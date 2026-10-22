import fs from 'node:fs';
import path from 'node:path';
export const GB=1024**3;
export const defaultStorage={enabled:false,keepDays:30,maxGB:50,minFreeGB:5};
export const defaultSchedule={enabled:false,days:[0,1,2,3,4,5,6],start:'08:00',end:'18:00'};
export function validateSchedule(value){
  if(typeof value?.enabled!=='boolean'||!Array.isArray(value.days)||!value.days.length||value.days.some(d=>!Number.isInteger(d)||d<0||d>6)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.end)||value.start===value.end)throw Error('Choose days and different valid start/end times.');
  return {enabled:value.enabled,days:[...new Set(value.days)].sort(),start:value.start,end:value.end};
}
export function validateStorage(value){
  if(typeof value?.enabled!=='boolean')throw Error('Choose whether storage cleanup is enabled.');
  for(const key of ['keepDays','maxGB','minFreeGB'])if(typeof value[key]!=='number'||!Number.isFinite(value[key])||value[key]<0||value[key]>1000000)throw Error('Storage limits must be numbers between 0 and 1,000,000.');
  if(!Number.isInteger(value.keepDays))throw Error('Enter whole days for recording retention.');
  if(value.enabled&&!value.keepDays&&!value.maxGB&&!value.minFreeGB)throw Error('Enable at least one storage limit.');
  return {enabled:value.enabled,keepDays:value.keepDays,maxGB:value.maxGB,minFreeGB:value.minFreeGB};
}
export function activeWindow(schedule,now=new Date()){
  if(!schedule?.enabled)return null;
  for(const offset of [0,-1]){
    const start=new Date(now);start.setDate(start.getDate()+offset);start.setHours(...schedule.start.split(':').map(Number),0,0);
    if(!schedule.days.includes(start.getDay()))continue;
    const end=new Date(start);end.setHours(...schedule.end.split(':').map(Number),0,0);if(schedule.end<=schedule.start)end.setDate(end.getDate()+1);
    if(now>=start&&now<end)return {id:`${start.getFullYear()}-${start.getMonth()+1}-${start.getDate()}:${schedule.start}:${schedule.end}`,endAt:end.getTime()};
  }
  return null;
}
export function inspectStorage(data,cameras,now=Date.now()){
  const folder=path.join(data,'recordings'),files=[];
  const disk=fs.statfsSync(data);const freeBytes=disk.bavail*disk.bsize,totalBytes=disk.blocks*disk.bsize;
  if(fs.existsSync(folder)){
    if(fs.lstatSync(folder).isSymbolicLink())throw Error('Cleanup does not follow linked recording folders.');
    const realRoot=fs.realpathSync(folder);
    for(const dir of fs.readdirSync(folder,{withFileTypes:true})){
      if(!dir.isDirectory()||!/^[\w-]{1,48}$/.test(dir.name)||fs.lstatSync(path.join(folder,dir.name)).isSymbolicLink())continue;
      const entries=[];
      for(const file of fs.readdirSync(path.join(folder,dir.name),{withFileTypes:true})){
        if(!file.isFile()||!file.name.endsWith('.mp4'))continue;
        const full=path.join(folder,dir.name,file.name),stat=fs.lstatSync(full);
        if(stat.isSymbolicLink()||!stat.isFile()||!fs.realpathSync(full).startsWith(realRoot+path.sep))continue;
        entries.push({full,file:file.name,path:dir.name,size:stat.size,mtime:stat.mtimeMs,protected:now-stat.mtimeMs<120000});
      }
      entries.sort((a,b)=>b.mtime-a.mtime||b.file.localeCompare(a.file));
      if(entries.length&&cameras.some(c=>c.path===dir.name&&c.record))entries[0].protected=true;
      files.push(...entries);
    }
  }
  return {files:files.sort((a,b)=>a.mtime-b.mtime||a.file.localeCompare(b.file)),usedBytes:files.reduce((sum,f)=>sum+f.size,0),freeBytes,totalBytes};
}
export function planCleanup(stats,settings,now=Date.now()){
  let used=stats.usedBytes,free=stats.freeBytes;const candidates=[];
  if(settings.enabled)for(const file of stats.files){
    if(file.protected)continue;
    const expired=settings.keepDays>0&&file.mtime<now-settings.keepDays*86400000;
    if(expired||(settings.maxGB>0&&used>=settings.maxGB*GB)||(settings.minFreeGB>0&&free<settings.minFreeGB*GB)){candidates.push(file);used-=file.size;free+=file.size}
  }
  return {candidates,estimatedFreedBytes:candidates.reduce((sum,f)=>sum+f.size,0),remainingBytes:used};
}
export function runCleanup(data,cameras,settings,now=Date.now()){
  const plan=planCleanup(inspectStorage(data,cameras,now),settings,now);let removed=0,freedBytes=0,failed=0;
  const folder=path.join(data,'recordings');
  const realRoot=fs.existsSync(folder)?fs.realpathSync(folder):null;
  for(const file of plan.candidates){
    try{
      // Recheck containment and unchanged metadata; never follow junctions or links.
      if(fs.lstatSync(folder).isSymbolicLink()||fs.lstatSync(path.dirname(file.full)).isSymbolicLink())continue;
      const current=fs.lstatSync(file.full);
      if(!current.isFile()||current.isSymbolicLink()||current.size!==file.size||current.mtimeMs!==file.mtime||now-current.mtimeMs<120000||!fs.realpathSync(file.full).startsWith(realRoot+path.sep))continue;
      fs.unlinkSync(file.full);removed++;freedBytes+=current.size;
    }catch{failed++}
  }
  return {removed,freedBytes,failed};
}
export function createRecordingAutomation({data,state,api,isRunning,save,event,recordingClock,clock=()=>new Date()}){
  for(const c of state.cameras){c.manualRecord=c.manualRecord??(!!c.record&&!c.recordFromSchedule);c.recordSessionOpen=c.recordSessionOpen??!!c.record}
  let lastCleanup=0,lastResult=null,lastError='';
  function view(){
    const settings={...defaultStorage,...state.storage};
    try{
      const stats=inspectStorage(data,state.cameras),plan=planCleanup(stats,settings);
      const blocked=settings.enabled&&((settings.minFreeGB>0&&stats.freeBytes<settings.minFreeGB*GB)||(settings.maxGB>0&&stats.usedBytes>=settings.maxGB*GB));
      return {settings,usedBytes:stats.usedBytes,freeBytes:stats.freeBytes,totalBytes:stats.totalBytes,protectedFiles:stats.files.filter(f=>f.protected).length,preview:{count:plan.candidates.length,freedBytes:plan.estimatedFreedBytes},blocked,error:lastError,lastResult};
    }catch(e){return {settings,usedBytes:null,freeBytes:null,totalBytes:null,preview:{count:0,freedBytes:0},blocked:settings.enabled,error:e.message,lastResult}}
  }
  function cleanup(){const result=runCleanup(data,state.cameras,{...defaultStorage,...state.storage});lastResult={...result,time:new Date().toISOString()};lastCleanup=Date.now();if(result.removed)event(`Storage cleanup removed ${result.removed} old recording file(s)`);if(result.failed)lastError='Some recording files could not be removed. They may be open in another program.';return result}
  async function apply(c,wanted,scheduled,retain=false){
    if(!wanted&&!retain)c.recordSessionOpen=false;
    if(!!c.record===wanted)return;
    if(isRunning()&&c.enabled!==false)await api(`config/paths/patch/${c.path}`,'PATCH',{record:wanted});
    if(wanted){if(!c.recordSessionOpen){c.recordElapsedMs=0;c.recordStartedAt=null}c.recordSessionOpen=true}
    c.record=wanted;c.recordFromSchedule=!!(wanted&&scheduled);
    if(!wanted){recordingClock(c,false);c.lastRecordingMs=c.recordElapsedMs||0}
    event(`Recording ${wanted?'started':'stopped'}${scheduled?' by schedule':''}: ${c.name}`);
  }
  async function tick(){
    lastError='';
    if(state.storage?.enabled&&Date.now()-lastCleanup>=60000)try{cleanup()}catch(e){lastError=e.message;lastCleanup=Date.now()}
    const status=view();
    if(status.blocked!==!!state.storageBlocked){state.storageBlocked=status.blocked;event(status.blocked?'Recording paused: storage limit reached. Live viewing continues.':'Storage limits allow recording again')}
    for(const c of state.cameras){
      const window=activeWindow(c.schedule,clock()),scheduled=!!window&&c.skipScheduleWindow!==window.id;
      const wanted=isRunning()&&c.enabled!==false&&!status.blocked&&(!!c.manualRecord||scheduled);
      try{await apply(c,wanted,!c.manualRecord&&scheduled,!!c.manualRecord||scheduled)}catch{lastError='A recording setting could not be applied. Check that the camera and server are running.'}
    }
  }
  return {
    view,cleanup,tick,
    preview(value){const settings=validateStorage({...value,enabled:true}),plan=planCleanup(inspectStorage(data,state.cameras),settings);return {count:plan.candidates.length,freedBytes:plan.estimatedFreedBytes}},
    settings(){return {timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,serverTime:clock().toISOString(),storage:view(),cameras:state.cameras.map(c=>({id:c.id,name:c.name,schedule:c.schedule||defaultSchedule,record:!!c.record,manualRecord:!!c.manualRecord,scheduledNow:!!activeWindow(c.schedule,clock()),paused:c.enabled===false}))}},
    async manual(c,wanted){
      if(wanted&&view().blocked)throw Error('Recording is paused by your storage limits. Free space or adjust the limits first.');
      c.manualRecord=wanted;const window=activeWindow(c.schedule,clock());c.skipScheduleWindow=!wanted&&window?window.id:null;
      await apply(c,wanted,false);save();
    },
    async schedule(c,value){c.schedule=validateSchedule(value);c.skipScheduleWindow=null;save();await tick()},
    async storage(value){state.storage=validateStorage(value);save();lastCleanup=0;await tick()}
  };
}

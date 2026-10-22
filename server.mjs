import {runtimeExecutable,openURL,macCredential} from './platform.mjs';
import http from 'node:http';
import {validateCameraSource} from './camera-source.mjs';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {startSharing} from './sharing.mjs';
import {createWebsiteFeeds,websitePath} from './website-feeds.mjs';
import {createRecordingAutomation} from './recording-automation.mjs';
import {exportBackup,openBackup,backupPayload,restoredSettings,restoreSummary,settingsFingerprint} from './settings-backup.mjs';
import {createStreamForwarding} from './stream-forwarding.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const data=path.resolve(process.env.MTX_MANAGER_DATA||path.join(root,'data'));
const port=Number(process.env.MTX_MANAGER_PORT||17860);
const origin=process.env.MTX_MANAGER_ORIGIN||`http://127.0.0.1:${port}`;
const ports={api:Number(process.env.MTX_API_PORT||19997),rtsp:Number(process.env.MTX_RTSP_PORT||18554),hls:Number(process.env.MTX_HLS_PORT||18888),playback:Number(process.env.MTX_PLAYBACK_PORT||19996)};
const token=process.env.MTX_MANAGER_TOKEN||randomBytes(32).toString('hex');
fs.mkdirSync(data,{recursive:true});
const stateFile=path.join(data,'workspace.json');
let state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{workspace:'Print studio',cameras:[],activity:[]};
// A new process must not count time when the recorder was not running.
for(const c of state.cameras)c.recordStartedAt=null;
let mtx=null,sample=null,starting=null,startedAt=null,lastError='',closing=false;
let queue=Promise.resolve();
const restorePreviews=new Map();
function pruneRestorePreviews(){for(const [id,preview] of restorePreviews)if(preview.expires<Date.now())restorePreviews.delete(id)}
setInterval(pruneRestorePreviews,60000).unref();
function stageRestore(payload){pruneRestorePreviews();while(restorePreviews.size>=3)restorePreviews.delete(restorePreviews.keys().next().value);const id=randomUUID();restorePreviews.set(id,{payload,fingerprint:settingsFingerprint(state),expires:Date.now()+600000});return {id,...restoreSummary(state,payload)}}
function previousRestorePoint(){
  const name=state.restorePoint;if(typeof name!=='string'||!/^before-restore-\d{13}-[a-f0-9-]{36}\.json$/.test(name))return null;
  const folder=path.join(data,'restore-points'),file=path.join(folder,name);
  if(!fs.existsSync(file)||fs.lstatSync(folder).isSymbolicLink()||fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size>2097152)return null;
  return {workspace:JSON.parse(fs.readFileSync(file,'utf8')),createdAt:fs.statSync(file).mtime.toISOString()};
}
function replaceState(next){for(const key of Object.keys(state))delete state[key];Object.assign(state,next)}
async function applyRestore(id){
  pruneRestorePreviews();const staged=restorePreviews.get(id);if(!staged)throw Error('The restore preview expired. Choose and preview the backup again.');
  if(staged.fingerprint!==settingsFingerprint(state))throw Error('Your setup changed after the preview. Preview the backup again before restoring.');
  const next=restoredSettings(staged.payload,password=>protect(password));restorePreviews.delete(id);
  const running=!!mtx;
  await stopMtx();
  const before=JSON.parse(JSON.stringify(state)),folder=path.join(data,'restore-points');
  const point=`before-restore-${Date.now()}-${randomUUID()}.json`;
  try{
    fs.mkdirSync(folder,{recursive:true});if(fs.lstatSync(folder).isSymbolicLink())throw Error('Restore points cannot be stored in a linked folder.');
    fs.writeFileSync(path.join(folder,point),JSON.stringify(before,null,2),{flag:'wx',mode:0o600});
    replaceState({...next,activity:before.activity||[],restorePoint:point});save();
    if(running)await startMtx();event('Settings restored. Review paused cameras and disabled automation before enabling them.');
    return {ok:true,...await snapshot()};
  }catch(error){
    try{await stopMtx();replaceState(before);save();if(running){await startMtx();if(state.sampleWanted)await startSample()}}catch{lastError='Restore failed and the previous setup could not restart. Your local restore point is retained.'}
    throw Error('Restore could not finish; the previous settings were retained. '+error.message);
  }
}
let sharingError='';
const sharingPort=Number(process.env.MTX_SHARING_PORT||17862);
const websiteFeeds=createWebsiteFeeds({root,state,ports,api});
const recordingAutomation=createRecordingAutomation({data,state,api,isRunning:()=>!!mtx&&!closing,save,event,recordingClock});
const streamForwarding=createStreamForwarding({root,state,ports,api,protect,save,event,isRunning:()=>!!mtx&&!closing});
let automationQueued=false;
const automationTimer=setInterval(()=>{if(automationQueued||closing)return;automationQueued=true;const run=queue.then(()=>recordingAutomation.tick());queue=run.catch(()=>{}).finally(()=>{automationQueued=false})},5000);automationTimer.unref();
const sharingServer=startSharing({root,state,hlsPort:ports.hls,port:sharingPort,mediaPath:websitePath});
sharingServer.on('error',()=>{sharingError='The website viewer port is unavailable. Restart the manager after closing the conflicting application.'});
function sharingState(){return {enabled:!!state.sharing?.enabled,baseUrl:state.sharing?.baseUrl||'',defaultQuality:state.sharing?.defaultQuality==='saver'?'saver':'standard',localUrl:`http://127.0.0.1:${sharingPort}/watch/`,error:sharingError,websiteQuality:'Standard: 640 × 360 at 15 fps. Optional Data Saver: 320 × 180 at 10 fps.',cameras:state.cameras.map(c=>({id:c.id,name:c.name,publicViewing:!!c.publicViewing,websiteStatus:websiteFeeds.status(c.id)}))}}
function save(){const tmp=stateFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2));fs.renameSync(tmp,stateFile)}
function event(message){queueMicrotask(()=>websiteFeeds.sync().catch(()=>{}));state.activity.unshift({message,time:new Date().toISOString()});state.activity=state.activity.slice(0,100);save()}
function protect(text,decrypt=false){
  if(process.platform==='darwin')return macCredential(text,decrypt);
  const script=decrypt
    ? "$ErrorActionPreference='Stop';[void][Reflection.Assembly]::LoadWithPartialName('System.Security');$b=[Convert]::FromBase64String([Console]::In.ReadToEnd());[Console]::Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))"
    : "$ErrorActionPreference='Stop';[void][Reflection.Assembly]::LoadWithPartialName('System.Security');$b=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd());[Console]::Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))";
  const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:text,encoding:'utf8',windowsHide:true,timeout:10000});
  if(r.status!==0)throw new Error('Windows could not unlock the saved camera password. Re-enter it on this computer.');
  return decrypt?r.stdout:r.stdout.trim();
}
async function api(endpoint,method='GET',body){
  let r;try{r=await fetch(`http://127.0.0.1:${ports.api}/v3/${endpoint}`,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000)})}catch{throw new Error('MediaMTX is not responding. Start the server in Settings.')}
  if(!r.ok){const e=new Error(`MediaMTX rejected this operation (${r.status}). Check the camera details and try again.`);e.status=r.status;throw e}
  return r.status===204?{}:r.json();
}
const validPath=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,48}$/.test(s);
function cameraConfig(c){
  if(c.kind==='sample')return {source:'publisher',record:c.record};
  const u=new URL(`rtsp://${c.host}:${c.port}/${c.stream}`);
  if(c.authRequired!==false){u.username=c.username;u.password=protect(c.secret,true)}
  return {source:u.href,rtspTransport:'tcp',sourceOnDemand:false,record:c.record};
}
async function installCamera(c){const conf=cameraConfig(c);try{await api(`config/paths/add/${c.path}`,'POST',conf)}catch(e){if(e.status!==400)throw e;await api(`config/paths/patch/${c.path}`,'PATCH',conf)}}
async function freePort(p){return new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(false));s.listen(p,'127.0.0.1',()=>s.close(()=>resolve(true)))})}
async function startMtx(){
  if(mtx)return;if(starting)return starting;
  starting=(async()=>{
    const exe=runtimeExecutable(root,'mediamtx');
    if(!fs.existsSync(exe))throw new Error('MediaMTX is missing. Extract the complete Windows package.');
    for(const p of Object.values(ports))if(!await freePort(p))throw new Error(`Port ${p} is already in use. Close the other MediaMTX instance and try again.`);
    const conf={logLevel:'error',logStructured:true,api:true,apiAddress:`127.0.0.1:${ports.api}`,rtspAddress:`127.0.0.1:${ports.rtsp}`,rtspTransports:['tcp'],hlsAddress:`127.0.0.1:${ports.hls}`,hlsAlwaysRemux:true,hlsVariant:'mpegts',hlsSegmentCount:12,hlsSegmentDuration:'2s',playback:true,playbackAddress:`127.0.0.1:${ports.playback}`,webrtc:false,rtmp:false,srt:false,moq:false,authInternalUsers:[{user:'any',pass:'',ips:['127.0.0.1','::1'],permissions:[{action:'api'},{action:'publish'},{action:'read'},{action:'playback'}]}],pathDefaults:{recordPath:path.join(data,'recordings/%path/%Y-%m-%d_%H-%M-%S-%f').replaceAll('\\','/'),recordFormat:'fmp4',recordSegmentDuration:'1m',recordDeleteAfter:'0s'},paths:{}};
    const configFile=path.join(data,'mediamtx.yml');fs.writeFileSync(configFile,JSON.stringify(conf,null,2));
    const child=spawn(exe,[configFile],{cwd:data,windowsHide:true,stdio:['ignore','pipe','pipe']});mtx=child;
    child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
    child.once('error',()=>{lastError='Unable to launch MediaMTX.';if(mtx===child)mtx=null});
    child.once('exit',code=>{if(mtx===child){mtx=null;startedAt=null;lastError=code?'MediaMTX stopped unexpectedly. Check for a port conflict in Settings.':'';stopSample();websiteFeeds.stop().catch(()=>{});if(!closing)event(lastError||'MediaMTX stopped')}});
    let ready=false;for(let i=0;i<40;i++){if(!mtx)break;try{await api('info');ready=true;break}catch{}await new Promise(r=>setTimeout(r,150))}
    if(!ready){child.kill();throw new Error('MediaMTX could not start. Its local ports may already be in use.')}
    lastError='';startedAt=Date.now();
    for(const c of state.cameras)c.record=false;
    for(const c of state.cameras)if(c.enabled!==false)try{await installCamera(c)}catch{lastError=`Re-enter the saved password for ${c.name} on this Windows account.`}
    await recordingAutomation.tick();await websiteFeeds.start();event('MediaMTX started');
  })().finally(()=>{starting=null});
  return starting;
}
function stopSample(){if(sample){sample.kill();sample=null}}
async function stopMtx(){sharingServer.viewerCounts.clear();await streamForwarding.stopAll();await websiteFeeds.stop();if(!mtx){stopSample();return}for(const c of state.cameras.filter(c=>c.record&&c.enabled!==false))try{await api(`config/paths/patch/${c.path}`,'PATCH',{record:false})}catch{}for(const c of state.cameras)recordingClock(c,false);save();stopSample();const p=mtx;await new Promise(resolve=>{const timer=setTimeout(()=>{p.kill();resolve()},3000);p.once('exit',()=>{clearTimeout(timer);resolve()});p.kill()});mtx=null;startedAt=null}
async function startSample(){
  await startMtx();if(sample)return;
  let c=state.cameras.find(c=>c.kind==='sample');
  if(!c){c={id:randomUUID(),name:'Sample stream · Test pattern',path:'sample-test',kind:'sample',record:false,enabled:true};if(state.cameras.some(x=>x.path===c.path))throw new Error('Rename the camera using the reserved sample-test path first.');state.cameras.push(c)}
  c.enabled=true;await installCamera(c);state.sampleWanted=true;save();
  const exe=runtimeExecutable(root,'ffmpeg');if(!fs.existsSync(exe))throw new Error('The sample-stream runtime is missing. Extract the complete Windows package.');
  const child=spawn(exe,['-hide_banner','-loglevel','error','-re','-f','lavfi','-i','testsrc2=size=1280x720:rate=15','-an','-c:v','libx264','-preset','ultrafast','-tune','zerolatency','-pix_fmt','yuv420p','-g','15','-b:v','1200k','-f','rtsp','-rtsp_transport','tcp',`rtsp://127.0.0.1:${ports.rtsp}/${c.path}`],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  sample=child;child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});child.once('error',()=>{lastError='Unable to launch the sample stream.';sample=null});child.once('exit',()=>{if(sample===child)sample=null});event('Sample video stream started');
}
function cleanCamera(c){const {secret,...safe}=c;return {...safe,hasPassword:!!secret}}
function recordingClock(c,live){
  if(c.record&&live){if(!c.recordStartedAt){c.recordStartedAt=Date.now();return true}}
  else if(c.recordStartedAt){c.recordElapsedMs=(c.recordElapsedMs||0)+Math.max(0,Date.now()-c.recordStartedAt);c.recordStartedAt=null;return true}
  return false;
}
async function snapshot(){
  let info=null,paths=[];if(mtx)try{[info,paths]=await Promise.all([api('info'),api('paths/list?itemsPerPage=1000').then(v=>v.items||[])])}catch{}
  const viewing=sharingServer.viewerCounts.snapshot();
  let clocksChanged=false;for(const c of state.cameras){const p=paths.find(p=>p.name===c.path);clocksChanged=recordingClock(c,!!info&&c.enabled!==false&&!!(p?.ready??p?.available))||clocksChanged}if(clocksChanged)save();
  return {platform:process.platform,viewerCount:viewing.total,local:true,managerRunning:true,launcherAvailable:process.env.MTX_MANAGER_LAUNCHER==='1',workspace:state.workspace,server:{running:!!info,version:info?.version||null,startedAt,error:lastError,sampleRunning:!!sample},cameras:state.cameras.map(c=>({...cleanCamera(c),publicViewers:viewing.cameras[c.id]||0,status:c.enabled===false?'Paused':paths.find(p=>p.name===c.path)?.ready||paths.find(p=>p.name===c.path)?.available?'Live':'Waiting',readers:paths.find(p=>p.name===c.path)?.readers?.length||0})),paths:paths.map(p=>({name:p.name,ready:p.ready??p.available,inboundBytes:p.inboundBytes??p.bytesReceived??0,outboundBytes:p.outboundBytes??p.bytesSent??0,tracks:p.tracks||[]})),activity:state.activity};
}
function json(res,status,obj){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj))}
async function body(req,limit=32768){const chunks=[];let size=0;for await(const b of req){size+=b.length;if(size>limit){const error=Error('Request too large.');error.status=413;throw error}chunks.push(b)}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}
function requireCamera(id){const c=state.cameras.find(c=>c.id===id);if(!c)throw new Error('Camera not found.');return c}
function validateCamera(b,old){
  if(!b.name?.trim()||b.name.length>60||!validPath(b.path))throw new Error('Enter a camera name and a simple stream path using letters, numbers, dashes or underscores.');
  if(state.cameras.some(c=>c.path===b.path&&c.id!==old?.id))throw new Error('That stream path is already in use.');
  const source=validateCameraSource(b);
  if(source.authRequired&&!old?.secret&&!b.password)throw new Error('Enter the camera password.');
  if(b.password&&typeof b.password!=='string'||b.password?.length>256)throw new Error('Camera password is too long.');
  return {id:old?.id||randomUUID(),name:b.name.trim(),path:b.path,kind:'camera',...source,secret:source.authRequired?(b.password?protect(b.password):old?.secret):undefined,enabled:old?.enabled??true,record:old?.record??false,recordElapsedMs:old?.recordElapsedMs||0,recordStartedAt:old?.recordStartedAt||null,lastRecordingMs:old?.lastRecordingMs||0};
}
function recordings(){
  const folder=path.join(data,'recordings');const items=[];
  if(!fs.existsSync(folder))return items;
  for(const dir of fs.readdirSync(folder,{withFileTypes:true})){if(!dir.isDirectory()||!validPath(dir.name))continue;for(const f of fs.readdirSync(path.join(folder,dir.name),{withFileTypes:true})){if(!f.isFile()||!f.name.endsWith('.mp4'))continue;const full=path.join(folder,dir.name,f.name),st=fs.statSync(full);items.push({id:Buffer.from(`${dir.name}/${f.name}`).toString('base64url'),camera:state.cameras.find(c=>c.path===dir.name)?.name||dir.name,path:dir.name,file:f.name,size:st.size,modified:st.mtime.toISOString(),finalized:!state.cameras.some(c=>c.path===dir.name&&c.record)||Date.now()-st.mtimeMs>6000})}}
  return items.sort((a,b)=>b.modified.localeCompare(a.modified));
}
async function routes(req,res,u){
  if(u.pathname==='/api/forwarding'&&req.method==='GET')return json(res,200,await streamForwarding.list());
  if(u.pathname==='/api/forwarding'&&req.method==='POST')return json(res,201,await streamForwarding.add(await body(req)));
  const forwardingMatch=u.pathname.match(/^\/api\/forwarding\/([a-f0-9-]+)\/(start|stop|remove)$/);
  if(forwardingMatch&&req.method==='POST'){await body(req);return json(res,200,await streamForwarding.action(forwardingMatch[1],forwardingMatch[2]))}
  if(u.pathname==='/api/backup/status'&&req.method==='GET'){const previous=previousRestorePoint();return json(res,200,{previous:previous?{workspace:previous.workspace.workspace,cameras:previous.workspace.cameras.length,createdAt:previous.createdAt}:null})}
  if(u.pathname.startsWith('/api/backup/')&&req.method==='POST'){
    const b=await body(req,2097152);
    if(u.pathname==='/api/backup/export')return json(res,200,await exportBackup(state,{passphrase:b.passphrase,includePasswords:b.includePasswords??true,unlock:secret=>protect(secret,true)}));
    if(u.pathname==='/api/backup/preview')return json(res,200,stageRestore(await openBackup(b.backup,b.passphrase)));
    if(u.pathname==='/api/backup/cancel'){restorePreviews.delete(b.id);return json(res,200,{ok:true})}
    if(u.pathname==='/api/backup/previous-preview'){const previous=previousRestorePoint();if(!previous)throw Error('There is no previous setup to restore.');return json(res,200,stageRestore({...backupPayload(previous.workspace,true,secret=>protect(secret,true)),createdAt:previous.createdAt}))}
    if(u.pathname==='/api/backup/apply')return json(res,200,await applyRestore(b.id));
    return json(res,404,{error:'Not found.'});
  }
  if(u.pathname==='/api/automation'&&req.method==='GET')return json(res,200,recordingAutomation.settings());
  if(u.pathname.startsWith('/api/automation/')&&req.method==='POST'){
    const b=await body(req);
    if(u.pathname==='/api/automation/preview')return json(res,200,recordingAutomation.preview(b));
    if(u.pathname==='/api/automation/schedule'){await recordingAutomation.schedule(requireCamera(b.id),b.schedule);event('Recording schedule saved');return json(res,200,recordingAutomation.settings())}
    if(u.pathname==='/api/automation/storage'){await recordingAutomation.storage(b);event('Recording storage limits saved');return json(res,200,recordingAutomation.settings())}
    if(u.pathname==='/api/automation/cleanup'){if(!state.storage?.enabled)throw Error('Enable storage cleanup first.');recordingAutomation.cleanup();await recordingAutomation.tick();return json(res,200,recordingAutomation.settings())}
    return json(res,404,{error:'Not found.'});
  }
  if(u.pathname==='/api/sharing'&&req.method==='GET')return json(res,200,sharingState());
  if(u.pathname==='/api/sharing'&&req.method==='POST'){
    const b=await body(req);
    if(typeof b.enabled!=='boolean'||!Array.isArray(b.cameras)||b.cameras.some(id=>typeof id!=='string'||!state.cameras.some(c=>c.id===id)))throw Error('Choose valid cameras to share.');
    let baseUrl='';
    if(b.baseUrl){const url=new URL(b.baseUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Enter the HTTPS viewer address without a path, username or password.');baseUrl=url.origin}
    if(b.defaultQuality!==undefined&&!['standard','saver'].includes(b.defaultQuality))throw Error('Select a valid viewer quality.');state.sharing={enabled:b.enabled,baseUrl,defaultQuality:b.defaultQuality||state.sharing?.defaultQuality||'standard'};for(const c of state.cameras)c.publicViewing=b.cameras.includes(c.id);
    await websiteFeeds.sync();event(b.enabled?'Public website viewing enabled for selected cameras':'Public website viewing disabled');return json(res,200,sharingState());
  }
  if(u.pathname==='/api/bootstrap')return json(res,200,{token,...await snapshot()});
  if(u.pathname==='/api/state')return json(res,200,await snapshot());
  if(u.pathname==='/api/recordings'&&req.method==='GET')return json(res,200,{items:recordings()});
  if(u.pathname.startsWith('/api/recordings/file/')&&req.method==='GET'){
    const item=recordings().find(f=>f.id===u.pathname.split('/').pop());if(!item){json(res,404,{error:'Recording not found.'});return}
    if(!item.finalized){json(res,409,{error:'Stop recording or wait for the segment to finish before downloading.'});return}
    return sendFile(req,res,path.join(data,'recordings',item.path,item.file),u.searchParams.has('download')?item.file:null);
  }
  if(req.method==='GET'){json(res,404,{error:'Not found.'});return}
  const b=await body(req);
  if(u.pathname==='/api/server/start'){await startMtx();if(state.sampleWanted)await startSample();return json(res,200,await snapshot())}
  if(u.pathname==='/api/server/stop'){await stopMtx();return json(res,200,await snapshot())}
  if(u.pathname==='/api/sample/start'){await startSample();return json(res,200,await snapshot())}
  if(u.pathname==='/api/sample/stop'){state.sampleWanted=false;stopSample();event('Sample stream stopped');return json(res,200,await snapshot())}
  if(u.pathname==='/api/workspace'){if(!b.workspace?.trim()||b.workspace.length>60)throw new Error('Enter a workspace name.');state.workspace=b.workspace.trim();event('Workspace preferences saved');return json(res,200,await snapshot())}
  if(u.pathname==='/api/shutdown'){json(res,200,{ok:true});setTimeout(shutdown,200);return}
  if(u.pathname==='/api/cameras'&&req.method==='POST'){await startMtx();const c=validateCamera(b);await installCamera(c);state.cameras.push(c);event(`Camera added: ${c.name}`);return json(res,201,await snapshot())}
  const match=u.pathname.match(/^\/api\/cameras\/([a-f0-9-]+)(?:\/(record|enabled))?$/);
  if(match){const old=requireCamera(match[1]);
    if(req.method==='DELETE'){await streamForwarding.removeCamera(old.id);if(mtx&&old.enabled!==false)await api(`config/paths/delete/${old.path}`,'DELETE');if(old.kind==='sample'){state.sampleWanted=false;stopSample()};state.cameras=state.cameras.filter(c=>c!==old);event(`Camera removed: ${old.name}`);return json(res,200,await snapshot())}
    if(match[2]==='record'){if(b.record!==false&&(!mtx||old.enabled===false))throw new Error('Start the server and resume this camera before recording.');if(typeof b.record!=='boolean')throw new Error('Invalid recording setting.');await recordingAutomation.manual(old,b.record);return json(res,200,await snapshot())}
    if(match[2]==='enabled'){if(typeof b.enabled!=='boolean')throw new Error('Invalid camera setting.');await startMtx();if(b.enabled){if(old.kind==='sample')await startSample();else await installCamera({...old,enabled:true})}else {if(old.enabled!==false)await api(`config/paths/delete/${old.path}`,'DELETE');if(old.kind==='sample'){state.sampleWanted=false;stopSample()}}old.enabled=b.enabled;event(`Camera ${b.enabled?'resumed':'paused'}: ${old.name}`);return json(res,200,await snapshot())}
    if(req.method==='PATCH'){if(old.kind==='sample')throw new Error('The generated sample stream does not need camera settings.');const c=validateCamera(b,old);c.publicViewing=!!old.publicViewing;c.schedule=old.schedule;c.manualRecord=old.manualRecord;c.recordSessionOpen=old.recordSessionOpen;c.skipScheduleWindow=old.skipScheduleWindow;c.recordFromSchedule=old.recordFromSchedule;await startMtx();if(c.enabled){await installCamera(c);if(c.path!==old.path)await api(`config/paths/delete/${old.path}`,'DELETE')}state.cameras=state.cameras.map(x=>x.id===c.id?c:x);event(`Camera updated: ${c.name}`);return json(res,200,await snapshot())}
  }
  json(res,404,{error:'Not found.'});
}
const mime={'.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.mp4':'video/mp4','.txt':'text/plain'};
function sendFile(req,res,file,download){
  if(!fs.existsSync(file)){res.writeHead(404);res.end('Not found');return}
  const size=fs.statSync(file).size,headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'};
  if(download)headers['Content-Disposition']=`attachment; filename="${download}"`;
  let start=0,end=size-1,status=200;
  if(req.headers.range){const m=req.headers.range.match(/^bytes=(\d+)-(\d*)$/);if(!m||Number(m[1])>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return}start=+m[1];end=m[2]?Math.min(+m[2],size-1):size-1;if(end<start){res.writeHead(416);res.end();return}status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`}
  headers['Content-Length']=Math.max(0,end-start+1);res.writeHead(status,headers);if(req.method==='HEAD'||size===0){res.end();return}fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
}
const server=http.createServer(async(req,res)=>{
  try{
    // Bind and Host checks keep the local controller off the network and reject DNS rebinding.
    if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)){json(res,403,{error:'Local access only.'});return}
    const u=new URL(req.url,origin);
    if(req.headers['sec-fetch-site']==='cross-site'&&req.headers['sec-fetch-mode']!=='navigate'){json(res,403,{error:'Open the manager in its own local window.'});return}
    if(req.headers.origin&&![origin,origin.replace('127.0.0.1','localhost'),`http://localhost:${port}`].includes(req.headers.origin)){json(res,403,{error:'Open the manager in its own local window.'});return}
    if(u.pathname.startsWith('/api/')){
      if(!['GET','HEAD'].includes(req.method)&&req.headers['x-manager-token']!==token){json(res,403,{error:'Refresh the manager and try again.'});return}
      if(req.method==='GET')await routes(req,res,u);else{const run=queue.then(()=>routes(req,res,u));queue=run.catch(()=>{});await run}return;
    }
    if(u.pathname.startsWith('/hls/')){
      const rel=u.pathname.slice(5);if(!/^[\w-]+\/[\w.\/-]+$/.test(rel)||rel.includes('..')||!state.cameras.some(c=>c.path===rel.split('/')[0])){res.writeHead(404);res.end();return}
      const upstream=await fetch(`http://127.0.0.1:${ports.hls}/${rel}${u.search}`,{signal:AbortSignal.timeout(15000)});res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/octet-stream','Cache-Control':'no-store'});if(upstream.body)Readable.fromWeb(upstream.body).on('error',()=>res.destroy()).pipe(res);else res.end();return;
    }
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
    const relative=decodeURIComponent(u.pathname==='/'?'index.html':u.pathname.slice(1));const file=path.resolve(root,'dist',relative);if(!file.startsWith(path.join(root,'dist')+path.sep)){res.writeHead(403);res.end();return}sendFile(req,res,file);
  }catch(e){if(!res.headersSent)json(res,e.status||400,{error:e.message||'Unable to complete this operation.'});else res.destroy()}
});
async function shutdown(){if(closing)return;closing=true;sharingServer.close();sharingServer.closeAllConnections();await stopMtx();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1500).unref()}
server.on('error',e=>{if(e.code==='EADDRINUSE'&&process.argv.includes('--open')){openURL(origin);process.exit(0)}console.error('The manager port is unavailable.');process.exit(1)});
server.listen(port,'127.0.0.1',()=>{console.log(origin);if(process.argv.includes('--open'))openURL(origin);startMtx().then(()=>{if(state.sampleWanted)return startSample()}).catch(e=>{lastError=e.message})});
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);process.on('exit',()=>{streamForwarding.dispose();websiteFeeds.dispose();sample?.kill();mtx?.kill()});

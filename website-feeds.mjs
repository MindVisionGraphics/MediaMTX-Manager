import {runtimeExecutable} from './platform.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';

export const websitePath=(c,quality='standard')=>(quality==='saver'?'save-':'web-')+c.id.replaceAll('-','');
const profiles={standard:{width:640,height:360,fps:15,rate:'400k',buffer:'800k',threads:'2'},saver:{width:320,height:180,fps:10,rate:'120k',buffer:'240k',threads:'1'}};
const feedKey=c=>`${c.id}:${c.quality}`;

// Two small quality encoders per shared camera, shared by all website visitors. They read
// the manager's local RTSP stream; camera credentials never enter its arguments.
export function createWebsiteFeeds({root,state,ports,api}){
  const feeds=new Map();
  let suspended=true,pending=null,generation=0;
  const desired=()=>!suspended&&state.sharing?.enabled?state.cameras.filter(c=>c.publicViewing&&c.enabled!==false).flatMap(c=>Object.keys(profiles).map(quality=>({...c,quality}))):[];
  function terminate(entry){entry.child?.kill();entry.child=null}
  async function sync(){
    if(pending)return pending;
    const turn=generation;
    pending=(async()=>{
      const cameras=desired();
      for(const [id,entry] of feeds){const camera=cameras.find(c=>feedKey(c)===id);if(!camera||entry.source!==camera.path){terminate(entry);feeds.delete(id);try{await api(`config/paths/delete/${entry.path}`,'DELETE')}catch{}}}
      if(!cameras.length||suspended||turn!==generation)return;
      let paths;try{paths=(await api('paths/list?itemsPerPage=1000')).items||[]}catch{return}
      for(const c of cameras){
        if(suspended||turn!==generation||!desired().some(v=>feedKey(v)===feedKey(c)&&v.path===c.path))return;
        const profile=profiles[c.quality];
        let entry=feeds.get(feedKey(c));
        if(!entry){entry={path:websitePath(c,c.quality),source:c.path,child:null,retryAt:0,error:''};feeds.set(feedKey(c),entry)}
        if(entry.child||Date.now()<entry.retryAt)continue;
        const input=paths.find(p=>p.name===c.path);if(!(input?.ready??input?.available))continue;
        const exe=runtimeExecutable(root,'ffmpeg');
        if(!fs.existsSync(exe)){entry.error='Website video needs the bundled FFmpeg runtime.';entry.retryAt=Date.now()+10000;continue}
        if(state.cameras.some(other=>other.path===entry.path)){entry.error='A camera uses a reserved website stream path. Rename that camera path.';continue}
        try{
          try{await api(`config/paths/add/${entry.path}`,'POST',{source:'publisher',record:false})}
          catch(e){if(e.status!==400)throw e;await api(`config/paths/patch/${entry.path}`,'PATCH',{source:'publisher',record:false})}
          if(suspended||turn!==generation||!desired().some(v=>feedKey(v)===feedKey(c)&&v.path===c.path))return;
          const child=spawn(exe,[
            '-hide_banner','-loglevel','error','-fflags','+genpts+discardcorrupt',
            '-rtsp_transport','tcp','-timeout','15000000','-i',`rtsp://127.0.0.1:${ports.rtsp}/${c.path}`,
            '-map','0:v:0','-an','-sn','-dn','-vf',`scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=${profile.fps},setsar=1,setpts=N/(${profile.fps}*TB)`,
            '-c:v','libx264','-preset','veryfast','-tune','zerolatency','-profile:v','baseline','-level:v','3.0',
            '-pix_fmt','yuv420p','-crf','28','-maxrate',profile.rate,'-bufsize',profile.buffer,'-g',String(profile.fps*2),'-keyint_min',String(profile.fps*2),'-sc_threshold','0','-bf','0','-threads',profile.threads,
            '-f','rtsp','-rtsp_transport','tcp',`rtsp://127.0.0.1:${ports.rtsp}/${entry.path}`
          ],{windowsHide:true,stdio:['ignore','pipe','pipe']});
          entry.child=child;entry.error='';child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
          const lost=()=>{if(entry.child===child){entry.child=null;entry.retryAt=Date.now()+5000;entry.error='Website video is reconnecting.'}};
          child.once('error',lost);child.once('exit',lost);
        }catch{entry.error='Website video could not start. Check that MediaMTX is running.';entry.retryAt=Date.now()+5000}
      }
    })().finally(()=>{pending=null});
    return pending;
  }
  const timer=setInterval(()=>sync().catch(()=>{}),2000);timer.unref();
  return {
    path:websitePath,
    start(){suspended=false;generation++;return sync()},
    sync,
    async stop(){suspended=true;generation++;for(const e of feeds.values())terminate(e);await pending;for(const e of feeds.values())terminate(e);feeds.clear()},
    dispose(){suspended=true;generation++;clearInterval(timer);for(const e of feeds.values())terminate(e)},
    status(id){const e=feeds.get(id+':standard');return e?.error||(e?.child?'Standard and Data Saver website feeds enabled':'Waiting for website video')}
  };
}

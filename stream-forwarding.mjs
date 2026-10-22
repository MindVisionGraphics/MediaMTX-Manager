import {runtimeExecutable} from './platform.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
export const forwardingPath=id=>'fwd-'+id.replaceAll('-','');
export function validateEndpoint(server,streamKey){
  if(typeof server!=='string'||server.length>2000||typeof streamKey!=='string'||!streamKey.length||streamKey.length>1024||/[\s#]/.test(streamKey))throw Error('Enter a server URL and stream key in their separate fields.');
  let url;try{url=new URL(server)}catch{throw Error('Enter a valid RTMP or RTMPS server URL.')}
  if(!['rtmp:','rtmps:'].includes(url.protocol)||!url.hostname||url.username||url.password||url.hash||url.search||!url.pathname.split('/').filter(Boolean).length||/[\u0000-\u0020]/.test(server))throw Error('Use an RTMP or RTMPS server URL with an application path, without a stream key, username or query.');
  return {server:url.href.replace(/\/$/,''),streamKey,destination:url.protocol+'//'+url.host};
}
export function createStreamForwarding({root,state,ports,api,protect,save,event,isRunning}){
  state.forwardings=state.forwardings||[];for(const d of state.forwardings){d.enabled=false;d.error=''}
  const jobs=new Map();let pending=null;
  function clean(d){const job=jobs.get(d.id);return {id:d.id,name:d.name,cameraId:d.cameraId,destination:d.destination,hasEndpoint:!!d.endpointSecret,enabled:!!d.enabled,status:job?.status||(d.error?'Error':'Stopped'),error:d.error||job?.error||'',outboundBytes:job?.outboundBytes||0}}
  async function stop(d,reason=''){
    const job=jobs.get(d.id);jobs.delete(d.id);if(job)job.child?.kill();
    if(isRunning()&&job)try{await api(`config/paths/delete/${forwardingPath(d.id)}`,'DELETE')}catch{}
    const was=d.enabled;d.enabled=false;d.error=reason;save();if(was)event(`Forwarding stopped: ${d.name}`);
  }
  async function start(d){
    if(!isRunning())throw Error('Start the server before forwarding.');
    const camera=state.cameras.find(c=>c.id===d.cameraId);if(!camera||camera.enabled===false)throw Error('Resume the selected camera before forwarding.');
    if(!d.endpointSecret)throw Error('This destination has no saved stream key. Remove it and add it again with its key.');
    const paths=(await api('paths/list?itemsPerPage=1000')).items||[],source=paths.find(p=>p.name===camera.path);
    if(!(source?.ready??source?.available))throw Error('Wait until the selected camera is Live before forwarding.');
    if(!source.tracks?.includes('H264'))throw Error('This first forwarding version requires H.264 camera video.');
    const executable=runtimeExecutable(root,'ffmpeg');if(!fs.existsSync(executable))throw Error('The bundled FFmpeg runtime is missing. Extract the complete Windows package.');
    const endpoint=JSON.parse(protect(d.endpointSecret,true)),validated=validateEndpoint(endpoint.server,endpoint.streamKey);
    const streamPath=forwardingPath(d.id);if(state.cameras.some(c=>c.path===streamPath))throw Error('A camera uses this reserved forwarding path. Rename that camera stream first.');
    await stop(d);d.error='';
    const conf={source:'publisher',record:false,forward:[{dest:validated.server+'#'+encodeURIComponent(validated.streamKey)}]};
    try{await api(`config/paths/add/${streamPath}`,'POST',conf)}catch(e){if(e.status!==400)throw e;await api(`config/paths/patch/${streamPath}`,'PATCH',conf)}
    const job={source:camera.path,child:null,status:'Connecting',outboundBytes:0,error:''};jobs.set(d.id,job);
    try{
      const child=spawn(executable,[
        '-hide_banner','-loglevel','error','-fflags','+genpts','-rtsp_transport','tcp','-timeout','15000000','-i',`rtsp://127.0.0.1:${ports.rtsp}/${camera.path}`,
        '-re','-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000',
        '-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','128k','-ar','48000','-ac','2','-shortest',
        '-f','rtsp','-rtsp_transport','tcp',`rtsp://127.0.0.1:${ports.rtsp}/${streamPath}`
      ],{windowsHide:true,stdio:['ignore','pipe','pipe']});
      job.child=child;d.enabled=true;save();event(`Forwarding started: ${d.name}`);
      child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
      const failed=()=>{if(jobs.get(d.id)!==job)return;job.child=null;job.status='Error';d.error='Source forwarding stopped. Check the camera and select Start to retry.';d.enabled=false;save()};
      child.once('error',failed);child.once('exit',failed);
    }catch{await stop(d);throw Error('The forwarding helper could not start.')}
  }
  async function sync(){
    if(pending)return pending;
    pending=(async()=>{
      for(const d of state.forwardings){
        const job=jobs.get(d.id);if(!job)continue;
        const camera=state.cameras.find(c=>c.id===d.cameraId);
        if(!isRunning()||!camera||camera.enabled===false||camera.path!==job.source){await stop(d);continue}
        if(!job.child){const error=d.error;await stop(d,error);continue}
        try{const result=await api(`paths/forward-dests/list?path=${forwardingPath(d.id)}&itemsPerPage=10`),remote=result.items?.[0];
          job.outboundBytes=Number(remote?.outboundBytes||0);job.status=remote?.state==='forwarding'&&job.outboundBytes>0?'Forwarding':remote?.state==='error'?'Error':'Connecting';
          job.error=job.status==='Error'?'Destination connection failed. Check its server address, stream key and service settings.':'';
        }catch{job.status='Connecting';job.error='Waiting for forwarding status.'}
      }
    })().finally(()=>{pending=null});return pending;
  }
  const timer=setInterval(()=>sync().catch(()=>{}),2000);timer.unref();
  return {
    async list(){await sync();return {experimental:true,items:state.forwardings.map(clean)}},
    async add(b){if(state.forwardings.length>=8)throw Error('This version supports up to eight forwarding destinations.');if(typeof b.name!=='string'||!b.name.trim()||b.name.length>60||/[\u0000-\u001f]/.test(b.name))throw Error('Enter a destination name up to 60 characters.');if(!state.cameras.some(c=>c.id===b.cameraId))throw Error('Choose a camera.');const endpoint=validateEndpoint(b.server,b.streamKey),d={id:randomUUID(),name:b.name.trim(),cameraId:b.cameraId,destination:endpoint.destination,endpointSecret:protect(JSON.stringify({server:endpoint.server,streamKey:endpoint.streamKey})),enabled:false,error:''};state.forwardings.push(d);event(`Forwarding destination saved: ${d.name}`);return clean(d)},
    async action(id,action){const d=state.forwardings.find(d=>d.id===id);if(!d)throw Error('Forwarding destination not found.');if(action==='start')await start(d);else if(action==='stop')await stop(d);else if(action==='remove'){await stop(d);state.forwardings=state.forwardings.filter(v=>v!==d);event(`Forwarding destination removed: ${d.name}`)}return this.list()},
    async removeCamera(id){for(const d of state.forwardings.filter(d=>d.cameraId===id))await stop(d);state.forwardings=state.forwardings.filter(d=>d.cameraId!==id);save()},
    async stopAll(){for(const d of state.forwardings)await stop(d)},
    dispose(){clearInterval(timer);for(const job of jobs.values())job.child?.kill()}
  };
}

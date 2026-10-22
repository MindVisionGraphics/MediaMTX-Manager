// Anonymous, short-lived viewing sessions; no IP addresses, cookies or history.
export function createViewerCounts({allowed,now=Date.now,ttl=45000}){
  const sessions=new Map();
  function prune(){const ids=new Set(allowed().map(c=>c.id));for(const [key,s] of sessions)if(now()-s.time>=ttl||!ids.has(s.cameraId))sessions.delete(key)}
  return {
    update({sessionId,cameraId,watching}){
      prune();if(typeof sessionId!=='string'||!/^[a-f0-9-]{36}$/.test(sessionId)||typeof cameraId!=='string'||!allowed().some(c=>c.id===cameraId)||typeof watching!=='boolean')throw Error('Invalid viewing session.');
      const key=sessionId+':'+cameraId;
      if(!watching)sessions.delete(key);else if(sessions.has(key)||sessions.size<5000)sessions.set(key,{sessionId,cameraId,time:now()});
    },
    snapshot(){prune();const cameras={};const viewers=new Set();for(const s of sessions.values()){cameras[s.cameraId]=(cameras[s.cameraId]||0)+1;viewers.add(s.sessionId)}return {total:viewers.size,cameras}},
    clear(){sessions.clear()}
  };
}

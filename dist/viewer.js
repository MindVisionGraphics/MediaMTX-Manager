const container=document.querySelector('#cameras'),players=new Map(),viewerSession=crypto.randomUUID();
function report(id,watching,beacon=false){const body=JSON.stringify({sessionId:viewerSession,cameraId:id,watching});if(beacon&&navigator.sendBeacon){navigator.sendBeacon('/watch/session',new Blob([body],{type:'application/json'}));return}fetch('/watch/session',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{})}
setInterval(()=>{for(const [id,p] of players)report(id,!p.video.paused&&!p.video.ended&&Date.now()-(p.lastProgress||0)<30000)},15000);
function stop(id){const p=players.get(id);if(!p)return;players.delete(id);report(id,false);p.video.onpause=null;p.video.ontimeupdate=null;p.video.onerror=null;p.video.onplaying=null;p.video.onwaiting=null;p.hls?.destroy();p.video.pause();p.video.removeAttribute('src');p.video.load();p.button.textContent='Watch live';p.status.textContent='Stopped'}
async function load(){
  try{
    const response=await fetch('/watch/cameras',{cache:'no-store'});if(!response.ok)throw Error();const {cameras,defaultQuality}=await response.json();container.replaceChildren();
    if(!cameras.length){container.textContent='The studio is offline right now. Please check back later.';container.className='empty';return}
    for(const c of cameras){
      const article=document.createElement('article'),title=document.createElement('h2'),video=document.createElement('video'),controls=document.createElement('div'),button=document.createElement('button'),status=document.createElement('span');
      title.textContent=c.name;video.controls=true;video.muted=true;video.playsInline=true;video.preload='none';video.setAttribute('aria-label',c.name+' live video');controls.className='controls';button.textContent='Watch live';status.className='status';status.setAttribute('role','status');status.textContent='Video loads when you press Watch live';
      let quality=defaultQuality==='saver'?'saver':'standard';try{const saved=localStorage.getItem('mvg-quality-'+c.id);if(['standard','saver'].includes(saved))quality=saved}catch{}
      const group=document.createElement('div'),note=document.createElement('p'),label=document.createElement('label'),select=document.createElement('select');group.className='quality-options';note.className='quality-note';label.textContent='Quality ';select.setAttribute('aria-label',c.name+' video quality');
      for(const [value,text] of [['standard','Standard · 360p'],['saver','Data Saver · 180p']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option)}label.append(select);group.append(label);
      select.onchange=()=>{const value=select.value;if(quality===value)return;const playing=players.has(c.id)&&(!video.paused||!players.get(c.id).hasPlayed);stop(c.id);quality=value;try{localStorage.setItem('mvg-quality-'+c.id,quality)}catch{}updateChoice();if(playing)start()};
      function updateChoice(){select.value=quality;note.textContent=quality==='saver'?'180p · uses less data on slower connections. Your choice affects this player only.':'360p · clearer picture. Choose Data Saver if playback buffers.';if(!players.has(c.id))status.textContent='Video loads when you press Watch live'}
      function start(){
        const url='/watch/media/'+encodeURIComponent(c.id)+(quality==='saver'?'/saver':'')+'/index.m3u8',p={video,button,status};players.set(c.id,p);button.textContent='Stop watching';status.textContent='Connecting…';
        const fail=()=>{if(players.get(c.id)!==p)return;stop(c.id);status.textContent='Camera unavailable. Press Watch live to try again.'};
        video.onerror=fail;video.onplaying=()=>{if(players.get(c.id)===p){p.hasPlayed=true;p.lastProgress=Date.now();report(c.id,true);status.textContent='Live · '+(quality==='saver'?'Data Saver · 180p':'Standard · 360p')}};video.ontimeupdate=()=>{if(!video.paused)p.lastProgress=Date.now()};video.onpause=()=>report(c.id,false);video.onwaiting=()=>{if(players.get(c.id)===p)status.textContent='Buffering…'};
        if(window.Hls?.isSupported()){p.hls=new Hls({lowLatencyMode:false,liveSyncDurationCount:6,maxBufferLength:30,maxMaxBufferLength:60,backBufferLength:15});p.hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal)fail()});p.hls.loadSource(url);p.hls.attachMedia(video);p.hls.on(Hls.Events.MANIFEST_PARSED,()=>video.play().catch(()=>{status.textContent='Press play on the video to watch.'}))}
        else if(video.canPlayType('application/vnd.apple.mpegurl')){video.src=url;video.play().catch(()=>status.textContent='Press play on the video to watch.')}
        else{stop(c.id);status.textContent='This browser cannot play live video. Try a current browser.'}
      }
      button.onclick=()=>{if(players.has(c.id))stop(c.id);else start()};updateChoice();
      controls.append(group,note,button,status);article.append(title,video,controls);container.append(article);
    }
  }catch{container.textContent='The studio is unavailable right now. Please check back later.'}
}
window.addEventListener('pagehide',()=>{for(const id of players.keys()){report(id,false,true);stop(id)}});load();

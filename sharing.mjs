import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {createViewerCounts} from './viewer-counts.mjs';

// This listener deliberately has no route to the controller, recordings or camera credentials.
// Publish only this listener through an HTTPS video relay, never the manager port.
export function startSharing({root,state,hlsPort,port=17862,mediaPath=c=>c.path}){
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
  function reply(res,code,text,type='text/plain; charset=utf-8') {res.writeHead(code,{...headers,'Content-Type':type});res.end(text)}
  const allowed=()=>state.sharing?.enabled?state.cameras.filter(c=>c.publicViewing&&c.enabled!==false):[];
  const viewerCounts=createViewerCounts({allowed});
  const mediaReference=ref=>/^\w[\w.-]*\.(?:m3u8|ts|mp4|m4s)(?:\?session=[a-f0-9-]{36})?$/.test(ref)&&!ref.includes('..');
  const server=http.createServer(async(req,res)=>{
    try{
      const u=new URL(req.url,'http://viewer.invalid');
      if(u.pathname==='/watch/session'&&req.method==='POST'){
        if(req.headers['sec-fetch-site']==='cross-site'||req.headers['content-type']?.split(';')[0]!=='application/json')return reply(res,403,'Invalid viewing request.');
        let text='';for await(const chunk of req){text+=chunk;if(text.length>1024)return reply(res,413,'Request too large.')}
        try{viewerCounts.update(JSON.parse(text))}catch{return reply(res,400,'Invalid viewing session.')}
        return reply(res,200,'{}','application/json');
      }
      if(!['GET','HEAD'].includes(req.method))return reply(res,405,'Viewing only.');
      if(u.pathname==='/watch/cameras')return reply(res,200,JSON.stringify({defaultQuality:state.sharing?.defaultQuality==='saver'?'saver':'standard',cameras:allowed().map(c=>({id:c.id,name:c.name}))}),'application/json');
      if(u.pathname==='/watch'||u.pathname==='/watch/'){
        res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self' blob:; worker-src blob:; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors https://mindvisiongraphics.com https://www.mindvisiongraphics.com 'self'");
        return reply(res,200,fs.readFileSync(path.join(root,'dist/watch.html')),'text/html; charset=utf-8');
      }
      const assets={'/watch/viewer.js':['viewer.js','text/javascript'],'/watch/viewer.css':['viewer.css','text/css'],'/watch/hls.min.js':['vendor/hls.min.js','text/javascript']};
      if(assets[u.pathname]){const [file,type]=assets[u.pathname];return reply(res,200,fs.readFileSync(path.join(root,'dist',file)),type)}
      const match=u.pathname.match(/^\/watch\/media\/([a-f0-9-]+)\/(saver\/)?([A-Za-z0-9_.-]+)$/);
      if(!match)return reply(res,404,'Not found.');
      const camera=allowed().find(c=>c.id===match[1]);
      const file=match[3],quality=match[2]?'saver':'standard';
      if(!camera||file.includes('..')||!/^\w[\w.-]*\.(?:m3u8|ts|mp4|m4s)$/.test(file))return reply(res,404,'Not found.');
      if(u.search&&!/^\?session=[a-f0-9-]{36}$/.test(u.search))return reply(res,400,'Invalid playback session.');
      // MediaMTX 1.21 uses per-viewer session IDs in playlist URLs. Its browser-cookie
      // redirect is unnecessary here: this service owns the upstream HTTP request.
      const query=u.search||(file==='index.m3u8'?'?cookieCheck=1':'');
      const upstream=await fetch(`http://127.0.0.1:${hlsPort}/${mediaPath(camera,quality)}/${file}${query}`,{method:file.endsWith('.m3u8')?'GET':req.method,redirect:'error',signal:AbortSignal.timeout(12000)});
      if(!upstream.ok){await upstream.body?.cancel();return reply(res,503,'This camera is currently offline.')}
      if(file.endsWith('.m3u8')){
        // Only relative media resources may be handed to a public player.
        let manifest=await upstream.text();
        const refs=[...manifest.split(/\r?\n/).filter(l=>l&&!l.startsWith('#')),...Array.from(manifest.matchAll(/URI="([^"]+)"/g),m=>m[1])];
        if(refs.some(ref=>!mediaReference(ref)))return reply(res,502,'Unsupported playlist.');
        // Native HLS players (including Safari) also benefit from starting behind
        // the newest segment. Add the hint only when enough history exists.
        const available=Array.from(manifest.matchAll(/#EXTINF:([\d.]+)/g),m=>Number(m[1])).reduce((a,b)=>a+b,0);
        if(available>=16&&!manifest.includes('#EXT-X-START:'))manifest=manifest.replace('#EXTM3U','#EXTM3U\n#EXT-X-START:TIME-OFFSET=-12,PRECISE=NO');
        return reply(res,200,manifest,'application/vnd.apple.mpegurl');
      }
      res.writeHead(200,{...headers,'Content-Type':upstream.headers.get('content-type')||'application/octet-stream'});
      if(req.method==='HEAD'){await upstream.body?.cancel();res.end()}else if(upstream.body){const stream=Readable.fromWeb(upstream.body);res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy()).pipe(res)}else res.end();
    }catch{if(!res.headersSent)reply(res,503,'Live video is unavailable. Try again shortly.');else res.destroy()}
  });
  server.listen(port,'127.0.0.1');
  server.viewerCounts=viewerCounts;
  return server;
}

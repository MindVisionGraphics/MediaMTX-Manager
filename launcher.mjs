import {openURL} from './platform.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';

// The launcher serves the page while the camera manager is stopped. Restarting
// its child never opens a browser: the page reconnects through this same origin.
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.MTX_LAUNCHER_PORT||17860),workerPort=Number(process.env.MTX_WORKER_PORT||17861);
const origin=`http://127.0.0.1:${port}`,workerOrigin=`http://127.0.0.1:${workerPort}`;
const data=path.resolve(process.env.MTX_MANAGER_DATA||path.join(root,'data'));
const token=randomBytes(32).toString('hex'),pages=new Map();
let child=null,launching=null,stopping=false,exiting=false,lastError='';
function json(res,status,v){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(v))}
async function read(req){let text='';for await(const b of req){text+=b;if(text.length>16384)throw Error('Request too large.')}return JSON.parse(text||'{}')}
function stoppedState(){let saved={};try{saved=JSON.parse(fs.readFileSync(path.join(data,'workspace.json'),'utf8'))}catch{}return {token,local:true,managerRunning:false,managerStarting:!!launching,launcherAvailable:true,workspace:saved.workspace||'Print studio',server:{running:false,sampleRunning:false,version:null,startedAt:null,error:lastError},cameras:(saved.cameras||[]).map(({secret,recordStartedAt,...c})=>({...c,recordStartedAt:null,status:'Stopped'})),paths:[],activity:saved.activity||[]}}
async function workerState(){const r=await fetch(workerOrigin+'/api/bootstrap',{signal:AbortSignal.timeout(2000)});if(!r.ok)throw Error('Manager is not ready.');return r.json()}
async function startWorker(){
  if(launching)return launching;
  launching=(async()=>{
    if(stopping&&child)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Manager is still stopping. Try again in a moment.')),6000);child.once('exit',()=>{clearTimeout(timer);resolve()})});
    if(child){try{return await workerState()}catch{throw Error('The manager is still starting. Try again in a moment.')}}
    lastError='';
    const p=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,env:{...process.env,MTX_MANAGER_PORT:String(workerPort),MTX_MANAGER_ORIGIN:origin,MTX_MANAGER_TOKEN:token,MTX_MANAGER_LAUNCHER:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
    child=p;p.stdout.on('data',()=>{});p.stderr.on('data',()=>{});
    p.once('error',()=>{lastError='The manager could not start. Check the package files.'});
    p.once('exit',code=>{if(child===p){child=null;stopping=false;if(code&&!exiting)lastError='The manager stopped unexpectedly. You can try Start manager again.'}});
    for(let i=0;i<80;i++){if(!child)break;try{return await workerState()}catch{}await new Promise(r=>setTimeout(r,150))}
    throw Error(lastError||'Manager startup timed out. Check that local port 17861 is available.');
  })().finally(()=>{launching=null});return launching;
}
function openBrowser(){if(process.env.MTX_LAUNCHER_NO_BROWSER==='1')return;openURL(origin)}
function hasPages(){for(const [id,time] of pages)if(Date.now()-time>90000)pages.delete(id);return pages.size>0}
const types={'.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.txt':'text/plain','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try{
    if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host))return json(res,403,{error:'Local access only.'});
    if(req.headers.origin&&![origin,origin.replace('127.0.0.1','localhost')].includes(req.headers.origin))return json(res,403,{error:'Open the manager in its local page.'});
    if(req.headers['sec-fetch-site']==='cross-site'&&req.headers['sec-fetch-mode']!=='navigate')return json(res,403,{error:'Local page access only.'});
    const u=new URL(req.url,origin);
    if(u.pathname==='/api/launcher/status'&&req.method==='GET')return json(res,200,{launcher:true,appRoot:root,managerRunning:!!child&&!stopping,hasOpenPages:hasPages()});
    if(u.pathname.startsWith('/api/launcher/')||u.pathname==='/api/manager/start'){
      if(req.method!=='POST')return json(res,405,{error:'POST required.'});const b=await read(req);
      if(req.headers['x-manager-token']!==token&&b.token!==token)return json(res,403,{error:'Refresh this page to reconnect.'});
      if(u.pathname==='/api/launcher/exit'){json(res,200,{ok:true});setImmediate(stopAll);return}
      if(u.pathname==='/api/manager/start')return json(res,200,await startWorker());
      if(typeof b.pageId!=='string'||!/^[a-f0-9-]{16,64}$/.test(b.pageId))return json(res,400,{error:'Invalid page session.'});
      if(u.pathname==='/api/launcher/heartbeat'){pages.set(b.pageId,Date.now());return json(res,200,{ok:true})}
      if(u.pathname==='/api/launcher/page-close'){pages.delete(b.pageId);return json(res,200,{ok:true})}
      return json(res,404,{error:'Not found.'});
    }
    if(u.pathname.startsWith('/api/')||u.pathname.startsWith('/hls/')){
      if(!child||stopping){if(['/api/bootstrap','/api/state'].includes(u.pathname)&&req.method==='GET')return json(res,200,stoppedState());return json(res,503,{error:'The manager is stopped. Use Start manager on this page.'})}
      if(u.pathname==='/api/shutdown'&&req.method==='POST'&&req.headers['x-manager-token']===token)stopping=true;
      const upstream=http.request(workerOrigin+req.url,{method:req.method,headers:{...req.headers,host:`127.0.0.1:${workerPort}`}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});
      upstream.setTimeout(60000,()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent)json(res,503,{error:'The manager is restarting. Try again shortly.'});else res.destroy()});req.pipe(upstream);return;
    }
    if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Method not allowed.'});
    const base=path.join(root,'dist'),file=path.resolve(base,decodeURIComponent(u.pathname==='/'?'index.html':u.pathname.slice(1)));
    if(!file.startsWith(base+path.sep))return json(res,403,{error:'Access denied.'});
    if(!fs.existsSync(file)||!fs.statSync(file).isFile())return json(res,404,{error:'Not found.'});
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});if(req.method==='HEAD')res.end();else fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  }catch(e){if(!res.headersSent)json(res,400,{error:e.message});else res.destroy()}
});
// A repeated shortcut launch wakes the existing worker and only opens a browser
// when no page has checked in. It never starts a second launcher or manager.
server.on('error',async e=>{
  if(e.code!=='EADDRINUSE'){console.error('The local launcher could not start.');process.exit(1)}
  try{const status=await(await fetch(origin+'/api/launcher/status')).json();if(!status.launcher)throw Error();const s=await(await fetch(origin+'/api/bootstrap')).json();await fetch(origin+'/api/manager/start',{method:'POST',headers:{'Content-Type':'application/json','X-Manager-Token':s.token},body:'{}'});if(process.argv.includes('--open')&&!status.hasOpenPages)openBrowser();process.exitCode=0}catch{console.error('An older manager is using this port. Quit it before opening the updated launcher.');process.exit(1)}
});
server.listen(port,'127.0.0.1',()=>{console.log(origin);startWorker().catch(e=>{lastError=e.message});if(process.argv.includes('--open'))openBrowser()});
async function stopAll(){exiting=true;if(child)try{await fetch(workerOrigin+'/api/shutdown',{method:'POST',headers:{'Content-Type':'application/json','X-Manager-Token':token},body:'{}',signal:AbortSignal.timeout(3000)})}catch{}server.close();setTimeout(()=>{child?.kill();process.exit(0)},2000).unref()}
process.on('SIGINT',stopAll);process.on('SIGTERM',stopAll);process.on('exit',()=>child?.kill());

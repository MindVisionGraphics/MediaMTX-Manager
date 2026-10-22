const {app,BrowserWindow,Menu,dialog,shell,session}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const root=__dirname,port=Number(process.env.MTX_LAUNCHER_PORT||17860),origin=`http://127.0.0.1:${port}`;
app.setName('MediaMTX Manager');
if(process.platform==='win32')app.setAppUserModelId('com.mindvisiongraphics.mediamtxmanager');
app.setPath('userData',process.env.MTX_DESKTOP_PROFILE||path.join(app.getPath('appData'),'MindVision Graphics','MediaMTX Manager',String(port)));
let window=null;
function focus(){if(!window||window.isDestroyed())return;if(window.isMinimized())window.restore();window.show();window.focus()}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function localJSON(route){const r=await fetch(origin+route,{signal:AbortSignal.timeout(1500)});if(!r.ok)throw Error('Local manager unavailable.');return r.json()}
async function connect(){
  let existing=null;try{existing=await localJSON('/api/launcher/status')}catch{}
  if(existing?.launcher&&process.env.MTX_INSTALLED==='1'&&existing.appRoot!==root)throw Error('A different portable copy is still running. Quit its manager and restart this computer once before opening the installed application. Your portable files are unchanged.');
  if(!existing?.launcher){
    const node=path.join(root,'runtime',process.platform==='win32'?'node.exe':'node');if(!fs.existsSync(node))throw Error('The application runtime is missing. Reinstall the complete package.');
    const child=spawn(node,[path.join(root,'launcher.mjs')],{cwd:root,env:{...process.env,MTX_LAUNCHER_NO_BROWSER:'1'},detached:true,windowsHide:true,stdio:'ignore'});child.on('error',()=>{});child.unref();
  }
  for(let i=0;i<100;i++){
    try{
      if(!(await localJSON('/api/launcher/status')).launcher)throw Error();
      const b=await localJSON('/api/bootstrap');
      if(!b.managerRunning){const r=await fetch(origin+'/api/manager/start',{method:'POST',headers:{'Content-Type':'application/json','X-Manager-Token':b.token},body:'{}',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error()}
      return;
    }catch{await sleep(200)}
  }
  throw Error('The local manager could not start. Close an older manager using this port, then open the desktop app again.');
}
function isLocal(url){try{return new URL(url).origin===origin}catch{return false}}
function external(url){try{const u=new URL(url);if(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password)shell.openExternal(u.href).catch(()=>{})}catch{}}
async function open(){
  await connect();
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  session.defaultSession.on('will-download',(_event,item)=>{
    const name=path.basename(item.getFilename());item.setSaveDialogOptions({title:'Save recording or backup',defaultPath:path.join(app.getPath('downloads'),name)});
    item.once('done',(_e,state)=>{if(state==='interrupted'&&window&&!window.isDestroyed())dialog.showMessageBox(window,{type:'error',message:'The download did not finish. Please try again.'})});
  });
  window=new BrowserWindow({title:'MediaMTX Manager',width:1320,height:900,minWidth:760,minHeight:600,backgroundColor:'#0b1428',show:false,icon:path.join(root,'dist/assets/app-icon.png'),webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false}});
  window.webContents.setWindowOpenHandler(({url})=>{external(url);return {action:'deny'}});
  window.webContents.on('will-navigate',(event,url)=>{if(!isLocal(url)){event.preventDefault();external(url)}});
  window.webContents.on('will-redirect',(event,url)=>{if(!isLocal(url))event.preventDefault()});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.once('ready-to-show',focus);
  window.on('closed',()=>{window=null});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'Manager',submenu:[{label:'Open web version',click:()=>shell.openExternal(origin)},{type:'separator'},{label:'Close desktop window (manager keeps running)',click:()=>app.quit()}]},
    {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'View',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},{role:'togglefullscreen'}]},
    {label:'Help',submenu:[{label:'Closing this window',click:()=>dialog.showMessageBox(window,{type:'info',message:'Closing the desktop window leaves cameras and recordings running.',detail:'Use Settings → Quit manager to stop them. Start manager stays available in the same window. Open the desktop shortcut again to return.'})}]}
  ]));
  await window.loadURL(origin+'/#dashboard');
}
if(!app.requestSingleInstanceLock()){app.quit()}else{
  app.on('second-instance',focus);
  app.on('window-all-closed',()=>app.quit());
  app.whenReady().then(open).catch(error=>{dialog.showErrorBox('MediaMTX Manager',error.message);app.quit()});
}

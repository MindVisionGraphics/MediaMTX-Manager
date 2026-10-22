const {app,safeStorage}=require('electron');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../manager');
app.setName('MediaMTX Manager');
process.env.MTX_INSTALLED='1';
process.env.MTX_MANAGER_DATA=process.env.MTX_MANAGER_DATA||path.join(process.platform==='win32'?process.env.LOCALAPPDATA:app.getPath('appData'),'MindVision Graphics','MediaMTX Manager','data');
process.env.MTX_CREDENTIAL_HELPER=process.execPath;
if(process.argv.includes('--credential-helper')){
  app.whenReady().then(async()=>{
    app.dock?.hide();if(!safeStorage.isEncryptionAvailable())throw Error('OS credential storage is unavailable.');
    let text='';for await(const chunk of process.stdin)text+=chunk;
    const decrypt=process.argv.includes('decrypt');
    const result=decrypt?safeStorage.decryptString(Buffer.from(text,'base64')):safeStorage.encryptString(text).toString('base64');
    process.stdout.write(result,()=>app.exit(0));
  }).catch(()=>app.exit(1));
}else if(process.argv.includes('--web')){
  const node=path.join(root,'runtime',process.platform==='win32'?'node.exe':'node');
  const child=spawn(node,[path.join(root,'launcher.mjs'),'--open'],{cwd:root,env:process.env,windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();app.quit();
}else{
  require(path.join(root,'desktop.cjs'));
}

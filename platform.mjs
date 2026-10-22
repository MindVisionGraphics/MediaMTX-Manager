import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
export function runtimeExecutable(root,component){
  const extension=process.platform==='win32'?'.exe':'';
  return component==='node'?path.join(root,'runtime','node'+extension):path.join(root,'runtime',component,component+extension);
}
export function openURL(url){
  const child=process.platform==='darwin'?spawn('/usr/bin/open',[url],{detached:true,stdio:'ignore'}):spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();
}
export function macCredential(text,decrypt){
  const helper=process.env.MTX_CREDENTIAL_HELPER;if(!helper)throw Error('Open the installed Mac application to use Keychain-protected credentials.');
  const result=spawnSync(helper,['--credential-helper',decrypt?'decrypt':'encrypt'],{input:text,encoding:'utf8',timeout:30000,stdio:['pipe','pipe','ignore']});
  if(result.status!==0||!result.stdout)throw Error('macOS could not access the saved credential. Allow the app to use Keychain, or re-enter the credential.');
  return result.stdout;
}

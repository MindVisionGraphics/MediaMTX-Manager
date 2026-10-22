import {validateCameraSource} from './camera-source.mjs';
import {randomBytes,createCipheriv,createDecipheriv,scrypt,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {validateSchedule,validateStorage,defaultStorage} from './recording-automation.mjs';
import {validateEndpoint} from './stream-forwarding.mjs';
const derive=promisify(scrypt),format='mediamtx-manager-backup',version=1;
const aad=Buffer.from(format+':1:aes-256-gcm:scrypt-32768-8-1');
function phrase(value){if(typeof value!=='string'||value.length<12||value.length>256)throw Error('Use a backup passphrase between 12 and 256 characters.');return value}
function text(value,max,label){if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f]/.test(value))throw Error('Invalid '+label+' in backup.');return value}
export function backupPayload(state,includePasswords,unlock){
  return validatePayload({workspace:state.workspace,createdAt:new Date().toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
    cameras:state.cameras.map(c=>({id:c.id,name:c.name,path:c.path,kind:c.kind,host:c.host,port:c.port,stream:c.stream,sourceType:c.sourceType,authRequired:c.authRequired,username:c.username,password:includePasswords&&c.secret?unlock(c.secret):null,enabled:c.enabled!==false,publicViewing:!!c.publicViewing,schedule:c.schedule||null})),
    sharing:{enabled:!!state.sharing?.enabled,baseUrl:state.sharing?.baseUrl||'',defaultQuality:state.sharing?.defaultQuality||'standard'},storage:{...defaultStorage,...state.storage},forwardings:(state.forwardings||[]).map(d=>({id:d.id,name:d.name,cameraId:d.cameraId,destination:d.destination,endpoint:includePasswords&&d.endpointSecret?JSON.parse(unlock(d.endpointSecret)):null}))});
}
export function validatePayload(value){
  if(!value||typeof value!=='object'||!Array.isArray(value.cameras)||value.cameras.length>100)throw Error('Invalid backup or more than 100 cameras.');
  const ids=new Set(),paths=new Set();let samples=0;
  const cameras=value.cameras.map(c=>{
    if(!c||typeof c.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(c.id)||ids.has(c.id)||typeof c.path!=='string'||!/^[\w-]{1,48}$/.test(c.path)||/^(?:web-|save-|fwd-)[a-f0-9]{32}$/.test(c.path)||paths.has(c.path))throw Error('Duplicate or invalid camera identifiers in backup.');
    ids.add(c.id);paths.add(c.path);
    if(!['camera','sample'].includes(c.kind))throw Error('Unsupported camera type in backup.');
    const camera={id:c.id,name:text(c.name,60,'camera name'),path:c.path,kind:c.kind,enabled:!!c.enabled,publicViewing:!!c.publicViewing,schedule:c.schedule?validateSchedule(c.schedule):null};
    if(c.kind==='sample'){if(++samples>1||c.path!=='sample-test')throw Error('Invalid sample camera in backup.');return camera}
    const source=validateCameraSource(c);
    if(c.password!==null&&c.password!==undefined&&(typeof c.password!=='string'||!c.password.length||c.password.length>256))throw Error('Invalid camera password in backup.');
    return {...camera,...source,password:source.authRequired?(c.password??null):null};
  });
  let baseUrl='';if(value.sharing?.baseUrl){const url=new URL(value.sharing.baseUrl);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Invalid public viewer address in backup.');baseUrl=url.origin}
  if(typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt)))throw Error('Invalid backup date.');
  if(value.forwardings!==undefined&&(!Array.isArray(value.forwardings)||value.forwardings.length>8))throw Error('Invalid forwarding destinations in backup.');
  const destIds=new Set();const forwardings=(value.forwardings||[]).map(d=>{
    if(!d||typeof d.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(d.id)||destIds.has(d.id)||!ids.has(d.cameraId))throw Error('Invalid forwarding destination or missing camera in backup.');destIds.add(d.id);
    const endpoint=d.endpoint?validateEndpoint(d.endpoint.server,d.endpoint.streamKey):null;
    let destination=endpoint?.destination;if(!destination){const u=new URL(d.destination);if(!['rtmp:','rtmps:'].includes(u.protocol)||!u.hostname||u.username||u.password||u.search||u.hash||u.pathname&&u.pathname!=='/')throw Error('Invalid forwarding address in backup.');destination=u.protocol+'//'+u.host}
    return {id:d.id,name:text(d.name,60,'forwarding name'),cameraId:d.cameraId,destination,endpoint:endpoint?{server:endpoint.server,streamKey:endpoint.streamKey}:null};
  });
  return {workspace:text(value.workspace,60,'workspace name'),createdAt:value.createdAt,timezone:typeof value.timezone==='string'?value.timezone.slice(0,100):'Unknown',cameras,sharing:{enabled:!!value.sharing?.enabled,baseUrl,defaultQuality:value.sharing?.defaultQuality==='saver'?'saver':'standard'},storage:validateStorage(value.storage||defaultStorage),forwardings};
}
export async function exportBackup(state,{passphrase,includePasswords=true,unlock}){
  phrase(passphrase);if(typeof includePasswords!=='boolean')throw Error('Choose whether camera passwords are included.');
  const payload=backupPayload(state,includePasswords,unlock),salt=randomBytes(16),iv=randomBytes(12);
  const key=await derive(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:128*1024*1024});
  try{const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);const ciphertext=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);return {format,version,cipher:'aes-256-gcm',kdf:'scrypt-32768-8-1',salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:ciphertext.toString('base64')}}finally{key.fill(0)}
}
function decode(value,length){if(typeof value!=='string'||value.length>1400000||!value.length||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('Invalid backup file.');const b=Buffer.from(value,'base64');if(b.toString('base64')!==value||(length&&b.length!==length))throw Error('Invalid backup file.');return b}
export async function openBackup(envelope,passphrase){
  phrase(passphrase);
  if(!envelope||envelope.format!==format||envelope.version!==version||envelope.cipher!=='aes-256-gcm'||envelope.kdf!=='scrypt-32768-8-1')throw Error('This is not a supported MediaMTX Manager backup.');
  const salt=decode(envelope.salt,16),iv=decode(envelope.iv,12),tag=decode(envelope.tag,16),ciphertext=decode(envelope.data);
  const key=await derive(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:128*1024*1024});let plain;
  try{const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(aad);decipher.setAuthTag(tag);plain=Buffer.concat([decipher.update(ciphertext),decipher.final()])}catch{throw Error('The passphrase is incorrect or the backup file is damaged.')}finally{key.fill(0)}
  try{return validatePayload(JSON.parse(plain.toString('utf8')))}finally{plain.fill(0)}
}
export function restoredSettings(payload,lock){
  return {workspace:payload.workspace,cameras:payload.cameras.map(c=>{const {password,...camera}=c;return {...camera,secret:c.kind==='camera'&&password?lock(password):undefined,enabled:false,publicViewing:!!c.publicViewing,schedule:c.schedule?{...c.schedule,enabled:false}:undefined,record:false,manualRecord:false,recordSessionOpen:false,recordStartedAt:null,recordElapsedMs:0,lastRecordingMs:0}}),sharing:{...payload.sharing,enabled:false},storage:{...payload.storage,enabled:false},sampleWanted:false,storageBlocked:false,forwardings:(payload.forwardings||[]).map(d=>({id:d.id,name:d.name,cameraId:d.cameraId,destination:d.destination,endpointSecret:d.endpoint?lock(JSON.stringify(d.endpoint)):undefined,enabled:false,error:''}))};
}
export function settingsFingerprint(state){
  const config={workspace:state.workspace,cameras:state.cameras.map(c=>({id:c.id,name:c.name,path:c.path,kind:c.kind,host:c.host,port:c.port,stream:c.stream,sourceType:c.sourceType,authRequired:c.authRequired,username:c.username,secret:c.secret,enabled:c.enabled,publicViewing:c.publicViewing,schedule:c.schedule})),sharing:state.sharing,storage:state.storage};
  config.forwardings=(state.forwardings||[]).map(d=>({id:d.id,name:d.name,cameraId:d.cameraId,destination:d.destination,endpointSecret:d.endpointSecret,enabled:d.enabled}));
  return createHash('sha256').update(JSON.stringify(config)).digest('hex');
}
export function restoreSummary(state,payload){return {workspace:payload.workspace,createdAt:payload.createdAt,timezone:payload.timezone,forwardings:(payload.forwardings||[]).map(d=>({name:d.name,needsKey:!d.endpoint})),currentCameras:state.cameras.map(c=>c.name),cameras:payload.cameras.map(c=>({name:c.name,path:c.path,kind:c.kind,needsPassword:c.kind==='camera'&&c.authRequired!==false&&!c.password,scheduled:!!c.schedule?.enabled,publicViewing:!!c.publicViewing})),storage:payload.storage,sharing:payload.sharing}}

// Shared by camera setup and backup validation; credentials stay in separate fields.
export function validateCameraSource(b){
  const sourceType=b.sourceType??'tapo',authRequired=sourceType==='tapo'||b.authRequired!==false;
  if(!['tapo','custom'].includes(sourceType))throw Error('Select a supported camera setup.');
  if(typeof b.host!=='string'||!/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?$/.test(b.host))throw Error('Enter the camera IP address or hostname without a protocol or slash.');
  const port=Number(b.port||554);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Enter a valid camera port.');
  let stream=b.stream;
  if(sourceType==='tapo'){if(!['stream1','stream2'].includes(stream))throw Error('Select a camera stream.')}
  else{
    if(typeof stream!=='string'||stream.length>512||!/^\/?[A-Za-z0-9_~!$&'()*+,;=.%/?-]*$/.test(stream)||stream.startsWith('//')||/%(?:0[0-9a-f]|1[0-9a-f]|7f|2f|5c|40)/i.test(stream)||stream.split('?')[0].split('/').some(p=>['.','..'].includes(decodeURIComponent(p))))throw Error('Enter only the RTSP stream path, for example /Streaming/Channels/101. Put login details in the separate fields.');
    stream=stream.replace(/^\//,'');
  }
  const username=authRequired?b.username:'';
  if(authRequired&&(typeof username!=='string'||!username||username.length>128||/[\u0000-\u001f]/.test(username)))throw Error('Enter the camera username.');
  return {sourceType,authRequired,host:b.host,port,stream,username};
}

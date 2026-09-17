/**
 * VideoExportCapabilities.js
 * SM Engine — safe runtime export capability probing.
 *
 * Important:
 * Chromium may report MP4/H.264 MediaRecorder support while the resulting
 * fragmented MP4 is not reliably playable in every desktop player.
 * Therefore browser-only export prefers WebM VP9/VP8 for reliability.
 * Native/Electron exporters may still use MP4/H.264 safely.
 */
(function(global){
'use strict';

class VideoExportCapabilities{
 constructor(){
  this.mediaRecorder=
   typeof global.MediaRecorder!=='undefined';

  this.captureStream=
   !!global.HTMLCanvasElement
    ?.prototype
    ?.captureStream;

  this.webCodecs=
   typeof global.VideoEncoder!=='undefined';

  this.audioContext=
   !!(
    global.AudioContext ||
    global.webkitAudioContext
   );

  this.formats=
   this._probeFormats();
 }

 _supported(mime){
  if(!this.mediaRecorder){
   return false;
  }

  try{
   return global.MediaRecorder
    .isTypeSupported(
     mime
    );
  }catch(_){
   return false;
  }
 }

 _probeFormats(){
  const candidates=[
   {
    id:'mp4-h264',
    container:'mp4',
    codec:'h264',
    label:'MP4 · H.264/AAC',
    extension:'mp4',
    mime:'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    fallbackMime:'video/mp4',
    browserSafe:false,
    experimental:true
   },
   {
    id:'webm-vp9',
    container:'webm',
    codec:'vp9',
    label:'WebM · VP9/Opus',
    extension:'webm',
    mime:'video/webm;codecs=vp9,opus',
    fallbackMime:'video/webm;codecs=vp9',
    browserSafe:true,
    experimental:false
   },
   {
    id:'webm-vp8',
    container:'webm',
    codec:'vp8',
    label:'WebM · VP8/Opus',
    extension:'webm',
    mime:'video/webm;codecs=vp8,opus',
    fallbackMime:'video/webm;codecs=vp8',
    browserSafe:true,
    experimental:false
   },
   {
    id:'webm-av1',
    container:'webm',
    codec:'av1',
    label:'WebM · AV1/Opus',
    extension:'webm',
    mime:'video/webm;codecs=av01,opus',
    fallbackMime:'video/webm;codecs=av01',
    browserSafe:true,
    experimental:true
   }
  ];

  return candidates.map(item=>{
   let mime=item.mime;
   let supported=
    this._supported(mime);

   if(
    !supported &&
    item.fallbackMime
   ){
    supported=
     this._supported(
      item.fallbackMime
     );

    if(supported){
     mime=
      item.fallbackMime;
    }
   }

   return {
    ...item,
    mime,
    supported
   };
  });
 }

 supportedVideoFormats(options={}){
  const safeOnly=
   options.safeOnly===true;

  return this.formats.filter(item=>
   item.supported &&
   (!safeOnly || item.browserSafe)
  );
 }

 bestVideoFormat(preferred='mp4-h264',options={}){
  const nativeAvailable=
   !!global.smNativeVideoExporter?.render;

  const allowExperimental=
   options.allowExperimental===true ||
   nativeAvailable;

  const exact=
   this.formats.find(item=>
    item.id===preferred &&
    item.supported &&
    (
     item.browserSafe ||
     allowExperimental
    )
   );

  if(exact){
   return exact;
  }

  return (
   this.formats.find(item=>
    item.id==='webm-vp9' &&
    item.supported
   ) ||
   this.formats.find(item=>
    item.id==='webm-vp8' &&
    item.supported
   ) ||
   this.formats.find(item=>
    item.browserSafe &&
    item.supported
   ) ||
   (
    allowExperimental
     ? this.formats.find(item=>item.supported)
     : null
   )
  );
 }

 get(id){
  return this.formats.find(item=>
   item.id===id
  )||null;
 }

 fromMime(mime=''){
  const value=
   String(mime||'')
    .toLowerCase();

  if(value.includes('mp4')){
   return this.get('mp4-h264');
  }

  if(value.includes('vp9')){
   return this.get('webm-vp9');
  }

  if(value.includes('vp8')){
   return this.get('webm-vp8');
  }

  if(
   value.includes('av01') ||
   value.includes('av1')
  ){
   return this.get('webm-av1');
  }

  if(value.includes('webm')){
   return (
    this.get('webm-vp9') ||
    this.get('webm-vp8')
   );
  }

  return null;
 }

 snapshot(){
  return {
   mediaRecorder:this.mediaRecorder,
   captureStream:this.captureStream,
   webCodecs:this.webCodecs,
   audioContext:this.audioContext,
   nativeExporter:
    !!global.smNativeVideoExporter?.render,
   formats:this.formats.map(item=>({
    id:item.id,
    label:item.label,
    supported:item.supported,
    browserSafe:item.browserSafe,
    experimental:item.experimental,
    mime:item.mime
   }))
  };
 }
}

global.VideoExportCapabilities=
 VideoExportCapabilities;

global.videoExportCapabilities=
 new VideoExportCapabilities();

})(window);
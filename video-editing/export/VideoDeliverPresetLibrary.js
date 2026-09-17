/**
 * VideoDeliverPresetLibrary.js
 * SM Engine — professional capability-aware Deliver preset library.
 *
 * This file is UI-agnostic. It provides rich preset metadata consumed by:
 * - VideoDeliverPresetsPanel
 * - VideoDeliverSettingsPanel
 * - VideoDeliverInspectorPanel
 * - VideoDeliverDockManager
 *
 * Backward-compatible public API:
 *   register(preset)
 *   get(id)
 *   list()
 *   resolve(id, project)
 *   groups()
 */
(function(global){
'use strict';

class VideoDeliverPresetLibrary{
 constructor(capabilities=null){
  this.capabilities=
   capabilities ||
   global.videoExportCapabilities ||
   null;

  this.presets=
   new Map();

  this.groupOrder=[
   'General',
   'Master',
   'Online',
   'Social',
   'Preview'
  ];

  this._registerBuiltins();
 }

 /* ============================================================
    PUBLIC API
    ============================================================ */

 register(preset){
  if(
   !preset ||
   !preset.id ||
   !preset.name
  ){
   return false;
  }

  const normalized=
   this._normalizePreset(
    preset
   );

  this.presets.set(
   normalized.id,
   normalized
  );

  return true;
 }

 unregister(id){
  return this.presets.delete(
   id
  );
 }

 get(id){
  return this.presets.get(
   id
  )||
  null;
 }

 has(id){
  return this.presets.has(
   id
  );
 }

 list(options={}){
  let items=[
   ...this.presets.values()
  ];

  if(options.group){
   items=
    items.filter(
     preset=>
      preset.group===
      options.group
    );
  }

  if(options.search){
   const query=
    String(
     options.search
    )
    .trim()
    .toLowerCase();

   if(query){
    items=
     items.filter(
      preset=>{
       const haystack=[
        preset.name,
        preset.group,
        preset.description,
        preset.notes,
        ...(preset.tags||[])
       ]
       .filter(Boolean)
       .join(' ')
       .toLowerCase();

       return haystack.includes(
        query
       );
      }
     );
   }
  }

  return items.sort(
   (a,b)=>{
    const groupA=
     this._groupIndex(
      a.group
     );

    const groupB=
     this._groupIndex(
      b.group
     );

    if(groupA!==groupB){
     return groupA-groupB;
    }

    return Number(a.order||0)-
     Number(b.order||0);
   }
  );
 }

 groups(){
  const found=
   new Set(
    this.list().map(
     preset=>
      preset.group||
      'General'
    )
   );

  return [
   ...found
  ].sort(
   (a,b)=>
    this._groupIndex(a)-
    this._groupIndex(b)
  );
 }

 resolve(id,project=null){
  const preset=
   this.get(id)||
   this.get('custom');

  const settings=
   project?.settings||
   global.videoProject?.settings||
   {};

  const resolution=
   settings.resolution||
   {
    w:1920,
    h:1080
   };

  const requestedFormatId=
   preset.formatId||
   'mp4-h264';

  const preferred=
   this.capabilities
    ?.bestVideoFormat?.(
     requestedFormatId
    )||
   this.capabilities
    ?.get?.(
     requestedFormatId
    )||
   null;

  const formatId=
   preferred?.id||
   requestedFormatId||
   'webm-vp9';

  const width=
   Number(
    preset.useProjectResolution
     ? resolution.w
     : preset.width||
       resolution.w||
       1920
   );

  const height=
   Number(
    preset.useProjectResolution
     ? resolution.h
     : preset.height||
       resolution.h||
       1080
   );

  const fps=
   Number(
    preset.useProjectFPS
     ? settings.fps
     : preset.fps||
       settings.fps||
       30
   );

  const fallbackUsed=
   !!(
    requestedFormatId &&
    formatId &&
    requestedFormatId!==
    formatId
   );

  return {
   presetId:
    preset.id,

   presetName:
    preset.name,

   group:
    preset.group,

   icon:
    preset.icon,

   description:
    preset.description,

   tags:
    [
     ...(preset.tags||[])
    ],

   filename:
    preset.filename||
    '{project}_{date}_{resolution}',

   range:
    preset.range||
    'entire',

   requestedFormatId,

   formatId,

   formatFallbackUsed:
    fallbackUsed,

   width:
    Math.max(
     1,
     Math.round(
      width||
      1920
     )
    ),

   height:
    Math.max(
     1,
     Math.round(
      height||
      1080
     )
    ),

   fps:
    Math.max(
     1,
     Number(
      fps||
      30
     )
    ),

   videoBitrateMbps:
    Math.max(
     .25,
     Number(
      preset.videoBitrateMbps||
      12
     )
    ),

   audioBitrateKbps:
    Math.max(
     32,
     Number(
      preset.audioBitrateKbps||
      192
     )
    ),

   includeVideo:
    preset.includeVideo!==
    false,

   includeAudio:
    preset.includeAudio!==
    false,

   scaleMode:
    preset.scaleMode||
    'fit',

   quality:
    preset.quality||
    'balanced',

   alpha:
    !!preset.alpha,

   hardwarePreferred:
    preset.hardwarePreferred!==
    false,

   twoPassPreferred:
    !!preset.twoPassPreferred,

   optimizedFor:
    preset.optimizedFor||
    'general',

   notes:
    preset.notes||
    ''
  };
 }

 describe(id,project=null){
  const resolved=
   this.resolve(
    id,
    project
   );

  if(!resolved){
   return null;
  }

  return {
   id:
    resolved.presetId,

   name:
    resolved.presetName,

   group:
    resolved.group,

   resolution:
    `${resolved.width}×${resolved.height}`,

   fps:
    resolved.fps,

   codec:
    this.capabilities
     ?.get?.(
      resolved.formatId
     )
     ?.codec||
    resolved.formatId,

   bitrate:
    resolved.videoBitrateMbps,

   audioBitrate:
    resolved.audioBitrateKbps,

   fallback:
    resolved.formatFallbackUsed
  };
 }

 /* ============================================================
    BUILT-IN PRESETS
    ============================================================ */

 _registerBuiltins(){

  /* ------------------------------------------------------------
     GENERAL
     ------------------------------------------------------------ */

  this.register({
   id:'custom',
   name:'Custom Export',
   group:'General',
   order:10,
   icon:'sliders',

   description:
    'Start from the current project format and customize every render option.',

   tags:[
    'custom',
    'project',
    'manual'
   ],

   useProjectResolution:true,
   useProjectFPS:true,

   formatId:'mp4-h264',

   videoBitrateMbps:12,
   audioBitrateKbps:192,

   quality:'balanced',
   scaleMode:'fit',
   optimizedFor:'general'
  });

  this.register({
   id:'project-match',
   name:'Match Project',
   group:'General',
   order:20,
   icon:'project',

   description:
    'Match the active project resolution and frame rate.',

   tags:[
    'project',
    'timeline',
    'match'
   ],

   useProjectResolution:true,
   useProjectFPS:true,

   formatId:'mp4-h264',

   videoBitrateMbps:18,
   audioBitrateKbps:192,

   quality:'high',
   scaleMode:'fit',
   optimizedFor:'project'
  });


  /* ------------------------------------------------------------
     MASTER
     ------------------------------------------------------------ */

  this.register({
   id:'master-1080',
   name:'Master 1080p',
   group:'Master',
   order:10,
   icon:'master',

   description:
    'High-bitrate Full HD master for archiving and high-quality delivery.',

   tags:[
    'master',
    '1080p',
    'full hd',
    'archive'
   ],

   width:1920,
   height:1080,

   useProjectFPS:true,

   formatId:'mp4-h264',

   videoBitrateMbps:32,
   audioBitrateKbps:320,

   quality:'master',
   scaleMode:'fit',

   hardwarePreferred:true,
   optimizedFor:'master',

   notes:
    'High-quality Full HD delivery master.'
  });

  this.register({
   id:'master-1440',
   name:'Master QHD 1440p',
   group:'Master',
   order:20,
   icon:'master',

   description:
    'High-quality 2560×1440 master.',

   tags:[
    'master',
    '1440p',
    'qhd'
   ],

   width:2560,
   height:1440,

   useProjectFPS:true,

   formatId:'mp4-h264',

   videoBitrateMbps:48,
   audioBitrateKbps:320,

   quality:'master',
   scaleMode:'fit',

   hardwarePreferred:true,
   optimizedFor:'master'
  });

  this.register({
   id:'master-4k',
   name:'Master UHD 4K',
   group:'Master',
   order:30,
   icon:'master',

   description:
    'High-bitrate UHD master for premium delivery and archive.',

   tags:[
    'master',
    '4k',
    'uhd',
    'archive'
   ],

   width:3840,
   height:2160,

   useProjectFPS:true,

   formatId:'mp4-h264',

   videoBitrateMbps:70,
   audioBitrateKbps:320,

   quality:'master',
   scaleMode:'fit',

   hardwarePreferred:true,
   optimizedFor:'master',

   notes:
    'High-quality UHD delivery master.'
  });


  /* ------------------------------------------------------------
     ONLINE
     ------------------------------------------------------------ */

  this.register({
   id:'youtube-720',
   name:'YouTube 720p',
   group:'Online',
   order:10,
   icon:'online',

   description:
    'Compact HD preset for online video delivery.',

   tags:[
    'youtube',
    'online',
    '720p'
   ],

   width:1280,
   height:720,

   useProjectFPS:true,

   formatId:'mp4-h264',

   videoBitrateMbps:7,
   audioBitrateKbps:192,

   quality:'balanced',
   scaleMode:'fit',
   optimizedFor:'online'
  });

  this.register({
   id:'youtube-1080',
   name:'YouTube 1080p',
   group:'Online',
   order:20,
   icon:'online',

   description:
    'Balanced Full HD preset for online platforms.',

   tags:[
    'youtube',
    'online',
    '1080p'
   ],

   width:1920,
   height:1080,

   useProjectFPS:true,

   formatId:'mp4-h264',

   videoBitrateMbps:12,
   audioBitrateKbps:192,

   quality:'balanced',
   scaleMode:'fit',
   optimizedFor:'online'
  });

  this.register({
   id:'youtube-1440',
   name:'YouTube 1440p',
   group:'Online',
   order:30,
   icon:'online',

   description:
    'High-quality QHD online delivery preset.',

   tags:[
    'youtube',
    'online',
    '1440p',
    'qhd'
   ],

   width:2560,
   height:1440,

   useProjectFPS:true,

   formatId:'mp4-h264',

   videoBitrateMbps:24,
   audioBitrateKbps:256,

   quality:'high',
   scaleMode:'fit',
   optimizedFor:'online'
  });

  this.register({
   id:'youtube-4k',
   name:'YouTube 4K',
   group:'Online',
   order:40,
   icon:'online',

   description:
    'High-quality UHD preset for online delivery.',

   tags:[
    'youtube',
    'online',
    '4k',
    'uhd'
   ],

   width:3840,
   height:2160,

   useProjectFPS:true,

   formatId:'mp4-h264',

   videoBitrateMbps:45,
   audioBitrateKbps:256,

   quality:'high',
   scaleMode:'fit',
   optimizedFor:'online'
  });

  this.register({
   id:'web-vp9-1080',
   name:'Web VP9 1080p',
   group:'Online',
   order:50,
   icon:'web',

   description:
    'Efficient WebM VP9 delivery preset.',

   tags:[
    'web',
    'vp9',
    'webm',
    '1080p'
   ],

   width:1920,
   height:1080,

   useProjectFPS:true,

   formatId:'webm-vp9',

   videoBitrateMbps:9,
   audioBitrateKbps:160,

   quality:'balanced',
   scaleMode:'fit',
   optimizedFor:'web'
  });

  this.register({
   id:'web-av1-1080',
   name:'Web AV1 1080p',
   group:'Online',
   order:60,
   icon:'web',

   description:
    'Modern AV1 WebM preset when supported by the runtime.',

   tags:[
    'web',
    'av1',
    'webm',
    '1080p'
   ],

   width:1920,
   height:1080,

   useProjectFPS:true,

   formatId:'webm-av1',

   videoBitrateMbps:7,
   audioBitrateKbps:160,

   quality:'high',
   scaleMode:'fit',
   optimizedFor:'web'
  });


  /* ------------------------------------------------------------
     SOCIAL
     ------------------------------------------------------------ */

  this.register({
   id:'social-vertical',
   name:'Vertical 1080 × 1920',
   group:'Social',
   order:10,
   icon:'phone',

   description:
    '9:16 vertical preset for short-form social video.',

   tags:[
    'vertical',
    '9:16',
    'social',
    'short form'
   ],

   width:1080,
   height:1920,

   useProjectFPS:true,

   formatId:'mp4-h264',

   videoBitrateMbps:12,
   audioBitrateKbps:192,

   quality:'balanced',
   scaleMode:'fit',
   optimizedFor:'social'
  });

  this.register({
   id:'social-square',
   name:'Square 1080 × 1080',
   group:'Social',
   order:20,
   icon:'social',

   description:
    '1:1 square social-media delivery preset.',

   tags:[
    'square',
    '1:1',
    'social'
   ],

   width:1080,
   height:1080,

   useProjectFPS:true,

   formatId:'mp4-h264',

   videoBitrateMbps:10,
   audioBitrateKbps:192,

   quality:'balanced',
   scaleMode:'fit',
   optimizedFor:'social'
  });

  this.register({
   id:'social-portrait',
   name:'Portrait 1080 × 1350',
   group:'Social',
   order:30,
   icon:'phone',

   description:
    '4:5 portrait preset for social feeds.',

   tags:[
    'portrait',
    '4:5',
    'social'
   ],

   width:1080,
   height:1350,

   useProjectFPS:true,

   formatId:'mp4-h264',

   videoBitrateMbps:10,
   audioBitrateKbps:192,

   quality:'balanced',
   scaleMode:'fit',
   optimizedFor:'social'
  });


  /* ------------------------------------------------------------
     PREVIEW
     ------------------------------------------------------------ */

  this.register({
   id:'draft-540',
   name:'Fast Draft 540p',
   group:'Preview',
   order:10,
   icon:'draft',

   description:
    'Low-cost preview export for fast review cycles.',

   tags:[
    'draft',
    'preview',
    'fast',
    '540p'
   ],

   width:960,
   height:540,

   useProjectFPS:true,

   formatId:'webm-vp8',

   videoBitrateMbps:1.8,
   audioBitrateKbps:96,

   quality:'draft',
   scaleMode:'fit',
   optimizedFor:'preview'
  });

  this.register({
   id:'draft-720',
   name:'Draft 720p',
   group:'Preview',
   order:20,
   icon:'draft',

   description:
    'Fast HD preview export with reduced bitrate.',

   tags:[
    'draft',
    'preview',
    '720p'
   ],

   width:1280,
   height:720,

   useProjectFPS:true,

   formatId:'webm-vp8',

   videoBitrateMbps:3,
   audioBitrateKbps:128,

   quality:'draft',
   scaleMode:'fit',
   optimizedFor:'preview'
  });

  this.register({
   id:'preview-1080',
   name:'Review 1080p',
   group:'Preview',
   order:30,
   icon:'draft',

   description:
    'Full HD review copy with moderate bitrate.',

   tags:[
    'preview',
    'review',
    '1080p'
   ],

   width:1920,
   height:1080,

   useProjectFPS:true,

   formatId:'webm-vp9',

   videoBitrateMbps:6,
   audioBitrateKbps:128,

   quality:'balanced',
   scaleMode:'fit',
   optimizedFor:'preview'
  });
 }

 /* ============================================================
    INTERNAL HELPERS
    ============================================================ */

 _normalizePreset(preset){
  return {
   id:
    String(
     preset.id
    ),

   name:
    String(
     preset.name
    ),

   group:
    preset.group||
    'General',

   order:
    Number(
     preset.order||
     0
    ),

   icon:
    preset.icon||
    'sliders',

   description:
    preset.description||
    '',

   tags:
    Array.isArray(
     preset.tags
    )
     ? [
        ...preset.tags
       ]
     : [],

   filename:
    preset.filename||
    '{project}_{date}_{resolution}',

   range:
    preset.range||
    'entire',

   formatId:
    preset.formatId||
    'mp4-h264',

   width:
    preset.width!=null
     ? Number(
        preset.width
       )
     : null,

   height:
    preset.height!=null
     ? Number(
        preset.height
       )
     : null,

   fps:
    preset.fps!=null
     ? Number(
        preset.fps
       )
     : null,

   useProjectResolution:
    !!preset.useProjectResolution,

   useProjectFPS:
    preset.useProjectFPS!==
    false,

   videoBitrateMbps:
    Number(
     preset.videoBitrateMbps||
     12
    ),

   audioBitrateKbps:
    Number(
     preset.audioBitrateKbps||
     192
    ),

   includeVideo:
    preset.includeVideo!==
    false,

   includeAudio:
    preset.includeAudio!==
    false,

   scaleMode:
    preset.scaleMode||
    'fit',

   quality:
    preset.quality||
    'balanced',

   alpha:
    !!preset.alpha,

   hardwarePreferred:
    preset.hardwarePreferred!==
    false,

   twoPassPreferred:
    !!preset.twoPassPreferred,

   optimizedFor:
    preset.optimizedFor||
    'general',

   notes:
    preset.notes||
    ''
  };
 }

 _groupIndex(group){
  const index=
   this.groupOrder.indexOf(
    group
   );

  return index>=0
   ? index
   : this.groupOrder.length+
     1;
 }
}

global.VideoDeliverPresetLibrary=
 VideoDeliverPresetLibrary;

global.videoDeliverPresetLibrary=
 global.videoDeliverPresetLibrary ||
 new VideoDeliverPresetLibrary(
  global.videoExportCapabilities
 );

})(window);
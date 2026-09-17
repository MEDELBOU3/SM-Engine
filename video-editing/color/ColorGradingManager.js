/**
 * ColorGradingManager.js
 * SM Engine Video Editing — DaVinci-inspired color grading state + render bridge.
 *
 * Persistent grade:
 *   videoProject.color.clips[clipId]
 *
 * Runtime compatibility:
 *   clip.grade / clip.curves
 *   videoEditingManager item.grade / item.curves
 */
(function(global){
'use strict';

const DEFAULT_CURVE = () => [
 {x:0,y:0},
 {x:1,y:1}
];

const DEFAULT_GRADE = () => ({
 __smSchema:'normalized-v1',
 enabled:true,

 exposure:0,
 contrast:1,
 pivot:.435,
 saturation:1,
 hue:0,
 temperature:0,
 tint:0,
 colorBoost:0,
 midtoneDetail:0,

 wheels:{
  lift:{x:0,y:0,level:0},
  gamma:{x:0,y:0,level:0},
  gain:{x:0,y:0,level:0},
  offset:{x:0,y:0,level:0}
 },

 curves:{
  master:DEFAULT_CURVE(),
  red:DEFAULT_CURVE(),
  green:DEFAULT_CURVE(),
  blue:DEFAULT_CURVE()
 }
});

class ColorGradingManager{
 constructor(project=null){
  this.project=
   project ||
   global.videoProject ||
   global.ensureVideoProjectState?.() ||
   null;

  this.enabled=true;
  this._listeners=[];
  this._fallbackPatched=false;

  this._bindProject();

  /*
   * IMPORTANT:
   * Do NOT wrap CanvasController.drawItem here.
   *
   * SM Engine already has the professional render patch from
   * video-editor-advanced.js. Wrapping drawItem a second time caused the
   * imported image to be filtered twice and, more importantly, identity
   * SVG curves could be pushed through ctx.filter url(...), which can make
   * Chromium/Electron canvas images appear gray/white.
   *
   * ColorGradingManager now only synchronizes grade data into the existing
   * render pipeline. One renderer owns the pixels.
   */
 }

 selectedClip(){
  const id=
   this.project?.selection?.primaryClipId ||
   global.sequencerManager
    ?.state
    ?.primarySelection
    ?.id ||
   null;

  const clip=
   this.project?.getClip?.(id) ||
   this.project?.timeline?.clips?.find(
    item=>item.id===id
   ) ||
   global.sequencerManager
    ?.state
    ?.primarySelection ||
   null;

  if(!clip){
   return null;
  }

  if(
   clip.mediaType==='audio' ||
   clip.type==='audio'
  ){
   return null;
  }

  return clip;
 }

 ensureGrade(clipOrId){
  const clip=
   typeof clipOrId==='string'
    ? (
      this.project?.getClip?.(clipOrId) ||
      this.project?.timeline?.clips?.find(
       item=>item.id===clipOrId
      )
     )
    : (
      clipOrId ||
      this.selectedClip()
     );

  if(!clip){
   return null;
  }

  const stored=
   this.project?.color?.clips?.[
    clip.id
   ] ||
   {};

  const merged=
   this._mergeGrade(
    DEFAULT_GRADE(),
    clip.grade || {},
    stored
   );

  if(this.project){
   this.project.state.color.clips[
    clip.id
   ]=
    merged;
  }

  clip.grade=
   this._clone(merged);

  clip.curves=
   this._clone(
    merged.curves
   );

  return merged;
 }

 update(path,value,clipOrId=null,options={}){
  const clip=
   typeof clipOrId==='string'
    ? (
      this.project?.getClip?.(clipOrId) ||
      this.project?.timeline?.clips?.find(
       item=>item.id===clipOrId
      )
     )
    : (
      clipOrId ||
      this.selectedClip()
     );

  if(!clip){
   return false;
  }

  const grade=
   this.ensureGrade(clip);

  this._setPath(
   grade,
   path,
   value
  );

  this._commit(
   clip,
   grade,
   path,
   options
  );

  return true;
 }

 patch(patch={},clipOrId=null,options={}){
  const clip=
   typeof clipOrId==='string'
    ? (
      this.project?.getClip?.(clipOrId) ||
      this.project?.timeline?.clips?.find(
       item=>item.id===clipOrId
      )
     )
    : (
      clipOrId ||
      this.selectedClip()
     );

  if(!clip){
   return false;
  }

  const grade=
   this.ensureGrade(clip);

  this._deepAssign(
   grade,
   patch
  );

  this._commit(
   clip,
   grade,
   'patch',
   options
  );

  return true;
 }

 setWheel(name,patch={},clipOrId=null){
  const allowed=[
   'lift',
   'gamma',
   'gain',
   'offset'
  ];

  if(!allowed.includes(name)){
   return false;
  }

  const clip=
   typeof clipOrId==='string'
    ? (
      this.project?.getClip?.(clipOrId) ||
      this.project?.timeline?.clips?.find(
       item=>item.id===clipOrId
      )
     )
    : (
      clipOrId ||
      this.selectedClip()
     );

  if(!clip){
   return false;
  }

  const grade=
   this.ensureGrade(clip);

  grade.wheels[name]={
   ...grade.wheels[name],
   ...patch
  };

  grade.wheels[name].x=
   this._clamp(
    Number(grade.wheels[name].x||0),
    -1,
    1
   );

  grade.wheels[name].y=
   this._clamp(
    Number(grade.wheels[name].y||0),
    -1,
    1
   );

  grade.wheels[name].level=
   this._clamp(
    Number(grade.wheels[name].level||0),
    -1,
    1
   );

  this._commit(
   clip,
   grade,
   `wheel.${name}`
  );

  return true;
 }

 setCurve(channel,points,clipOrId=null){
  const allowed=[
   'master',
   'red',
   'green',
   'blue'
  ];

  if(!allowed.includes(channel)){
   return false;
  }

  const clip=
   typeof clipOrId==='string'
    ? (
      this.project?.getClip?.(clipOrId) ||
      this.project?.timeline?.clips?.find(
       item=>item.id===clipOrId
      )
     )
    : (
      clipOrId ||
      this.selectedClip()
     );

  if(!clip){
   return false;
  }

  const grade=
   this.ensureGrade(clip);

  grade.curves[channel]=
   this._normalizePoints(
    points
   );

  this._commit(
   clip,
   grade,
   `curve.${channel}`
  );

  return true;
 }

 reset(clipOrId=null){
  const clip=
   typeof clipOrId==='string'
    ? (
      this.project?.getClip?.(clipOrId) ||
      this.project?.timeline?.clips?.find(
       item=>item.id===clipOrId
      )
     )
    : (
      clipOrId ||
      this.selectedClip()
     );

  if(!clip){
   return false;
  }

  const grade=
   DEFAULT_GRADE();

  this._commit(
   clip,
   grade,
   'reset'
  );

  return true;
 }

 resetWheel(name,clipOrId=null){
  return this.setWheel(
   name,
   {
    x:0,
    y:0,
    level:0
   },
   clipOrId
  );
 }

 toggleEnabled(clipOrId=null){
  const clip=
   typeof clipOrId==='string'
    ? (
      this.project?.getClip?.(clipOrId) ||
      this.project?.timeline?.clips?.find(
       item=>item.id===clipOrId
      )
     )
    : (
      clipOrId ||
      this.selectedClip()
     );

  if(!clip){
   return false;
  }

  const grade=
   this.ensureGrade(clip);

  grade.enabled=
   grade.enabled===false;

  this._commit(
   clip,
   grade,
   'enabled'
  );

  return grade.enabled;
 }

 syncClipToRuntime(clipOrId=null){
  const clip=
   typeof clipOrId==='string'
    ? (
      this.project?.getClip?.(clipOrId) ||
      this.project?.timeline?.clips?.find(
       item=>item.id===clipOrId
      )
     )
    : (
      clipOrId ||
      this.selectedClip()
     );

  if(!clip){
   return false;
  }

  const grade=
   this.ensureGrade(clip);

  clip.grade=
   this._clone(grade);

  if (
   this._hasNonIdentityCurves(
    grade.curves
   )
  ) {
   clip.curves=
    this._clone(
     grade.curves
    );

   clip._smColorOwnsCurves=
    true;
  } else if (
   clip._smColorOwnsCurves
  ) {
   delete clip.curves;
   delete clip._smColorOwnsCurves;
  }

  const item=
   this._runtimeItemForClip(
    clip
   );

  if(!item){
   return true;
  }

  const exposureBrightness=
   (
    Math.pow(
     2,
     Number(grade.exposure||0)
    )-
    1
   )*
   100;

  item.grade={
   ...(item.grade||{}),

   __smSchema:
    'legacy-percent-v1',

   /*
    * Compatibility with the existing professional color patch in
    * video-editor-advanced.js.
    */
   exposure:
    exposureBrightness,

   contrast:
    Number(grade.contrast||1)*
    100,

   saturation:
    Number(grade.saturation||1)*
    100,

   temp:
    Number(grade.temperature||0),

   tint:
    Number(grade.tint||0),

   hue:
    Number(grade.hue||0),

   pivot:
    Number(grade.pivot??.435),

   midtoneDetail:
    Number(grade.midtoneDetail||0),

   colorBoost:
    Number(grade.colorBoost||0),

   shadows:{
    x:
     Number(
      grade.wheels
       ?.lift
       ?.x ||
      0
     ),
    y:
     Number(
      grade.wheels
       ?.lift
       ?.y ||
      0
     )
   },

   wheels:
    this._clone(
     grade.wheels
    ),

   enabled:
    grade.enabled!==false
  };

  /*
   * Do not attach identity curves to every imported image/video.
   *
   * video-editor-advanced.js sees `item.curves` and adds an SVG
   * `url(#vea-filter-...)` to CanvasRenderingContext2D.filter.
   * On Chromium/Electron that URL filter is not reliable for canvas media
   * and was the main reason a freshly imported image could become gray/white.
   *
   * Only expose runtime curves after the user has actually changed a curve.
   */
  if (
   this._hasNonIdentityCurves(
    grade.curves
   )
  ) {
   item.curves=
    this._legacyCurves(
     grade.curves
    );

   item._smColorOwnsCurves=
    true;
  } else if (
   item._smColorOwnsCurves
  ) {
   delete item.curves;
   delete item._smColorOwnsCurves;
  }

  item._smColorGrade=
   this._clone(grade);

  return true;
 }

 requestRender(){
  const manager=
   global.videoEditingManager;

  const clip=
   this.selectedClip();

  if(clip){
   this.syncClipToRuntime(
    clip
   );
  }

  const playhead=
   global.sequencerManager
    ?.state
    ?.playhead ??
   manager?.currentTime ??
   0;

  manager?.renderCompositeAt?.(
   playhead
  );

  manager?.renderCanvas?.();

  global.dispatchEvent(
   new CustomEvent(
    'videoColorGradeChanged',
    {
     detail:{
      clip,
      grade:
       clip
        ? this.ensureGrade(clip)
        : null
     }
    }
   )
  );
 }

 buildFallbackFilter(grade,existing='none'){
  if(
   !grade ||
   grade.enabled===false
  ){
   return existing||'none';
  }

  const parts=[];

  if(
   existing &&
   existing!=='none'
  ){
   parts.push(existing);
  }

  const exposure=
   Math.pow(
    2,
    Number(grade.exposure||0)
   );

  parts.push(
   `brightness(${Math.max(.01,exposure)})`
  );

  parts.push(
   `contrast(${Math.max(0,Number(grade.contrast||1))})`
  );

  parts.push(
   `saturate(${Math.max(0,Number(grade.saturation||1))})`
  );

  if(
   Number(grade.hue||0)!==0
  ){
   parts.push(
    `hue-rotate(${Number(grade.hue||0)}deg)`
   );
  }

  /*
   * Temperature/Tint approximation for the plain Canvas fallback.
   * The dedicated GPU color pipeline can replace this later.
   */
  const temperature=
   Number(
    grade.temperature||
    0
   );

  const tint=
   Number(
    grade.tint||
    0
   );

  if(
   Math.abs(temperature)>0.01
  ){
   parts.push(
    `sepia(${Math.min(.18,Math.abs(temperature)/700)})`
   );

   parts.push(
    `hue-rotate(${temperature>0?-8:8}deg)`
   );
  }

  if(
   Math.abs(tint)>0.01
  ){
   parts.push(
    `hue-rotate(${tint*.08}deg)`
   );
  }

  return parts.join(' ')||
   'none';
 }

 _commit(clip,grade,reason,options={}){
  const clean=
   this._clone(grade);

  if(this.project){
   this.project.state.color.clips[
    clip.id
   ]=
    clean;

   this.project.touch?.(
    'color.clipGrade',
    {
     clipId:
      clip.id,
     reason,
     grade:
      this._clone(clean)
    },
    options
   );
  }

  clip.grade=
   this._clone(clean);

  clip.curves=
   this._clone(
    clean.curves
   );

  this.syncClipToRuntime(
   clip
  );

  this.requestRender();
 }

 _runtimeItemForClip(clip){
  const manager=
   global.videoEditingManager;

  if(!manager){
   return null;
  }

  return (
   manager.items?.find(
    item =>
     item.id===
      clip.mediaRef ||
     item.clipId===
      clip.id
   ) ||
   manager.compositionRuntime
    ?.itemForClip?.(
     clip
    ) ||
   null
  );
 }

 _legacyCurves(curves){
  const source=
   curves ||
   {};

  const master=
   this._normalizePoints(
    source.master
   );

  const result={};

  [
   'red',
   'green',
   'blue'
  ].forEach(channel=>{
   const points=
    this._normalizePoints(
     source[channel]
    );

   const combined=[];

   for(let i=0;i<=16;i++){
    const x=i/16;

    const masterY=
     this._evalCurve(
      master,
      x
     );

    const y=
     this._evalCurve(
      points,
      masterY
     );

    combined.push({
     x,
     y:
      this._clamp(
       y,
       0,
       1
      )
    });
   }

   result[channel]=
    combined;
  });

  return result;
 }

 _hasNonIdentityCurves(curves){
  const source=
   curves ||
   {};

  return [
   'master',
   'red',
   'green',
   'blue'
  ]
  .some(
   channel =>
    !this._isIdentityCurve(
     source[channel]
    )
  );
 }

 _isIdentityCurve(points){
  const curve=
   this._normalizePoints(
    points
   );

  if(curve.length!==2){
   return false;
  }

  const a=
   curve[0];

  const b=
   curve[1];

  return (
   Math.abs(a.x)<=.000001 &&
   Math.abs(a.y)<=.000001 &&
   Math.abs(b.x-1)<=.000001 &&
   Math.abs(b.y-1)<=.000001
  );
 }

 _installFallbackRenderBridge(){
  /*
   * Retained only for backward compatibility with older builds that may call
   * this private method. Pixel processing is owned by the existing
   * video-editor-advanced renderer.
   */
  this._fallbackPatched=false;
 }

 _bindProject(){
  this._listeners
   .forEach(
    unsubscribe =>
     unsubscribe?.()
   );

  this._listeners=[];

  if(
   !this.project?.subscribe
  ){
   return;
  }

  const selection=
   this.project.subscribe(
    'selection.*',
    ()=>{
     const clip=
      this.selectedClip();

     if(clip){
      this.syncClipToRuntime(
       clip
      );
     }
    }
   );

  const color=
   this.project.subscribe(
    'color.*',
    event=>{
     const clipId=
      event.detail?.clipId;

     if(clipId){
      this.syncClipToRuntime(
       clipId
      );
     }
    }
   );

  this._listeners.push(
   selection,
   color
  );
 }

 _mergeGrade(...grades){
  const result=
   DEFAULT_GRADE();

  grades.forEach(grade=>{
   if(
    !grade ||
    typeof grade!=='object'
   ){
    return;
   }

   Object.keys(grade)
    .forEach(key=>{
     if(
      key==='wheels' ||
      key==='curves'
     ){
      return;
     }

     result[key]=
      this._clone(
       grade[key]
      );
    });

   if(grade.wheels){
    [
     'lift',
     'gamma',
     'gain',
     'offset'
    ]
    .forEach(name=>{
     result.wheels[name]={
      ...result.wheels[name],
      ...(grade.wheels[name]||{})
     };
    });
   }

   if(grade.curves){
    [
     'master',
     'red',
     'green',
     'blue'
    ]
    .forEach(channel=>{
     if(grade.curves[channel]){
      result.curves[channel]=
       this._normalizePoints(
        grade.curves[channel]
       );
     }
    });
   }
  });

  return result;
 }

 _normalizePoints(points){
  const source=
   Array.isArray(points)
    ? points
    : DEFAULT_CURVE();

  const normalized=
   source
    .map(point=>({
     x:
      this._clamp(
       Number(point.x||0),
       0,
       1
      ),
     y:
      this._clamp(
       Number(point.y||0),
       0,
       1
      )
    }))
    .sort(
     (a,b)=>
      a.x-b.x
    );

  if(
   !normalized.length ||
   normalized[0].x>0
  ){
   normalized.unshift({
    x:0,
    y:0
   });
  }

  if(
   normalized[
    normalized.length-1
   ].x<1
  ){
   normalized.push({
    x:1,
    y:1
   });
  }

  return normalized;
 }

 _evalCurve(points,x){
  const p=
   this._normalizePoints(
    points
   );

  if(x<=p[0].x){
   return p[0].y;
  }

  for(
   let i=1;
   i<p.length;
   i++
  ){
   if(x<=p[i].x){
    const a=p[i-1];
    const b=p[i];

    const t=
     (
      x-a.x
     )/
     Math.max(
      .000001,
      b.x-a.x
     );

    return a.y+
     (
      b.y-a.y
     )*
     t;
   }
  }

  return p[
   p.length-1
  ].y;
 }

 _setPath(target,path,value){
  const parts=
   String(path)
    .split('.')
    .filter(Boolean);

  if(!parts.length){
   return;
  }

  let object=target;

  for(
   let i=0;
   i<parts.length-1;
   i++
  ){
   const key=
    parts[i];

   if(
    !object[key] ||
    typeof object[key]!=='object'
   ){
    object[key]={};
   }

   object=
    object[key];
  }

  object[
   parts[
    parts.length-1
   ]
  ]=
   value;
 }

 _deepAssign(target,patch){
  Object.entries(
   patch||{}
  )
  .forEach(
   ([key,value])=>{
    if(
     value &&
     typeof value==='object' &&
     !Array.isArray(value)
    ){
     if(
      !target[key] ||
      typeof target[key]!=='object' ||
      Array.isArray(target[key])
     ){
      target[key]={};
     }

     this._deepAssign(
      target[key],
      value
     );
    }else{
     target[key]=
      this._clone(value);
    }
   }
  );
 }

 _clone(value){
  if(
   global.structuredClone
  ){
   try{
    return global.structuredClone(
     value
    );
   }catch(_){}
  }

  return JSON.parse(
   JSON.stringify(
    value
   )
  );
 }

 _clamp(value,min,max){
  return Math.max(
   min,
   Math.min(
    max,
    value
   )
  );
 }
}

global.ColorGradingManager=
 ColorGradingManager;

global.ensureColorGradingManager=
 function ensureColorGradingManager(
  project
 ){
  if(
   !global.colorGradingManager
  ){
   global.colorGradingManager=
    new ColorGradingManager(
     project ||
     global.videoProject ||
     null
    );
  }

  return global.colorGradingManager;
 };

global.ensureColorGradingManager();

})(window);
/**
 * AudioStudioManager.js
 * SM Engine — Phase 15 Professional Audio Studio.
 *
 * Fairlight-inspired architecture:
 * - track channel strips
 * - 6-band parametric EQ
 * - compressor + limiter
 * - 6 realtime insert slots
 * - stereo pan / fader / mute / solo
 * - track + master metering
 * - WebAudio routing remains runtime-only
 *
 * Persistent state stays in window.videoProject.state.audio.
 */
(function(global){
'use strict';

const AudioContextClass =
 global.AudioContext ||
 global.webkitAudioContext;

const EQ_BANDS = [
 {id:'band1',type:'lowshelf',frequency:100,gain:0,q:.7,enabled:true},
 {id:'band2',type:'peaking',frequency:250,gain:0,q:1,enabled:true},
 {id:'band3',type:'peaking',frequency:800,gain:0,q:1,enabled:true},
 {id:'band4',type:'peaking',frequency:2200,gain:0,q:1,enabled:true},
 {id:'band5',type:'peaking',frequency:6500,gain:0,q:1,enabled:true},
 {id:'band6',type:'highshelf',frequency:12000,gain:0,q:.7,enabled:true}
];

const DEFAULT_TRACK = {
 gain:1,
 pan:0,
 muted:false,
 solo:false,
 automationMode:'read',

 eq:{
  enabled:true,
  bands:EQ_BANDS
 },

 compressor:{
  enabled:true,
  threshold:-18,
  knee:16,
  ratio:3,
  attack:.01,
  release:.22
 },

 limiter:{
  enabled:true,
  threshold:-1,
  knee:0,
  ratio:20,
  attack:.003,
  release:.08
 },

 effects:[]
};

const DEFAULT_MASTER = {
 gain:1,
 muted:false,
 limiterEnabled:true,
 limiterThreshold:-1
};

class AudioStudioManager{
 constructor(project=null){
  this.project=
   project ||
   global.videoProject ||
   global.ensureVideoProjectState?.() ||
   null;

  this.context=null;

  this.masterInput=null;
  this.masterGainNode=null;
  this.limiter=null;
  this.masterAnalyser=null;

  this.trackBuses=new Map();
  this.mediaRoutes=new WeakMap();
  this.itemRoutes=new Map();

  this.selectedTrackId=null;
  this.active=false;

  this.host=null;
  this.workspace=null;

  this.mixerPanel=null;
  this.effectsRack=null;
  this.waveformEditor=null;

  this._meterRaf=0;
  this._unsubs=[];
  this._impulseCache=new Map();

  this._afterDraw=
   event=>
    this._onAfterDraw(
     event
    );

  global.addEventListener(
   'videoCompositionAfterDraw',
   this._afterDraw
  );

  this._ensureAudioState();
  this._bindProject();
  this._styles();
 }

 /* ============================================================
    PROJECT STATE
    ============================================================ */

 _ensureAudioState(){
  if(!this.project?.state){
   return null;
  }

  this.project.state.audio=
   this.project.state.audio ||
   {};

  const audio=
   this.project.state.audio;

  audio.trackStates=
   audio.trackStates ||
   {};

  audio.master={
   ...DEFAULT_MASTER,
   ...(audio.master||{})
  };

  return audio;
 }

 _clone(value){
  if(global.structuredClone){
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

 _normalizeEffect(effect,index=0){
  const type=
   effect?.type ||
   'gain';

  const defaults=
   this.effectDefaults(
    type
   );

  return {
   id:
    effect?.id ||
    this.project?.makeId?.(
     'audio-fx'
    ) ||
    `audio-fx-${Date.now()}-${index}-${Math.random().toString(36).slice(2,7)}`,

   type,
   name:
    effect?.name ||
    defaults.name,

   enabled:
    effect?.enabled !==
    false,

   mix:
    Number.isFinite(
     Number(
      effect?.mix
     )
    )
     ? Number(
        effect.mix
       )
     : defaults.mix,

   params:{
    ...defaults.params,
    ...(effect?.params||{})
   }
  };
 }

 ensureTrackState(id){
  if(!id){
   return this._clone(
    DEFAULT_TRACK
   );
  }

  const audio=
   this._ensureAudioState();

  if(!audio){
   return this._clone(
    DEFAULT_TRACK
   );
  }

  const existing=
   audio.trackStates[id] ||
   {};

  /*
   * Migrate old Phase 4 3-band EQ to Phase 15 6-band EQ.
   */
  let bands=
   Array.isArray(
    existing.eq?.bands
   )
    ? existing.eq.bands
    : this._clone(
       EQ_BANDS
      );

  if(
   !Array.isArray(
    existing.eq?.bands
   ) &&
   existing.eq
  ){
   const old=
    existing.eq;

   bands[0].gain=
    Number(
     old.lowGain ||
     0
    );

   bands[2].gain=
    Number(
     old.midGain ||
     0
    );

   bands[2].frequency=
    Number(
     old.midFreq ||
     800
    );

   bands[2].q=
    Number(
     old.midQ ||
     1
    );

   bands[5].gain=
    Number(
     old.highGain ||
     0
    );
  }

  bands=
   EQ_BANDS.map(
    (fallback,index)=>({
     ...fallback,
     ...(bands[index]||{}),
     id:
      fallback.id
    })
   );

  const normalized={
   ...this._clone(
    DEFAULT_TRACK
   ),

   ...existing,

   eq:{
    enabled:
     existing.eq?.enabled !==
     false,

    bands
   },

   compressor:{
    ...DEFAULT_TRACK.compressor,
    ...(existing.compressor||{})
   },

   limiter:{
    ...DEFAULT_TRACK.limiter,
    ...(existing.limiter||{})
   },

   effects:
    (
     Array.isArray(
      existing.effects
     )
      ? existing.effects
      : []
    )
    .slice(
     0,
     6
    )
    .map(
     (effect,index)=>
      this._normalizeEffect(
       effect,
       index
      )
    )
  };

  audio.trackStates[id]=
   normalized;

  return normalized;
 }

 /* ============================================================
    ACTIVATION
    ============================================================ */

 async activate(context={}){
  this.active=true;

  document.body.classList.add(
   'audio-studio-active'
  );

  await this.ensureContext();

  try{
   if(
    this.context?.state===
    'suspended'
   ){
    await this.context.resume();
   }
  }catch(_){}

  if(context.host){
   this.host=
    context.host;
  }

  this.syncTracks();
  this.syncRuntimeMedia();
  this.refresh();
  this._startMeters();

  return true;
 }

 enter(context={}){
  return this.activate(
   context
  );
 }

 show(context={}){
  return this.activate(
   context
  );
 }

 deactivate(){
  this.active=false;

  document.body.classList.remove(
   'audio-studio-active'
  );

  this._stopMeters();

  return true;
 }

 exit(){
  return this.deactivate();
 }

 hide(){
  return this.deactivate();
 }

 /* ============================================================
    WEB AUDIO ENGINE
    ============================================================ */

 async ensureContext(){
  if(
   this.context &&
   this.context.state!==
   'closed'
  ){
   return this.context;
  }

  if(!AudioContextClass){
   console.warn(
    '[AudioStudio] WebAudio is unavailable.'
   );

   return null;
  }

  try{
   this.context=
    new AudioContextClass({
     latencyHint:
      'interactive',

     sampleRate:
      Number(
       this.project
        ?.settings
        ?.sampleRate ||
       48000
      )
    });
  }catch(_){
   this.context=
    new AudioContextClass();
  }

  const context=
   this.context;

  this.masterInput=
   context.createGain();

  this.masterGainNode=
   context.createGain();

  this.limiter=
   context.createDynamicsCompressor();

  this.masterAnalyser=
   context.createAnalyser();

  this.masterAnalyser.fftSize=
   2048;

  this.masterAnalyser.smoothingTimeConstant=
   .76;

  this.masterInput
   .connect(
    this.masterGainNode
   )
   .connect(
    this.limiter
   )
   .connect(
    this.masterAnalyser
   )
   .connect(
    context.destination
   );

  this._applyMaster();

  context.addEventListener?.(
   'statechange',
   ()=>{
    this._syncContextBadge();

    try{
     global.dispatchEvent(
      new CustomEvent(
       'audioStudioEngineState',
       {
        detail:{
         state:
          context.state,

         sampleRate:
          context.sampleRate
        }
       }
      )
     );
    }catch(_){}
   }
  );

  return context;
 }

 _applyMaster(){
  if(!this.context){
   return;
  }

  const audio=
   this._ensureAudioState();

  const master=
   audio?.master ||
   DEFAULT_MASTER;

  const now=
   this.context.currentTime;

  this.masterGainNode
   ?.gain
   ?.setTargetAtTime(
    master.muted
     ? 0
     : Math.max(
        0,
        Number(
         master.gain ??
         1
        )
       ),
    now,
    .01
   );

  const limiterOn=
   master.limiterEnabled !==
   false;

  this.limiter
   ?.threshold
   ?.setTargetAtTime(
    limiterOn
     ? Number(
        master.limiterThreshold ??
        -1
       )
     : 0,
    now,
    .01
   );

  this.limiter
   ?.knee
   ?.setValueAtTime(
    limiterOn
     ? 0
     : 40,
    now
   );

  this.limiter
   ?.ratio
   ?.setValueAtTime(
    limiterOn
     ? 20
     : 1,
    now
   );

  this.limiter
   ?.attack
   ?.setValueAtTime(
    limiterOn
     ? .003
     : .01,
    now
   );

  this.limiter
   ?.release
   ?.setValueAtTime(
    limiterOn
     ? .08
     : .2,
    now
   );
 }

 ensureTrackBus(id){
  if(
   !id ||
   !this.context
  ){
   return null;
  }

  if(
   this.trackBuses.has(
    id
   )
  ){
   return this.trackBuses.get(
    id
   );
  }

  const context=
   this.context;

  const input=
   context.createGain();

  const eqBands=
   EQ_BANDS.map(
    ()=>{
     const node=
      context.createBiquadFilter();

     return node;
    }
   );

  const compressor=
   context.createDynamicsCompressor();

  const insertInput=
   context.createGain();

  const insertOutput=
   context.createGain();

  const limiter=
   context.createDynamicsCompressor();

  const pan=
   context.createStereoPanner
    ? context.createStereoPanner()
    : context.createGain();

  const gain=
   context.createGain();

  const analyser=
   context.createAnalyser();

  analyser.fftSize=
   2048;

  analyser.smoothingTimeConstant=
   .7;

  input.connect(
   eqBands[0]
  );

  for(
   let index=0;
   index<
   eqBands.length-1;
   index++
  ){
   eqBands[index]
    .connect(
     eqBands[index+1]
    );
  }

  eqBands[
   eqBands.length-1
  ]
   .connect(
    compressor
   )
   .connect(
    insertInput
   );

  insertOutput
   .connect(
    limiter
   )
   .connect(
    pan
   )
   .connect(
    gain
   )
   .connect(
    analyser
   )
   .connect(
    this.masterInput
   );

  const bus={
   trackId:id,

   input,
   eqBands,
   compressor,
   insertInput,
   insertOutput,
   insertNodes:[],
   limiter,
   pan,
   gain,
   analyser,

   meterBuffer:
    new Float32Array(
     analyser.fftSize
    )
  };

  this.trackBuses.set(
   id,
   bus
  );

  this._rebuildInsertChain(
   id
  );

  this.updateTrackBus(
   id
  );

  return bus;
 }

 _rebuildInsertChain(id){
  const bus=
   this.trackBuses.get(
    id
   );

  if(
   !bus ||
   !this.context
  ){
   return;
  }

  try{
   bus.insertInput.disconnect();
  }catch(_){}

  for(
   const unit of
   bus.insertNodes
  ){
   for(
    const node of
    unit.nodes ||
    []
   ){
    try{
     node.disconnect();
    }catch(_){}
   }
  }

  bus.insertNodes=[];

  const state=
   this.ensureTrackState(
    id
   );

  let previous=
   bus.insertInput;

  const effects=
   state.effects
    .slice(
     0,
     6
    );

  for(
   const effect of
   effects
  ){
   if(
    effect.enabled===
    false
   ){
    continue;
   }

   const unit=
    this._createInsertUnit(
     effect
    );

   if(!unit){
    continue;
   }

   previous.connect(
    unit.input
   );

   previous=
    unit.output;

   bus.insertNodes.push(
    unit
   );
  }

  previous.connect(
   bus.insertOutput
  );
 }

 _createInsertUnit(effect){
  if(!this.context){
   return null;
  }

  const context=
   this.context;

  const type=
   effect.type;

  const params=
   effect.params ||
   {};

  if(type==='gain'){
   const node=
    context.createGain();

   node.gain.value=
    this.dbToLinear(
     Number(
      params.gainDb ||
      0
     )
    );

   return {
    input:node,
    output:node,
    nodes:[node]
   };
  }

  if(
   type==='highpass' ||
   type==='lowpass'
  ){
   const node=
    context.createBiquadFilter();

   node.type=
    type;

   node.frequency.value=
    Math.max(
     20,
     Number(
      params.frequency ||
      (
       type==='highpass'
        ? 80
        : 12000
      )
     )
    );

   node.Q.value=
    Math.max(
     .1,
     Number(
      params.q ||
      .7
     )
    );

   return {
    input:node,
    output:node,
    nodes:[node]
   };
  }

  if(type==='compressor'){
   const node=
    context.createDynamicsCompressor();

   node.threshold.value=
    Number(
     params.threshold ??
     -18
    );

   node.knee.value=
    Number(
     params.knee ??
     16
    );

   node.ratio.value=
    Number(
     params.ratio ??
     3
    );

   node.attack.value=
    Number(
     params.attack ??
     .01
    );

   node.release.value=
    Number(
     params.release ??
     .2
    );

   return {
    input:node,
    output:node,
    nodes:[node]
   };
  }

  if(type==='delay'){
   const input=
    context.createGain();

   const output=
    context.createGain();

   const dry=
    context.createGain();

   const wet=
    context.createGain();

   const delay=
    context.createDelay(
     5
    );

   const feedback=
    context.createGain();

   const mix=
    this._clamp(
     Number(
      effect.mix ??
      .25
     ),
     0,
     1
    );

   dry.gain.value=
    1-mix;

   wet.gain.value=
    mix;

   delay.delayTime.value=
    this._clamp(
     Number(
      params.time ??
      .22
     ),
     0,
     5
    );

   feedback.gain.value=
    this._clamp(
     Number(
      params.feedback ??
      .22
     ),
     0,
     .92
    );

   input
    .connect(
     dry
    )
    .connect(
     output
    );

   input
    .connect(
     delay
    )
    .connect(
     wet
    )
    .connect(
     output
    );

   delay
    .connect(
     feedback
    )
    .connect(
     delay
    );

   return {
    input,
    output,
    nodes:[
     input,
     output,
     dry,
     wet,
     delay,
     feedback
    ]
   };
  }

  if(type==='reverb'){
   const input=
    context.createGain();

   const output=
    context.createGain();

   const dry=
    context.createGain();

   const wet=
    context.createGain();

   const convolver=
    context.createConvolver();

   const mix=
    this._clamp(
     Number(
      effect.mix ??
      .25
     ),
     0,
     1
    );

   dry.gain.value=
    1-mix;

   wet.gain.value=
    mix;

   convolver.buffer=
    this._getImpulseResponse(
     Number(
      params.decay ??
      1.6
     ),
     Number(
      params.damping ??
      .45
     )
    );

   input
    .connect(
     dry
    )
    .connect(
     output
    );

   input
    .connect(
     convolver
    )
    .connect(
     wet
    )
    .connect(
     output
    );

   return {
    input,
    output,
    nodes:[
     input,
     output,
     dry,
     wet,
     convolver
    ]
   };
  }

  return null;
 }

 _getImpulseResponse(
  decay=1.6,
  damping=.45
 ){
  if(!this.context){
   return null;
  }

  decay=
   this._clamp(
    decay,
    .2,
    6
   );

  damping=
   this._clamp(
    damping,
    0,
    1
   );

  const key=
   `${decay.toFixed(2)}:${damping.toFixed(2)}:${this.context.sampleRate}`;

  if(
   this._impulseCache.has(
    key
   )
  ){
   return this._impulseCache.get(
    key
   );
  }

  const length=
   Math.max(
    1,
    Math.floor(
     this.context.sampleRate*
     decay
    )
   );

  const buffer=
   this.context.createBuffer(
    2,
    length,
    this.context.sampleRate
   );

  for(
   let channel=0;
   channel<2;
   channel++
  ){
   const data=
    buffer.getChannelData(
     channel
    );

   for(
    let index=0;
    index<length;
    index++
   ){
    const t=
     index/
     length;

    const envelope=
     Math.pow(
      1-t,
      1.5+
      damping*
      4
     );

    data[index]=
     (
      Math.random()*
      2-
      1
     )*
     envelope;
   }
  }

  this._impulseCache.set(
   key,
   buffer
  );

  return buffer;
 }

 /* ============================================================
    TRACK SYNC
    ============================================================ */

 syncTracks(){
  if(!this.context){
   return;
  }

  const tracks=
   this.project
    ?.timeline
    ?.tracks ||
   [];

  const keep=
   new Set();

  tracks.forEach(
   track=>{
    keep.add(
     track.id
    );

    this.ensureTrackState(
     track.id
    );

    this.ensureTrackBus(
     track.id
    );

    this.updateTrackBus(
     track.id
    );
   }
  );

  [
   ...this.trackBuses.keys()
  ].forEach(
   id=>{
    if(
     !keep.has(
      id
     )
    ){
     this._destroyBus(
      id
     );
    }
   }
  );

  this._repairSelection();
  this._renderTrackList();
 }

 updateTrackBus(id){
  if(!this.context){
   return;
  }

  const bus=
   this.trackBuses.get(
    id
   ) ||
   this.ensureTrackBus(
    id
   );

  if(!bus){
   return;
  }

  const state=
   this.ensureTrackState(
    id
   );

  const track=
   this.project
    ?.timeline
    ?.tracks
    ?.find(
     candidate=>
      candidate.id===
      id
    );

  const tracks=
   this.project
    ?.timeline
    ?.tracks ||
   [];

  const trackStates=
   this.project
    ?.state
    ?.audio
    ?.trackStates ||
   {};

  const anySolo=
   tracks.some(
    candidate=>
     candidate.solo
   ) ||
   Object.values(
    trackStates
   ).some(
    candidate=>
     candidate?.solo
   );

  const solo=
   !!(
    track?.solo ||
    state.solo
   );

  const muted=
   !!(
    track?.muted ||
    state.muted ||
    (
     anySolo &&
     !solo
    )
   );

  const now=
   this.context.currentTime;

  bus.gain
   .gain
   .setTargetAtTime(
    muted
     ? 0
     : Math.max(
        0,
        Number(
         state.gain ??
         1
        )
       ),
    now,
    .01
   );

  if(bus.pan.pan){
   bus.pan.pan
    .setTargetAtTime(
     this._clamp(
      Number(
       state.pan ||
       0
      ),
      -1,
      1
     ),
     now,
     .01
    );
  }

  const eq=
   state.eq;

  eq.bands.forEach(
   (band,index)=>{
    const node=
     bus.eqBands[index];

    if(!node){
     return;
    }

    try{
     node.type=
      [
       'lowshelf',
       'highshelf',
       'peaking',
       'notch',
       'highpass',
       'lowpass'
      ].includes(
       band.type
      )
       ? band.type
       : 'peaking';
    }catch(_){}

    node.frequency
     .setTargetAtTime(
      this._clamp(
       Number(
        band.frequency ||
        1000
       ),
       20,
       Math.max(
        100,
        this.context.sampleRate/
        2-
        100
       )
      ),
      now,
      .01
     );

    node.Q
     .setTargetAtTime(
      this._clamp(
       Number(
        band.q ??
        1
       ),
       .1,
       18
      ),
      now,
      .01
     );

    node.gain
     .setTargetAtTime(
      (
       eq.enabled===
       false ||
       band.enabled===
       false
      )
       ? 0
       : this._clamp(
          Number(
           band.gain ||
           0
          ),
          -24,
          24
         ),
      now,
      .01
     );
   }
  );

  const compressor=
   state.compressor;

  bus.compressor
   .threshold
   .setTargetAtTime(
    compressor.enabled===
    false
     ? 0
     : Number(
        compressor.threshold ??
        -18
       ),
    now,
    .01
   );

  bus.compressor
   .knee
   .setTargetAtTime(
    Number(
     compressor.knee ??
     16
    ),
    now,
    .01
   );

  bus.compressor
   .ratio
   .setTargetAtTime(
    compressor.enabled===
    false
     ? 1
     : Number(
        compressor.ratio ??
        3
       ),
    now,
    .01
   );

  bus.compressor
   .attack
   .setTargetAtTime(
    Number(
     compressor.attack ??
     .01
    ),
    now,
    .01
   );

  bus.compressor
   .release
   .setTargetAtTime(
    Number(
     compressor.release ??
     .22
    ),
    now,
    .01
   );

  const limiter=
   state.limiter;

  bus.limiter
   .threshold
   .setTargetAtTime(
    limiter.enabled===
    false
     ? 0
     : Number(
        limiter.threshold ??
        -1
       ),
    now,
    .01
   );

  bus.limiter
   .knee
   .setTargetAtTime(
    limiter.enabled===
    false
     ? 40
     : Number(
        limiter.knee ??
        0
       ),
    now,
    .01
   );

  bus.limiter
   .ratio
   .setTargetAtTime(
    limiter.enabled===
    false
     ? 1
     : Number(
        limiter.ratio ??
        20
       ),
    now,
    .01
   );

  bus.limiter
   .attack
   .setTargetAtTime(
    Number(
     limiter.attack ??
     .003
    ),
    now,
    .01
   );

  bus.limiter
   .release
   .setTargetAtTime(
    Number(
     limiter.release ??
     .08
    ),
    now,
    .01
   );
 }

 updateAllTrackBuses(){
  this.trackBuses.forEach(
   (
    _,
    id
   )=>
    this.updateTrackBus(
     id
    )
  );
 }

 setTrackGain(id,value){
  const state=
   this.ensureTrackState(
    id
   );

  state.gain=
   Math.max(
    0,
    Number(
     value
    )||
    0
   );

  this._touch(
   id,
   'gain'
  );

  this.updateTrackBus(
   id
  );
 }

 setTrackPan(id,value){
  const state=
   this.ensureTrackState(
    id
   );

  state.pan=
   this._clamp(
    Number(
     value
    )||
    0,
    -1,
    1
   );

  this._touch(
   id,
   'pan'
  );

  this.updateTrackBus(
   id
  );
 }

 setTrackMuted(id,value){
  const state=
   this.ensureTrackState(
    id
   );

  state.muted=
   !!value;

  const track=
   this.project
    ?.timeline
    ?.tracks
    ?.find(
     candidate=>
      candidate.id===
      id
    );

  if(track){
   track.muted=
    !!value;
  }

  this._touch(
   id,
   'muted'
  );

  this.updateAllTrackBuses();
 }

 setTrackSolo(id,value){
  const state=
   this.ensureTrackState(
    id
   );

  state.solo=
   !!value;

  const track=
   this.project
    ?.timeline
    ?.tracks
    ?.find(
     candidate=>
      candidate.id===
      id
    );

  if(track){
   track.solo=
    !!value;
  }

  this._touch(
   id,
   'solo'
  );

  this.updateAllTrackBuses();
 }

 setAutomationMode(id,mode){
  const allowed=[
   'off',
   'read',
   'touch',
   'latch',
   'write'
  ];

  const state=
   this.ensureTrackState(
    id
   );

  state.automationMode=
   allowed.includes(
    mode
   )
    ? mode
    : 'read';

  this._touch(
   id,
   'automation'
  );
 }

 setTrackEQ(id,patch){
  const state=
   this.ensureTrackState(
    id
   );

  if(
   patch &&
   Array.isArray(
    patch.bands
   )
  ){
   state.eq.bands=
    EQ_BANDS.map(
     (fallback,index)=>({
      ...fallback,
      ...(patch.bands[index]||{})
     })
    );
  }

  if(
   patch &&
   patch.enabled !==
   undefined
  ){
   state.eq.enabled=
    !!patch.enabled;
  }

  /*
   * Backward-compatible old Phase 4 setters.
   */
  if(
   patch?.lowGain !==
   undefined
  ){
   state.eq.bands[0].gain=
    Number(
     patch.lowGain
    );
  }

  if(
   patch?.midGain !==
   undefined
  ){
   state.eq.bands[2].gain=
    Number(
     patch.midGain
    );
  }

  if(
   patch?.midFreq !==
   undefined
  ){
   state.eq.bands[2].frequency=
    Number(
     patch.midFreq
    );
  }

  if(
   patch?.midQ !==
   undefined
  ){
   state.eq.bands[2].q=
    Number(
     patch.midQ
    );
  }

  if(
   patch?.highGain !==
   undefined
  ){
   state.eq.bands[5].gain=
    Number(
     patch.highGain
    );
  }

  this._touch(
   id,
   'eq'
  );

  this.updateTrackBus(
   id
  );
 }

 setEQBand(
  id,
  index,
  patch={}
 ){
  const state=
   this.ensureTrackState(
    id
   );

  index=
   Math.max(
    0,
    Math.min(
     5,
     Number(
      index
     )||
     0
    )
   );

  state.eq.bands[index]={
   ...state.eq.bands[index],
   ...patch,
   id:
    EQ_BANDS[index].id
  };

  this._touch(
   id,
   `eq-band-${index+1}`
  );

  this.updateTrackBus(
   id
  );
 }

 setTrackCompressor(id,patch){
  const state=
   this.ensureTrackState(
    id
   );

  state.compressor={
   ...state.compressor,
   ...patch
  };

  this._touch(
   id,
   'compressor'
  );

  this.updateTrackBus(
   id
  );
 }

 setTrackLimiter(id,patch){
  const state=
   this.ensureTrackState(
    id
   );

  state.limiter={
   ...state.limiter,
   ...patch
  };

  this._touch(
   id,
   'limiter'
  );

  this.updateTrackBus(
   id
  );
 }

 /* ============================================================
    INSERT EFFECTS
    ============================================================ */

 effectDefaults(type){
  const library={
   gain:{
    name:'Gain',
    mix:1,
    params:{
     gainDb:0
    }
   },

   highpass:{
    name:'High Pass',
    mix:1,
    params:{
     frequency:80,
     q:.7
    }
   },

   lowpass:{
    name:'Low Pass',
    mix:1,
    params:{
     frequency:12000,
     q:.7
    }
   },

   compressor:{
    name:'Compressor',
    mix:1,
    params:{
     threshold:-18,
     knee:16,
     ratio:3,
     attack:.01,
     release:.2
    }
   },

   delay:{
    name:'Delay',
    mix:.25,
    params:{
     time:.22,
     feedback:.22
    }
   },

   reverb:{
    name:'Reverb',
    mix:.25,
    params:{
     decay:1.6,
     damping:.45
    }
   }
  };

  return this._clone(
   library[type] ||
   library.gain
  );
 }

 effectLibrary(){
  return [
   {
    type:'gain',
    name:'Gain'
   },
   {
    type:'highpass',
    name:'High Pass'
   },
   {
    type:'lowpass',
    name:'Low Pass'
   },
   {
    type:'compressor',
    name:'Compressor'
   },
   {
    type:'delay',
    name:'Delay'
   },
   {
    type:'reverb',
    name:'Reverb'
   }
  ];
 }

 addTrackEffect(
  id,
  type='gain'
 ){
  const state=
   this.ensureTrackState(
    id
   );

  if(
   state.effects.length>=
   6
  ){
   return null;
  }

  const defaults=
   this.effectDefaults(
    type
   );

  const effect=
   this._normalizeEffect(
    {
     type,
     name:
      defaults.name,
     mix:
      defaults.mix,
     params:
      defaults.params
    },
    state.effects.length
   );

  state.effects.push(
   effect
  );

  this._touch(
   id,
   'effect-add'
  );

  this._rebuildInsertChain(
   id
  );

  return effect;
 }

 removeTrackEffect(
  id,
  effectId
 ){
  const state=
   this.ensureTrackState(
    id
   );

  const before=
   state.effects.length;

  state.effects=
   state.effects.filter(
    effect=>
     effect.id !==
     effectId
   );

  if(
   before===
   state.effects.length
  ){
   return false;
  }

  this._touch(
   id,
   'effect-remove'
  );

  this._rebuildInsertChain(
   id
  );

  return true;
 }

 updateTrackEffect(
  id,
  effectId,
  patch={}
 ){
  const state=
   this.ensureTrackState(
    id
   );

  const effect=
   state.effects.find(
    candidate=>
     candidate.id===
     effectId
   );

  if(!effect){
   return false;
  }

  if(
   patch.type &&
   patch.type !==
   effect.type
  ){
   const defaults=
    this.effectDefaults(
     patch.type
    );

   effect.type=
    patch.type;

   effect.name=
    defaults.name;

   effect.mix=
    defaults.mix;

   effect.params=
    this._clone(
     defaults.params
    );
  }

  if(
   patch.enabled !==
   undefined
  ){
   effect.enabled=
    !!patch.enabled;
  }

  if(
   patch.mix !==
   undefined
  ){
   effect.mix=
    this._clamp(
     Number(
      patch.mix
     ),
     0,
     1
    );
  }

  if(patch.params){
   effect.params={
    ...effect.params,
    ...patch.params
   };
  }

  this._touch(
   id,
   'effect-update'
  );

  this._rebuildInsertChain(
   id
  );

  return true;
 }

 moveTrackEffect(
  id,
  effectId,
  direction
 ){
  const state=
   this.ensureTrackState(
    id
   );

  const index=
   state.effects.findIndex(
    effect=>
     effect.id===
     effectId
   );

  if(index<0){
   return false;
  }

  const target=
   index+
   (
    direction<0
     ? -1
     : 1
   );

  if(
   target<0 ||
   target>=
   state.effects.length
  ){
   return false;
  }

  const [
   effect
  ]=
   state.effects.splice(
    index,
    1
   );

  state.effects.splice(
   target,
   0,
   effect
  );

  this._touch(
   id,
   'effect-move'
  );

  this._rebuildInsertChain(
   id
  );

  return true;
 }

 /* ============================================================
    MASTER
    ============================================================ */

 setMasterGain(value){
  const audio=
   this._ensureAudioState();

  const gain=
   Math.max(
    0,
    Number(
     value
    )||
    0
   );

  audio.master.gain=
   gain;

  if(global.videoEditingManager){
   global.videoEditingManager.masterGain=
    gain;
  }

  this.project?.touch?.(
   'audio.master.gain',
   {
    value:
     gain
   }
  );

  this._applyMaster();
 }

 setMasterMuted(value){
  const audio=
   this._ensureAudioState();

  audio.master.muted=
   !!value;

  this.project?.touch?.(
   'audio.master.muted',
   {
    value:
     !!value
   }
  );

  this._applyMaster();
 }

 setMasterLimiter(patch={}){
  const audio=
   this._ensureAudioState();

  if(
   patch.enabled !==
   undefined
  ){
   audio.master.limiterEnabled=
    !!patch.enabled;
  }

  if(
   patch.threshold !==
   undefined
  ){
   audio.master.limiterThreshold=
    Number(
     patch.threshold
    );
  }

  this.project?.touch?.(
   'audio.master.limiter',
   {
    ...patch
   }
  );

  this._applyMaster();
 }

 /* ============================================================
    MEDIA ROUTING
    ============================================================ */

 _canRoute(media,item){
  const src=
   media.currentSrc ||
   media.src ||
   item?.src ||
   '';

  if(
   /^(blob:|data:|file:)/i
    .test(
     src
    )
  ){
   return true;
  }

  try{
   const url=
    new URL(
     src,
     location.href
    );

   return (
    url.origin===
    location.origin
   );
  }catch(_){
   return false;
  }
 }

 routeRuntimeItem(
  item,
  clip,
  evaluated=clip
 ){
  if(
   !this.context ||
   !item ||
   !clip
  ){
   return null;
  }

  const media=
   item._video ||
   item._audio;

  if(!media){
   return null;
  }

  let route=
   this.mediaRoutes.get(
    media
   );

  if(!route){
   if(
    !this._canRoute(
     media,
     item
    )
   ){
    return null;
   }

   const bus=
    this.ensureTrackBus(
     clip.trackId
    );

   if(!bus){
    return null;
   }

   try{
    const source=
     this.context
      .createMediaElementSource(
       media
      );

    const clipGain=
     this.context
      .createGain();

    source
     .connect(
      clipGain
     )
     .connect(
      bus.input
     );

    route={
     itemId:
      item.id,

     clipId:
      clip.id,

     trackId:
      clip.trackId,

     media,
     source,
     clipGain,
     connected:true
    };

    this.mediaRoutes.set(
     media,
     route
    );

    this.itemRoutes.set(
     item.id,
     route
    );

    /*
     * Routed MediaElementSource should remain unity on the native element.
     */
    media.defaultMuted=false;
    media.muted=false;
    media.volume=1;
   }catch(error){
    console.warn(
     '[AudioStudio] Media route failed. Native audio fallback remains active.',
     error
    );

    return null;
   }
  }

  if(
   route.trackId !==
   clip.trackId
  ){
   const bus=
    this.ensureTrackBus(
     clip.trackId
    );

   try{
    route.clipGain
     .disconnect();

    route.clipGain
     .connect(
      bus.input
     );

    route.trackId=
     clip.trackId;
   }catch(_){}
  }

  route.itemId=
   item.id;

  route.clipId=
   clip.id;

  this.itemRoutes.set(
   item.id,
   route
  );

  const gain=
   Math.max(
    0,
    Number(
     evaluated?.volume ??
     item._runtimeVolume ??
     clip.volume ??
     1
    )
   );

  const muted=
   !!(
    item._runtimeMuted ||
    clip.muted
   );

  route.clipGain
   .gain
   .setTargetAtTime(
    muted
     ? 0
     : gain,
    this.context.currentTime,
    .005
   );

  this.updateTrackBus(
   clip.trackId
  );

  return route;
 }

 isMediaRouted(media){
  const route=
   media
    ? this.mediaRoutes.get(
       media
      )
    : null;

  return !!(
   route?.connected &&
   this.context &&
   this.context.state!==
   'closed'
  );
 }

 syncRuntimeMedia(){
  const runtime=
   global.videoEditingManager
    ?.compositionRuntime;

  const items=
   runtime?.items ||
   global.videoEditingManager?.items ||
   [];

  items.forEach(
   item=>{
    const clip=
     runtime?.clipForItem?.(
      item
     ) ||
     this.project
      ?.timeline
      ?.clips
      ?.find(
       candidate=>
        candidate.mediaRef===
         item.id ||
        candidate.id===
         item.clipId
      );

    if(clip){
     this.routeRuntimeItem(
      item,
      clip,
      clip
     );
    }
   }
  );
 }

 _onAfterDraw(event){
  const detail=
   event?.detail;

  if(
   this.context &&
   detail?.item &&
   detail?.clip
  ){
   this.routeRuntimeItem(
    detail.item,
    detail.clip,
    detail.evaluated
   );
  }
 }

 /* ============================================================
    SELECTION
    ============================================================ */

 selectTrack(id){
  const track=
   this.project
    ?.timeline
    ?.tracks
    ?.find(
     candidate=>
      candidate.id===
      id
    );

  if(!track){
   return false;
  }

  this.selectedTrackId=
   id;

  if(
   this.project?.state
    ?.selection
  ){
   this.project.state.selection.audioTrackId=
    id;
  }

  this.project?.touch?.(
   'selection.audioTrack',
   {
    audioTrackId:
     id
   },
   {
    dirty:false,
    autosave:false
   }
  );

  this.mixerPanel
   ?.syncSelection?.();

  this.effectsRack
   ?.render?.();

  try{
   global.dispatchEvent(
    new CustomEvent(
     'audioStudioSelectionChanged',
     {
      detail:{
       trackId:id,
       track
      }
     }
    )
   );
  }catch(_){}

  return true;
 }

 getSelectedTrack(){
  this._repairSelection();

  return (
   this.project
    ?.timeline
    ?.tracks
    ?.find(
     track=>
      track.id===
      this.selectedTrackId
    ) ||
   null
  );
 }

 getSelectedClip(){
  const id=
   this.project
    ?.selection
    ?.primaryClipId ||
   this.project
    ?.state
    ?.selection
    ?.primaryClipId ||
   global.sequencerManager
    ?.state
    ?.primarySelection
    ?.id ||
   null;

  return (
   this.project?.getClip?.(
    id
   ) ||
   this.project
    ?.timeline
    ?.clips
    ?.find(
     clip=>
      clip.id===
      id
    ) ||
   (
    global.sequencerManager
     ?.state
     ?.primarySelection &&
    typeof global.sequencerManager
     .state
     .primarySelection===
     'object'
     ? global.sequencerManager
       .state
       .primarySelection
     : null
   )
  );
 }

 _repairSelection(){
  const tracks=
   this.project
    ?.timeline
    ?.tracks ||
   [];

  if(
   this.selectedTrackId &&
   tracks.some(
    track=>
     track.id===
     this.selectedTrackId
   )
  ){
   return;
  }

  const requested=
   this.project
    ?.state
    ?.selection
    ?.audioTrackId;

  this.selectedTrackId=
   (
    requested &&
    tracks.some(
     track=>
      track.id===
      requested
    )
   )
    ? requested
    : (
       tracks.find(
        track=>
         track.type===
         'audio'
       )?.id ||
       tracks[0]?.id ||
       null
      );
 }

 /* ============================================================
    METERS
    ============================================================ */

 _startMeters(){
  if(this._meterRaf){
   return;
  }

  const loop=()=>{
   if(!this.active){
    this._meterRaf=0;
    return;
   }

   const tracks={};

   this.trackBuses.forEach(
    (
     bus,
     id
    )=>{
     tracks[id]=
      this._meter(
       bus.analyser,
       bus.meterBuffer,
       bus
      );
    }
   );

   const masterBuffer=
    this.masterAnalyser
     ? new Float32Array(
        this.masterAnalyser.fftSize
       )
     : null;

   const master=
    (
     this.masterAnalyser &&
     masterBuffer
    )
     ? this._meter(
        this.masterAnalyser,
        masterBuffer,
        null
       )
     : {
        rmsDb:-96,
        peakDb:-96,
        reductionDb:0
       };

   try{
    global.dispatchEvent(
     new CustomEvent(
      'audioStudioMeters',
      {
       detail:{
        tracks,
        master,
        time:
         performance.now()
       }
      }
     )
    );
   }catch(_){}

   this._syncPlayIcon();

   this._meterRaf=
    requestAnimationFrame(
     loop
    );
  };

  this._meterRaf=
   requestAnimationFrame(
    loop
   );
 }

 _stopMeters(){
  if(this._meterRaf){
   cancelAnimationFrame(
    this._meterRaf
   );
  }

  this._meterRaf=0;
 }

 _meter(
  analyser,
  buffer,
  bus
 ){
  if(
   !analyser ||
   !buffer
  ){
   return {
    rmsDb:-96,
    peakDb:-96,
    reductionDb:0
   };
  }

  analyser.getFloatTimeDomainData(
   buffer
  );

  let sum=0;
  let peak=0;

  for(
   const sample of
   buffer
  ){
   sum+=
    sample*
    sample;

   peak=
    Math.max(
     peak,
     Math.abs(
      sample
     )
    );
  }

  const rms=
   Math.sqrt(
    sum/
    Math.max(
     1,
     buffer.length
    )
   );

  return {
   rmsDb:
    this.linearToDb(
     rms
    ),

   peakDb:
    this.linearToDb(
     peak
    ),

   reductionDb:
    bus?.compressor
     ? Number(
        bus.compressor
         .reduction ||
        0
       )
     : 0
  };
 }

 /* ============================================================
    EQ RESPONSE
    ============================================================ */

 getTrackFrequencyResponse(
  id,
  points=160
 ){
  const bus=
   this.trackBuses.get(
    id
   );

  if(
   !bus ||
   !this.context
  ){
   return null;
  }

  const frequency=
   new Float32Array(
    points
   );

  const magnitude=
   new Float32Array(
    points
   );

  const phase=
   new Float32Array(
    points
   );

  const finalMagnitude=
   new Float32Array(
    points
   );

  finalMagnitude.fill(
   1
  );

  const min=20;
  const max=
   Math.min(
    20000,
    this.context.sampleRate/
    2-
    1
   );

  for(
   let index=0;
   index<points;
   index++
  ){
   const ratio=
    index/
    Math.max(
     1,
     points-
     1
    );

   frequency[index]=
    min*
    Math.pow(
     max/
     min,
     ratio
    );
  }

  for(
   const node of
   bus.eqBands
  ){
   node.getFrequencyResponse(
    frequency,
    magnitude,
    phase
   );

   for(
    let index=0;
    index<points;
    index++
   ){
    finalMagnitude[index]*=
     magnitude[index];
   }
  }

  return {
   frequency,
   magnitudeDb:
    Float32Array.from(
     finalMagnitude,
     value=>
      this.linearToDb(
       value
      )
    )
  };
 }

 /* ============================================================
    UTILITIES
    ============================================================ */

 linearToDb(value){
  return value>
   1e-6
   ? Math.max(
      -96,
      20*
      Math.log10(
       value
      )
     )
   : -96;
 }

 dbToLinear(db){
  const value=
   Number(db);

  return value<=
   -96
   ? 0
   : Math.pow(
      10,
      value/
      20
     );
 }

 gainToDb(gain){
  return this.linearToDb(
   Math.max(
    0,
    Number(
     gain
    )||
    0
   )
  );
 }

 _clamp(
  value,
  min,
  max
 ){
  return Math.max(
   min,
   Math.min(
    max,
    value
   )
  );
 }

 _touch(
  id,
  reason
 ){
  this.project?.touch?.(
   'audio.track.updated',
   {
    trackId:id,
    reason
   }
  );

  try{
   global.dispatchEvent(
    new CustomEvent(
     'audioStudioTrackChanged',
     {
      detail:{
       trackId:id,
       reason
      }
     }
    )
   );
  }catch(_){}
 }

 _destroyBus(id){
  const bus=
   this.trackBuses.get(
    id
   );

  if(!bus){
   return;
  }

  const nodes=[
   bus.input,
   ...(bus.eqBands||[]),
   bus.compressor,
   bus.insertInput,
   bus.insertOutput,
   ...(bus.insertNodes||[])
    .flatMap(
     unit=>
      unit.nodes ||
      []
    ),
   bus.limiter,
   bus.pan,
   bus.gain,
   bus.analyser
  ];

  nodes.forEach(
   node=>{
    try{
     node?.disconnect?.();
    }catch(_){}
   }
  );

  this.trackBuses.delete(
   id
  );
 }

 /* ============================================================
    LEGACY FULL WORKSPACE COMPATIBILITY
    ============================================================ */

 mount(host){
  /*
   * Phase 15 primarily uses AudioStudioDockManager.
   * Keep this method so the older AudioWorkspaceBridge does not break.
   */
  this.host=
   host ||
   this.host;

  return true;
 }

 refresh(){
  this.syncTracks();

  this._repairSelection();

  this.mixerPanel?.render?.();
  this.effectsRack?.render?.();
  this.waveformEditor?.render?.();

  this._syncContextBadge();
 }

 _renderTrackList(){
  /*
   * Kept for backwards compatibility with Phase 4 workspace.
   * Dock UI owns track browsing in Phase 15.
   */
 }

 _syncPlayIcon(){
  const icon=
   this.workspace
    ?.querySelector(
     '[data-play-icon]'
    );

  if(icon){
   icon.innerHTML=
    global.sequencerManager
     ?.state
     ?.playing
     ? '❚❚'
     : '▶';
  }
 }

 _syncContextBadge(){
  const label=
   this.workspace
    ?.querySelector(
     '[data-audio-state]'
    );

  if(label){
   label.textContent=
    this.context?.state===
    'running'
     ? `${Math.round(this.context.sampleRate/1000)} kHz · Engine Ready`
     : 'Audio Engine';
  }
 }

 _bindProject(){
  this._unsubs.forEach(
   unsubscribe=>
    unsubscribe?.()
  );

  this._unsubs=[];

  if(
   !this.project?.subscribe
  ){
   return;
  }

  const audio=
   this.project.subscribe(
    'audio.*',
    ()=>{
     this._applyMaster();
     this.updateAllTrackBuses();

     if(this.active){
      this.mixerPanel?.render?.();
      this.effectsRack?.render?.();
     }
    }
   );

  const timeline=
   this.project.subscribe(
    'timeline.*',
    event=>{
     if(
      event.path===
      'timeline.playhead'
     ){
      if(this.active){
       this.waveformEditor
        ?.updatePlayhead?.();
      }

      return;
     }

     if(
      this.context
     ){
      this.syncTracks();
     }

     if(this.active){
      this.refresh();
     }
    }
   );

  const selection=
   this.project.subscribe(
    'selection.*',
    ()=>{
     if(this.active){
      this._repairSelection();
      this.waveformEditor?.render?.();
      this.effectsRack?.render?.();
      this.mixerPanel?.syncSelection?.();
     }
    }
   );

  this._unsubs.push(
   audio,
   timeline,
   selection
  );
 }

 _styles(){
  if(
   document.getElementById(
    'sm-audio-studio-style'
   )
  ){
   return;
  }

  const style=
   document.createElement(
    'style'
   );

  style.id=
   'sm-audio-studio-style';

  style.textContent=`
   body.audio-studio-active{
    --sm-audio-meter-floor:-60;
   }
  `;

  document.head.appendChild(
   style
  );
 }

 destroy(){
  this._stopMeters();

  this._unsubs.forEach(
   unsubscribe=>
    unsubscribe?.()
  );

  this._unsubs=[];

  global.removeEventListener(
   'videoCompositionAfterDraw',
   this._afterDraw
  );

  [
   ...this.trackBuses.keys()
  ].forEach(
   id=>
    this._destroyBus(
     id
    )
  );

  try{
   this.context?.close?.();
  }catch(_){}

  this.context=null;
 }
}

global.AudioStudioManager=
 AudioStudioManager;

global.ensureAudioStudioManager=
 function ensureAudioStudioManager(project){
  if(
   !global.audioStudioManager
  ){
   global.audioStudioManager=
    new AudioStudioManager(
     project ||
     global.videoProject ||
     null
    );
  }else if(
   project &&
   global.audioStudioManager.project !==
   project
  ){
   global.audioStudioManager.project=
    project;

   global.audioStudioManager
    ._ensureAudioState?.();
  }

  return global.audioStudioManager;
 };

global.ensureAudioStudioManager();

})(window);
(function(){
    'use strict';
    class SMAnimatorComponent extends window.SMBehaviour{
        constructor(options={}){
            super({...options,type:'Animator'});
            this.speed=Math.max(0,Number(options.speed??1));
            this.playOnStart=options.playOnStart!==false;
            this.defaultClip=options.defaultClip||null;
            this.rootMotion=options.rootMotion===true;
            this.managedByRuntime=false;
            this.mixer=null;
            this.actions=new Map();
            this.clips=new Map();
            this.currentAction=null;
            this.currentClipName=null;
            this.parameters=new window.SMAnimationParameterSet(options.parameters||{});
            this.stateMachine=new window.SMAnimationStateMachine(options.stateMachine||{});
            this._finishedHandler=event=>this._onFinished(event);
            this._loopHandler=event=>this._onLoop(event);
            this._sourceClips=Array.isArray(options.clips)?options.clips:[];
            this.tickEnabled=true;
            this.fixedTickEnabled=false;
            this.lateTickEnabled=false;
        }
        onAttach(){
            this._collectClips();
            this._ensureMixer();
        }
        onStart(){
            this._collectClips();
            this._ensureMixer();
            window.SMAnimationRuntime?.register?.(this);
            if(this.playOnStart){
                if(this.stateMachine.entryState&&this.stateMachine.states.size)this.stateMachine.tick(this,0);
                else if(this.defaultClip)this.play(this.defaultClip,{fade:0});
                else if(this.clips.size)this.play(this.clips.keys().next().value,{fade:0});
            }
        }
        onUpdate(delta){
            if(this.managedByRuntime)return;
            this.runtimeUpdate(delta);
        }
        onStop(){
            window.SMAnimationRuntime?.unregister?.(this);
            this.stopAll({fade:0});
        }
        onDestroy(){
            window.SMAnimationRuntime?.unregister?.(this);
            this._disposeMixer();
        }
        runtimeUpdate(delta){
            if(!this.enabled||!this.started)return false;
            const dt=Math.max(0,Number(delta)||0);
            this.stateMachine?.tick?.(this,dt);
            this.mixer?.update?.(dt*this.speed);
            return true;
        }
        registerClip(clip,name=null){
            if(!clip)return null;
            const clipName=String(name||clip.name||`Clip_${this.clips.size+1}`);
            this.clips.set(clipName,clip);
            return clip;
        }
        unregisterClip(name){
            const key=String(name);
            const action=this.actions.get(key);
            if(action){
                try{action.stop();this.mixer?.uncacheAction?.(action.getClip?.(),this.owner);}catch{}
                this.actions.delete(key);
            }
            return this.clips.delete(key);
        }
        getClip(name){
            return this.clips.get(String(name))||null;
        }
        getAction(name){
            const key=String(name);
            if(this.actions.has(key))return this.actions.get(key);
            const clip=this.getClip(key);
            if(!clip||!this._ensureMixer())return null;
            const action=this.mixer.clipAction(clip,this.owner);
            this.actions.set(key,action);
            return action;
        }
        play(name,options={}){
            const key=String(name);
            const action=this.getAction(key);
            if(!action){
                console.warn(`[SMAnimatorComponent] Animation clip "${key}" was not found on ${this.owner?.name||'owner'}.`);
                return null;
            }
            const previous=this.currentAction;
            const fade=Math.max(0,Number(options.fade??0.15));
            const loop=options.loop!==undefined?options.loop:true;
            const repetitions=options.repetitions===undefined?Infinity:Number(options.repetitions);
            action.enabled=true;
            action.paused=false;
            action.timeScale=Number(options.speed??1);
            action.clampWhenFinished=options.clampWhenFinished===true||loop===false;
            if(window.THREE){
                const loopMode=loop===false?THREE.LoopOnce:loop==='pingpong'?THREE.LoopPingPong:THREE.LoopRepeat;
                action.setLoop(loopMode,Number.isFinite(repetitions)?repetitions:Infinity);
            }
            if(options.reset!==false)action.reset();
            if(options.startTime!==undefined)action.time=Math.max(0,Number(options.startTime)||0);
            action.play();
            if(previous&&previous!==action){
                if(fade>0){
                    try{previous.crossFadeTo(action,fade,options.warp===true);}catch{previous.fadeOut?.(fade);action.fadeIn?.(fade);}
                }else previous.stop();
            }else if(fade>0)action.fadeIn?.(fade);
            this.currentAction=action;
            this.currentClipName=key;
            this.emit('animation-play',{clip:key,action,previous});
            return action;
        }
        crossFade(name,duration=0.15,options={}){
            return this.play(name,{...options,fade:duration});
        }
        stop(name=null,options={}){
            const action=name?this.actions.get(String(name)):this.currentAction;
            if(!action)return false;
            const fade=Math.max(0,Number(options.fade??0.1));
            if(fade>0)action.fadeOut?.(fade);
            else action.stop?.();
            if(action===this.currentAction){
                this.currentAction=null;
                this.currentClipName=null;
            }
            return true;
        }
        stopAll(options={}){
            const fade=Math.max(0,Number(options.fade??0));
            for(const action of this.actions.values()){
                if(fade>0)action.fadeOut?.(fade);
                else action.stop?.();
            }
            this.currentAction=null;
            this.currentClipName=null;
            return true;
        }
        setFloat(name,value){
            return this.parameters.setFloat(name,value);
        }
        setInt(name,value){
            return this.parameters.setInt(name,value);
        }
        setBool(name,value){
            return this.parameters.setBool(name,value);
        }
        setTrigger(name){
            return this.parameters.setTrigger(name);
        }
        getParameter(name,fallback=null){
            return this.parameters.get(name,fallback);
        }
        setState(name,options={}){
            return this.stateMachine.requestState(name,options);
        }
        _playState(state,options={}){
            return this.play(state.clip,{fade:options.fade??state.fadeIn,speed:state.speed,loop:state.loop,startTime:state.startTime});
        }
        _collectClips(){
            for(const clip of this._sourceClips)this.registerClip(clip);
            for(const clip of this.owner?.animations||[])this.registerClip(clip);
            this.owner?.traverse?.(child=>{
                for(const clip of child.animations||[])this.registerClip(clip);
            });
            return this.clips.size;
        }
        _ensureMixer(){
            if(this.mixer)return this.mixer;
            if(!this.owner||!window.THREE?.AnimationMixer)return null;
            this.mixer=new THREE.AnimationMixer(this.owner);
            this.mixer.addEventListener?.('finished',this._finishedHandler);
            this.mixer.addEventListener?.('loop',this._loopHandler);
            return this.mixer;
        }
        _disposeMixer(){
            if(!this.mixer)return;
            try{
                this.mixer.removeEventListener?.('finished',this._finishedHandler);
                this.mixer.removeEventListener?.('loop',this._loopHandler);
                this.mixer.stopAllAction?.();
                this.mixer.uncacheRoot?.(this.owner);
            }catch{}
            this.actions.clear();
            this.mixer=null;
            this.currentAction=null;
            this.currentClipName=null;
        }
        _onFinished(event){
            const clip=event?.action?.getClip?.();
            this.emit('animation-finished',{clip:clip?.name||this.currentClipName,action:event?.action||null});
        }
        _onLoop(event){
            const clip=event?.action?.getClip?.();
            this.emit('animation-loop',{clip:clip?.name||this.currentClipName,action:event?.action||null,loopDelta:event?.loopDelta||0});
        }
        serializeState(){
            return{speed:this.speed,playOnStart:this.playOnStart,defaultClip:this.defaultClip,rootMotion:this.rootMotion,parameters:this.parameters.serialize(),stateMachine:this.stateMachine.serialize()};
        }
        deserializeState(data={}){
            if(data.speed!==undefined)this.speed=Math.max(0,Number(data.speed)||0);
            if(data.playOnStart!==undefined)this.playOnStart=Boolean(data.playOnStart);
            if(data.defaultClip!==undefined)this.defaultClip=data.defaultClip||null;
            if(data.rootMotion!==undefined)this.rootMotion=Boolean(data.rootMotion);
            if(data.parameters!==undefined)this.parameters.deserialize(data.parameters);
            if(data.stateMachine!==undefined)this.stateMachine.deserialize(data.stateMachine);
            return this;
        }
        debug(){
            const base=super.debug();
            const state={...base,clips:Array.from(this.clips.keys()),actions:Array.from(this.actions.keys()),currentClip:this.currentClipName,state:this.stateMachine.currentState,managedByRuntime:this.managedByRuntime,parameters:this.parameters.snapshot()};
            console.log('[SMAnimatorComponent]',state);
            return state;
        }
    }
    SMAnimatorComponent.componentType='Animator';
    SMAnimatorComponent.executionOrder=20;
    const register=()=>{
        if(!window.SMComponentRegistry?.register)return false;
        if(window.SMComponentRegistry.has?.('Animator'))return true;
        window.SMComponentRegistry.register('Animator',SMAnimatorComponent,{displayName:'Animator',category:'Animation',description:'Three.js AnimationMixer, parameters and animation state machine.',allowMultiple:false,aliases:['SMAnimatorComponent'],executionOrder:20});
        return true;
    };
    window.SMAnimatorComponent=SMAnimatorComponent;
    window.SMAnimatorComponentClass=SMAnimatorComponent;
    if(!register())queueMicrotask(register);
    window.addEventListener?.('sm:runtime-ready',register,{once:true});
})();
(function(){
    'use strict';
    class SMRuntimeWorldBridge{
        constructor(){
            this.id='runtime-world';
            this.priority=950;
            this.world=null;
            this.session=null;
            this._registered=false;
            this._runtimePatched=false;
            this._autoRegister();
            this._patchRuntimeAPI();
        }
        start(session){
            this.session=session;
            this.world=new window.SMRuntimeWorld({session,scene:session?.scene||window.scene||null,eventBus:window.SMRuntimeEventBus||null});
            this.world.start();
            session?.setData?.('world',this.world);
            window.smRuntimeWorld=this.world;
            this._patchRuntimeAPI();
            this._applyWorldFeatureFlags();
            window.SMRuntimeEventBus?.emit?.('worldbridge:started',{bridge:this,world:this.world,session});
            return this.world;
        }
        pause(){
            this.world?.pause?.();
        }
        resume(){
            this.world?.resume?.();
        }
        update(delta,time){
            this.world?.update?.(delta,time);
        }
        fixedUpdate(delta){
            this.world?.fixedUpdate?.(delta);
        }
        stop(session,reason='user'){
            const world=this.world;
            world?.stop?.(reason);
            session?.deleteData?.('world');
            this.world=null;
            this.session=null;
            window.smRuntimeWorld=null;
            window.SMRuntimeEventBus?.emit?.('worldbridge:stopped',{bridge:this,world,session,reason});
        }
        getWorld(){
            return this.world;
        }
        async spawn(source,options={}){
            if(!this.world)throw new Error('Runtime World is not active. Enter Play Mode first.');
            return await this.world.spawn(source,options);
        }
        destroy(object,options={}){
            return this.world?.destroy?.(object,options)||false;
        }
        getRegistry(){
            return this.world?.registry||null;
        }
        getSpawner(){
            return this.world?.spawner||null;
        }
        _applyWorldFeatureFlags(){
            if(!this.world)return;
            const settings=this.world.settings;
            const physics=window.SMRuntimePhysicsBridge;
            const audio=window.SMRuntimeAudioBridge;
            const ui=window.SMRuntimeUIBridge;
            if(physics&&window.SMRuntime?.setSystemEnabled)window.SMRuntime.setSystemEnabled('runtime-physics',settings.isFeatureEnabled('physics'));
            if(audio&&window.SMRuntime?.setSystemEnabled)window.SMRuntime.setSystemEnabled('runtime-audio',settings.isFeatureEnabled('audio'));
            if(ui&&window.SMRuntime?.setSystemEnabled)window.SMRuntime.setSystemEnabled('runtime-ui',settings.isFeatureEnabled('ui'));
            window.SMRuntimeEventBus?.emit?.('world:feature-flags-applied',{world:this.world,physics:settings.isFeatureEnabled('physics'),audio:settings.isFeatureEnabled('audio'),ai:settings.isFeatureEnabled('ai'),ui:settings.isFeatureEnabled('ui')});
        }
        _patchRuntimeAPI(){
            const runtime=window.SMRuntime;
            if(!runtime||this._runtimePatched)return false;
            if(typeof runtime.getWorld!=='function')runtime.getWorld=()=>this.getWorld();
            if(typeof runtime.getObjectRegistry!=='function')runtime.getObjectRegistry=()=>this.getRegistry();
            if(typeof runtime.getSpawner!=='function')runtime.getSpawner=()=>this.getSpawner();
            if(typeof runtime.spawn!=='function')runtime.spawn=(source,options={})=>this.spawn(source,options);
            if(typeof runtime.destroy!=='function')runtime.destroy=(object,options={})=>this.destroy(object,options);
            try{
                if(!Object.getOwnPropertyDescriptor(runtime,'world'))Object.defineProperty(runtime,'world',{configurable:true,enumerable:true,get:()=>this.getWorld()});
            }catch{}
            this._runtimePatched=true;
            return true;
        }
        _autoRegister(){
            const register=()=>{
                if(this._registered||!window.SMRuntime?.registerSystem)return false;
                window.SMRuntime.registerSystem(this.id,this,{priority:this.priority});
                this._registered=true;
                this._patchRuntimeAPI();
                return true;
            };
            if(!register())window.addEventListener('sm:runtime-ready',register,{once:true});
        }
        debug(){
            const state={registered:this._registered,active:!!this.world,priority:this.priority,world:this.world?.getStats?.()||null,runtimePatched:this._runtimePatched};
            console.log('[SMRuntimeWorldBridge]',state);
            return state;
        }
    }
    const bridge=new SMRuntimeWorldBridge();
    window.SMRuntimeWorldBridge=bridge;
    window.smRuntimeWorldBridge=bridge;
    window.SMRuntimeWorldBridgeClass=SMRuntimeWorldBridge;
})();
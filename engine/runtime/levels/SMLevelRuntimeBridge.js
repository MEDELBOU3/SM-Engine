(function(){
    'use strict';
    class SMLevelRuntimeBridge{
        constructor(){
            this.id='runtime-levels';
            this.priority=930;
            this.session=null;
            this.world=null;
            this.manager=window.SMLevelManager||null;
            this.active=false;
            this.ready=Promise.resolve(null);
            this._registered=false;
            this._runtimePatched=false;
            this._autoRegister();
            this._patchRuntimeAPI();
        }
        start(session){
            this.session=session;
            this.world=session?.getData?.('world')||window.SMRuntime?.getWorld?.()||null;
            if(!this.world)throw new Error('SMLevelRuntimeBridge requires an active Runtime World.');
            this.manager=window.SMLevelManager;
            this.manager.setRuntimeContext(this.world,session);
            this.active=true;
            let level=this._resolveStartupLevel();
            if(!level)level=this._createEditorLevel();
            session?.setData?.('levelManager',this.manager);
            session?.setData?.('activeLevel',level);
            if(level.sourceMode==='editor-bound'&&level.templateScene===this.world.scene){
                const record=this.manager.bindEditorLevel(level,{world:this.world,active:true,applyWorldSettings:true});
                this.ready=Promise.resolve(record);
                session?.setData?.('levelReady',this.ready);
                this._onReady(level,record);
                return record;
            }
            this.ready=this.manager.load(level,{world:this.world,active:true,applyWorldSettings:true}).then(record=>{
                this._onReady(level,record);
                return record;
            }).catch(error=>{
                console.error('[SMLevelRuntimeBridge] Startup level failed to load.',error);
                window.SMRuntimeEventBus?.emit?.('levels:error',{bridge:this,world:this.world,level,error});
                throw error;
            });
            session?.setData?.('levelReady',this.ready);
            return this.ready;
        }
        pause(){}
        resume(){}
        update(){}
        fixedUpdate(){}
        stop(session,reason='runtime-stop'){
            const manager=this.manager;
            const finish=async()=>{
                try{await manager?.unloadAll?.({allowActive:true,dispose:false});}catch(error){console.warn('[SMLevelRuntimeBridge] Level cleanup failed.',error);}
                manager?.clearRuntimeContext?.();
            };
            finish();
            session?.deleteData?.('activeLevel');
            session?.deleteData?.('levelManager');
            session?.deleteData?.('levelReady');
            this.active=false;
            this.world=null;
            this.session=null;
            this.ready=Promise.resolve(null);
            window.SMRuntimeEventBus?.emit?.('levels:stopped',{bridge:this,session,reason});
        }
        whenReady(){
            return this.ready;
        }
        async openLevel(levelOrId,options={}){
            if(!this.world)throw new Error('openLevel() requires active Play Mode.');
            const current=this.manager.getActive();
            if(current&&current.id!==this.manager.registry.get(levelOrId)?.id&&options.unloadCurrent!==false&&current.type==='persistent')await this.manager.unload(current,{allowActive:true,dispose:false});
            const record=await this.manager.load(levelOrId,{...options,world:this.world,active:true});
            const level=record.level;
            this.session?.setData?.('activeLevel',level);
            return level;
        }
        async loadSublevel(parentOrId,sublevelOrId,options={}){
            if(!this.world)throw new Error('loadSublevel() requires active Play Mode.');
            return await this.manager.loadSublevel(parentOrId,sublevelOrId,options);
        }
        async unloadSublevel(sublevelOrId,options={}){
            return await this.manager.unloadSublevel(sublevelOrId,options);
        }
        _resolveStartupLevel(){
            const scene=this.world?.scene;
            const requested=scene?.userData?.activeLevelId||this.manager.registry.activeLevelId;
            if(requested&&this.manager.registry.has(requested))return this.manager.registry.get(requested);
            const persistent=this.manager.registry.getPersistent();
            if(persistent)return persistent;
            return this.manager.registry.list({type:'persistent'})[0]||null;
        }
        _createEditorLevel(){
            const scene=this.world.scene;
            const level=this.manager.createFromScene(scene,{id:scene.userData?.levelId||'editor-main-level',name:scene.userData?.levelName||scene.name||'Main Level',type:'persistent',editorBound:true,register:true,override:true,active:true,persistent:true,worldSettings:scene.userData?.worldSettings||{},playerStart:scene.userData?.playerStart||{},metadata:{runtimeAutoCreated:true}});
            this.manager.registry.setPersistent(level);
            this.manager.registry.setActive(level);
            return level;
        }
        _onReady(level,record){
            this.world.playerStart=this.manager.resolvePlayerStart(level);
            this.session?.setData?.('activeLevel',level);
            window.smActiveLevel=level;
            window.SMRuntimeEventBus?.emit?.('levels:ready',{bridge:this,world:this.world,session:this.session,level,record});
            window.dispatchEvent(new CustomEvent('sm:runtime-level-ready',{detail:{bridge:this,world:this.world,session:this.session,level,record}}));
        }
        _patchRuntimeAPI(){
            const runtime=window.SMRuntime;
            if(!runtime||this._runtimePatched)return false;
            if(typeof runtime.getLevelManager!=='function')runtime.getLevelManager=()=>this.manager||window.SMLevelManager;
            if(typeof runtime.getActiveLevel!=='function')runtime.getActiveLevel=()=>this.manager?.getActive?.()||null;
            if(typeof runtime.openLevel!=='function')runtime.openLevel=(levelOrId,options={})=>this.openLevel(levelOrId,options);
            if(typeof runtime.loadSublevel!=='function')runtime.loadSublevel=(parentOrId,sublevelOrId,options={})=>this.loadSublevel(parentOrId,sublevelOrId,options);
            if(typeof runtime.unloadSublevel!=='function')runtime.unloadSublevel=(sublevelOrId,options={})=>this.unloadSublevel(sublevelOrId,options);
            if(typeof runtime.whenLevelReady!=='function')runtime.whenLevelReady=()=>this.whenReady();
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
            const state={registered:this._registered,active:this.active,priority:this.priority,world:this.world?.id||null,activeLevel:this.manager?.getActive?.()?.id||null,loaded:this.manager?.loadedLevels?.size||0};
            console.log('[SMLevelRuntimeBridge]',state);
            return state;
        }
    }
    const bridge=new SMLevelRuntimeBridge();
    window.SMLevelRuntimeBridge=bridge;
    window.smLevelRuntimeBridge=bridge;
    window.SMLevelRuntimeBridgeClass=SMLevelRuntimeBridge;
})();
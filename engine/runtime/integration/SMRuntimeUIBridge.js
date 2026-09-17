(function(){
    'use strict';
    class SMRuntimeUIBridge{
        constructor(){
            this.id='runtime-ui';
            this.priority=600;
            this.session=null;
            this.active=false;
            this.paused=false;
            this.adapter=null;
            this.roots=new Set();
            this._registered=false;
            this._autoRegister();
        }
        setAdapter(adapter){
            if(adapter!==null&&typeof adapter!=='object')throw new TypeError('SMRuntimeUIBridge.setAdapter(adapter) expects an object or null.');
            this.adapter=adapter;
            return this;
        }
        getBackend(){
            if(this.adapter)return this.adapter;
            const candidates=[
                window.smGameUI,
                window.SMGameUI,
                window.gameUISystem,
                window.GameUISystem,
                window.gameUIManager,
                window.GameUIManager,
                window.uiLayoutEngine,
                window.UILayoutEngine
            ];
            return candidates.find(candidate=>candidate&&typeof candidate==='object')||null;
        }
        start(session){
            this.session=session;
            this.active=true;
            this.paused=false;
            const backend=this.getBackend();
            this._setRootsVisible(true);
            this._callFirst(backend,['onRuntimeStart','startRuntime','showRuntime','show','start'],session);
            document.body?.classList?.add('sm-game-ui-runtime-active');
            window.SMRuntimeEventBus?.emit?.('ui:started',{bridge:this,session,backend});
            window.dispatchEvent(new CustomEvent('sm:runtime-ui-started',{detail:{bridge:this,session,backend}}));
        }
        pause(session){
            if(!this.active)return;
            this.paused=true;
            const backend=this.getBackend();
            this._callFirst(backend,['onRuntimePause','pauseRuntime','pause'],session);
            document.body?.classList?.add('sm-game-ui-runtime-paused');
            window.SMRuntimeEventBus?.emit?.('ui:paused',{bridge:this,session,backend});
        }
        resume(session){
            if(!this.active)return;
            this.paused=false;
            const backend=this.getBackend();
            this._callFirst(backend,['onRuntimeResume','resumeRuntime','resume'],session);
            document.body?.classList?.remove('sm-game-ui-runtime-paused');
            window.SMRuntimeEventBus?.emit?.('ui:resumed',{bridge:this,session,backend});
        }
        update(delta,time,session){
            if(!this.active||this.paused)return;
            const backend=this.getBackend();
            if(typeof this.adapter?.update==='function')this.adapter.update(delta,time,session);
            else if(this.adapter&&this.adapter.driveUpdate===true&&typeof backend?.update==='function')backend.update(delta,time,session);
        }
        stop(session,reason='user'){
            const backend=this.getBackend();
            this._callFirst(backend,['onRuntimeStop','stopRuntime','hideRuntime','hide','stop'],session,reason);
            this._setRootsVisible(false);
            document.body?.classList?.remove('sm-game-ui-runtime-active','sm-game-ui-runtime-paused');
            this.active=false;
            this.paused=false;
            this.session=null;
            window.SMRuntimeEventBus?.emit?.('ui:stopped',{bridge:this,session,backend,reason});
            window.dispatchEvent(new CustomEvent('sm:runtime-ui-stopped',{detail:{bridge:this,session,backend,reason}}));
        }
        registerRoot(element,options={}){
            if(typeof element==='string')element=document.querySelector(element);
            if(!(element instanceof Element))throw new TypeError('registerRoot(element) expects a DOM Element or selector.');
            const record={element,display:options.display||'',hideMode:options.hideMode==='visibility'?'visibility':'display',restoreOnStop:options.restoreOnStop===true,initialDisplay:element.style.display,initialVisibility:element.style.visibility,initialPointerEvents:element.style.pointerEvents};
            this.roots.add(record);
            if(this.active)this._showRecord(record);
            else this._hideRecord(record);
            return()=>this.unregisterRoot(element);
        }
        unregisterRoot(element){
            if(typeof element==='string')element=document.querySelector(element);
            for(const record of Array.from(this.roots)){
                if(record.element===element){
                    if(record.restoreOnStop)this._restoreRecord(record);
                    this.roots.delete(record);
                    return true;
                }
            }
            return false;
        }
        setInputEnabled(enabled){
            for(const record of this.roots)record.element.style.pointerEvents=enabled?'':'none';
        }
        _setRootsVisible(visible){
            for(const record of this.roots){
                if(visible)this._showRecord(record);
                else if(record.restoreOnStop)this._restoreRecord(record);
                else this._hideRecord(record);
            }
        }
        _showRecord(record){
            if(record.hideMode==='visibility')record.element.style.visibility='visible';
            else record.element.style.display=record.display||record.initialDisplay||'';
            record.element.style.pointerEvents=record.initialPointerEvents||'';
            record.element.dataset.smRuntimeVisible='true';
        }
        _hideRecord(record){
            if(record.hideMode==='visibility')record.element.style.visibility='hidden';
            else record.element.style.display='none';
            record.element.style.pointerEvents='none';
            delete record.element.dataset.smRuntimeVisible;
        }
        _restoreRecord(record){
            record.element.style.display=record.initialDisplay;
            record.element.style.visibility=record.initialVisibility;
            record.element.style.pointerEvents=record.initialPointerEvents;
            delete record.element.dataset.smRuntimeVisible;
        }
        _callFirst(target,names,...args){
            if(!target)return false;
            for(const name of names){
                if(typeof target[name]==='function'){
                    try{
                        target[name](...args);
                        return true;
                    }catch(error){
                        console.warn(`[SMRuntimeUIBridge] ${name}() failed.`,error);
                        return false;
                    }
                }
            }
            return false;
        }
        _autoRegister(){
            const register=()=>{
                if(this._registered||!window.SMRuntime?.registerSystem)return false;
                window.SMRuntime.registerSystem(this.id,this,{priority:this.priority});
                this._registered=true;
                return true;
            };
            if(!register())window.addEventListener('sm:runtime-ready',register,{once:true});
        }
        debug(){
            const backend=this.getBackend();
            const state={registered:this._registered,active:this.active,paused:this.paused,backend:backend?.constructor?.name||typeof backend,roots:this.roots.size};
            console.log('[SMRuntimeUIBridge]',state);
            return state;
        }
    }
    const bridge=new SMRuntimeUIBridge();
    window.SMRuntimeUIBridge=bridge;
    window.smRuntimeUIBridge=bridge;
    window.SMRuntimeUIBridgeClass=SMRuntimeUIBridge;
})();
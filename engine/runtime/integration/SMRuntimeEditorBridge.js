(function(){
    'use strict';
    class SMRuntimeEditorBridge{
        constructor(){
            this.id='runtime-editor-lock';
            this.priority=1000;
            this.session=null;
            this.active=false;
            this.paused=false;
            this.lockOrbitControls=true;
            this.lockTransformControls=true;
            this.lockSelection=true;
            this.saved={};
            this._registered=false;
            this._autoRegister();
        }
        configure(options={}){
            if(options.lockOrbitControls!==undefined)this.lockOrbitControls=Boolean(options.lockOrbitControls);
            if(options.lockTransformControls!==undefined)this.lockTransformControls=Boolean(options.lockTransformControls);
            if(options.lockSelection!==undefined)this.lockSelection=Boolean(options.lockSelection);
            return this;
        }
        start(session){
            if(this.active)return;
            this.session=session;
            this.active=true;
            this.paused=false;
            this._captureEditorState();
            this._applyRuntimeLock();
            document.body?.classList?.add('sm-runtime-editor-locked');
            document.body?.setAttribute('data-sm-editor-mode','runtime');
            window.SMRuntimeEventBus?.emit?.('editor:locked',{bridge:this,session});
            window.dispatchEvent(new CustomEvent('sm:runtime-editor-lock',{detail:{locked:true,bridge:this,session}}));
        }
        pause(session){
            this.paused=true;
            document.body?.classList?.add('sm-runtime-editor-paused');
            window.SMRuntimeEventBus?.emit?.('editor:runtime-paused',{bridge:this,session});
        }
        resume(session){
            this.paused=false;
            document.body?.classList?.remove('sm-runtime-editor-paused');
            this._applyRuntimeLock();
            window.SMRuntimeEventBus?.emit?.('editor:runtime-resumed',{bridge:this,session});
        }
        stop(session,reason='user'){
            this._restoreEditorState();
            this.active=false;
            this.paused=false;
            this.session=null;
            document.body?.classList?.remove('sm-runtime-editor-locked','sm-runtime-editor-paused');
            document.body?.setAttribute('data-sm-editor-mode','editor');
            window.SMRuntimeEventBus?.emit?.('editor:unlocked',{bridge:this,session,reason});
            window.dispatchEvent(new CustomEvent('sm:runtime-editor-lock',{detail:{locked:false,bridge:this,session,reason}}));
        }
        isSelectionLocked(){
            return this.active&&this.lockSelection;
        }
        canEditScene(){
            return !this.active;
        }
        _captureEditorState(){
            const orbit=this._getOrbitControls();
            const transform=this._getTransformControls();
            this.saved={
                orbit,
                orbitEnabled:orbit&&'enabled'in orbit?orbit.enabled:undefined,
                transform,
                transformEnabled:transform&&'enabled'in transform?transform.enabled:undefined,
                transformVisible:transform&&'visible'in transform?transform.visible:undefined,
                transformObject:transform?.object||null,
                bodyCursor:document.body?.style?.cursor||'',
                selectedObject:window.selectedObject||window.currentSelectedObject||null
            };
        }
        _applyRuntimeLock(){
            const orbit=this._getOrbitControls();
            const transform=this._getTransformControls();
            if(this.lockOrbitControls&&orbit&&'enabled'in orbit)orbit.enabled=false;
            if(this.lockTransformControls&&transform){
                if(typeof transform.detach==='function')transform.detach();
                if('enabled'in transform)transform.enabled=false;
                if('visible'in transform)transform.visible=false;
            }
            if(this.lockSelection)window.dispatchEvent(new CustomEvent('sm:editor-selection-lock',{detail:{locked:true,source:'runtime'}}));
        }
        _restoreEditorState(){
            const saved=this.saved||{};
            if(saved.orbit&&saved.orbitEnabled!==undefined)saved.orbit.enabled=saved.orbitEnabled;
            if(saved.transform){
                if(saved.transformEnabled!==undefined)saved.transform.enabled=saved.transformEnabled;
                if(saved.transformVisible!==undefined)saved.transform.visible=saved.transformVisible;
                if(saved.transformObject&&typeof saved.transform.attach==='function')saved.transform.attach(saved.transformObject);
            }
            if(this.lockSelection)window.dispatchEvent(new CustomEvent('sm:editor-selection-lock',{detail:{locked:false,source:'runtime'}}));
            if(document.body)document.body.style.cursor=saved.bodyCursor||'';
            this.saved={};
        }
        _getOrbitControls(){
            const candidates=[window.controls,window.orbitControls,window.editorControls,window.cameraControls];
            return candidates.find(candidate=>candidate&&typeof candidate==='object')||null;
        }
        _getTransformControls(){
            const candidates=[window.transformControls,window.TransformControlsInstance,window.gizmoControls,window.transformGizmo];
            return candidates.find(candidate=>candidate&&typeof candidate==='object')||null;
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
            const orbit=this._getOrbitControls();
            const transform=this._getTransformControls();
            const state={registered:this._registered,active:this.active,paused:this.paused,lockOrbitControls:this.lockOrbitControls,lockTransformControls:this.lockTransformControls,lockSelection:this.lockSelection,orbitFound:!!orbit,orbitEnabled:orbit?.enabled,transformFound:!!transform,transformEnabled:transform?.enabled};
            console.log('[SMRuntimeEditorBridge]',state);
            return state;
        }
    }
    const bridge=new SMRuntimeEditorBridge();
    window.SMRuntimeEditorBridge=bridge;
    window.smRuntimeEditorBridge=bridge;
    window.SMRuntimeEditorBridgeClass=SMRuntimeEditorBridge;
})();
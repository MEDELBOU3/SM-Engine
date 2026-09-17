(function(){
    'use strict';
    class SMInputManager{
        constructor(){
            this.contexts=[];
            this.running=false;
            this.keyboard=new Set();
            this.mouseButtons=new Set();
            this.mouseDelta={x:0,y:0};
            this.wheelDelta=0;
            this.gamepadIndex=0;
            this.target=null;
            this.pointerLocked=false;
            this._listeners=[];
            this._consumed=new Set();
            this._frame=0;
            this._defaultContext=null;
        }
        start(options={}){
            if(this.running)return this;
            this.target=options.target||window;
            this.gamepadIndex=Number(options.gamepadIndex??0);
            this.running=true;
            this._bindDOM();
            if(options.createDefaultContext!==false&&!this._defaultContext)this.createDefaultGameplayContext();
            window.SMRuntimeEventBus?.emit?.('input:started',{manager:this});
            return this;
        }
        stop(){
            if(!this.running)return this;
            for(const remove of this._listeners.splice(0))try{remove();}catch{}
            this.running=false;
            this.keyboard.clear();
            this.mouseButtons.clear();
            this.mouseDelta.x=0;
            this.mouseDelta.y=0;
            this.wheelDelta=0;
            for(const context of this.contexts)context.map.resetActions();
            window.SMRuntimeEventBus?.emit?.('input:stopped',{manager:this});
            return this;
        }
        createDefaultGameplayContext(options={}){
            const map=window.SMInputMap.createDefaultGameplay();
            const context=new window.SMInputContext(options.name||'Gameplay',map,{priority:Number(options.priority??0),consumeInput:options.consumeInput!==false,tags:['gameplay'],owner:options.owner||null});
            this._defaultContext=context;
            this.addContext(context);
            return context;
        }
        addContext(contextOrName,map=null,options={}){
            const context=contextOrName instanceof window.SMInputContext?contextOrName:new window.SMInputContext(contextOrName,map,options);
            if(!this.contexts.includes(context))this.contexts.push(context);
            this._sortContexts();
            window.SMRuntimeEventBus?.emit?.('input:context-added',{manager:this,context});
            return context;
        }
        removeContext(contextOrName){
            const index=this.contexts.findIndex(context=>context===contextOrName||context.name===contextOrName);
            if(index<0)return false;
            const context=this.contexts.splice(index,1)[0];
            context.map.resetActions();
            if(this._defaultContext===context)this._defaultContext=null;
            window.SMRuntimeEventBus?.emit?.('input:context-removed',{manager:this,context});
            return context;
        }
        getContext(name){
            return this.contexts.find(context=>context.name===String(name))||null;
        }
        getDefaultContext(){
            return this._defaultContext;
        }
        getAction(name,contextName=null){
            if(contextName)return this.getContext(contextName)?.getAction(name)||null;
            for(const context of this.contexts)if(context.enabled&&context.map.enabled&&context.map.hasAction(name))return context.map.getAction(name);
            return null;
        }
        getValue(name,contextName=null){
            const action=this.getAction(name,contextName);
            return action?action.getValue():null;
        }
        isPressed(name,contextName=null){
            return Boolean(this.getAction(name,contextName)?.pressed);
        }
        isReleased(name,contextName=null){
            return Boolean(this.getAction(name,contextName)?.released);
        }
        isActive(name,contextName=null){
            return Boolean(this.getAction(name,contextName)?.active);
        }
        update(dt=0){
            if(!this.running)return;
            this._frame+=1;
            this._consumed.clear();
            const gamepad=this._getGamepad();
            for(const context of this.contexts){
                if(!context.enabled||!context.map.enabled)continue;
                for(const action of context.map.actions.values())action._beginFrame();
            }
            let blockLower=false;
            for(const context of this.contexts){
                if(blockLower||!context.enabled||!context.map.enabled)continue;
                for(const binding of context.map.bindings){
                    const signature=this._bindingSignature(binding);
                    if(this._consumed.has(signature))continue;
                    const sample=this._sampleBinding(binding,gamepad);
                    if(sample===null||sample===undefined)continue;
                    const action=context.map.getAction(binding.action);
                    if(!action)continue;
                    if(binding.deadzone!==null&&typeof sample==='number'&&Math.abs(sample)<binding.deadzone)continue;
                    const value=binding.invert&&typeof sample==='number'?-sample:sample;
                    action._accumulate(value,binding.axis,binding.scale*binding.value);
                    if(context.consumeInput&&binding.consume!==false&&this._isMeaningful(value,binding.deadzone??0))this._consumed.add(signature);
                }
                if(context.blockLowerContexts)blockLower=true;
            }
            for(const context of this.contexts){
                if(!context.enabled||!context.map.enabled)continue;
                for(const action of context.map.actions.values())action._commit(dt);
            }
            this.mouseDelta.x=0;
            this.mouseDelta.y=0;
            this.wheelDelta=0;
        }
        setContextEnabled(name,enabled){
            const context=this.getContext(name);
            return context?context.setEnabled(enabled):false;
        }
        requestPointerLock(element=null){
            const target=element||document.getElementById('renderer-container')||document.body;
            try{return target?.requestPointerLock?.();}catch{return null;}
        }
        exitPointerLock(){
            try{document.exitPointerLock?.();}catch{}
        }
        _bindDOM(){
            const listen=(target,type,handler,options)=>{
                target.addEventListener(type,handler,options);
                this._listeners.push(()=>target.removeEventListener(type,handler,options));
            };
            listen(window,'keydown',event=>{
                this.keyboard.add(event.code);
                if(this._shouldPreventDefault('keyboard',event.code))event.preventDefault();
            },{capture:true});
            listen(window,'keyup',event=>{
                this.keyboard.delete(event.code);
                if(this._shouldPreventDefault('keyboard',event.code))event.preventDefault();
            },{capture:true});
            listen(window,'mousedown',event=>{
                this.mouseButtons.add(event.button);
                if(this._shouldPreventDefault('mouse-button',event.button))event.preventDefault();
            },{capture:true});
            listen(window,'mouseup',event=>{
                this.mouseButtons.delete(event.button);
                if(this._shouldPreventDefault('mouse-button',event.button))event.preventDefault();
            },{capture:true});
            listen(window,'mousemove',event=>{
                this.mouseDelta.x+=Number(event.movementX||0);
                this.mouseDelta.y+=Number(event.movementY||0);
            },{capture:true});
            listen(window,'wheel',event=>{
                this.wheelDelta+=Math.sign(Number(event.deltaY)||0);
            },{capture:true,passive:true});
            listen(window,'blur',()=>{
                this.keyboard.clear();
                this.mouseButtons.clear();
            });
            listen(document,'pointerlockchange',()=>{
                this.pointerLocked=document.pointerLockElement!==null;
                window.SMRuntimeEventBus?.emit?.('input:pointer-lock-changed',{manager:this,locked:this.pointerLocked,element:document.pointerLockElement});
            });
            listen(window,'contextmenu',event=>{
                if(this.running&&this._shouldPreventDefault('mouse-button',2))event.preventDefault();
            },{capture:true});
        }
        _sampleBinding(binding,gamepad){
            switch(binding.device){
                case'keyboard':
                    if(!this._modifiersSatisfied(binding.modifiers))return 0;
                    return this.keyboard.has(binding.code)?1:0;
                case'mouse-button':
                    return this.mouseButtons.has(binding.button)?1:0;
                case'mouse-move':
                    return binding.axis==='y'?this.mouseDelta.y:this.mouseDelta.x;
                case'mouse-wheel':
                    return this.wheelDelta;
                case'gamepad-button':
                    return Number(gamepad?.buttons?.[binding.button]?.value||0);
                case'gamepad-axis':
                    return Number(gamepad?.axes?.[binding.axisIndex]||0);
                default:
                    return null;
            }
        }
        _modifiersSatisfied(modifiers=[]){
            for(const modifier of modifiers){
                const key=String(modifier);
                if(key==='Shift'&&!this._anyKey(['ShiftLeft','ShiftRight']))return false;
                if(key==='Control'&&!this._anyKey(['ControlLeft','ControlRight']))return false;
                if(key==='Alt'&&!this._anyKey(['AltLeft','AltRight']))return false;
                if(key==='Meta'&&!this._anyKey(['MetaLeft','MetaRight']))return false;
            }
            return true;
        }
        _anyKey(codes){
            return codes.some(code=>this.keyboard.has(code));
        }
        _getGamepad(){
            try{return navigator.getGamepads?.()?.[this.gamepadIndex]||null;}catch{return null;}
        }
        _bindingSignature(binding){
            return`${binding.device}:${binding.code??binding.button??binding.axisIndex??binding.axis??''}`;
        }
        _isMeaningful(value,deadzone=0){
            if(value&&typeof value==='object')return Math.hypot(Number(value.x||0),Number(value.y||0))>deadzone;
            return Math.abs(Number(value)||0)>deadzone;
        }
        _shouldPreventDefault(device,code){
            for(const context of this.contexts){
                if(!context.enabled||!context.map.enabled||!context.consumeInput)continue;
                if(context.map.bindings.some(binding=>binding.device===device&&(binding.code===code||binding.button===code)&&binding.consume!==false))return true;
            }
            return false;
        }
        _sortContexts(){
            this.contexts.sort((a,b)=>b.priority-a.priority);
        }
        debug(){
            const state={running:this.running,frame:this._frame,contexts:this.contexts.map(context=>({name:context.name,priority:context.priority,enabled:context.enabled})),keyboard:Array.from(this.keyboard),mouseButtons:Array.from(this.mouseButtons),pointerLocked:this.pointerLocked,gamepadIndex:this.gamepadIndex};
            console.log('[SMInputManager]',state);
            return state;
        }
    }
    const manager=new SMInputManager();
    window.SMInputManagerClass=SMInputManager;
    window.SMInputManager=manager;
    window.smInputManager=manager;
})();
(function(){
    'use strict';
    class SMAnimationStateMachine{
        constructor(data={}){
            this.states=new Map();
            this.anyTransitions=[];
            this.entryState=data.entryState||data.entry||null;
            this.currentState=null;
            this.previousState=null;
            this.stateTime=0;
            this.enabled=data.enabled!==false;
            this._requested=null;
            for(const state of data.states||[])this.addState(state.name,state);
            for(const transition of data.anyTransitions||[])this.addAnyTransition(transition);
            if(data.transitions&&typeof data.transitions==='object'&&!Array.isArray(data.transitions)){
                for(const[from,list]of Object.entries(data.transitions))for(const transition of list||[])this.addTransition(from,transition.to,transition);
            }
        }
        addState(name,options={}){
            const key=String(name);
            const state={name:key,clip:String(options.clip||key),speed:Number(options.speed??1),loop:options.loop??true,fadeIn:Math.max(0,Number(options.fadeIn??options.fade??0.15)),fadeOut:Math.max(0,Number(options.fadeOut??options.fade??0.15)),startTime:Math.max(0,Number(options.startTime??0)),metadata:{...(options.metadata||{})},transitions:[]};
            for(const transition of options.transitions||[])state.transitions.push(this._normalizeTransition(transition));
            this.states.set(key,state);
            if(!this.entryState)this.entryState=key;
            return state;
        }
        removeState(name){
            const key=String(name);
            const removed=this.states.delete(key);
            if(this.entryState===key)this.entryState=this.states.keys().next().value||null;
            if(this.currentState===key)this.currentState=null;
            return removed;
        }
        getState(name){
            return this.states.get(String(name))||null;
        }
        addTransition(from,to,options={}){
            const state=this.getState(from);
            if(!state)throw new Error(`Unknown animation state "${from}".`);
            const transition=this._normalizeTransition({...options,to});
            state.transitions.push(transition);
            return transition;
        }
        addAnyTransition(options={}){
            const transition=this._normalizeTransition(options);
            if(!transition.to)throw new Error('Any transition requires "to".');
            this.anyTransitions.push(transition);
            return transition;
        }
        requestState(name,options={}){
            if(!this.states.has(String(name)))return false;
            this._requested={name:String(name),force:options.force===true,fade:options.fade};
            return true;
        }
        reset(){
            this.currentState=null;
            this.previousState=null;
            this.stateTime=0;
            this._requested=null;
            return this;
        }
        tick(animator,dt){
            if(!this.enabled||!animator)return null;
            const delta=Math.max(0,Number(dt)||0);
            if(!this.currentState){
                const entry=this.entryState&&this.states.has(this.entryState)?this.entryState:this.states.keys().next().value;
                if(entry)this._enter(animator,entry,{fade:0});
                return this.currentState;
            }
            this.stateTime+=delta;
            if(this._requested){
                const request=this._requested;
                this._requested=null;
                if(request.force||request.name!==this.currentState)this._enter(animator,request.name,{fade:request.fade});
                return this.currentState;
            }
            const candidates=[...this.anyTransitions,...(this.getState(this.currentState)?.transitions||[])];
            for(const transition of candidates){
                if(transition.to===this.currentState&&!transition.allowSelf)continue;
                if(this.stateTime<transition.minTime)continue;
                if(!this._conditionsPass(transition.conditions,animator.parameters))continue;
                if(transition.consumeTriggers)this._consumeTriggers(transition.conditions,animator.parameters);
                this._enter(animator,transition.to,{fade:transition.fade});
                break;
            }
            return this.currentState;
        }
        _enter(animator,name,options={}){
            const state=this.getState(name);
            if(!state)return false;
            const previous=this.currentState;
            this.previousState=previous;
            this.currentState=state.name;
            this.stateTime=0;
            animator._playState?.(state,{fade:options.fade});
            window.SMRuntimeEventBus?.emit?.('animation:state-changed',{animator,state:state.name,previous,machine:this});
            return true;
        }
        _conditionsPass(conditions,parameters){
            if(!conditions?.length)return true;
            for(const condition of conditions){
                const parameter=condition.parameter||condition.name;
                const actual=parameters?.get?.(parameter);
                const expected=condition.value;
                const op=condition.op||condition.operator||'==';
                if(condition.trigger===true||op==='trigger'){
                    if(actual!==true)return false;
                    continue;
                }
                if(op==='=='&&actual!==expected)return false;
                if(op==='!='&&actual===expected)return false;
                if(op==='>'&&!(Number(actual)>Number(expected)))return false;
                if(op==='>='&&!(Number(actual)>=Number(expected)))return false;
                if(op==='<'&&!(Number(actual)<Number(expected)))return false;
                if(op==='<='&&!(Number(actual)<=Number(expected)))return false;
                if(op==='truthy'&&!actual)return false;
                if(op==='falsy'&&actual)return false;
            }
            return true;
        }
        _consumeTriggers(conditions,parameters){
            for(const condition of conditions||[]){
                const name=condition.parameter||condition.name;
                if(condition.trigger===true||condition.op==='trigger'||parameters?.getType?.(name)==='trigger')parameters?.consumeTrigger?.(name);
            }
        }
        _normalizeTransition(options={}){
            return{to:String(options.to||''),conditions:Array.isArray(options.conditions)?options.conditions.map(condition=>({...condition})):[],fade:Math.max(0,Number(options.fade??0.15)),minTime:Math.max(0,Number(options.minTime??0)),allowSelf:options.allowSelf===true,consumeTriggers:options.consumeTriggers!==false,metadata:{...(options.metadata||{})}};
        }
        serialize(){
            const transitions={};
            const states=[];
            for(const state of this.states.values()){
                states.push({name:state.name,clip:state.clip,speed:state.speed,loop:state.loop,fadeIn:state.fadeIn,fadeOut:state.fadeOut,startTime:state.startTime,metadata:{...state.metadata}});
                transitions[state.name]=state.transitions.map(transition=>this._clone(transition));
            }
            return{enabled:this.enabled,entryState:this.entryState,states,transitions,anyTransitions:this.anyTransitions.map(transition=>this._clone(transition))};
        }
        deserialize(data={}){
            this.states.clear();
            this.anyTransitions=[];
            this.entryState=data.entryState||data.entry||null;
            this.enabled=data.enabled!==false;
            for(const state of data.states||[])this.addState(state.name,state);
            for(const[from,list]of Object.entries(data.transitions||{}))for(const transition of list||[])this.addTransition(from,transition.to,transition);
            for(const transition of data.anyTransitions||[])this.addAnyTransition(transition);
            this.reset();
            return this;
        }
        _clone(value){
            try{return structuredClone(value);}catch{}
            return JSON.parse(JSON.stringify(value));
        }
        debug(){
            const state={entryState:this.entryState,currentState:this.currentState,previousState:this.previousState,stateTime:this.stateTime,states:Array.from(this.states.keys()),anyTransitions:this.anyTransitions.length};
            console.log('[SMAnimationStateMachine]',state);
            return state;
        }
    }
    window.SMAnimationStateMachine=SMAnimationStateMachine;
    window.SMAnimationStateMachineClass=SMAnimationStateMachine;
})();
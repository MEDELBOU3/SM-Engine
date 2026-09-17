(function(){
    'use strict';
    class SMInputMap{
        constructor(name='Gameplay',options={}){
            this.name=String(name);
            this.actions=new Map();
            this.bindings=[];
            this.enabled=options.enabled!==false;
            this.metadata={...(options.metadata||{})};
            for(const action of options.actions||[])this.addAction(action.name||action,action);
            for(const binding of options.bindings||[])this.addBinding(binding);
        }
        addAction(nameOrAction,options={}){
            const action=nameOrAction instanceof window.SMInputAction?nameOrAction:new window.SMInputAction(nameOrAction,options);
            this.actions.set(action.name,action);
            return action;
        }
        removeAction(name){
            const key=String(name);
            const action=this.actions.get(key)||null;
            this.actions.delete(key);
            this.bindings=this.bindings.filter(binding=>binding.action!==key);
            return action;
        }
        getAction(name){
            return this.actions.get(String(name))||null;
        }
        hasAction(name){
            return this.actions.has(String(name));
        }
        addBinding(binding={}){
            if(!binding.action)throw new Error('SMInputMap.addBinding() requires binding.action.');
            if(!this.hasAction(binding.action))this.addAction(binding.action,{type:binding.type||'button'});
            const normalized={id:String(binding.id||`binding-${this.bindings.length+1}-${Math.random().toString(36).slice(2,6)}`),action:String(binding.action),device:String(binding.device||'keyboard').toLowerCase(),code:binding.code!==undefined?String(binding.code):null,button:binding.button!==undefined?Number(binding.button):null,axisIndex:binding.axisIndex!==undefined?Number(binding.axisIndex):null,axis:binding.axis||null,value:Number(binding.value??1),scale:Number(binding.scale??1),invert:binding.invert===true,deadzone:binding.deadzone!==undefined?Math.max(0,Number(binding.deadzone)||0):null,consume:binding.consume!==false,modifiers:Array.isArray(binding.modifiers)?binding.modifiers.map(String):[],metadata:{...(binding.metadata||{})}};
            this.bindings.push(normalized);
            return normalized;
        }
        removeBinding(id){
            const index=this.bindings.findIndex(binding=>binding.id===id);
            if(index<0)return false;
            return this.bindings.splice(index,1)[0];
        }
        getBindingsForAction(name){
            return this.bindings.filter(binding=>binding.action===String(name));
        }
        setEnabled(enabled){
            this.enabled=Boolean(enabled);
            return this.enabled;
        }
        resetActions(){
            for(const action of this.actions.values())action.reset();
            return this;
        }
        serialize(){
            return{name:this.name,enabled:this.enabled,metadata:{...this.metadata},actions:Array.from(this.actions.values()).map(action=>action.serialize()),bindings:this.bindings.map(binding=>({...binding,metadata:{...binding.metadata}}))};
        }
        static createDefaultGameplay(){
            const map=new SMInputMap('Gameplay');
            map.addAction('Move',{type:'axis2d',threshold:0.1,deadzone:0.05});
            map.addAction('Look',{type:'axis2d',threshold:0.001,deadzone:0});
            map.addAction('Jump',{type:'button'});
            map.addAction('Sprint',{type:'button'});
            map.addAction('Crouch',{type:'button'});
            map.addAction('Interact',{type:'button'});
            map.addAction('Fire',{type:'button'});
            map.addAction('Aim',{type:'button'});
            map.addAction('Pause',{type:'button'});
            map.addBinding({action:'Move',device:'keyboard',code:'KeyW',axis:'y',value:1});
            map.addBinding({action:'Move',device:'keyboard',code:'KeyS',axis:'y',value:-1});
            map.addBinding({action:'Move',device:'keyboard',code:'KeyA',axis:'x',value:-1});
            map.addBinding({action:'Move',device:'keyboard',code:'KeyD',axis:'x',value:1});
            map.addBinding({action:'Look',device:'mouse-move',axis:'x',value:1,scale:0.01,consume:false});
            map.addBinding({action:'Look',device:'mouse-move',axis:'y',value:1,scale:0.01,consume:false});
            map.addBinding({action:'Jump',device:'keyboard',code:'Space'});
            map.addBinding({action:'Sprint',device:'keyboard',code:'ShiftLeft'});
            map.addBinding({action:'Crouch',device:'keyboard',code:'KeyC'});
            map.addBinding({action:'Interact',device:'keyboard',code:'KeyE'});
            map.addBinding({action:'Fire',device:'mouse-button',button:0});
            map.addBinding({action:'Aim',device:'mouse-button',button:2});
            map.addBinding({action:'Pause',device:'keyboard',code:'Escape',consume:false});
            map.addBinding({action:'Move',device:'gamepad-axis',axisIndex:0,axis:'x',value:1,deadzone:0.15});
            map.addBinding({action:'Move',device:'gamepad-axis',axisIndex:1,axis:'y',value:-1,deadzone:0.15});
            map.addBinding({action:'Look',device:'gamepad-axis',axisIndex:2,axis:'x',value:1,deadzone:0.12});
            map.addBinding({action:'Look',device:'gamepad-axis',axisIndex:3,axis:'y',value:-1,deadzone:0.12});
            map.addBinding({action:'Jump',device:'gamepad-button',button:0});
            map.addBinding({action:'Interact',device:'gamepad-button',button:2});
            map.addBinding({action:'Fire',device:'gamepad-button',button:7});
            map.addBinding({action:'Aim',device:'gamepad-button',button:6});
            return map;
        }
        debug(){
            const state={name:this.name,enabled:this.enabled,actions:Array.from(this.actions.keys()),bindings:this.bindings.length};
            console.log('[SMInputMap]',state);
            return state;
        }
    }
    window.SMInputMap=SMInputMap;
    window.SMInputMapClass=SMInputMap;
})();
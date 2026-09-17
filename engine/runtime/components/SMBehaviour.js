(function(){
    'use strict';
    class SMBehaviour extends window.SMComponent{
        constructor(options={}){
            super(options);
            this.type=options.type||this.constructor.componentType||this.constructor.name||'SMBehaviour';
            this.runInEditor=options.runInEditor===true;
            this.tickEnabled=options.tickEnabled!==false;
            this.fixedTickEnabled=options.fixedTickEnabled!==false;
            this.lateTickEnabled=options.lateTickEnabled!==false;
        }
        update(delta,time){
            if(!this.tickEnabled)return false;
            return super.update(delta,time);
        }
        fixedUpdate(delta){
            if(!this.fixedTickEnabled)return false;
            return super.fixedUpdate(delta);
        }
        lateUpdate(delta,time){
            if(!this.lateTickEnabled)return false;
            return super.lateUpdate(delta,time);
        }
        setTickEnabled(enabled){
            this.tickEnabled=Boolean(enabled);
            return this.tickEnabled;
        }
        setFixedTickEnabled(enabled){
            this.fixedTickEnabled=Boolean(enabled);
            return this.fixedTickEnabled;
        }
        setLateTickEnabled(enabled){
            this.lateTickEnabled=Boolean(enabled);
            return this.lateTickEnabled;
        }
        get transform(){
            return this.owner||null;
        }
        get scene(){
            return this.world?.scene||this.owner?.parent?.isScene?this.owner.parent:window.scene||null;
        }
        get registry(){
            return this.world?.registry||null;
        }
        get spawner(){
            return this.world?.spawner||null;
        }
        async spawn(source,options={}){
            if(!this.world?.spawn)throw new Error(`${this.type} cannot spawn because Runtime World is unavailable.`);
            return await this.world.spawn(source,options);
        }
        destroyObject(object,options={}){
            if(this.world?.destroy)return this.world.destroy(object,options);
            object?.parent?.remove?.(object);
            return Boolean(object);
        }
        findByType(type){
            return this.registry?.findByType?.(type)||[];
        }
        findByTag(tag){
            return this.registry?.findByTag?.(tag)||[];
        }
        findFirstByType(type){
            return this.registry?.findFirstByType?.(type)||null;
        }
        findFirstByTag(tag){
            return this.registry?.findFirstByTag?.(tag)||null;
        }
        onCollisionEnter(){}
        onCollisionStay(){}
        onCollisionExit(){}
        onTriggerEnter(){}
        onTriggerStay(){}
        onTriggerExit(){}
        serializeState(){
            return{runInEditor:this.runInEditor,tickEnabled:this.tickEnabled,fixedTickEnabled:this.fixedTickEnabled,lateTickEnabled:this.lateTickEnabled};
        }
        deserializeState(data={}){
            if(data.runInEditor!==undefined)this.runInEditor=Boolean(data.runInEditor);
            if(data.tickEnabled!==undefined)this.tickEnabled=Boolean(data.tickEnabled);
            if(data.fixedTickEnabled!==undefined)this.fixedTickEnabled=Boolean(data.fixedTickEnabled);
            if(data.lateTickEnabled!==undefined)this.lateTickEnabled=Boolean(data.lateTickEnabled);
            return this;
        }
    }
    SMBehaviour.componentType='SMBehaviour';
    SMBehaviour.executionOrder=0;
    window.SMBehaviour=SMBehaviour;
    window.SMBehaviourClass=SMBehaviour;
})();
(function(){
    'use strict';
    class SMRotatorComponent extends window.SMBehaviour{
        constructor(options={}){
            super({...options,type:options.type||'Rotator'});
            this.axis=this._normalizeAxis(options.axis||[0,1,0]);
            this.speed=Number(options.speed??45);
            this.space=String(options.space||'local').toLowerCase()==='world'?'world':'local';
            this.useDegrees=options.useDegrees!==false;
        }
        onUpdate(dt){
            if(!this.owner)return;
            const angle=(this.useDegrees?this.speed*Math.PI/180:this.speed)*Math.max(0,Number(dt)||0);
            if(!angle)return;
            if(window.THREE?.Vector3&&this.owner.rotateOnAxis&&this.owner.rotateOnWorldAxis){
                const axis=new THREE.Vector3(this.axis[0],this.axis[1],this.axis[2]).normalize();
                if(this.space==='world')this.owner.rotateOnWorldAxis(axis,angle);
                else this.owner.rotateOnAxis(axis,angle);
            }else if(this.owner.rotation){
                this.owner.rotation.x+=this.axis[0]*angle;
                this.owner.rotation.y+=this.axis[1]*angle;
                this.owner.rotation.z+=this.axis[2]*angle;
            }
            this.owner.updateMatrixWorld?.(true);
        }
        setAxis(value){
            this.axis=this._normalizeAxis(value);
            return this.axis;
        }
        setSpeed(value){
            this.speed=Number(value)||0;
            return this.speed;
        }
        serializeState(){
            return{...super.serializeState(),axis:[...this.axis],speed:this.speed,space:this.space,useDegrees:this.useDegrees};
        }
        deserializeState(data={}){
            super.deserializeState(data);
            if(data.axis!==undefined)this.axis=this._normalizeAxis(data.axis);
            if(data.speed!==undefined)this.speed=Number(data.speed)||0;
            if(data.space!==undefined)this.space=String(data.space).toLowerCase()==='world'?'world':'local';
            if(data.useDegrees!==undefined)this.useDegrees=Boolean(data.useDegrees);
            return this;
        }
        _normalizeAxis(value){
            let axis;
            if(Array.isArray(value))axis=[Number(value[0]||0),Number(value[1]||0),Number(value[2]||0)];
            else if(value&&typeof value==='object')axis=[Number(value.x||0),Number(value.y||0),Number(value.z||0)];
            else axis=[0,1,0];
            const length=Math.hypot(axis[0],axis[1],axis[2])||1;
            return[axis[0]/length,axis[1]/length,axis[2]/length];
        }
    }
    SMRotatorComponent.componentType='Rotator';
    SMRotatorComponent.executionOrder=10;
    const register=()=>{
        if(!window.SMComponentRegistry?.register)return false;
        if(!window.SMComponentRegistry.has('Rotator'))window.SMComponentRegistry.register('Rotator',SMRotatorComponent,{category:'Utility',displayName:'Rotator',allowMultiple:false,aliases:['SMRotatorComponent'],executionOrder:10});
        return true;
    };
    register();
    queueMicrotask(register);
    window.addEventListener('sm:runtime-ready',register,{once:true});
    window.SMRotatorComponent=SMRotatorComponent;
    window.SMRotatorComponentClass=SMRotatorComponent;
})();
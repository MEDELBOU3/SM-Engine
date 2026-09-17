(function(global){
    'use strict';
    class SMPhysicsLayerManager{
        constructor(){
            this.layers=new Map();
            this._nextBit=1;
            this.define('default',global.COL?.DEFAULT??1);
            this.define('ground',global.COL?.GROUND??2);
            this.define('kinematic',global.COL?.KINEMATIC??4);
            this.define('liquid',global.COL?.LIQUID??8);
            this.define('sensor',global.COL?.SENSOR??16);
            this._nextBit=32;
        }
        define(name,bit=null){
            const key=String(name||'default').toLowerCase();
            if(this.layers.has(key))return this.layers.get(key);
            const resolved=bit===null?this._nextBit:Number(bit);
            if(bit===null)this._nextBit<<=1;
            this.layers.set(key,resolved);
            return resolved;
        }
        get(name){
            const key=String(name||'default').toLowerCase();
            return this.layers.get(key)??this.define(key);
        }
        mask(names='all'){
            if(names===-1||String(names).toLowerCase()==='all')return -1;
            const list=Array.isArray(names)?names:[names];
            let value=0;
            for(const item of list)value|=this.get(item);
            return value||this.get('default');
        }
        descriptor(layer='default',mask='all'){
            return{
                collisionGroup:this.get(layer),
                collisionMask:this.mask(mask)
            };
        }
        list(){
            return Array.from(this.layers.entries()).map(([name,bit])=>({name,bit}));
        }
    }
    global.SMPhysicsLayerManager=SMPhysicsLayerManager;
})(window);

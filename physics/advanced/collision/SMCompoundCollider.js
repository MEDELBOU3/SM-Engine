(function(global){
    'use strict';
    class SMCompoundCollider{
        constructor(owner,config={}){
            this.owner=owner||null;
            this.parts=Array.isArray(config.parts)?config.parts.map(part=>this._normalize(part)):[];
        }
        _normalize(part={}){
            const type=String(part.type||'box').toLowerCase();
            return{
                id:part.id||`collider-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
                name:part.name||`${type} collider`,
                type,
                position:Array.isArray(part.position)?part.position.slice(0,3):[0,0,0],
                quaternion:Array.isArray(part.quaternion)?part.quaternion.slice(0,4):[0,0,0,1],
                scale:Array.isArray(part.scale)?part.scale.slice(0,3):[1,1,1],
                size:Array.isArray(part.size)?part.size.slice(0,3):[1,1,1],
                radius:Math.max(0.001,Number(part.radius)||0.5),
                height:Math.max(0.001,Number(part.height)||1),
                enabled:part.enabled!==false,
                points:Array.isArray(part.points)?part.points.map(point=>Array.isArray(point)?point.slice(0,3):[point.x||0,point.y||0,point.z||0]):null
            };
        }
        add(type='box',options={}){
            const part=this._normalize({...options,type});
            this.parts.push(part);
            return part;
        }
        remove(indexOrId){
            const index=typeof indexOrId==='number'?indexOrId:this.parts.findIndex(part=>part.id===indexOrId);
            if(index<0||index>=this.parts.length)return false;
            this.parts.splice(index,1);
            return true;
        }
        get(indexOrId){
            if(typeof indexOrId==='number')return this.parts[indexOrId]||null;
            return this.parts.find(part=>part.id===indexOrId)||null;
        }
        clear(){this.parts.length=0;}
        toJSON(){return this.parts.map(part=>JSON.parse(JSON.stringify(part)));}
    }
    global.SMCompoundCollider=SMCompoundCollider;
})(window);
(function(){
    'use strict';
    class SMDistanceStreaming{
        constructor(options={}){
            this.enabled=options.enabled!==false;
            this.defaultLoadDistance=Math.max(0,Number(options.loadDistance??250));
            this.defaultUnloadDistance=Math.max(this.defaultLoadDistance,Number(options.unloadDistance??300));
            this.levelManager=options.levelManager||window.SMLevelManager||null;
            this.targets=[];
            this._lastDistances=new Map();
        }
        setLevelManager(manager){
            this.levelManager=manager||null;
            return this.levelManager;
        }
        setTargets(targets=[]){
            this.targets=Array.isArray(targets)?targets.filter(Boolean):targets?[targets]:[];
            return this.targets;
        }
        addTarget(target){
            if(target&&!this.targets.includes(target))this.targets.push(target);
            return target;
        }
        removeTarget(target){
            const index=this.targets.indexOf(target);
            if(index<0)return false;
            this.targets.splice(index,1);
            return true;
        }
        evaluate(level,target=null){
            if(!this.enabled||!level)return{shouldLoad:false,shouldUnload:false,distance:Infinity,level};
            const streaming=level.streaming||{};
            if(streaming.alwaysLoaded===true)return{shouldLoad:true,shouldUnload:false,distance:0,level,alwaysLoaded:true};
            const targets=target?[target]:this.targets;
            if(!targets.length)return{shouldLoad:false,shouldUnload:false,distance:Infinity,level};
            const anchor=this._levelAnchor(level);
            if(!anchor)return{shouldLoad:false,shouldUnload:false,distance:Infinity,level};
            let minDistance=Infinity;
            for(const item of targets){
                const position=this._position(item);
                if(!position)continue;
                const dx=position[0]-anchor[0];
                const dy=position[1]-anchor[1];
                const dz=position[2]-anchor[2];
                minDistance=Math.min(minDistance,Math.hypot(dx,dy,dz));
            }
            const loadDistance=Math.max(0,Number(streaming.loadDistance??this.defaultLoadDistance));
            const unloadDistance=Math.max(loadDistance,Number(streaming.unloadDistance??this.defaultUnloadDistance));
            const loaded=this.levelManager?.isLoaded?.(level)||false;
            const result={level,distance:minDistance,loadDistance,unloadDistance,loaded,shouldLoad:!loaded&&minDistance<=loadDistance,shouldUnload:loaded&&minDistance>=unloadDistance,anchor};
            this._lastDistances.set(level.id,minDistance);
            return result;
        }
        evaluateAll(levels=[],target=null){
            return(levels||[]).map(level=>this.evaluate(level,target));
        }
        getLastDistance(levelOrId){
            const id=String(levelOrId?.id||levelOrId||'');
            return this._lastDistances.get(id)??Infinity;
        }
        clear(){
            this._lastDistances.clear();
            this.targets.length=0;
        }
        _levelAnchor(level){
            const meta=level.metadata||{};
            const streaming=level.streaming||{};
            const value=streaming.center||meta.streamingCenter||meta.center||level.playerStart?.position||null;
            if(value)return this._vector(value,[0,0,0]);
            const record=this.levelManager?.getLoaded?.(level);
            const root=record?.root;
            if(root?.getWorldPosition&&window.THREE?.Vector3){
                const point=root.getWorldPosition(new THREE.Vector3());
                return[point.x,point.y,point.z];
            }
            return null;
        }
        _position(target){
            const object=target?.object||target;
            if(!object)return null;
            if(object.getWorldPosition&&window.THREE?.Vector3){
                const point=object.getWorldPosition(new THREE.Vector3());
                return[point.x,point.y,point.z];
            }
            if(Array.isArray(object))return this._vector(object,[0,0,0]);
            if(object.position)return[Number(object.position.x||0),Number(object.position.y||0),Number(object.position.z||0)];
            if(typeof object==='object'&&('x'in object||'y'in object||'z'in object))return[Number(object.x||0),Number(object.y||0),Number(object.z||0)];
            return null;
        }
        _vector(value,fallback=[0,0,0]){
            if(Array.isArray(value))return[Number(value[0]??fallback[0]),Number(value[1]??fallback[1]),Number(value[2]??fallback[2])];
            if(value&&typeof value==='object')return[Number(value.x??fallback[0]),Number(value.y??fallback[1]),Number(value.z??fallback[2])];
            return[...fallback];
        }
        debug(){
            const state={enabled:this.enabled,targets:this.targets.length,defaultLoadDistance:this.defaultLoadDistance,defaultUnloadDistance:this.defaultUnloadDistance,lastDistances:Object.fromEntries(this._lastDistances)};
            console.log('[SMDistanceStreaming]',state);
            return state;
        }
    }
    window.SMDistanceStreaming=SMDistanceStreaming;
    window.SMDistanceStreamingClass=SMDistanceStreaming;
})();
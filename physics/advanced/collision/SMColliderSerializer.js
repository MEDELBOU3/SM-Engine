(function(global){
    'use strict';
    class SMColliderSerializer{
        static sanitize(config={}){
            const clone=JSON.parse(JSON.stringify(config,(key,value)=>key.startsWith('_')?undefined:value));
            clone.version=Number(clone.version)||1;
            clone.enabled=clone.enabled!==false;
            return clone;
        }
        static save(object,config){
            if(!object)return null;
            object.userData=object.userData||{};
            object.userData.colliderAuthoring=this.sanitize(config);
            return object.userData.colliderAuthoring;
        }
        static load(object){
            const config=object?.userData?.colliderAuthoring;
            return config?this.sanitize(config):null;
        }
        static clear(object){
            if(!object?.userData)return false;
            delete object.userData.colliderAuthoring;
            return true;
        }
        static clone(source,target){
            const config=this.load(source);
            if(!config||!target)return null;
            return this.save(target,config);
        }
    }
    global.SMColliderSerializer=SMColliderSerializer;
})(window);
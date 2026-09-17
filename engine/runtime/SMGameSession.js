(function(){
    'use strict';class SMGameSession{
        constructor(options={
        }){
            this.id=options.id||`session-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;this.scene=options.scene||window.scene||null;this.renderer=options.renderer||window.renderer||null;this.camera=options.camera||window.activeCamera||window.camera||null;this.eventBus=options.eventBus||window.SMRuntimeEventBus||null;this.state='created';this.startedAt=0;this.pausedAt=0;this.stoppedAt=0;this.elapsed=0;this.frame=0;this.data=new Map();this.systems=new Map();this.runtimeObjects=new Set();this._orderedSystems=[];this._lastUpdateTime=0;this._abortController=new AbortController();
        }
        get signal(){
            return this._abortController.signal;
        }
        get isRunning(){
            return this.state==='running';
        }
        get isPaused(){
            return this.state==='paused';
        }
        get isStopped(){
            return this.state==='stopped';
        }
        registerSystem(id,system,options={
        }){
            if(!id||!system)throw new Error('registerSystem(id, system) requires both values.');const record={
                id:String(id),system,priority:Number(options.priority||0),enabled:options.enabled!==false,started:false
            };this.systems.set(record.id,record);this._rebuildSystemOrder();if(this.state==='running')this._startSystem(record);return()=>this.unregisterSystem(record.id);
        }
        unregisterSystem(id){
            const record=this.systems.get(String(id));if(!record)return false;if(record.started){
                try{
                    record.system.stop?.(this);
                } catch(error){
                    console.error(`[SMGameSession] System "${record.id}" stop failed.`,error);
                }
            }
            this.systems.delete(String(id));this._rebuildSystemOrder();return true;
        }
        setSystemEnabled(id,enabled){
            const record=this.systems.get(String(id));if(!record)return false;record.enabled=Boolean(enabled);return true;
        }
        start(){
            if(this.state!=='created')return false;this.state='starting';this.startedAt=performance.now();this._lastUpdateTime=this.startedAt;this.eventBus?.emit?.('session:starting',{
                session:this
            });for(const record of this._orderedSystems)this._startSystem(record);this.state='running';this.eventBus?.emit?.('session:started',{
                session:this
            });return true;
        }
        pause(){
            if(this.state!=='running')return false;this.state='paused';this.pausedAt=performance.now();for(const record of this._orderedSystems){
                if(!record.enabled||!record.started)continue;try{
                    record.system.pause?.(this);
                } catch(error){
                    console.error(`[SMGameSession] System "${record.id}" pause failed.`,error);
                }
            }
            this.eventBus?.emit?.('session:paused',{
                session:this
            });return true;
        }
        resume(){
            if(this.state!=='paused')return false;const now=performance.now();this._lastUpdateTime=now;this.state='running';for(const record of this._orderedSystems){
                if(!record.enabled||!record.started)continue;try{
                    record.system.resume?.(this);
                } catch(error){
                    console.error(`[SMGameSession] System "${record.id}" resume failed.`,error);
                }
            }
            this.eventBus?.emit?.('session:resumed',{
                session:this
            });return true;
        }
        update(delta=null,time=null){
            if(this.state!=='running')return false;const now=time!==null?Number(time):performance.now();let dt=delta!==null?Number(delta):(now-this._lastUpdateTime)/1000;if(!Number.isFinite(dt))dt=0;dt=Math.max(0,Math.min(dt,0.1));this._lastUpdateTime=now;this.elapsed+=dt;this.frame+=1;for(const record of this._orderedSystems){
                if(!record.enabled||!record.started)continue;try{
                    record.system.update?.(dt,now,this);
                } catch(error){
                    console.error(`[SMGameSession] System "${record.id}" update failed.`,error);this.eventBus?.emit?.('system:error',{
                        session:this,id:record.id,error
                    });
                }
            }
            this.eventBus?.emit?.('session:update',{
                session:this,delta:dt,time:now,frame:this.frame,elapsed:this.elapsed
            });return true;
        }
        fixedUpdate(delta){
            if(this.state!=='running')return false;const dt=Math.max(0,Number(delta)||0);for(const record of this._orderedSystems){
                if(!record.enabled||!record.started)continue;try{
                    record.system.fixedUpdate?.(dt,this);
                } catch(error){
                    console.error(`[SMGameSession] System "${record.id}" fixedUpdate failed.`,error);this.eventBus?.emit?.('system:error',{
                        session:this,id:record.id,error
                    });
                }
            }
            this.eventBus?.emit?.('session:fixed-update',{
                session:this,delta:dt
            });return true;
        }
        stop(reason='user'){
            if(this.state==='stopped'||this.state==='stopping')return false;this.state='stopping';this.eventBus?.emit?.('session:stopping',{
                session:this,reason
            });for(const record of [...this._orderedSystems].reverse()){
                if(!record.started)continue;try{
                    record.system.stop?.(this,reason);
                } catch(error){
                    console.error(`[SMGameSession] System "${record.id}" stop failed.`,error);
                }
                record.started=false;
            }
            this._abortController.abort(reason);this.runtimeObjects.clear();this.stoppedAt=performance.now();this.state='stopped';this.eventBus?.emit?.('session:stopped',{
                session:this,reason,duration:(this.stoppedAt-this.startedAt)/1000
            });return true;
        }
        trackRuntimeObject(object){
            if(!object)return object;this.runtimeObjects.add(object);return object;
        }
        untrackRuntimeObject(object){
            this.runtimeObjects.delete(object);
        }
        destroyRuntimeObjects(){
            for(const object of Array.from(this.runtimeObjects)){
                try{
                    object.parent?.remove?.(object);object.traverse?.(child=>{
                        child.geometry?.dispose?.();const materials=Array.isArray(child.material)?child.material:child.material?[child.material]:[];for(const material of materials)material?.dispose?.();
                    });
                } catch(error){
                    console.warn('[SMGameSession] Runtime object cleanup failed.',error);
                }
            }
            this.runtimeObjects.clear();
        }
        setData(key,value){
            this.data.set(String(key),value);return value;
        }
        getData(key,fallback=null){
            return this.data.has(String(key))?this.data.get(String(key)):fallback;
        }
        deleteData(key){
            return this.data.delete(String(key));
        }
        getStats(){
            return{
                id:this.id,state:this.state,frame:this.frame,elapsed:this.elapsed,systems:this.systems.size,runtimeObjects:this.runtimeObjects.size,startedAt:this.startedAt,pausedAt:this.pausedAt,stoppedAt:this.stoppedAt
            };
        }
        _startSystem(record){
            if(record.started||!record.enabled)return;try{
                record.system.start?.(this);record.started=true;
            } catch(error){
                console.error(`[SMGameSession] System "${record.id}" start failed.`,error);this.eventBus?.emit?.('system:error',{
                    session:this,id:record.id,error
                });
            }
        }
        _rebuildSystemOrder(){
            this._orderedSystems=Array.from(this.systems.values()).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
        }
        debug(){
            const stats=this.getStats();console.log('[SMGameSession]',stats);return stats;
        }
    }
    window.SMGameSession=SMGameSession;window.smGameSession=SMGameSession;
})();
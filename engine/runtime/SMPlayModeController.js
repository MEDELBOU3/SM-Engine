(function(){
    'use strict';class SMPlayModeController{
        constructor(options={
        }){
            this.eventBus=options.eventBus||window.SMRuntimeEventBus||null;this.state='editor';this.snapshot=null;this.session=null;this.lastError=null;this.keepChangesOnStop=false;this._transitionPromise=null;
        }
        get isPlaying(){
            return this.state==='playing'||this.state==='paused';
        }
        get isPaused(){
            return this.state==='paused';
        }
        get isTransitioning(){
            return['starting','stopping'].includes(this.state);
        }
        async play(options={
        }){
            if(this.state==='playing'){
                return this.session;
            }
            if(this.state==='paused'){
                await this.resume();return this.session;
            }
            if(this._transitionPromise)return this._transitionPromise;this._transitionPromise=this._startPlay(options);try{
                return await this._transitionPromise;
            } finally{
                this._transitionPromise=null;
            }
        }
        async pause(){
            if(this.state!=='playing'||!this.session)return false;this.state='pausing';this.eventBus?.emit?.('playmode:pausing',{
                controller:this,session:this.session
            });this.session.pause();this.state='paused';this.eventBus?.emit?.('playmode:paused',{
                controller:this,session:this.session
            });this._emitState();return true;
        }
        async resume(){
            if(this.state!=='paused'||!this.session)return false;this.state='resuming';this.eventBus?.emit?.('playmode:resuming',{
                controller:this,session:this.session
            });this.session.resume();this.state='playing';this.eventBus?.emit?.('playmode:resumed',{
                controller:this,session:this.session
            });this._emitState();return true;
        }
        async stop(options={
        }){
            if(this.state==='editor')return false;if(this._transitionPromise)return this._transitionPromise;this._transitionPromise=this._stopPlay(options);try{
                return await this._transitionPromise;
            } finally{
                this._transitionPromise=null;
            }
        }
        async togglePause(){
            if(this.state==='playing')return this.pause();if(this.state==='paused')return this.resume();return false;
        }
        update(delta,time){
            if(this.state!=='playing'||!this.session)return false;return this.session.update(delta,time);
        }
        fixedUpdate(delta){
            if(this.state!=='playing'||!this.session)return false;return this.session.fixedUpdate(delta);
        }
        async _startPlay(options){
            this.state='starting';this.lastError=null;this._emitState();try{
                const scene=options.scene||window.scene||null;if(!scene)throw new Error('Cannot enter Play Mode because window.scene is missing.');this.eventBus?.emit?.('playmode:before-snapshot',{
                    controller:this,scene
                });this.snapshot=new window.SMRuntimeStateSnapshot(scene,options.snapshotOptions||{
                }).capture();this.eventBus?.emit?.('playmode:before-session',{
                    controller:this,snapshot:this.snapshot
                });this.session=new window.SMGameSession({
                    scene,renderer:options.renderer||window.renderer||null,camera:options.camera||window.activeCamera||window.camera||null,eventBus:this.eventBus
                });const systems=Array.isArray(options.systems)?options.systems:[];for(const entry of systems){
                    if(!entry)continue;if(entry.id&&entry.system)this.session.registerSystem(entry.id,entry.system,entry.options||{
                    });
                }
                await this.eventBus?.emitAsync?.('playmode:prepare',{
                    controller:this,session:this.session,snapshot:this.snapshot
                });this.session.start();this.state='playing';document.body?.classList?.add('sm-runtime-playing');document.body?.classList?.remove('sm-runtime-paused');this.eventBus?.emit?.('playmode:started',{
                    controller:this,session:this.session,snapshot:this.snapshot
                });this._emitState();return this.session;
            } catch(error){
                this.lastError=error;console.error('[SMPlayModeController] Failed to enter Play Mode.',error);try{
                    this.snapshot?.restore?.();
                } catch(restoreError){
                    console.error('[SMPlayModeController] Snapshot rollback failed.',restoreError);
                }
                this.session=null;this.snapshot=null;this.state='editor';document.body?.classList?.remove('sm-runtime-playing','sm-runtime-paused');this.eventBus?.emit?.('playmode:error',{
                    controller:this,error,phase:'play'
                });this._emitState();throw error;
            }
        }
        async _stopPlay(options){
            this.state='stopping';this._emitState();const session=this.session;const snapshot=this.snapshot;const keepChanges=options.keepChanges===true||this.keepChangesOnStop===true;try{
                this.eventBus?.emit?.('playmode:stopping',{
                    controller:this,session,keepChanges
                });await this.eventBus?.emitAsync?.('playmode:before-stop',{
                    controller:this,session,keepChanges
                });session?.stop?.(options.reason||'user');if(options.destroyRuntimeObjects!==false)session?.destroyRuntimeObjects?.();if(!keepChanges&&snapshot){
                    this.eventBus?.emit?.('playmode:before-restore',{
                        controller:this,session,snapshot
                    });snapshot.restore();this.eventBus?.emit?.('playmode:restored',{
                        controller:this,snapshot
                    });
                }
                this.session=null;this.snapshot=null;this.state='editor';document.body?.classList?.remove('sm-runtime-playing','sm-runtime-paused');this.eventBus?.emit?.('playmode:stopped',{
                    controller:this,keepChanges
                });this._emitState();window.dispatchEvent(new Event('resize'));window.dispatchEvent(new Event('sm:sync-layout'));return true;
            } catch(error){
                this.lastError=error;console.error('[SMPlayModeController] Stop failed.',error);this.session=null;this.snapshot=null;this.state='editor';document.body?.classList?.remove('sm-runtime-playing','sm-runtime-paused');this.eventBus?.emit?.('playmode:error',{
                    controller:this,error,phase:'stop'
                });this._emitState();throw error;
            }
        }
        _emitState(){
            if(this.state==='paused'){
                document.body?.classList?.add('sm-runtime-paused');
            } else{
                document.body?.classList?.remove('sm-runtime-paused');
            }
            const detail={
                state:this.state,isPlaying:this.isPlaying,isPaused:this.isPaused,session:this.session
            };this.eventBus?.emit?.('playmode:state',detail);window.dispatchEvent(new CustomEvent('sm:playmode-state',{
                detail
            }));
        }
        debug(){
            const state={
                state:this.state,isPlaying:this.isPlaying,isPaused:this.isPaused,session:this.session?.getStats?.()||null,snapshot:this.snapshot?.getStats?.()||null,lastError:this.lastError?.message||null
            };console.log('[SMPlayModeController]',state);return state;
        }
    }
    window.SMPlayModeController=SMPlayModeController;window.smPlayModeController=SMPlayModeController;
})();
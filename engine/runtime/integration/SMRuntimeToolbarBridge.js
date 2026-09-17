(function(){
    'use strict';
    class SMRuntimeToolbarBridge{
        constructor(){
            this.playButton=null;
            this.pauseButton=null;
            this.stopButton=null;
            this._observer=null;
            this._bound=false;
            this._busy=false;
            this.selectors={
                play:['#play-btn','#runtime-play-btn','#game-play-btn','[data-runtime-action="play"]','[data-action="play-game"]','[data-action="runtime-play"]'],
                pause:['#pause-btn','#runtime-pause-btn','#game-pause-btn','[data-runtime-action="pause"]','[data-action="pause-game"]','[data-action="runtime-pause"]'],
                stop:['#stop-btn','#runtime-stop-btn','#game-stop-btn','[data-runtime-action="stop"]','[data-action="stop-game"]','[data-action="runtime-stop"]']
            };
            this._onState=this._onState.bind(this);
            this._onPlay=this._onPlay.bind(this);
            this._onPause=this._onPause.bind(this);
            this._onStop=this._onStop.bind(this);
            this._init();
        }
        registerButtons(buttons={}){
            this._unbindButtons();
            this.playButton=this._resolve(buttons.play)||this._find('play');
            this.pauseButton=this._resolve(buttons.pause)||this._find('pause');
            this.stopButton=this._resolve(buttons.stop)||this._find('stop');
            this._bindButtons();
            this.refresh();
            return this.getButtons();
        }
        refresh(){
            if(!this.playButton?.isConnected)this.playButton=this._find('play');
            if(!this.pauseButton?.isConnected)this.pauseButton=this._find('pause');
            if(!this.stopButton?.isConnected)this.stopButton=this._find('stop');
            this._bindButtons();
            this._applyState(window.SMRuntime?.getState?.()||'editor');
            return this.getButtons();
        }
        getButtons(){
            return{play:this.playButton,pause:this.pauseButton,stop:this.stopButton};
        }
        async play(){
            if(this._busy)return false;
            this._busy=true;
            this._setBusy(true);
            try{
                await window.SMRuntime?.play?.();
                return true;
            }catch(error){
                console.error('[SMRuntimeToolbarBridge] Play failed.',error);
                return false;
            }finally{
                this._busy=false;
                this._setBusy(false);
                this.refresh();
            }
        }
        async togglePause(){
            if(this._busy)return false;
            const runtime=window.SMRuntime;
            if(!runtime?.isPlaying?.())return false;
            this._busy=true;
            this._setBusy(true);
            try{
                if(runtime.isPaused())await runtime.resume();
                else await runtime.pause();
                return true;
            }catch(error){
                console.error('[SMRuntimeToolbarBridge] Pause/Resume failed.',error);
                return false;
            }finally{
                this._busy=false;
                this._setBusy(false);
                this.refresh();
            }
        }
        async stop(options={}){
            if(this._busy)return false;
            if(!window.SMRuntime?.isPlaying?.())return false;
            this._busy=true;
            this._setBusy(true);
            try{
                await window.SMRuntime.stop(options);
                return true;
            }catch(error){
                console.error('[SMRuntimeToolbarBridge] Stop failed.',error);
                return false;
            }finally{
                this._busy=false;
                this._setBusy(false);
                this.refresh();
            }
        }
        _init(){
            const start=()=>{
                this.refresh();
                this._observeDOM();
            };
            if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
            else start();
            window.addEventListener('sm:playmode-state',this._onState);
            window.addEventListener('sm:runtime-ready',()=>this.refresh());
            if(typeof window.playGame!=='function')window.playGame=()=>this.play();
            if(typeof window.pauseGame!=='function')window.pauseGame=()=>this.togglePause();
            if(typeof window.stopGame!=='function')window.stopGame=options=>this.stop(options);
        }
        _observeDOM(){
            if(this._observer)return;
            this._observer=new MutationObserver(()=>{
                if(!this.playButton?.isConnected||!this.pauseButton?.isConnected||!this.stopButton?.isConnected)this.refresh();
            });
            this._observer.observe(document.body||document.documentElement,{childList:true,subtree:true});
        }
        _find(type){
            for(const selector of this.selectors[type]||[]){
                const element=document.querySelector(selector);
                if(element)return element;
            }
            return null;
        }
        _resolve(value){
            if(!value)return null;
            if(typeof value==='string')return document.querySelector(value);
            return value instanceof Element?value:null;
        }
        _bindButtons(){
            const buttons=[this.playButton,this.pauseButton,this.stopButton];
            if(buttons.every(button=>!button))return;
            if(this.playButton&&!this.playButton.__smRuntimePlayBound){
                this.playButton.addEventListener('click',this._onPlay);
                this.playButton.__smRuntimePlayBound=true;
            }
            if(this.pauseButton&&!this.pauseButton.__smRuntimePauseBound){
                this.pauseButton.addEventListener('click',this._onPause);
                this.pauseButton.__smRuntimePauseBound=true;
            }
            if(this.stopButton&&!this.stopButton.__smRuntimeStopBound){
                this.stopButton.addEventListener('click',this._onStop);
                this.stopButton.__smRuntimeStopBound=true;
            }
            this._bound=true;
        }
        _unbindButtons(){
            if(this.playButton?.__smRuntimePlayBound){
                this.playButton.removeEventListener('click',this._onPlay);
                delete this.playButton.__smRuntimePlayBound;
            }
            if(this.pauseButton?.__smRuntimePauseBound){
                this.pauseButton.removeEventListener('click',this._onPause);
                delete this.pauseButton.__smRuntimePauseBound;
            }
            if(this.stopButton?.__smRuntimeStopBound){
                this.stopButton.removeEventListener('click',this._onStop);
                delete this.stopButton.__smRuntimeStopBound;
            }
            this._bound=false;
        }
        _onPlay(event){
            event.preventDefault();
            this.play();
        }
        _onPause(event){
            event.preventDefault();
            this.togglePause();
        }
        _onStop(event){
            event.preventDefault();
            this.stop();
        }
        _onState(event){
            const state=event.detail?.state||window.SMRuntime?.getState?.()||'editor';
            this._applyState(state);
        }
        _applyState(state){
            const playing=state==='playing';
            const paused=state==='paused';
            const active=playing||paused||state==='starting'||state==='stopping';
            if(this.playButton){
                this.playButton.disabled=this._busy||playing||paused||state==='starting'||state==='stopping';
                this.playButton.classList.toggle('active',playing);
                this.playButton.classList.toggle('runtime-active',active);
                this.playButton.setAttribute('aria-pressed',playing?'true':'false');
            }
            if(this.pauseButton){
                this.pauseButton.disabled=this._busy||!active||state==='starting'||state==='stopping';
                this.pauseButton.classList.toggle('active',paused);
                this.pauseButton.classList.toggle('runtime-paused',paused);
                this.pauseButton.setAttribute('aria-pressed',paused?'true':'false');
                this.pauseButton.title=paused?'Resume Runtime':'Pause Runtime';
                this.pauseButton.dataset.runtimeState=paused?'resume':'pause';
                const icon=this.pauseButton.querySelector('i');
                if(icon&&icon.dataset.smRuntimeOwnedIcon==='true'){
                    icon.className=paused?'fa-solid fa-play':'fa-solid fa-pause';
                }
            }
            if(this.stopButton){
                this.stopButton.disabled=this._busy||!active||state==='starting'||state==='stopping';
                this.stopButton.classList.toggle('runtime-active',active);
            }
            document.body?.setAttribute('data-sm-runtime-state',state);
        }
        _setBusy(busy){
            for(const button of [this.playButton,this.pauseButton,this.stopButton]){
                if(button)button.classList.toggle('runtime-busy',busy);
            }
        }
        debug(){
            const state={bound:this._bound,busy:this._busy,state:window.SMRuntime?.getState?.()||'editor',play:this.playButton?.id||null,pause:this.pauseButton?.id||null,stop:this.stopButton?.id||null};
            console.log('[SMRuntimeToolbarBridge]',state);
            return state;
        }
    }
    const bridge=new SMRuntimeToolbarBridge();
    window.SMRuntimeToolbarBridge=bridge;
    window.smRuntimeToolbarBridge=bridge;
    window.SMRuntimeToolbarBridgeClass=SMRuntimeToolbarBridge;
})();
(function(){
    'use strict';
    class SMPlayerController{
        constructor(options={}){
            this.id=String(options.id||`player-controller-${Date.now()}-${Math.random().toString(36).slice(2,7)}`);
            this.player=options.player||null;
            this.pawn=options.pawn||null;
            this.inputManager=options.inputManager||window.SMInputManager||null;
            this.inputContext=options.inputContext||null;
            this.gameMode=options.gameMode||null;
            this.enabled=options.enabled!==false;
            this.inputEnabled=options.inputEnabled!==false;
            this.camera=options.camera||null;
            this.metadata={...(options.metadata||{})};
            this._lastInput=null;
        }
        possess(pawn,options={}){
            const runtime=window.SMRuntime;
            if(runtime?.possess&&window.SMPlayerPossessionManager)return runtime.possess(this,pawn,{...options,player:this.player});
            this.pawn=pawn||null;
            pawn?.possess?.(this,this.player);
            this.onPossess?.(pawn,null,options);
            return pawn;
        }
        unpossess(options={}){
            if(window.SMRuntime?.unpossess&&window.SMPlayerPossessionManager)return window.SMRuntime.unpossess(this,options);
            const pawn=this.pawn;
            this.pawn=null;
            pawn?.unpossess?.();
            this.onUnpossess?.(pawn,options);
            return pawn;
        }
        setPlayer(player){
            this.player=player||null;
            if(player&&player.controller!==this)player.controller=this;
            return this.player;
        }
        setInputContext(context){
            this.inputContext=context||null;
            if(context&&this.player?.setInputContext)this.player.setInputContext(context);
            return this.inputContext;
        }
        setInputEnabled(enabled){
            this.inputEnabled=Boolean(enabled);
            if(this.inputContext?.setEnabled)this.inputContext.setEnabled(this.inputEnabled);
            return this.inputEnabled;
        }
        onInput(input){
            if(!this.enabled||!this.inputEnabled)return false;
            this._lastInput=input||{};
            if(input?.pausePressed)this.gameMode?.requestPause?.(this);
            return true;
        }
        getInputValue(name){
            if(this.inputContext?.getAction)return this.inputContext.getAction(name)?.getValue?.()??null;
            return this.inputManager?.getValue?.(name)??null;
        }
        isInputPressed(name){
            if(this.inputContext?.getAction)return Boolean(this.inputContext.getAction(name)?.pressed);
            return Boolean(this.inputManager?.isPressed?.(name));
        }
        isInputActive(name){
            if(this.inputContext?.getAction)return Boolean(this.inputContext.getAction(name)?.active);
            return Boolean(this.inputManager?.isActive?.(name));
        }
        respawn(options={}){
            if(this.gameMode?.respawnPlayer)return this.gameMode.respawnPlayer(this.player||this,options);
            if(window.SMRuntime?.respawnPlayer&&this.player)return window.SMRuntime.respawnPlayer(this.player,options);
            return Promise.resolve(null);
        }
        switchPawn(pawn,options={}){
            this.unpossess({reason:'switch-pawn'});
            return this.possess(pawn,options);
        }
        onPossess(pawn,previousPawn,options={}){
            this.pawn=pawn||null;
            window.SMRuntimeEventBus?.emit?.('player-controller:possess',{controller:this,pawn,previousPawn,options});
        }
        onUnpossess(pawn,options={}){
            if(this.pawn===pawn)this.pawn=null;
            window.SMRuntimeEventBus?.emit?.('player-controller:unpossess',{controller:this,pawn,options});
        }
        serialize(){
            return{id:this.id,playerId:this.player?.id||null,pawnId:this.pawn?.id||null,enabled:this.enabled,inputEnabled:this.inputEnabled,inputContext:this.inputContext?.name||null,metadata:{...this.metadata}};
        }
        debug(){
            const state={id:this.id,player:this.player?.id||null,pawn:this.pawn?.id||null,enabled:this.enabled,inputEnabled:this.inputEnabled,inputContext:this.inputContext?.name||null,gameMode:this.gameMode?.id||null};
            console.log('[SMPlayerController]',state);
            return state;
        }
    }
    window.SMPlayerController=SMPlayerController;
    window.SMPlayerControllerClass=SMPlayerController;
})();
(function(){
    'use strict';
    class SMPlayerPossessionManager{
        constructor(){
            this.controllerToPawn=new Map();
            this.pawnToController=new Map();
        }
        possess(controller,pawn,options={}){
            if(!controller)throw new Error('SMPlayerPossessionManager.possess() requires a controller.');
            if(!pawn)throw new Error('SMPlayerPossessionManager.possess() requires a pawn.');
            const current=this.controllerToPawn.get(controller);
            if(current===pawn)return pawn;
            if(current)this.unpossess(controller,{reason:'switch-pawn'});
            const otherController=this.pawnToController.get(pawn);
            if(otherController&&otherController!==controller)this.unpossess(otherController,{reason:'pawn-taken'});
            this.controllerToPawn.set(controller,pawn);
            this.pawnToController.set(pawn,controller);
            controller.pawn=pawn;
            if(controller.player)controller.player.setPawn?.(pawn);
            pawn.possess?.(controller,controller.player||options.player||null);
            try{controller.onPossess?.(pawn,current||null,options);}catch(error){console.error('[SMPlayerPossessionManager] controller.onPossess failed.',error);}
            window.SMRuntimeEventBus?.emit?.('player:possessed',{manager:this,controller,pawn,player:controller.player||options.player||null});
            return pawn;
        }
        unpossess(controllerOrPawn,options={}){
            let controller=controllerOrPawn;
            let pawn=this.controllerToPawn.get(controller)||null;
            if(!pawn&&this.pawnToController.has(controllerOrPawn)){
                pawn=controllerOrPawn;
                controller=this.pawnToController.get(pawn);
            }
            if(!controller||!pawn)return null;
            this.controllerToPawn.delete(controller);
            this.pawnToController.delete(pawn);
            if(controller.pawn===pawn)controller.pawn=null;
            if(controller.player?.pawn===pawn)controller.player.clearPawn?.();
            pawn.unpossess?.();
            try{controller.onUnpossess?.(pawn,options);}catch(error){console.error('[SMPlayerPossessionManager] controller.onUnpossess failed.',error);}
            window.SMRuntimeEventBus?.emit?.('player:unpossessed',{manager:this,controller,pawn,reason:options.reason||null});
            return pawn;
        }
        getPawn(controller){
            return this.controllerToPawn.get(controller)||null;
        }
        getController(pawn){
            return this.pawnToController.get(pawn)||null;
        }
        isPossessed(pawn){
            return this.pawnToController.has(pawn);
        }
        clear(){
            for(const controller of Array.from(this.controllerToPawn.keys()))this.unpossess(controller,{reason:'clear'});
            return true;
        }
        debug(){
            const state={possessions:this.controllerToPawn.size,items:Array.from(this.controllerToPawn.entries()).map(([controller,pawn])=>({controller:controller.id||controller.constructor?.name||'controller',pawn:pawn.id||null,player:controller.player?.id||null}))};
            console.log('[SMPlayerPossessionManager]',state);
            return state;
        }
    }
    const manager=new SMPlayerPossessionManager();
    window.SMPlayerPossessionManagerClass=SMPlayerPossessionManager;
    window.SMPlayerPossessionManager=manager;
    window.smPlayerPossessionManager=manager;
})();
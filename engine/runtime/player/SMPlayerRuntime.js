(function(){
    'use strict';
    class SMPlayerRuntime{
        constructor(options={}){
            this.id=String(options.id||`player-${Date.now()}-${Math.random().toString(36).slice(2,6)}`);
            this.displayName=String(options.displayName||options.name||'Player');
            this.local=options.local!==false;
            this.connected=options.connected!==false;
            this.controller=options.controller||null;
            this.pawn=options.pawn||null;
            this.inputContext=options.inputContext||null;
            this.metadata={...(options.metadata||{})};
            this.spawnCount=Number(options.spawnCount||0);
            this.joinedAt=Number(options.joinedAt||performance.now?.()||Date.now());
            this.state='active';
        }
        setController(controller){
            this.controller=controller||null;
            if(controller)controller.player=this;
            return this.controller;
        }
        setPawn(pawn){
            this.pawn=pawn||null;
            if(pawn)pawn.player=this;
            return this.pawn;
        }
        clearPawn(){
            const pawn=this.pawn;
            this.pawn=null;
            return pawn;
        }
        setInputContext(context){
            this.inputContext=context||null;
            if(context)context.owner=this;
            return this.inputContext;
        }
        setConnected(connected){
            this.connected=Boolean(connected);
            this.state=this.connected?'active':'disconnected';
            return this.connected;
        }
        incrementSpawn(){
            this.spawnCount+=1;
            return this.spawnCount;
        }
        serialize(){
            return{id:this.id,displayName:this.displayName,local:this.local,connected:this.connected,spawnCount:this.spawnCount,state:this.state,metadata:{...this.metadata},pawnId:this.pawn?.id||null};
        }
        debug(){
            const state={id:this.id,displayName:this.displayName,local:this.local,connected:this.connected,state:this.state,spawnCount:this.spawnCount,controller:!!this.controller,pawn:this.pawn?.id||null,inputContext:this.inputContext?.name||null};
            console.log('[SMPlayerRuntime]',state);
            return state;
        }
    }
    window.SMPlayerRuntime=SMPlayerRuntime;
    window.SMPlayerRuntimeClass=SMPlayerRuntime;
})();
(function(){
    'use strict';
    class SMGameState{
        constructor(options={}){
            this.id=String(options.id||`game-state-${Date.now()}-${Math.random().toString(36).slice(2,7)}`);
            this.state=String(options.state||'waiting');
            this.previousState=null;
            this.startedAt=0;
            this.elapsedTime=0;
            this.round=Number(options.round||0);
            this.maxRounds=Math.max(0,Number(options.maxRounds||0));
            this.players=new Map();
            this.scores=new Map();
            this.teams=new Map();
            this.winner=null;
            this.result=null;
            this.metadata={...(options.metadata||{})};
            this.paused=false;
            this.ended=false;
        }
        setState(state,metadata={}){
            const next=String(state||'waiting');
            if(this.state===next)return this.state;
            const previous=this.state;
            this.previousState=previous;
            this.state=next;
            if(next==='playing'&&!this.startedAt)this.startedAt=performance.now?.()||Date.now();
            if(next==='paused')this.paused=true;
            if(previous==='paused'&&next!=='paused')this.paused=false;
            if(next==='ended'||next==='game-over')this.ended=true;
            window.SMRuntimeEventBus?.emit?.('game-state:changed',{gameState:this,state:next,previous,metadata});
            window.dispatchEvent(new CustomEvent('sm:game-state-changed',{detail:{gameState:this,state:next,previous,metadata}}));
            return next;
        }
        update(delta){
            if(this.state==='playing'&&!this.paused&&!this.ended)this.elapsedTime+=Math.max(0,Number(delta)||0);
            return this.elapsedTime;
        }
        addPlayer(player,options={}){
            if(!player)return null;
            const id=String(player.id||options.id||`player-${this.players.size+1}`);
            this.players.set(id,player);
            if(!this.scores.has(id))this.scores.set(id,Number(options.score||0));
            if(options.team!==undefined)this.teams.set(id,options.team);
            window.SMRuntimeEventBus?.emit?.('game-state:player-added',{gameState:this,player,playerId:id});
            return player;
        }
        removePlayer(playerOrId){
            const id=String(playerOrId?.id||playerOrId||'');
            const player=this.players.get(id)||null;
            if(!player)return false;
            this.players.delete(id);
            this.scores.delete(id);
            this.teams.delete(id);
            window.SMRuntimeEventBus?.emit?.('game-state:player-removed',{gameState:this,player,playerId:id});
            return player;
        }
        getPlayer(playerOrId){
            const id=String(playerOrId?.id||playerOrId||'');
            return this.players.get(id)||null;
        }
        setScore(playerOrId,score){
            const id=String(playerOrId?.id||playerOrId||'');
            const value=Number(score)||0;
            const previous=this.scores.get(id)||0;
            this.scores.set(id,value);
            window.SMRuntimeEventBus?.emit?.('game-state:score-changed',{gameState:this,playerId:id,score:value,previous,delta:value-previous});
            return value;
        }
        addScore(playerOrId,delta=1){
            const id=String(playerOrId?.id||playerOrId||'');
            return this.setScore(id,(this.scores.get(id)||0)+(Number(delta)||0));
        }
        getScore(playerOrId){
            const id=String(playerOrId?.id||playerOrId||'');
            return this.scores.get(id)||0;
        }
        setTeam(playerOrId,team){
            const id=String(playerOrId?.id||playerOrId||'');
            this.teams.set(id,team);
            return team;
        }
        getTeam(playerOrId){
            const id=String(playerOrId?.id||playerOrId||'');
            return this.teams.get(id)??null;
        }
        nextRound(){
            this.round+=1;
            window.SMRuntimeEventBus?.emit?.('game-state:round-changed',{gameState:this,round:this.round,maxRounds:this.maxRounds});
            return this.round;
        }
        end(result={}){
            this.result={...(result||{})};
            this.winner=result?.winner??null;
            this.setState('ended',{result:this.result});
            return this.result;
        }
        reset(options={}){
            this.previousState=this.state;
            this.state=String(options.state||'waiting');
            this.startedAt=0;
            this.elapsedTime=0;
            this.round=Number(options.round||0);
            this.winner=null;
            this.result=null;
            this.paused=false;
            this.ended=false;
            if(options.keepPlayers!==true){
                this.players.clear();
                this.scores.clear();
                this.teams.clear();
            }else if(options.keepScores!==true)for(const id of this.players.keys())this.scores.set(id,0);
            return this;
        }
        serialize(){
            return{id:this.id,state:this.state,previousState:this.previousState,startedAt:this.startedAt,elapsedTime:this.elapsedTime,round:this.round,maxRounds:this.maxRounds,players:Array.from(this.players.keys()),scores:Object.fromEntries(this.scores),teams:Object.fromEntries(this.teams),winner:this.winner?.id||this.winner||null,result:this._clone(this.result),metadata:this._clone(this.metadata),paused:this.paused,ended:this.ended};
        }
        _clone(value){
            if(value===undefined)return undefined;
            try{return structuredClone(value);}catch{}
            try{return JSON.parse(JSON.stringify(value));}catch{return value;}
        }
        debug(){
            const state={id:this.id,state:this.state,previousState:this.previousState,elapsedTime:this.elapsedTime,round:this.round,players:this.players.size,scores:Object.fromEntries(this.scores),winner:this.winner?.id||this.winner||null,paused:this.paused,ended:this.ended};
            console.log('[SMGameState]',state);
            return state;
        }
    }
    window.SMGameState=SMGameState;
    window.SMGameStateClass=SMGameState;
})();
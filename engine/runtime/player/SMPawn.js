(function(){
    'use strict';
    class SMPawn{
        constructor(object,options={}){
            if(!object)throw new Error('SMPawn requires an Object3D-like owner.');
            this.id=String(options.id||object.userData?.pawnId||object.uuid||`pawn-${Date.now()}`);
            this.object=object;
            this.type=String(options.type||object.userData?.pawnType||'character');
            this.enabled=options.enabled!==false;
            this.controller=null;
            this.player=null;
            this.metadata={...(options.metadata||{})};
            this._ensureMetadata();
        }
        get transform(){
            return this.object;
        }
        get character(){
            return this.object?.getComponent?.('Character')||this.object?.components?.get?.('Character')||null;
        }
        get health(){
            return this.object?.getComponent?.('Health')||this.object?.components?.get?.('Health')||null;
        }
        get runtimeType(){
            return this.object?.userData?.runtimeType||'pawn';
        }
        setEnabled(enabled){
            this.enabled=Boolean(enabled);
            if(this.object)this.object.userData.pawnEnabled=this.enabled;
            return this.enabled;
        }
        possess(controller,player=null){
            this.controller=controller||null;
            if(player)this.player=player;
            this.object.userData.possessed=true;
            this.object.userData.playerId=player?.id||this.object.userData.playerId||null;
            this.onPossessed?.(controller,player);
            window.SMRuntimeEventBus?.emit?.('pawn:possessed',{pawn:this,controller,player});
            return this;
        }
        unpossess(){
            const controller=this.controller;
            const player=this.player;
            this.controller=null;
            this.object.userData.possessed=false;
            this.onUnpossessed?.(controller,player);
            window.SMRuntimeEventBus?.emit?.('pawn:unpossessed',{pawn:this,controller,player});
            return this;
        }
        applyInput(input={}){
            if(!this.enabled)return false;
            const character=this.character;
            const move=input.move||{x:0,y:0};
            if(character?.setMoveInput)character.setMoveInput(move.x??0,move.y??0);
            if(character?.setRunning)character.setRunning(Boolean(input.sprint));
            if(input.jumpPressed&&character?.jump)character.jump({source:'runtime-input',pawn:this});
            if(input.crouchPressed)this._callAdapter(['crouch','toggleCrouch'],true,input);
            if(input.crouchReleased)this._callAdapter(['crouch','toggleCrouch'],false,input);
            if(input.interactPressed)this._callAdapter(['interact','requestInteract'],input);
            if(input.fireActive)this._callAdapter(['fire','setFire'],true,input);
            else this._callAdapter(['fire','setFire'],false,input);
            this._callAdapter(['aim','setAim'],Boolean(input.aimActive),input);
            if(input.look&&((input.look.x||0)!==0||(input.look.y||0)!==0))this._callAdapter(['look','addLookInput','lookInput'],input.look,input);
            this.onInput?.(input);
            return true;
        }
        teleport(position,quaternion=null){
            const character=this.character;
            if(character?.teleport)return character.teleport(position,quaternion);
            if(Array.isArray(position))this.object.position?.fromArray?.(position);
            else if(position&&this.object.position?.set)this.object.position.set(Number(position.x||0),Number(position.y||0),Number(position.z||0));
            if(quaternion){
                if(Array.isArray(quaternion))this.object.quaternion?.fromArray?.(quaternion);
                else this.object.quaternion?.set?.(Number(quaternion.x||0),Number(quaternion.y||0),Number(quaternion.z||0),Number(quaternion.w??1));
            }
            this.object.updateMatrixWorld?.(true);
            return true;
        }
        serialize(){
            return{id:this.id,type:this.type,enabled:this.enabled,objectUUID:this.object?.uuid||null,metadata:{...this.metadata}};
        }
        _callAdapter(names,...args){
            const adapters=[this.character?.adapter,this.object?.userData?.pawnAdapter,this.controller,this.object];
            for(const adapter of adapters){
                if(!adapter)continue;
                for(const name of names){
                    if(typeof adapter[name]==='function'){
                        try{return adapter[name](...args);}catch(error){console.warn(`[SMPawn] ${name}() failed.`,error);}
                    }
                }
            }
            return undefined;
        }
        _ensureMetadata(){
            this.object.userData=this.object.userData||{};
            this.object.userData.pawnId=this.id;
            this.object.userData.pawnType=this.type;
            if(!this.object.userData.runtimeType)this.object.userData.runtimeType='pawn';
            const tags=Array.isArray(this.object.userData.tags)?this.object.userData.tags.slice():[];
            if(!tags.includes('pawn'))tags.push('pawn');
            this.object.userData.tags=tags;
        }
        onPossessed(){}
        onUnpossessed(){}
        onInput(){}
        debug(){
            const state={id:this.id,type:this.type,enabled:this.enabled,object:this.object?.name||this.object?.uuid||null,controller:!!this.controller,player:this.player?.id||null,hasCharacter:!!this.character};
            console.log('[SMPawn]',state);
            return state;
        }
    }
    window.SMPawn=SMPawn;
    window.SMPawnClass=SMPawn;
})();
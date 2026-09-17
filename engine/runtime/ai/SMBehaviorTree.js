(function(){
    'use strict';
    class SMBehaviorTree{
        constructor(definition={}){
            this.name=String(definition.name||'BehaviorTree');
            this.root=this._normalizeNode(definition.root||definition);
            this.actions=new Map();
            this.conditions=new Map();
            this.nodeState=new Map();
            this.enabled=definition.enabled!==false;
            this.lastStatus='failure';
            this.tickCount=0;
            this._registerBuiltins();
        }
        registerAction(name,handler){
            if(typeof handler!=='function')throw new TypeError('registerAction(name, handler) expects a function.');
            this.actions.set(String(name),handler);
            return this;
        }
        registerCondition(name,handler){
            if(typeof handler!=='function')throw new TypeError('registerCondition(name, handler) expects a function.');
            this.conditions.set(String(name),handler);
            return this;
        }
        tick(context={},dt=0){
            if(!this.enabled||!this.root)return'failure';
            this.tickCount+=1;
            const ctx={...context,tree:this,blackboard:context.blackboard||context.controller?.blackboard||null,delta:Math.max(0,Number(dt)||0)};
            this.lastStatus=this._tickNode(this.root,ctx);
            return this.lastStatus;
        }
        reset(nodeId=null){
            if(nodeId===null)this.nodeState.clear();
            else this.nodeState.delete(String(nodeId));
            return this;
        }
        _tickNode(node,context){
            if(!node||node.enabled===false)return'failure';
            const type=String(node.type||'action').toLowerCase();
            if(type==='sequence')return this._tickSequence(node,context);
            if(type==='selector')return this._tickSelector(node,context);
            if(type==='parallel')return this._tickParallel(node,context);
            if(type==='inverter'){
                const result=this._tickNode(node.children[0],context);
                return result==='success'?'failure':result==='failure'?'success':'running';
            }
            if(type==='succeeder'){
                const result=this._tickNode(node.children[0],context);
                return result==='running'?'running':'success';
            }
            if(type==='repeat')return this._tickRepeat(node,context);
            if(type==='wait')return this._tickWait(node,context);
            if(type==='condition')return this._tickCondition(node,context);
            if(type==='blackboard-condition')return this._tickBlackboardCondition(node,context);
            return this._tickAction(node,context);
        }
        _tickSequence(node,context){
            const state=this._state(node);
            let index=Number(state.index||0);
            while(index<node.children.length){
                const result=this._tickNode(node.children[index],context);
                if(result==='running'){
                    state.index=index;
                    return'running';
                }
                if(result==='failure'){
                    state.index=0;
                    this._resetChildren(node,index);
                    return'failure';
                }
                index+=1;
            }
            state.index=0;
            this._resetChildren(node);
            return'success';
        }
        _tickSelector(node,context){
            const state=this._state(node);
            let index=Number(state.index||0);
            while(index<node.children.length){
                const result=this._tickNode(node.children[index],context);
                if(result==='running'){
                    state.index=index;
                    return'running';
                }
                if(result==='success'){
                    state.index=0;
                    this._resetChildren(node,index);
                    return'success';
                }
                index+=1;
            }
            state.index=0;
            this._resetChildren(node);
            return'failure';
        }
        _tickParallel(node,context){
            let successes=0;
            let failures=0;
            let running=0;
            for(const child of node.children){
                const result=this._tickNode(child,context);
                if(result==='success')successes+=1;
                else if(result==='failure')failures+=1;
                else running+=1;
            }
            const successPolicy=node.successPolicy||'all';
            const failurePolicy=node.failurePolicy||'one';
            if((successPolicy==='one'&&successes>0)||(successPolicy==='all'&&successes===node.children.length)){
                this._resetChildren(node);
                return'success';
            }
            if((failurePolicy==='one'&&failures>0)||(failurePolicy==='all'&&failures===node.children.length)){
                this._resetChildren(node);
                return'failure';
            }
            return running>0?'running':'failure';
        }
        _tickRepeat(node,context){
            const child=node.children[0];
            if(!child)return'failure';
            const state=this._state(node);
            const count=Number(node.count??-1);
            const result=this._tickNode(child,context);
            if(result==='running')return'running';
            if(result==='failure'&&node.stopOnFailure===true){
                state.count=0;
                this._resetNode(child);
                return'failure';
            }
            state.count=Number(state.count||0)+1;
            this._resetNode(child);
            if(count>=0&&state.count>=count){
                state.count=0;
                return'success';
            }
            return'running';
        }
        _tickWait(node,context){
            const state=this._state(node);
            state.elapsed=Number(state.elapsed||0)+context.delta;
            const duration=Math.max(0,Number(node.duration??node.seconds??0));
            if(state.elapsed>=duration){
                state.elapsed=0;
                return'success';
            }
            return'running';
        }
        _tickCondition(node,context){
            const handler=this.conditions.get(String(node.condition||node.name||''));
            if(!handler)return'failure';
            try{return handler(context,node)?'success':'failure';}catch(error){console.error(`[SMBehaviorTree] Condition "${node.condition||node.name}" failed.`,error);return'failure';}
        }
        _tickBlackboardCondition(node,context){
            const actual=context.blackboard?.get?.(node.key);
            const expected=node.value;
            const op=node.op||'==';
            if(op==='exists')return context.blackboard?.has?.(node.key)?'success':'failure';
            if(op==='not-exists')return!context.blackboard?.has?.(node.key)?'success':'failure';
            if(op==='=='&&actual===expected)return'success';
            if(op==='!='&&actual!==expected)return'success';
            if(op==='>'&&Number(actual)>Number(expected))return'success';
            if(op==='>='&&Number(actual)>=Number(expected))return'success';
            if(op==='<'&&Number(actual)<Number(expected))return'success';
            if(op==='<='&&Number(actual)<=Number(expected))return'success';
            if(op==='truthy'&&actual)return'success';
            if(op==='falsy'&&!actual)return'success';
            return'failure';
        }
        _tickAction(node,context){
            const handler=this.actions.get(String(node.action||node.name||''));
            if(!handler)return'failure';
            const state=this._state(node);
            if(state.promise){
                if(!state.settled)return'running';
                const result=state.result;
                state.promise=null;
                state.settled=false;
                state.result=null;
                return this._normalizeStatus(result);
            }
            try{
                const result=handler(context,node,state);
                if(result&&typeof result.then==='function'){
                    state.promise=result;
                    state.settled=false;
                    result.then(value=>{state.result=value;state.settled=true;}).catch(error=>{console.error(`[SMBehaviorTree] Async action "${node.action||node.name}" failed.`,error);state.result='failure';state.settled=true;});
                    return'running';
                }
                return this._normalizeStatus(result);
            }catch(error){
                console.error(`[SMBehaviorTree] Action "${node.action||node.name}" failed.`,error);
                return'failure';
            }
        }
        _registerBuiltins(){
            this.registerCondition('HasTarget',context=>Boolean(context.blackboard?.get?.('target')));
            this.registerCondition('HasDestination',context=>Boolean(context.controller?.navigation?.hasDestination?.()));
            this.registerAction('Idle',()=> 'success');
            this.registerAction('ClearTarget',context=>{context.blackboard?.delete?.('target');return'success';});
            this.registerAction('StopNavigation',context=>{context.controller?.navigation?.stop?.();return'success';});
            this.registerAction('MoveToBlackboard',context=>{
                const destination=context.blackboard?.get?.('destination')||context.blackboard?.get?.('targetPosition');
                if(!destination)return'failure';
                context.controller?.navigation?.setDestination?.(destination);
                return context.controller?.navigation?.hasArrived?.()?'success':'running';
            });
        }
        _state(node){
            if(!this.nodeState.has(node.id))this.nodeState.set(node.id,{});
            return this.nodeState.get(node.id);
        }
        _resetNode(node){
            if(!node)return;
            this.nodeState.delete(node.id);
            for(const child of node.children||[])this._resetNode(child);
        }
        _resetChildren(node,exceptIndex=-1){
            for(let i=0;i<(node.children||[]).length;i++)if(i!==exceptIndex)this._resetNode(node.children[i]);
        }
        _normalizeNode(node,index=0){
            if(!node||typeof node!=='object')return null;
            const normalized={...node,id:String(node.id||`bt-node-${Math.random().toString(36).slice(2,9)}-${index}`),type:String(node.type||'action').toLowerCase(),enabled:node.enabled!==false,children:[]};
            normalized.children=(node.children||[]).map((child,i)=>this._normalizeNode(child,i)).filter(Boolean);
            if(node.child&&!normalized.children.length){
                const child=this._normalizeNode(node.child,0);
                if(child)normalized.children.push(child);
            }
            return normalized;
        }
        _normalizeStatus(result){
            if(result===true)return'success';
            if(result===false||result===null||result===undefined)return'failure';
            const value=String(result).toLowerCase();
            return['success','failure','running'].includes(value)?value:'failure';
        }
        serialize(){
            return{name:this.name,enabled:this.enabled,root:this._clone(this.root)};
        }
        _clone(value){
            try{return structuredClone(value);}catch{}
            return JSON.parse(JSON.stringify(value));
        }
        debug(){
            const state={name:this.name,enabled:this.enabled,lastStatus:this.lastStatus,tickCount:this.tickCount,stateNodes:this.nodeState.size,root:this.root};
            console.log('[SMBehaviorTree]',state);
            return state;
        }
    }
    SMBehaviorTree.SUCCESS='success';
    SMBehaviorTree.FAILURE='failure';
    SMBehaviorTree.RUNNING='running';
    window.SMBehaviorTree=SMBehaviorTree;
    window.SMBehaviorTreeClass=SMBehaviorTree;
})();
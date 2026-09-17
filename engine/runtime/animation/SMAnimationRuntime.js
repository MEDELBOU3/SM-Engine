(function(){
    'use strict';
    class SMAnimationRuntime{
        constructor(){
            this.animators=new Set();
            this.active=false;
            this.paused=false;
            this.frame=0;
        }
        start(){
            this.active=true;
            this.paused=false;
            return this;
        }
        stop(){
            for(const animator of this.animators)animator.managedByRuntime=false;
            this.animators.clear();
            this.active=false;
            this.paused=false;
            return this;
        }
        pause(){
            this.paused=true;
            return true;
        }
        resume(){
            this.paused=false;
            return true;
        }
        register(animator){
            if(!animator)return false;
            this.animators.add(animator);
            if(this.active)animator.managedByRuntime=true;
            return animator;
        }
        unregister(animator){
            if(!animator)return false;
            animator.managedByRuntime=false;
            return this.animators.delete(animator);
        }
        update(delta){
            if(!this.active||this.paused)return false;
            this.frame+=1;
            for(const animator of Array.from(this.animators)){
                if(!animator||animator.destroyed){
                    this.unregister(animator);
                    continue;
                }
                animator.managedByRuntime=true;
                try{animator.runtimeUpdate?.(delta);}catch(error){console.error('[SMAnimationRuntime] Animator update failed.',error);}
            }
            return true;
        }
        getByOwner(owner){
            for(const animator of this.animators)if(animator.owner===owner)return animator;
            return null;
        }
        list(){
            return Array.from(this.animators);
        }
        debug(){
            const state={active:this.active,paused:this.paused,frame:this.frame,animators:this.animators.size,owners:Array.from(this.animators).map(animator=>animator.owner?.name||animator.owner?.uuid||null)};
            console.log('[SMAnimationRuntime]',state);
            return state;
        }
    }
    const runtime=new SMAnimationRuntime();
    window.SMAnimationRuntimeClass=SMAnimationRuntime;
    window.SMAnimationRuntime=runtime;
    window.smAnimationRuntime=runtime;
})();
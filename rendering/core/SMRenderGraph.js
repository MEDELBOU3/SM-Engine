(function(global){'use strict';
class SMRenderGraph{
 constructor(){this.passes=new Map();this.executionOrder=[];this.dirty=true;}
 addPass(pass){if(!pass?.name)throw new Error('[SMRenderGraph] Pass requires a name.');if(this.passes.has(pass.name))this.removePass(pass.name,true);this.passes.set(pass.name,pass);this.dirty=true;return pass;}
 removePass(name,dispose=false){const p=this.passes.get(name);if(!p)return false;if(dispose)p.dispose?.();this.passes.delete(name);this.dirty=true;return true;}
 getPass(name){return this.passes.get(name)||null;}
 setPassEnabled(name,enabled){const p=this.getPass(name);if(!p)return false;p.setEnabled?.(enabled);return true;}
 _rebuild(){const all=[...this.passes.values()],byName=new Map(all.map(p=>[p.name,p])),visited=new Set(),visiting=new Set(),result=[];const visit=p=>{if(visited.has(p.name))return;if(visiting.has(p.name))throw new Error(`[SMRenderGraph] Dependency cycle at ${p.name}`);visiting.add(p.name);for(const d of p.dependencies||[]){const dep=byName.get(d);if(dep)visit(dep);}visiting.delete(p.name);visited.add(p.name);result.push(p);};all.sort((a,b)=>(a.order||0)-(b.order||0)).forEach(visit);this.executionOrder=result;this.dirty=false;}
 execute(context){if(this.dirty)this._rebuild();for(const p of this.executionOrder)if(p.enabled)p.execute(context);}
 resize(w,h,context){if(this.dirty)this._rebuild();for(const p of this.executionOrder)p.resize?.(w,h,context);}
 dispose(){for(const p of this.passes.values())p.dispose?.();this.passes.clear();this.executionOrder=[];this.dirty=true;}
}
global.SMRenderGraph=SMRenderGraph;})(window);

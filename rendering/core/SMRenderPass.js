(function(global){'use strict';
class SMRenderPass{
 constructor(name,options={}){this.name=name||this.constructor.name;this.enabled=options.enabled!==false;this.order=Number.isFinite(options.order)?options.order:0;this.dependencies=new Set(options.dependencies||[]);this.tags=new Set(options.tags||[]);this.initialized=false;this.disposed=false;}
 initialize(context){if(this.disposed)throw new Error(`[SMRenderPass] Cannot initialize disposed pass: ${this.name}`);if(this.initialized)return this;this.onInitialize?.(context);this.initialized=true;return this;}
 resize(width,height,context){if(!this.initialized||this.disposed)return;this.onResize?.(Math.max(1,width|0),Math.max(1,height|0),context);}
 execute(context){if(!this.enabled||this.disposed)return false;if(!this.initialized)this.initialize(context);return this.onExecute?.(context)!==false;}
 setEnabled(enabled){this.enabled=!!enabled;return this;}
 dispose(){if(this.disposed)return;try{this.onDispose?.();}finally{this.initialized=false;this.disposed=true;}}
}
global.SMRenderPass=SMRenderPass;})(window);

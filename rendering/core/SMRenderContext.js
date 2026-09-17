(function(global){'use strict';
class SMRenderContext{
 constructor(options={}){this.renderer=options.renderer||null;this.scene=options.scene||null;this.camera=options.camera||null;this.delta=0;this.time=0;this.frame=0;this.width=1;this.height=1;this.pixelRatio=1;this.viewport={x:0,y:0,width:1,height:1};this.scissor=null;this.workspaceMode='FILM';this.renderMode='editor';this.outputTarget=null;this.resources=new Map();this.flags=Object.create(null);this.userData=Object.create(null);}
 beginFrame(options={}){this.camera=options.camera||this.camera;this.delta=Number.isFinite(options.delta)?options.delta:0;this.time=Number.isFinite(options.time)?options.time:performance.now()*.001;this.frame++;const r=this.renderer,c=r?.domElement;this.width=Math.max(1,options.width||c?.clientWidth||c?.width||1);this.height=Math.max(1,options.height||c?.clientHeight||c?.height||1);this.pixelRatio=r?.getPixelRatio?.()||1;const v=options.viewport||{};this.viewport={x:Number(v.x)||0,y:Number(v.y)||0,width:Math.max(1,Number(v.width)||this.width),height:Math.max(1,Number(v.height)||this.height)};this.scissor=options.scissor||null;this.workspaceMode=String(options.workspaceMode||global.workspaceManager?.currentMode||'FILM').toUpperCase();this.renderMode=options.renderMode||'editor';this.outputTarget=options.outputTarget??null;this.flags=Object.create(null);this.userData=Object.create(null);return this;}
 setResource(name,value){this.resources.set(name,value);return value;}
 getResource(name){return this.resources.get(name);}
 clearTransientResources(){this.resources.clear();}
 applyViewport(){const r=this.renderer;if(!r)return;const v=this.viewport;r.setViewport(v.x,v.y,v.width,v.height);if(this.scissor){const s=this.scissor;r.setScissor(s.x,s.y,s.width,s.height);r.setScissorTest(true);}else r.setScissorTest(false);}
 applyOutputTarget(){this.renderer?.setRenderTarget?.(this.outputTarget);}
}
global.SMRenderContext=SMRenderContext;})(window);

(function(global){'use strict';
class SMDepthPrePass extends global.SMRenderPass{
 constructor(o={}){super('DepthPrePass',{order:10,enabled:o.enabled===true});this.depthMaterial=null;}
 onInitialize(){this.depthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,blending:THREE.NoBlending});this.depthMaterial.name='SM_DepthPrePassMaterial';}
 onExecute(c){const{renderer,scene,camera}=c,pool=global.smRenderer?.targets;if(!renderer||!scene||!camera||!pool)return false;const target=pool.acquire('depth',c.viewport.width,c.viewport.height,{depthBuffer:true,stencilBuffer:false});const oldTarget=renderer.getRenderTarget?.()||null,oldOverride=scene.overrideMaterial,oldAuto=renderer.autoClear;scene.overrideMaterial=this.depthMaterial;renderer.setRenderTarget(target);renderer.autoClear=true;renderer.clear(true,true,true);renderer.render(scene,camera);scene.overrideMaterial=oldOverride;renderer.setRenderTarget(oldTarget);renderer.autoClear=oldAuto;c.setResource('depthTarget',target);c.setResource('depthTexture',target.texture);return true;}
 onDispose(){this.depthMaterial?.dispose?.();this.depthMaterial=null;}
}
global.SMDepthPrePass=SMDepthPrePass;})(window);

(function(global){'use strict';
class SMNormalPass extends global.SMRenderPass{
 constructor(o={}){super('NormalPass',{order:20,enabled:o.enabled===true});this.normalMaterial=null;}
 onInitialize(){this.normalMaterial=new THREE.MeshNormalMaterial();this.normalMaterial.name='SM_NormalPassMaterial';}
 onExecute(c){const{renderer,scene,camera}=c,pool=global.smRenderer?.targets;if(!renderer||!scene||!camera||!pool)return false;const target=pool.acquire('normal',c.viewport.width,c.viewport.height,{type:THREE.HalfFloatType??THREE.UnsignedByteType,depthBuffer:true});const oldTarget=renderer.getRenderTarget?.()||null,oldOverride=scene.overrideMaterial;scene.overrideMaterial=this.normalMaterial;renderer.setRenderTarget(target);renderer.clear(true,true,true);renderer.render(scene,camera);scene.overrideMaterial=oldOverride;renderer.setRenderTarget(oldTarget);c.setResource('normalTarget',target);c.setResource('normalTexture',target.texture);return true;}
 onDispose(){this.normalMaterial?.dispose?.();this.normalMaterial=null;}
}
global.SMNormalPass=SMNormalPass;})(window);

(function(global){'use strict';
class SMOpaquePass extends global.SMRenderPass{
 constructor(o={}){super('OpaquePass',{order:50,enabled:o.enabled===true});}
 _transparent(m){if(!m)return false;if(Array.isArray(m))return m.every(x=>this._transparent(x));return m.transparent===true&&(m.opacity??1)<1;}
 onExecute(c){const{renderer,scene,camera}=c;if(!renderer||!scene||!camera)return false;const hidden=[];scene.traverse(o=>{if(o?.isMesh&&o.visible!==false&&this._transparent(o.material)){hidden.push(o);o.visible=false;}});renderer.render(scene,camera);for(const o of hidden)o.visible=true;c.flags.opaqueRendered=true;return true;}
}
global.SMOpaquePass=SMOpaquePass;})(window);

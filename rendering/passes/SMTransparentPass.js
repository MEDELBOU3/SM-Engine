(function(global){'use strict';
class SMTransparentPass extends global.SMRenderPass{
 constructor(o={}){super('TransparentPass',{order:60,enabled:o.enabled===true,dependencies:o.dependencies||['OpaquePass']});}
 _transparent(m){if(!m)return false;if(Array.isArray(m))return m.some(x=>this._transparent(x));return m.transparent===true||(m.opacity??1)<1;}
 onExecute(c){const{renderer,scene,camera}=c;if(!renderer||!scene||!camera)return false;const hidden=[];scene.traverse(o=>{if(o?.isMesh&&o.visible!==false&&!this._transparent(o.material)){hidden.push(o);o.visible=false;}});const old=renderer.autoClear;renderer.autoClear=false;renderer.render(scene,camera);renderer.autoClear=old;for(const o of hidden)o.visible=true;c.flags.transparentRendered=true;return true;}
}
global.SMTransparentPass=SMTransparentPass;})(window);

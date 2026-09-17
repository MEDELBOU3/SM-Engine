(function(global){'use strict';
class SMFinalCompositePass extends global.SMRenderPass{
 constructor(o={}){super('FinalCompositePass',{order:1000,enabled:o.enabled!==false});}
 onExecute(c){c.renderer?.setRenderTarget?.(c.outputTarget??null);c.flags.presented=c.flags.sceneRendered===true;return true;}
}
global.SMFinalCompositePass=SMFinalCompositePass;})(window);

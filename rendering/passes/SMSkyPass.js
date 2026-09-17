(function(global){'use strict';
class SMSkyPass extends global.SMRenderPass{
 constructor(o={}){super('SkyPass',{order:30,enabled:o.enabled===true});}
 onExecute(c){global.skyLightingSystem?.update?.(c.delta,global.playerSystem?.model?.position||global.playerSystem?.character?.model?.position||null);c.flags.skyPrepared=true;return true;}
}
global.SMSkyPass=SMSkyPass;})(window);

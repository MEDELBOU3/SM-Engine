(function(global){'use strict';
class SMRenderTargetPool{
 constructor(renderer){this.renderer=renderer||null;this.targets=new Map();this.frame=0;}
 _key(name,w,h,o={}){return [name,w,h,o.type??THREE.UnsignedByteType,o.format??THREE.RGBAFormat,o.depthBuffer!==false?1:0,o.stencilBuffer===true?1:0,o.samples||0].join(':');}
 acquire(name,w,h,o={}){w=Math.max(1,w|0);h=Math.max(1,h|0);const key=this._key(name,w,h,o);let e=this.targets.get(key);if(!e){const t=new THREE.WebGLRenderTarget(w,h,{minFilter:o.minFilter??THREE.LinearFilter,magFilter:o.magFilter??THREE.LinearFilter,format:o.format??THREE.RGBAFormat,type:o.type??THREE.UnsignedByteType,depthBuffer:o.depthBuffer!==false,stencilBuffer:o.stencilBuffer===true,generateMipmaps:o.generateMipmaps===true});if('samples'in t&&Number.isFinite(o.samples))t.samples=Math.max(0,o.samples|0);t.texture.name=`SMRT_${name}`;e={target:t,inUse:false,lastUsedFrame:this.frame};this.targets.set(key,e);}e.inUse=true;e.lastUsedFrame=this.frame;return e.target;}
 release(target){for(const e of this.targets.values())if(e.target===target){e.inUse=false;return true;}return false;}
 beginFrame(){this.frame++;for(const e of this.targets.values())e.inUse=false;}
 trim(maxIdleFrames=180){for(const [k,e]of this.targets)if(!e.inUse&&(this.frame-e.lastUsedFrame)>maxIdleFrames){e.target.dispose();this.targets.delete(k);}}
 dispose(){for(const e of this.targets.values())e.target.dispose();this.targets.clear();}
}
global.SMRenderTargetPool=SMRenderTargetPool;})(window);

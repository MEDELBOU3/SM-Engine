(function(global){'use strict';
class SMMaterialCompiler{
 constructor(renderer=global.renderer){this.renderer=renderer||null;this.lastCompileMs=0;}
 compileScene(scene=global.scene,camera=global.camera){if(!this.renderer||!scene||!camera)return false;const t=performance.now();try{this.renderer.compile?.(scene,camera);}catch(e){console.warn('[SMMaterialCompiler] Compile warning:',e);return false;}this.lastCompileMs=performance.now()-t;return true;}
 async compileSceneAsync(scene=global.scene,camera=global.camera){if(!this.renderer||!scene||!camera)return false;const t=performance.now();try{if(typeof this.renderer.compileAsync==='function')await this.renderer.compileAsync(scene,camera);else this.renderer.compile?.(scene,camera);}catch(e){console.warn('[SMMaterialCompiler] Async compile warning:',e);return false;}this.lastCompileMs=performance.now()-t;return true;}
}
global.SMMaterialCompiler=SMMaterialCompiler;})(window);

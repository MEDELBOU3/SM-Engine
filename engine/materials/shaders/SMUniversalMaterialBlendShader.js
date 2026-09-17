// engine/materials/shaders/SMUniversalMaterialBlendShader.js
(function(global){
"use strict";
if(global.SMUniversalMaterialBlendShader)return;
global.SMUniversalMaterialBlendShader={
version:1,
maxLayers:4,
normalizeWeightsGLSL:`vec4 smNormalizeWeights(vec4 weights){
float total=dot(weights,vec4(1.0));
return total>0.0001?weights/total:vec4(1.0,0.0,0.0,0.0);
}`,
heightBlendGLSL:`vec4 smHeightBlend4(vec4 weights,vec4 heights,float contrast){
vec4 shaped=max(vec4(0.0),weights+(heights-max(max(heights.x,heights.y),max(heights.z,heights.w)))*max(0.0,contrast));
float total=dot(shaped,vec4(1.0));
return total>0.0001?shaped/total:weights;
}`,
triplanarWeightsGLSL:`vec3 smTriplanarWeights(vec3 worldNormal,float sharpness){
vec3 weights=pow(abs(normalize(worldNormal)),vec3(max(1.0,sharpness)));
return weights/max(0.0001,weights.x+weights.y+weights.z);
}`,
blendNormalGLSL:`vec3 smBlendNormals4(vec3 n0,vec3 n1,vec3 n2,vec3 n3,vec4 w){
return normalize(n0*w.x+n1*w.y+n2*w.z+n3*w.w);
}`
};
console.log("[SMUniversalMaterialBlendShader] Shared shader chunks ready.");
})(window);
const LumenVoxelTraceFragmentShader = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;
out vec4 outColor;
uniform sampler3D tVoxelScene;
uniform vec3 voxelOrigin;
uniform float voxelWorldSize;
uniform vec3 rayOrigin;
uniform vec3 rayDirection;
uniform float maxDistance;
uniform int maxSteps;
vec3 worldToUVW(vec3 worldPos) {
vec3 minCorner = voxelOrigin - vec3(voxelWorldSize * 0.5);
return (worldPos - minCorner) / voxelWorldSize;
}
bool insideVolume(vec3 uvw) {
return all(greaterThanEqual(uvw, vec3(0.0))) && all(lessThanEqual(uvw, vec3(1.0)));
}
void main() {
vec3 direction = normalize(rayDirection);
float stepLength = maxDistance / float(max(maxSteps, 1));
vec3 position = rayOrigin;
vec3 accumulated = vec3(0.0);
float hit = 0.0;
for (int i = 0; i < 128; i++) {
if (i >= maxSteps) break;
position += direction * stepLength;
vec3 uvw = worldToUVW(position);
if (!insideVolume(uvw)) break;
vec4 voxel = texture(tVoxelScene, uvw);
if (voxel.a > 0.1) {
accumulated = voxel.rgb;
hit = 1.0;
break;
}
}
outColor = vec4(accumulated, hit);
}
`;
window.LumenVoxelTraceFragmentShader = LumenVoxelTraceFragmentShader;
const LumenProbeTraceFragmentShader = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tScreenGI;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform sampler2D tProbeAtlas;
uniform mat4 projectionMatrixInverse;
uniform mat4 viewMatrixInverse;
uniform vec3 probeOrigin;
uniform vec3 probeDimensions;
uniform float probeSpacing;
uniform float fallbackStrength;
vec3 reconstructViewPosition(vec2 uv, float depth) {
vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
vec4 view = projectionMatrixInverse * clip;
return view.xyz / max(view.w, 0.00001);
}
vec3 reconstructWorldPosition(vec2 uv, float depth) {
return (viewMatrixInverse * vec4(reconstructViewPosition(uv, depth), 1.0)).xyz;
}
vec4 sampleProbeCell(vec3 cell) {
vec3 clampedCell = clamp(cell, vec3(0.0), probeDimensions - vec3(1.0));
float row = clampedCell.z * probeDimensions.y + clampedCell.y;
vec2 atlasSize = vec2(probeDimensions.x, probeDimensions.y * probeDimensions.z);
vec2 uv = (vec2(clampedCell.x, row) + 0.5) / atlasSize;
return texture2D(tProbeAtlas, uv);
}
vec3 sampleProbeGrid(vec3 worldPos) {
vec3 halfGrid = (probeDimensions - vec3(1.0)) * 0.5;
vec3 gridPos = (worldPos - probeOrigin) / max(probeSpacing, 0.0001) + halfGrid;
vec3 base = floor(gridPos);
vec3 f = fract(gridPos);
vec4 c000 = sampleProbeCell(base + vec3(0.0, 0.0, 0.0));
vec4 c100 = sampleProbeCell(base + vec3(1.0, 0.0, 0.0));
vec4 c010 = sampleProbeCell(base + vec3(0.0, 1.0, 0.0));
vec4 c110 = sampleProbeCell(base + vec3(1.0, 1.0, 0.0));
vec4 c001 = sampleProbeCell(base + vec3(0.0, 0.0, 1.0));
vec4 c101 = sampleProbeCell(base + vec3(1.0, 0.0, 1.0));
vec4 c011 = sampleProbeCell(base + vec3(0.0, 1.0, 1.0));
vec4 c111 = sampleProbeCell(base + vec3(1.0, 1.0, 1.0));
vec4 c00 = mix(c000, c100, f.x);
vec4 c10 = mix(c010, c110, f.x);
vec4 c01 = mix(c001, c101, f.x);
vec4 c11 = mix(c011, c111, f.x);
vec4 c0 = mix(c00, c10, f.y);
vec4 c1 = mix(c01, c11, f.y);
vec4 result = mix(c0, c1, f.z);
return result.rgb * result.a;
}
void main() {
float depth = texture2D(tDepth, vUv).r;
vec3 screenGI = texture2D(tScreenGI, vUv).rgb;
if (depth >= 0.99999) {
gl_FragColor = vec4(screenGI, 1.0);
return;
}
vec3 worldPos = reconstructWorldPosition(vUv, depth);
vec3 probeGI = sampleProbeGrid(worldPos);
float screenEnergy = dot(screenGI, vec3(0.2126, 0.7152, 0.0722));
float fallbackWeight = 1.0 - smoothstep(0.005, 0.08, screenEnergy);
vec3 result = screenGI + probeGI * fallbackWeight * fallbackStrength;
gl_FragColor = vec4(result, 1.0);
}
`;
window.LumenProbeTraceFragmentShader = LumenProbeTraceFragmentShader;
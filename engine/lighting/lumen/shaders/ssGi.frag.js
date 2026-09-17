const LumenSSGIFragmentShader = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSceneColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform mat4 projectionMatrixInverse;
uniform mat4 viewMatrixInverse;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec2 resolution;
uniform float cameraNear;
uniform float cameraFar;
uniform float giIntensity;
uniform float maxDistance;
uniform float thickness;
uniform float frameIndex;
uniform int rayCount;
uniform int maxSteps;
float hash12(vec2 p) {
vec3 p3 = fract(vec3(p.xyx) * 0.1031);
p3 += dot(p3, p3.yzx + 33.33);
return fract((p3.x + p3.y) * p3.z);
}
float linearizeDepth(float depth) {
float z = depth * 2.0 - 1.0;
return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
}
vec3 reconstructViewPosition(vec2 uv, float depth) {
vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
vec4 view = projectionMatrixInverse * clip;
return view.xyz / max(view.w, 0.00001);
}
vec3 reconstructWorldPosition(vec2 uv, float depth) {
vec4 view = vec4(reconstructViewPosition(uv, depth), 1.0);
return (viewMatrixInverse * view).xyz;
}
vec3 decodeNormal(vec3 encodedNormal) {
return normalize(encodedNormal * 2.0 - 1.0);
}
vec3 buildTangent(vec3 n) {
vec3 up = abs(n.y) < 0.999 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
return normalize(cross(up, n));
}
vec3 cosineHemisphere(vec2 xi, vec3 n) {
float phi = 6.28318530718 * xi.x;
float cosTheta = sqrt(1.0 - xi.y);
float sinTheta = sqrt(xi.y);
vec3 t = buildTangent(n);
vec3 b = cross(n, t);
return normalize(t * cos(phi) * sinTheta + b * sin(phi) * sinTheta + n * cosTheta);
}
bool projectWorldToUV(vec3 worldPos, out vec2 uv, out float ndcDepth) {
vec4 clip = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
if (clip.w <= 0.0) return false;
vec3 ndc = clip.xyz / clip.w;
uv = ndc.xy * 0.5 + 0.5;
ndcDepth = ndc.z * 0.5 + 0.5;
if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) return false;
return true;
}
bool traceScreenSpace(vec3 origin, vec3 direction, out vec2 hitUv) {
float stepLength = maxDistance / float(max(maxSteps, 1));
vec3 rayPos = origin + direction * max(thickness * 2.0, 0.02);
for (int i = 0; i < 96; i++) {
if (i >= maxSteps) break;
rayPos += direction * stepLength;
vec2 uv;
float rayDepth;
if (!projectWorldToUV(rayPos, uv, rayDepth)) return false;
float sceneDepth = texture2D(tDepth, uv).r;
if (sceneDepth >= 0.99999) continue;
vec3 sceneWorld = reconstructWorldPosition(uv, sceneDepth);
vec4 sceneView4 = viewMatrix * vec4(sceneWorld, 1.0);
vec4 rayView4 = viewMatrix * vec4(rayPos, 1.0);
float sceneViewDepth = -sceneView4.z;
float rayViewDepth = -rayView4.z;
float deltaDepth = rayViewDepth - sceneViewDepth;
if (deltaDepth >= 0.0 && deltaDepth <= thickness) {
hitUv = uv;
return true;
}
}
return false;
}
void main() {
float depth = texture2D(tDepth, vUv).r;
if (depth >= 0.99999) {
gl_FragColor = vec4(0.0);
return;
}
vec3 origin = reconstructWorldPosition(vUv, depth);
vec3 viewNormal = decodeNormal(texture2D(tNormal, vUv).rgb);
vec3 normal = normalize(mat3(viewMatrixInverse) * viewNormal);
vec3 indirect = vec3(0.0);
float validHits = 0.0;
for (int r = 0; r < 16; r++) {
if (r >= rayCount) break;
float seedA = hash12(gl_FragCoord.xy + vec2(float(r) * 17.13, frameIndex * 1.37));
float seedB = hash12(gl_FragCoord.yx + vec2(float(r) * 9.71, frameIndex * 2.11));
vec3 direction = cosineHemisphere(vec2(seedA, seedB), normal);
vec2 hitUv;
if (traceScreenSpace(origin, direction, hitUv)) {
vec3 bounced = texture2D(tSceneColor, hitUv).rgb;
vec3 hitViewNormal = decodeNormal(texture2D(tNormal, hitUv).rgb);
vec3 hitNormal = normalize(mat3(viewMatrixInverse) * hitViewNormal);
float geometryWeight = max(dot(hitNormal, -direction), 0.0);
float sourceWeight = max(dot(normal, direction), 0.0);
indirect += bounced * sourceWeight * mix(0.35, 1.0, geometryWeight);
validHits += 1.0;
}
}
if (validHits > 0.0) indirect /= validHits;
indirect *= giIntensity;
gl_FragColor = vec4(indirect, 1.0);
}
`;
window.LumenSSGIFragmentShader = LumenSSGIFragmentShader;
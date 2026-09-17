precision highp float;

uniform float uTime;
uniform float uPixelRatio;
uniform float uPointScale;
uniform float uGlobalSize;
uniform float uTurbulence;

attribute float aSize;
attribute float aLife;
attribute float aSeed;

varying float vLife;
varying float vSeed;
varying float vViewDepth;

void main() {
    vLife = clamp(aLife, 0.0, 1.0);
    vSeed = aSeed;

    vec3 p = position;

    float phase = aSeed * 6.28318530718;
    float wobble = sin(uTime * 0.8 + phase + p.y * 0.12)
                 * uTurbulence;

    p.x += wobble;
    p.z += cos(uTime * 0.65 + phase + p.x * 0.09)
         * uTurbulence * 0.65;

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);

    vViewDepth = -mvPosition.z;

    gl_Position = projectionMatrix * mvPosition;

    float perspectiveScale = uPointScale / max(1.0, -mvPosition.z);

    float growth = mix(0.55, 1.55, vLife);

    gl_PointSize = max(
        1.0,
        aSize * growth * uGlobalSize * uPixelRatio * perspectiveScale
    );
}

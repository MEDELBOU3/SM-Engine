precision highp float;

uniform float uTime;
uniform float uPixelRatio;
uniform float uPointScale;
uniform float uGlobalSize;

attribute float aSize;
attribute float aLife;
attribute float aSeed;

varying float vLife;
varying float vSeed;

void main() {
    vLife = clamp(aLife, 0.0, 1.0);
    vSeed = aSeed;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float perspectiveScale = uPointScale / max(1.0, -mvPosition.z);
    gl_PointSize = max(
        1.0,
        aSize * uGlobalSize * uPixelRatio * perspectiveScale
    );
}

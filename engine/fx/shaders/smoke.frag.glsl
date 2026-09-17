precision highp float;

uniform sampler2D uMap;
uniform vec3 uColor;
uniform vec3 uHotColor;
uniform float uOpacity;
uniform float uDensity;
uniform float uEdgeSoftness;
uniform int uUseTexture;

varying float vLife;
varying float vSeed;
varying float vViewDepth;

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

void main() {
    vec2 uv = gl_PointCoord;
    vec2 centered = uv * 2.0 - 1.0;
    float radius = length(centered);

    if (radius > 1.0) discard;

    float radial = 1.0 - smoothstep(
        max(0.0, 1.0 - uEdgeSoftness),
        1.0,
        radius
    );

    vec4 texel = vec4(1.0);

    if (uUseTexture == 1) {
        texel = texture2D(uMap, uv);
    }

    float grain = mix(
        0.88,
        1.0,
        hash21(uv * 47.0 + vSeed)
    );

    float fadeIn = smoothstep(0.0, 0.12, vLife);
    float fadeOut = 1.0 - smoothstep(0.62, 1.0, vLife);

    float alpha = radial
                * texel.a
                * grain
                * fadeIn
                * fadeOut
                * uOpacity
                * uDensity;

    if (alpha <= 0.002) discard;

    float hotAmount = (1.0 - vLife)
                    * (1.0 - smoothstep(0.0, 0.72, radius))
                    * 0.3;

    vec3 color = mix(uColor, uHotColor, hotAmount);
    color *= texel.rgb;

    gl_FragColor = vec4(color, alpha);
}

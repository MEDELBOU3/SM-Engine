precision highp float;

uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uSoftness;
uniform int uUseTexture;

varying float vLife;
varying float vSeed;

void main() {
    vec2 uv = gl_PointCoord;

    vec4 texel = vec4(1.0);

    if (uUseTexture == 1) {
        texel = texture2D(uMap, uv);
    } else {
        vec2 centered = uv * 2.0 - 1.0;
        float d = length(centered);
        float alpha = 1.0 - smoothstep(
            max(0.0, 1.0 - uSoftness),
            1.0,
            d
        );
        texel = vec4(1.0, 1.0, 1.0, alpha);
    }

    float lifeFade = smoothstep(0.0, 0.08, vLife)
                   * (1.0 - smoothstep(0.78, 1.0, vLife));

    float alpha = texel.a * uOpacity * lifeFade;

    if (alpha <= 0.002) discard;

    gl_FragColor = vec4(texel.rgb * uColor, alpha);
}

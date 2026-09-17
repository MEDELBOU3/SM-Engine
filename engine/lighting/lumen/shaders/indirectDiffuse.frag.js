const LumenIndirectDiffuseFragmentShader = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tSceneColor;
    uniform sampler2D tGI;
    uniform float giIntensity;
    uniform float indirectMix;
    void main() {
        vec3 sceneColor = texture2D(tSceneColor, vUv).rgb;
        vec3 gi = texture2D(tGI, vUv).rgb * giIntensity;
        vec3 color = sceneColor + gi * indirectMix;
        gl_FragColor = vec4(color, 1.0);
    }
`;
window.LumenIndirectDiffuseFragmentShader = LumenIndirectDiffuseFragmentShader;
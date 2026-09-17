/**
 * VideoFusionShaderLibrary.js
 * SM Engine — WebGL2 shader library for the Fusion compositor.
 */
(function (global) {
    'use strict';

    class VideoFusionShaderLibrary {
        constructor() {
            this.vertex = `#version 300 es
  precision highp float;
  layout(location=0) in vec2 aPosition;
  layout(location=1) in vec2 aUV;
  out vec2 vUV;
  void main(){
   vUV=aUV;
   gl_Position=vec4(aPosition,0.0,1.0);
  }`;

            this.fragments = new Map();
            this._registerBuiltins();
        }

        get(name) {
            return this.fragments.get(name) || null;
        }

        has(name) {
            return this.fragments.has(name);
        }

        register(name, source) {
            if (!name || !source) return false;
            this.fragments.set(name, source);
            return true;
        }

        _registerBuiltins() {
            this.register('copy', `#version 300 es
  precision highp float;
  uniform sampler2D uImage;
  in vec2 vUV;
  out vec4 outColor;
  void main(){
   outColor=texture(uImage,vUV);
  }`);

            this.register('transform', `#version 300 es
  precision highp float;
  uniform sampler2D uImage;
  uniform vec2 uCenter;
  uniform vec2 uOffset;
  uniform vec2 uScale;
  uniform float uAngle;
  in vec2 vUV;
  out vec4 outColor;
  void main(){
   vec2 p=vUV-uCenter-uOffset;
   float c=cos(-uAngle);
   float s=sin(-uAngle);
   p=mat2(c,-s,s,c)*p;
   p/=max(abs(uScale),vec2(0.00001))*sign(uScale);
   vec2 uv=p+uCenter;
   if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0)))){
    outColor=vec4(0.0);
    return;
   }
   outColor=texture(uImage,uv);
  }`);

            this.register('crop', `#version 300 es
  precision highp float;
  uniform sampler2D uImage;
  uniform vec4 uCrop;
  uniform float uFeather;
  in vec2 vUV;
  out vec4 outColor;
  void main(){
   vec4 c=texture(uImage,vUV);
   float left=uCrop.x;
   float right=1.0-uCrop.y;
   float top=uCrop.z;
   float bottom=1.0-uCrop.w;
   float a=step(left,vUV.x)*step(vUV.x,right)*step(top,vUV.y)*step(vUV.y,bottom);
   if(uFeather>0.00001){
    float fx=smoothstep(left,left+uFeather,vUV.x)*
             (1.0-smoothstep(right-uFeather,right,vUV.x));
    float fy=smoothstep(top,top+uFeather,vUV.y)*
             (1.0-smoothstep(bottom-uFeather,bottom,vUV.y));
    a*=fx*fy;
   }
   outColor=vec4(c.rgb,c.a*a);
  }`);

            this.register('brightnessContrast', `#version 300 es
  precision highp float;
  uniform sampler2D uImage;
  uniform float uBrightness;
  uniform float uContrast;
  in vec2 vUV;
  out vec4 outColor;
  void main(){
   vec4 c=texture(uImage,vUV);
   vec3 rgb=(c.rgb-0.5)*uContrast+0.5+uBrightness;
   outColor=vec4(clamp(rgb,0.0,1.0),c.a);
  }`);

            this.register('colorCorrect', `#version 300 es
  precision highp float;
  uniform sampler2D uImage;
  uniform float uLift;
  uniform float uGamma;
  uniform float uGain;
  uniform float uSaturation;
  uniform float uHue;
  in vec2 vUV;
  out vec4 outColor;

  vec3 rgb2hsv(vec3 c){
   vec4 K=vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);
   vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));
   vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));
   float d=q.x-min(q.w,q.y);
   float e=1.0e-10;
   return vec3(abs(q.z+(q.w-q.y)/(6.0*d+e)),d/(q.x+e),q.x);
  }

  vec3 hsv2rgb(vec3 c){
   vec3 p=abs(fract(c.xxx+vec3(0.0,2.0/3.0,1.0/3.0))*6.0-3.0);
   return c.z*mix(vec3(1.0),clamp(p-1.0,0.0,1.0),c.y);
  }

  void main(){
   vec4 c=texture(uImage,vUV);
   vec3 rgb=max(c.rgb+vec3(uLift),vec3(0.0));
   rgb=pow(rgb,vec3(1.0/max(uGamma,0.001)));
   rgb*=uGain;
   float l=dot(rgb,vec3(0.2126,0.7152,0.0722));
   rgb=mix(vec3(l),rgb,uSaturation);
   vec3 hsv=rgb2hsv(max(rgb,vec3(0.0)));
   hsv.x=fract(hsv.x+uHue/360.0);
   rgb=hsv2rgb(hsv);
   outColor=vec4(clamp(rgb,0.0,1.0),c.a);
  }`);

            this.register('hueSaturation', `#version 300 es
  precision highp float;
  uniform sampler2D uImage;
  uniform float uHue;
  uniform float uSaturation;
  in vec2 vUV;
  out vec4 outColor;

  vec3 rgb2hsv(vec3 c){
   vec4 K=vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);
   vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));
   vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));
   float d=q.x-min(q.w,q.y);
   float e=1.0e-10;
   return vec3(abs(q.z+(q.w-q.y)/(6.0*d+e)),d/(q.x+e),q.x);
  }

  vec3 hsv2rgb(vec3 c){
   vec3 p=abs(fract(c.xxx+vec3(0.0,2.0/3.0,1.0/3.0))*6.0-3.0);
   return c.z*mix(vec3(1.0),clamp(p-1.0,0.0,1.0),c.y);
  }

  void main(){
   vec4 c=texture(uImage,vUV);
   vec3 hsv=rgb2hsv(c.rgb);
   hsv.x=fract(hsv.x+uHue/360.0);
   hsv.y=clamp(hsv.y*uSaturation,0.0,1.0);
   outColor=vec4(hsv2rgb(hsv),c.a);
  }`);

            this.register('tint', `#version 300 es
  precision highp float;
  uniform sampler2D uImage;
  uniform vec3 uTint;
  uniform float uAmount;
  in vec2 vUV;
  out vec4 outColor;
  void main(){
   vec4 c=texture(uImage,vUV);
   vec3 lum=vec3(dot(c.rgb,vec3(0.2126,0.7152,0.0722)));
   vec3 tinted=lum*uTint*1.75;
   outColor=vec4(mix(c.rgb,tinted,uAmount),c.a);
  }`);

            this.register('invert', `#version 300 es
  precision highp float;
  uniform sampler2D uImage;
  uniform float uAmount;
  in vec2 vUV;
  out vec4 outColor;
  void main(){
   vec4 c=texture(uImage,vUV);
   outColor=vec4(mix(c.rgb,vec3(1.0)-c.rgb,uAmount),c.a);
  }`);

            this.register('blur', `#version 300 es
  precision highp float;
  uniform sampler2D uImage;
  uniform vec2 uTexel;
  uniform vec2 uDirection;
  uniform float uRadius;
  in vec2 vUV;
  out vec4 outColor;
  void main(){
   vec2 stepv=uTexel*uDirection*max(uRadius,0.0);
   vec4 c=texture(uImage,vUV)*0.227027;
   c+=texture(uImage,vUV+stepv*1.384615)*0.316216;
   c+=texture(uImage,vUV-stepv*1.384615)*0.316216;
   c+=texture(uImage,vUV+stepv*3.230769)*0.070270;
   c+=texture(uImage,vUV-stepv*3.230769)*0.070270;
   outColor=c;
  }`);

            this.register('mix', `#version 300 es
  precision highp float;
  uniform sampler2D uA;
  uniform sampler2D uB;
  uniform float uMix;
  in vec2 vUV;
  out vec4 outColor;
  void main(){
   outColor=mix(texture(uA,vUV),texture(uB,vUV),uMix);
  }`);

            this.register('sharpen', `#version 300 es
  precision highp float;
  uniform sampler2D uImage;
  uniform vec2 uTexel;
  uniform float uAmount;
  in vec2 vUV;
  out vec4 outColor;
  void main(){
   vec4 c=texture(uImage,vUV);
   vec3 n=texture(uImage,vUV+vec2(0.0,-uTexel.y)).rgb;
   vec3 s=texture(uImage,vUV+vec2(0.0, uTexel.y)).rgb;
   vec3 e=texture(uImage,vUV+vec2( uTexel.x,0.0)).rgb;
   vec3 w=texture(uImage,vUV+vec2(-uTexel.x,0.0)).rgb;
   vec3 rgb=c.rgb*(1.0+4.0*uAmount)-(n+s+e+w)*uAmount;
   outColor=vec4(clamp(rgb,0.0,1.0),c.a);
  }`);

            this.register('glow', `#version 300 es
  precision highp float;
  uniform sampler2D uOriginal;
  uniform sampler2D uBlur;
  uniform float uGain;
  uniform float uMix;
  in vec2 vUV;
  out vec4 outColor;
  void main(){
   vec4 a=texture(uOriginal,vUV);
   vec4 b=texture(uBlur,vUV);
   vec3 glow=1.0-(1.0-a.rgb)*(1.0-clamp(b.rgb*uGain,0.0,1.0));
   outColor=vec4(mix(a.rgb,glow,uMix),max(a.a,b.a*uMix));
  }`);

            this.register('chromaKey', `#version 300 es
  precision highp float;
  uniform sampler2D uImage;
  uniform vec3 uKeyColor;
  uniform float uThreshold;
  uniform float uSoftness;
  uniform float uSpill;
  in vec2 vUV;
  out vec4 outColor;
  void main(){
   vec4 c=texture(uImage,vUV);
   float d=distance(c.rgb,uKeyColor)/1.7320508;
   float alpha=smoothstep(uThreshold,uThreshold+max(uSoftness,0.0001),d);
   vec3 rgb=c.rgb;
   float dominant=max(max(uKeyColor.r,uKeyColor.g),uKeyColor.b);
   if(uKeyColor.g>=dominant-0.0001){
    float excess=max(0.0,rgb.g-max(rgb.r,rgb.b));
    rgb.g-=excess*uSpill*(1.0-alpha);
   }else if(uKeyColor.b>=dominant-0.0001){
    float excess=max(0.0,rgb.b-max(rgb.r,rgb.g));
    rgb.b-=excess*uSpill*(1.0-alpha);
   }else{
    float excess=max(0.0,rgb.r-max(rgb.g,rgb.b));
    rgb.r-=excess*uSpill*(1.0-alpha);
   }
   outColor=vec4(clamp(rgb,0.0,1.0),c.a*alpha);
  }`);

            this.register('maskRectangle', `#version 300 es
  precision highp float;
  uniform vec2 uCenter;
  uniform vec2 uSize;
  uniform float uSoftness;
  uniform float uInvert;
  in vec2 vUV;
  out vec4 outColor;
  void main(){
   vec2 d=abs(vUV-uCenter)-uSize*0.5;
   float outside=max(d.x,d.y);
   float feather=max(uSoftness,0.00001);
   float a=1.0-smoothstep(-feather,feather,outside);
   if(uInvert>0.5)a=1.0-a;
   outColor=vec4(vec3(1.0),a);
  }`);

            this.register('maskEllipse', `#version 300 es
  precision highp float;
  uniform vec2 uCenter;
  uniform vec2 uSize;
  uniform float uSoftness;
  uniform float uInvert;
  in vec2 vUV;
  out vec4 outColor;
  void main(){
   vec2 halfSize=max(uSize*0.5,vec2(0.0001));
   float d=length((vUV-uCenter)/halfSize);
   float feather=max(uSoftness,0.00001)*4.0;
   float a=1.0-smoothstep(1.0-feather,1.0+feather,d);
   if(uInvert>0.5)a=1.0-a;
   outColor=vec4(vec3(1.0),a);
  }`);

            this.register('merge', `#version 300 es
  precision highp float;
  uniform sampler2D uBackground;
  uniform sampler2D uForeground;
  uniform sampler2D uMask;
  uniform float uHasMask;
  uniform float uBlend;
  uniform int uMode;
  in vec2 vUV;
  out vec4 outColor;

  vec3 blendMode(vec3 b,vec3 f,int mode){
   if(mode==1)return min(vec3(1.0),b+f);
   if(mode==2)return b*f;
   if(mode==3)return 1.0-(1.0-b)*(1.0-f);
   if(mode==4){
    return mix(
     2.0*b*f,
     1.0-2.0*(1.0-b)*(1.0-f),
     step(vec3(0.5),b)
    );
   }
   if(mode==5)return min(b,f);
   if(mode==6)return max(b,f);
   if(mode==7)return abs(b-f);
   return f;
  }

  void main(){
   vec4 bg=texture(uBackground,vUV);
   vec4 fg=texture(uForeground,vUV);
   float mask=uHasMask>0.5?texture(uMask,vUV).a:1.0;
   float a=clamp(fg.a*uBlend*mask,0.0,1.0);
   vec3 applied=blendMode(bg.rgb,fg.rgb,uMode);
   vec3 rgb=mix(bg.rgb,applied,a);
   float alpha=a+bg.a*(1.0-a);
   outColor=vec4(rgb,alpha);
  }`);

            this.register('background', `#version 300 es
  precision highp float;
  uniform vec3 uColor;
  uniform float uAlpha;
  in vec2 vUV;
  out vec4 outColor;
  void main(){
   outColor=vec4(uColor,uAlpha);
  }`);

            this.register('alphaMultiply', `#version 300 es
  precision highp float;
  uniform sampler2D uImage;
  uniform float uAlpha;
  in vec2 vUV;
  out vec4 outColor;
  void main(){
   vec4 c=texture(uImage,vUV);
   outColor=vec4(c.rgb,c.a*uAlpha);
  }`);
        }
    }

    global.VideoFusionShaderLibrary = VideoFusionShaderLibrary;
    global.videoFusionShaderLibrary =
        global.videoFusionShaderLibrary ||
        new VideoFusionShaderLibrary();

})(window);
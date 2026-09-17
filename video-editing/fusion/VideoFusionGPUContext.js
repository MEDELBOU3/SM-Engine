/**
 * VideoFusionGPUContext.js
 * SM Engine — reusable WebGL2 render context for Fusion.
 */
(function (global) {
  "use strict";

  class VideoFusionGPUContext {
    constructor(shaderLibrary = null) {
      this.shaderLibrary =
        shaderLibrary ||
        global.videoFusionShaderLibrary ||
        new global.VideoFusionShaderLibrary();

      this.canvas = document.createElement("canvas");

      this.canvas.className = "sm-video-fusion-gpu-canvas";

      this.gl = this.canvas.getContext("webgl2", {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
        premultipliedAlpha: true,
        powerPreference: "high-performance",
      });

      this.available = !!this.gl;

      this.programs = new Map();

      this.targets = new Map();

      this.sourceTextures = new Map();

      this.frameId = 0;
      this.maxCachedTargets = 24;

      if (this.gl) {
        this._initGL();
      }
    }

    isAvailable() {
      return !!(this.available && this.gl && !this.gl.isContextLost());
    }

    capabilities() {
      if (!this.isAvailable()) {
        return {
          webgl2: false,
          maxTextureSize: 0,
          maxTextureUnits: 0,
          renderer: "Unavailable",
        };
      }

      const gl = this.gl;

      const debug = gl.getExtension("WEBGL_debug_renderer_info");

      return {
        webgl2: true,

        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),

        maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),

        renderer: debug
          ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),

        vendor: debug
          ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)
          : gl.getParameter(gl.VENDOR),
      };
    }

    beginFrame(width, height) {
      if (!this.isAvailable()) {
        return false;
      }

      this.frameId++;

      this.resizeOutput(width, height);

      return true;
    }

    endFrame() {
      this._pruneTargets();
    }

    resizeOutput(width, height) {
      width = Math.max(1, Math.round(Number(width) || 1));

      height = Math.max(1, Math.round(Number(height) || 1));

      if (this.canvas.width !== width) {
        this.canvas.width = width;
      }

      if (this.canvas.height !== height) {
        this.canvas.height = height;
      }
    }

    uploadSource(key, source, width, height) {
      if (!this.isAvailable() || !source) {
        return null;
      }

      const gl = this.gl;

      let entry = this.sourceTextures.get(key);

      if (!entry) {
        entry = {
          texture: gl.createTexture(),

          width: 0,
          height: 0,
        };

        this.sourceTextures.set(key, entry);
      }

      gl.bindTexture(gl.TEXTURE_2D, entry.texture);

      this._configureTexture();

      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

      const actualWidth = Math.max(
        1,
        Number(
          source.videoWidth ||
            source.naturalWidth ||
            source.width ||
            width ||
            1,
        ),
      );

      const actualHeight = Math.max(
        1,
        Number(
          source.videoHeight ||
            source.naturalHeight ||
            source.height ||
            height ||
            1,
        ),
      );

      try {
        /*
         * Do not reallocate a video texture every frame. Once dimensions are
         * stable, texSubImage2D only uploads the new decoded pixels.
         */
        if (
          entry.actualWidth === actualWidth &&
          entry.actualHeight === actualHeight
        ) {
          gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            0,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            source,
          );
        } else {
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            source,
          );

          entry.actualWidth = actualWidth;

          entry.actualHeight = actualHeight;
        }
      } catch (error) {
        console.warn("[VideoFusionGPU] Source texture upload failed:", error);

        return null;
      }

      entry.width = Number(width || actualWidth);

      entry.height = Number(height || actualHeight);

      return {
        texture: entry.texture,

        width: entry.width,

        height: entry.height,

        kind: "image",
        source: true,
      };
    }

    getTarget(key, width, height) {
      if (!this.isAvailable()) {
        return null;
      }

      const gl = this.gl;

      width = Math.max(1, Math.round(width));

      height = Math.max(1, Math.round(height));

      let target = this.targets.get(key);

      if (!target || target.width !== width || target.height !== height) {
        if (target) {
          this._deleteTarget(target);
        }

        const texture = gl.createTexture();

        gl.bindTexture(gl.TEXTURE_2D, texture);

        this._configureTexture();

        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA8,
          width,
          height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null,
        );

        const framebuffer = gl.createFramebuffer();

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          texture,
          0,
        );

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

        if (status !== gl.FRAMEBUFFER_COMPLETE) {
          gl.deleteFramebuffer(framebuffer);

          gl.deleteTexture(texture);

          throw new Error(`Fusion framebuffer incomplete: ${status}`);
        }

        target = {
          key,
          texture,
          framebuffer,
          width,
          height,
          lastUsed: this.frameId,
        };

        this.targets.set(key, target);
      }

      target.lastUsed = this.frameId;

      return target;
    }

    render({
      shader,
      target = null,
      width = null,
      height = null,
      textures = {},
      uniforms = {},
    } = {}) {
      if (!this.isAvailable()) {
        return false;
      }

      const gl = this.gl;

      const program = this.program(shader);

      if (!program) {
        return false;
      }

      const outputWidth = target?.width || width || this.canvas.width;

      const outputHeight = target?.height || height || this.canvas.height;

      gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer || null);

      gl.viewport(0, 0, outputWidth, outputHeight);

      gl.disable(gl.BLEND);

      gl.clearColor(0, 0, 0, 0);

      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(program.program);

      gl.bindVertexArray(this.vao);

      let unit = 0;

      Object.entries(textures).forEach(([name, value]) => {
        const texture = value?.texture || value;

        if (!texture) {
          return;
        }

        const location = gl.getUniformLocation(program.program, name);

        if (location == null) {
          return;
        }

        gl.activeTexture(gl.TEXTURE0 + unit);

        gl.bindTexture(gl.TEXTURE_2D, texture);

        gl.uniform1i(location, unit);

        unit++;
      });

      Object.entries(uniforms).forEach(([name, value]) => {
        this._setUniform(program.program, name, value);
      });

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.bindVertexArray(null);

      return true;
    }

    present(texture, width, height) {
      if (!texture || !this.isAvailable()) {
        return null;
      }

      this.resizeOutput(width, height);

      this.render({
        shader: "copy",

        target: null,

        width,
        height,

        textures: {
          uImage: texture,
        },
      });

      this.gl.flush();

      return this.canvas;
    }

    program(name) {
      if (this.programs.has(name)) {
        return this.programs.get(name);
      }

      const fragment = this.shaderLibrary.get(name);

      if (!fragment) {
        throw new Error(`Fusion shader not found: ${name}`);
      }

      const program = this._createProgram(this.shaderLibrary.vertex, fragment);

      const entry = {
        program,
        name,
      };

      this.programs.set(name, entry);

      return entry;
    }

    destroy() {
      if (!this.gl) {
        return;
      }

      const gl = this.gl;

      this.targets.forEach((target) => this._deleteTarget(target));

      this.targets.clear();

      this.sourceTextures.forEach((entry) => {
        gl.deleteTexture(entry.texture);
      });

      this.sourceTextures.clear();

      this.programs.forEach((entry) => {
        gl.deleteProgram(entry.program);
      });

      this.programs.clear();

      if (this.vao) {
        gl.deleteVertexArray(this.vao);
      }

      if (this.vertexBuffer) {
        gl.deleteBuffer(this.vertexBuffer);
      }

      this.available = false;
    }

    _initGL() {
      const gl = this.gl;

      this.vertexBuffer = gl.createBuffer();

      this.vao = gl.createVertexArray();

      gl.bindVertexArray(this.vao);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);

      const vertices = new Float32Array([
        -1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1,
      ]);

      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

      gl.enableVertexAttribArray(0);

      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);

      gl.enableVertexAttribArray(1);

      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

      gl.bindVertexArray(null);

      this.canvas.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();

        this.available = false;

        try {
          global.dispatchEvent(
            new CustomEvent("videoFusionGPUStatus", {
              detail: {
                available: false,
                reason: "context-lost",
              },
            }),
          );
        } catch (_) {}
      });

      this.canvas.addEventListener("webglcontextrestored", () => {
        this.available = true;
        this.programs.clear();
        this.targets.clear();
        this.sourceTextures.clear();
        this._initGL();

        try {
          global.dispatchEvent(
            new CustomEvent("videoFusionGPUStatus", {
              detail: {
                available: true,
                reason: "context-restored",
              },
            }),
          );
        } catch (_) {}
      });
    }

    _configureTexture() {
      const gl = this.gl;

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    _createProgram(vertexSource, fragmentSource) {
      const gl = this.gl;

      const vertex = this._compileShader(gl.VERTEX_SHADER, vertexSource);

      const fragment = this._compileShader(gl.FRAGMENT_SHADER, fragmentSource);

      const program = gl.createProgram();

      gl.attachShader(program, vertex);

      gl.attachShader(program, fragment);

      gl.linkProgram(program);

      gl.deleteShader(vertex);

      gl.deleteShader(fragment);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);

        gl.deleteProgram(program);

        throw new Error(`Fusion shader link failed: ${log}`);
      }

      return program;
    }

    _compileShader(type, source) {
      const gl = this.gl;

      const shader = gl.createShader(type);

      gl.shaderSource(shader, source);

      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);

        gl.deleteShader(shader);

        throw new Error(`Fusion shader compile failed: ${log}`);
      }

      return shader;
    }

    _setUniform(program, name, value) {
      const gl = this.gl;

      const location = gl.getUniformLocation(program, name);

      if (location == null) {
        return;
      }

      if (typeof value === "boolean") {
        gl.uniform1f(location, value ? 1 : 0);

        return;
      }

      if (Number.isInteger(value) && name.startsWith("uMode")) {
        gl.uniform1i(location, value);

        return;
      }

      if (typeof value === "number") {
        gl.uniform1f(location, value);

        return;
      }

      if (value instanceof Float32Array || Array.isArray(value)) {
        const array =
          value instanceof Float32Array ? value : new Float32Array(value);

        if (array.length === 2) {
          gl.uniform2fv(location, array);
        } else if (array.length === 3) {
          gl.uniform3fv(location, array);
        } else if (array.length === 4) {
          gl.uniform4fv(location, array);
        }
      }
    }

    _deleteTarget(target) {
      if (!target || !this.gl) {
        return;
      }

      this.gl.deleteFramebuffer(target.framebuffer);

      this.gl.deleteTexture(target.texture);
    }

    _pruneTargets() {
      if (this.targets.size <= this.maxCachedTargets) {
        return;
      }

      const candidates = [...this.targets.values()].sort(
        (a, b) => a.lastUsed - b.lastUsed,
      );

      while (this.targets.size > this.maxCachedTargets && candidates.length) {
        const target = candidates.shift();

        if (target.lastUsed === this.frameId) {
          continue;
        }

        this.targets.delete(target.key);

        this._deleteTarget(target);
      }
    }
  }

  global.VideoFusionGPUContext = VideoFusionGPUContext;

  global.ensureVideoFusionGPUContext = function ensureVideoFusionGPUContext() {
    if (!global.videoFusionGPUContext) {
      global.videoFusionGPUContext = new VideoFusionGPUContext(
        global.videoFusionShaderLibrary,
      );
    }

    return global.videoFusionGPUContext;
  };
})(window);

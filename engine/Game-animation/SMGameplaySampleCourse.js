/**
 * SMGameplaySampleCourse.js
 *
 * Authored Obstacle Course & Environment for SM Engine.
 * UE5 Game Animation Sample visual standard — FINAL:
 *   - Neutral gray concrete floor (readable under sun)
 *   - Dark grid lines on light base (matches UE5 sample)
 *   - COLOR-CODED obstacles:
 *       amber  = EASY    (low jumps, vaults)
 *       sage   = MEDIUM  (climb, balance)
 *       crimson= HARD    (wall climb, tall)
 *       slate  = support (structural, recedes)
 *       gray   = path    (ramp, landings, steps)
 *   - Matte PBR (roughness 0.70–0.78, metalness 0.0)
 *   - Subtle env map intensity (0.10–0.18)
 *   - Beveled edges via RoundedBoxGeometry (fallback-safe)
 *   - All obstacles, benches, ramp, Motion Matching lane & Decal preserved
 */
class SMGameplaySampleCourse {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = "SMGameplaySampleEnvironment";
    this.root.userData = {
      isSystemObject: true,
      isGameplaySample: true,
      workspaceOnly: "GAMEPLAY_SAMPLE",
      ignoreInTimeline: true,
      ignoreInHierarchy: true,
    };

    this.obstaclesGroup = new THREE.Group();
    this.obstaclesGroup.name = "SMGameplaySampleObstacles";
    this.obstaclesGroup.userData = {
      isSystemObject: true,
      isGameplaySample: true,
      workspaceOnly: "GAMEPLAY_SAMPLE",
      ignoreInTimeline: true,
      ignoreInHierarchy: true,
    };

    this.floor = null;
    this.collidableMeshes = [];
    this.traversalMeshes = [];
    this._materials = new Map();
    this._textures = [];
    this._built = false;

    this.floorSize = 1000;
    this.gridWorldSize = 10;
  }

  _tagObject(object, extra = {}) {
    if (!object) return object;
    object.userData = {
      ...(object.userData || {}),
      isSystemObject: true,
      isGameplaySample: true,
      workspaceOnly: "GAMEPLAY_SAMPLE",
      ignoreInTimeline: true,
      ignoreInHierarchy: true,
      ...extra,
    };
    return object;
  }

  _getMaxAnisotropy() {
    return Math.min(
      window.renderer?.capabilities?.getMaxAnisotropy?.() || 8,
      16,
    );
  }

  _registerTexture(texture, name = "") {
    if (!texture) return texture;
    if (name) texture.name = name;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = this._getMaxAnisotropy();
    texture.needsUpdate = true;
    this._textures.push(texture);
    return texture;
  }

  // =========================================================================
  // 1. FLOOR GRID TEXTURE — mid-gray concrete, dark grid lines
  // =========================================================================

  createUE5FloorGridTexture() {
    const size = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { alpha: false });

    // Mid-gray concrete base — the actual albedo
    ctx.fillStyle = "#7d828a";
    ctx.fillRect(0, 0, size, size);

    // Subtle radial vignette for tile depth
    const gradient = ctx.createRadialGradient(
      size * 0.5,
      size * 0.5,
      size * 0.05,
      size * 0.5,
      size * 0.5,
      size * 0.7,
    );
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.04)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.04)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Concrete speckle noise
    for (let i = 0; i < 3200; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const dark = Math.random() > 0.5;
      const alpha = Math.random() * 0.04 + 0.01;
      ctx.fillStyle = dark
        ? `rgba(0, 0, 0, ${alpha})`
        : `rgba(255, 255, 255, ${alpha})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }

    const divisions = 10;
    const step = size / divisions;

    const drawTicks = (x1, y1, x2, y2, count) => {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.22)";
      ctx.lineWidth = 1.0;
      for (let k = 1; k < count; k++) {
        const tx = x1 + (x2 - x1) * (k / count);
        const ty = y1 + (y2 - y1) * (k / count);
        ctx.beginPath();
        if (x1 === x2) {
          ctx.moveTo(tx - 3, ty);
          ctx.lineTo(tx + 3, ty);
        } else {
          ctx.moveTo(tx, ty - 3);
          ctx.lineTo(tx, ty + 3);
        }
        ctx.stroke();
      }
    };

    // 1m sub-grid lines
    ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
    ctx.lineWidth = 1.0;
    for (let i = 1; i < divisions; i++) {
      if (i % 5 === 0) continue;
      const p = Math.round(i * step) + 0.5;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
      drawTicks(p, 0, p, size, 10);
      drawTicks(0, p, size, p, 10);
    }

    // 5m mid-grid lines
    ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
    ctx.lineWidth = 1.8;
    for (let i = 5; i < divisions; i += 5) {
      if (i % 10 === 0) continue;
      const p = Math.round(i * step) + 0.5;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }

    // 10m major border
    ctx.strokeStyle = "rgba(0, 0, 0, 0.48)";
    ctx.lineWidth = 2.4;
    ctx.strokeRect(1.2, 1.2, size - 2.4, size - 2.4);

    const drawPlus = (cx, cy, radius, color, lineWidth) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(Math.max(0, cx - radius), cy);
      ctx.lineTo(Math.min(size, cx + radius), cy);
      ctx.moveTo(cx, Math.max(0, cy - radius));
      ctx.lineTo(cx, Math.min(size, cy + radius));
      ctx.stroke();
    };

    // Sub-crosses on 5m nodes
    for (let gy = 0; gy <= divisions; gy += 5) {
      for (let gx = 0; gx <= divisions; gx += 5) {
        if (gx % 10 === 0 && gy % 10 === 0) continue;
        const cx = Math.round(gx * step);
        const cy = Math.round(gy * step);
        drawPlus(cx, cy, 9, "rgba(0, 0, 0, 0.35)", 1.6);
      }
    }

    // Big bold cross at tile center
    const center = Math.round(size * 0.5);
    drawPlus(center, center, 44, "rgba(0, 0, 0, 0.55)", 4.5);

    return this._registerTexture(
      new THREE.CanvasTexture(canvas),
      "UE5_GameAnimation_FloorTexture",
    );
  }

  // =========================================================================
  // 2. COLOR-CODED GRID TEXTURES for obstacles
  // =========================================================================

  createPrototypeGridTexture(type = "amber") {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { alpha: false });

    // Per-type base colors — become the actual obstacle surface
    const baseColors = {
      gray:        "#9a9ea6",
      grayDark:    "#565a62",
      slate:       "#3f434a",
      amber:       "#c49a5a",
      amberDark:   "#a67f44",
      sage:        "#7b9c7f",
      sageDark:    "#5e7d62",
      crimson:     "#a65959",
      crimsonDark: "#8a4444",
      orange:      "#c49a5a", // legacy alias
    };

    const baseColor = baseColors[type] || baseColors.gray;

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);

    // Subtle vertical sheen — "manufactured" feel
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.07)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.08)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Surface speckle
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.fillStyle =
        Math.random() > 0.5
          ? `rgba(0, 0, 0, ${Math.random() * 0.05})`
          : `rgba(255, 255, 255, ${Math.random() * 0.05})`;
      ctx.fillRect(x, y, 1, 1);
    }

    const divisions = 10;
    const step = size / divisions;

    // Sub-grid lines (dark on colored base)
    ctx.strokeStyle = "rgba(0, 0, 0, 0.16)";
    ctx.lineWidth = 1.0;
    for (let i = 1; i < divisions; i++) {
      if (i % 5 === 0) continue;
      const p = Math.round(i * step) + 0.5;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }

    // Middle division line
    ctx.strokeStyle = "rgba(0, 0, 0, 0.32)";
    ctx.lineWidth = 1.8;
    const middle = Math.round(size * 0.5) + 0.5;
    ctx.beginPath();
    ctx.moveTo(middle, 0);
    ctx.lineTo(middle, size);
    ctx.moveTo(0, middle);
    ctx.lineTo(size, middle);
    ctx.stroke();

    // Chamfer border
    ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
    ctx.lineWidth = 3.0;
    ctx.strokeRect(1.5, 1.5, size - 3, size - 3);

    // Center plus marker
    const drawPlus = (cx, cy, radius, color, lineWidth) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(Math.max(0, cx - radius), cy);
      ctx.lineTo(Math.min(size, cx + radius), cy);
      ctx.moveTo(cx, Math.max(0, cy - radius));
      ctx.lineTo(cx, Math.min(size, cy + radius));
      ctx.stroke();
    };

    drawPlus(size * 0.5, size * 0.5, 18, "rgba(0, 0, 0, 0.50)", 2.5);

    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `UE5_Prototype_Grid_${type}`;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = this._getMaxAnisotropy();
    texture.needsUpdate = true;

    this._textures.push(texture);
    return texture;
  }

  // =========================================================================
  // 3. MATERIALS
  // =========================================================================

  _createSurfaceMaterial(type = "gray") {
    const key = `surface_${type}`;
    if (this._materials.has(key)) return this._materials.get(key);

    // =====================================================================
    // UE5-STYLE COLOR-CODED PALETTE
    // =====================================================================
    const palette = {
      // Structural / neutral
      gray:        { color: "#9a9ea6", roughness: 0.72, env: 0.15 },
      grayDark:    { color: "#565a62", roughness: 0.75, env: 0.12 },
      slate:       { color: "#3f434a", roughness: 0.78, env: 0.10 },

      // Amber — LOW / EASY obstacles
      amber:       { color: "#c49a5a", roughness: 0.68, env: 0.18 },
      amberDark:   { color: "#a67f44", roughness: 0.72, env: 0.15 },

      // Sage — MEDIUM / balance
      sage:        { color: "#7b9c7f", roughness: 0.70, env: 0.16 },
      sageDark:    { color: "#5e7d62", roughness: 0.72, env: 0.14 },

      // Crimson — TALL / HARD
      crimson:     { color: "#a65959", roughness: 0.68, env: 0.18 },
      crimsonDark: { color: "#8a4444", roughness: 0.72, env: 0.15 },

      // Benches
      benchWood:   { color: "#8a7358", roughness: 0.78, env: 0.10 },
      benchMetal:  { color: "#3a3d43", roughness: 0.45, env: 0.45 },

      // Legacy alias
      orange:      { color: "#c49a5a", roughness: 0.68, env: 0.18 },
    };

    const entry = palette[type] || palette.gray;

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(entry.color),
      roughness: entry.roughness,
      metalness: 0.0,
      side: THREE.DoubleSide,
      shadowSide: THREE.FrontSide,
      envMapIntensity: entry.env,
      dithering: true,
    });

    this._materials.set(key, material);
    return material;
  }

  _createGridMaterial(type = "amber") {
    const key = `grid_${type}`;
    if (this._materials.has(key)) return this._materials.get(key);

    const map = this.createPrototypeGridTexture(type);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#ffffff"),
      map,
      roughness: 0.70,
      metalness: 0.0,
      side: THREE.DoubleSide,
      shadowSide: THREE.FrontSide,
      envMapIntensity: 0.15,
      dithering: true,
    });

    this._materials.set(key, material);
    return material;
  }

  // =========================================================================
  // 4. BEVELED BOX GEOMETRY (fallback-safe)
  // =========================================================================

  _boxGeometry(width, height, depth, unit = 1, bevel = 0.03) {
    let geometry;

    if (typeof THREE.RoundedBoxGeometry === "function") {
      try {
        geometry = new THREE.RoundedBoxGeometry(
          width,
          height,
          depth,
          2,
          Math.min(bevel, Math.min(width, height, depth) * 0.15),
        );
      } catch (e) {
        geometry = new THREE.BoxGeometry(width, height, depth, 1, 1, 1);
      }
    } else {
      geometry = new THREE.BoxGeometry(width, height, depth, 1, 1, 1);
    }

    // UV scaling only applies cleanly to plain BoxGeometry (24 verts)
    const uv = geometry.attributes.uv;
    if (uv && uv.count === 24) {
      const faceScales = [
        [depth / unit, height / unit],
        [depth / unit, height / unit],
        [width / unit, depth / unit],
        [width / unit, depth / unit],
        [width / unit, height / unit],
        [width / unit, height / unit],
      ];

      for (let face = 0; face < 6; face++) {
        const start = face * 4;
        const scaleU = faceScales[face][0];
        const scaleV = faceScales[face][1];
        for (let i = 0; i < 4; i++) {
          const index = start + i;
          uv.setXY(
            index,
            uv.getX(index) * scaleU,
            uv.getY(index) * scaleV,
          );
        }
      }
      uv.needsUpdate = true;
    }

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  _inferTraversalType(name, height, depth) {
    const key = String(name || "").toLowerCase();
    if (/step|floor|landing|support|jumpplatform|ramp/.test(key)) return null;
    if (height < 0.32 || height > 3.2 || depth > 7.5) return null;
    return "AUTO";
  }

  _makeBox({
    name = "SMGameplayBox",
    type = "amber",
    size = [1, 1, 1],
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    grid = true,
    collidable = true,
    traversalType = null,
    traversalLandingOffset = 0.55,
  } = {}) {
    const [width, height, depth] = size;
    const geometry = this._boxGeometry(width, height, depth, 1);
    const material = grid
      ? this._createGridMaterial(type)
      : this._createSurfaceMaterial(type);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const resolvedTraversalType =
      traversalType || this._inferTraversalType(name, height, depth);

    this._tagObject(mesh, {
      static: true,
      physicsShape: "box",
      collisionEnabled: true,
      collisionLayer: "world-static",
      bodyType: "static",
      horizontalBlocking: true,
      physicsSize: [width, height, depth],
      friction: 0.8,
      restitution: 0.025,
      traversalType: resolvedTraversalType || null,
      traversalLandingOffset: Number(traversalLandingOffset) || 0.55,
      noTraversal: !resolvedTraversalType,
      colorCategory: type,
    });

    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
    mesh.updateMatrixWorld(true);
    mesh.userData.collider = new THREE.Box3().setFromObject(mesh);

    this.obstaclesGroup.add(mesh);
    if (collidable) this.collidableMeshes.push(mesh);
    if (resolvedTraversalType) this.traversalMeshes.push(mesh);

    window.SMPlayerCollisionRegistry?.registerObject?.(mesh, {
      collisionLayer: "world-static",
      bodyType: "static",
      physicsShape: "box",
      traversalType: resolvedTraversalType || false,
    });

    return mesh;
  }

  // =========================================================================
  // 5. PARK BENCH
  // =========================================================================

  _buildParkBench(position = [0, 0, 0], rotationY = 0) {
    const group = new THREE.Group();
    group.name = "SMGameplayParkBench";
    group.position.set(...position);
    group.rotation.y = rotationY;

    const slatMat = this._createSurfaceMaterial("benchWood");
    const metalMat = this._createSurfaceMaterial("benchMetal");

    const benchWidth = 2.4;
    const seatHeight = 0.5;
    const seatDepth = 0.45;

    for (let i = 0; i < 3; i++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(benchWidth, 0.04, 0.12),
        slatMat,
      );
      slat.position.set(0, seatHeight, -seatDepth * 0.3 + i * 0.14);
      slat.castShadow = true;
      slat.receiveShadow = true;
      group.add(slat);
    }

    for (let i = 0; i < 2; i++) {
      const backSlat = new THREE.Mesh(
        new THREE.BoxGeometry(benchWidth, 0.12, 0.04),
        slatMat,
      );
      backSlat.position.set(
        0,
        seatHeight + 0.25 + i * 0.16,
        -seatDepth * 0.5 - 0.02,
      );
      backSlat.castShadow = true;
      backSlat.receiveShadow = true;
      group.add(backSlat);
    }

    [-benchWidth * 0.42, benchWidth * 0.42].forEach((lx) => {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, seatHeight, seatDepth * 1.1),
        metalMat,
      );
      leg.position.set(lx, seatHeight * 0.5, 0);
      leg.castShadow = true;
      leg.receiveShadow = true;
      group.add(leg);

      const backPost = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.5, 0.08),
        metalMat,
      );
      backPost.position.set(lx, seatHeight + 0.25, -seatDepth * 0.5 - 0.02);
      backPost.castShadow = true;
      backPost.receiveShadow = true;
      group.add(backPost);
    });

    this._tagObject(group, {
      static: true,
      physicsShape: "box",
      physicsSize: [benchWidth, 0.9, 0.6],
      friction: 0.8,
      restitution: 0.02,
    });

    group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.obstaclesGroup.add(group);
    return group;
  }

  // =========================================================================
  // 6. CENTER ARENA DECAL
  // =========================================================================

  _createGameAnimationSampleDecal(radius = 14) {
    const group = new THREE.Group();
    group.name = "SMGameplaySpawnArena";

    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const center = canvas.width * 0.5;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(center, center, 740, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(center, center, 560, 0, Math.PI * 2);
    ctx.stroke();

    const bgGrad = ctx.createRadialGradient(
      center,
      center,
      60,
      center,
      center,
      410,
    );
    bgGrad.addColorStop(0, "rgba(255, 255, 255, 0.09)");
    bgGrad.addColorStop(1, "rgba(255, 255, 255, 0.0)");
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.arc(center, center - 20, 410, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(center - 710, center);
    ctx.lineTo(center + 710, center);
    ctx.moveTo(center, center - 710);
    ctx.lineTo(center, center + 710);
    ctx.stroke();

    const userLogoSvg = `<svg width="512" height="512" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoMainFill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#2c3e50" />
            <stop offset="100%" stop-color="#1c2833" />
        </linearGradient>
        <linearGradient id="logoOuterStroke" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#4e5b6b" />
            <stop offset="100%" stop-color="#7e8c9d" />
        </linearGradient>
        <linearGradient id="logoInnerHighlight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#66b3ff" />
            <stop offset="100%" stop-color="#89cff0" />
        </linearGradient>
      </defs>
      <filter id="logoDropShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="3" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.25" />
      </filter>
      <g filter="url(#logoDropShadow)">
        <path fill="url(#logoMainFill)" stroke="url(#logoOuterStroke)" stroke-width="6" stroke-linejoin="round" d="M30 170 L30 45 L60 30 L100 30 L130 30 L170 30 L170 155 L155 170 L100 170 L85 155 L85 100 L115 85 L115 45 L100 30 M85 100 L115 85" />
        <path fill="none" stroke="url(#logoInnerHighlight)" stroke-width="4" stroke-linejoin="round" opacity="0.85" d="M36 164 L36 48 L63 36 L100 36 L126 36 L164 36 L164 152 L152 164 L100 164 L91 152 L91 103 L112 91 L112 48" />
      </g>
    </svg>`;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    this._textures.push(texture);

    const svgBlob = new Blob([userLogoSvg], {
      type: "image/svg+xml;charset=utf-8",
    });
    const URLObj = window.URL || window.webkitURL || window;
    const blobURL = URLObj.createObjectURL(svgBlob);
    const logoImg = new Image();

    logoImg.onload = () => {
      const logoSize = 820;
      ctx.drawImage(
        logoImg,
        center - logoSize * 0.5,
        center - logoSize * 0.6,
        logoSize,
        logoSize,
      );

      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.font = '900 96px "Arial Black", Impact, sans-serif';
      ctx.fillText("GAME ANIMATION", center, center + 570);

      ctx.font = '900 146px "Arial Black", Impact, sans-serif';
      ctx.fillText("SAMPLE", center, center + 710);

      texture.needsUpdate = true;
      URLObj.revokeObjectURL(blobURL);
    };
    logoImg.src = blobURL;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    const decalMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 2, radius * 2),
      material,
    );
    decalMesh.rotation.x = -Math.PI / 2;
    decalMesh.position.y = 0.02;
    this._tagObject(decalMesh, {
      isGameplayDecoration: true,
      noCastShadow: true,
      noReceiveShadow: true,
    });

    group.add(decalMesh);

    const benchRadius = radius * 0.72;
    const benchAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
    benchAngles.forEach((angle) => {
      const bx = Math.sin(angle) * benchRadius;
      const bz = Math.cos(angle) * benchRadius;
      this._buildParkBench([bx, 0, bz], angle + Math.PI);
    });

    this.root.add(group);
    return group;
  }

  // =========================================================================
  // 7. TEXT PLANES & WORLD LABELS
  // =========================================================================

  _createTextPlane(
    text,
    {
      width = 10,
      height = 2.5,
      color = "#ffffff",
      fontSize = 76,
      background = null,
    } = {},
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.font = `800 ${fontSize}px Segoe UI, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Dark outline for readability
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
    ctx.strokeText(text, canvas.width * 0.5, canvas.height * 0.5);

    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width * 0.5, canvas.height * 0.5);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    this._textures.push(texture);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      material,
    );
    this._tagObject(mesh, {
      isGameplayDecoration: true,
      noCastShadow: true,
      noReceiveShadow: true,
    });
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  _createWorldLabel(text, position, width = 3.2, height = 1) {
    const label = this._createTextPlane(text, {
      width,
      height,
      color: "#ffffff",
      fontSize: 78,
    });
    label.position.set(...position);
    this.root.add(label);
    return label;
  }

  // =========================================================================
  // 8. CURVED RAMP
  // =========================================================================

  _createCurvedRamp({
    name = "SMGameplayCurvedRamp",
    width = 7,
    length = 18,
    height = 7,
    thickness = 0.55,
    position = [20, 0.05, -2],
  } = {}) {
    const segments = 36;
    const vertices = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const z = -length * 0.5 + t * length;
      const eased = t * t;
      const y = height * eased;
      const slope = (2 * height * t) / length;
      const normal = new THREE.Vector2(-slope, 1).normalize();
      const bottomY = y - thickness * normal.y;
      const bottomZ = z - thickness * normal.x;

      vertices.push(
        -width * 0.5,
        y,
        z,
        width * 0.5,
        y,
        z,
        -width * 0.5,
        bottomY,
        bottomZ,
        width * 0.5,
        bottomY,
        bottomZ,
      );
      uvs.push(0, t * 4, 1, t * 4, 0, t * 4, 1, t * 4);
    }

    for (let i = 0; i < segments; i++) {
      const a = i * 4;
      const b = (i + 1) * 4;
      indices.push(a, b, b + 1, a, b + 1, a + 1);
      indices.push(a + 2, a + 3, b + 3, a + 2, b + 3, b + 2);
      indices.push(a, a + 2, b + 2, a, b + 2, b);
      indices.push(a + 1, b + 1, b + 3, a + 1, b + 3, a + 3);
    }

    const first = 0;
    const last = segments * 4;
    indices.push(first, first + 1, first + 3, first, first + 3, first + 2);
    indices.push(last, last + 2, last + 3, last, last + 3, last + 1);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const material = this._createGridMaterial("gray");
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    this._tagObject(mesh, {
      static: true,
      physicsShape: "trimesh",
      collisionEnabled: true,
      collisionLayer: "world-static",
      bodyType: "static",
      collisionSurface: true,
      horizontalBlocking: false,
      noTraversal: true,
      friction: 0.84,
      restitution: 0.015,
    });

    this.obstaclesGroup.add(mesh);
    this.collidableMeshes.push(mesh);
    window.SMPlayerCollisionRegistry?.registerObject?.(mesh, {
      collisionLayer: "world-static",
      bodyType: "static",
      physicsShape: "trimesh",
      horizontalBlocking: false,
      traversalType: false,
    });
    return mesh;
  }

  // =========================================================================
  // 9. MOTION MATCHING LANE — color coded by difficulty
  // =========================================================================

  _buildMotionMatchingLane() {
    // VAULT (easy) → amber
    this._makeBox({
      name: "SMMotionVaultBarrier",
      type: "amber",
      size: [4.2, 0.9, 0.45],
      position: [-12, 0.45, 32],
      traversalType: "VAULT",
      traversalLandingOffset: 0.7,
    });

    // CLIMB (medium) → sage
    this._makeBox({
      name: "SMMotionClimbObstacle",
      type: "sage",
      size: [4.2, 1.65, 0.55],
      position: [0, 0.825, 32],
      traversalType: "CLIMB",
      traversalLandingOffset: 0.5,
    });

    // WALL CLIMB (hard) → crimson
    this._makeBox({
      name: "SMMotionHighWall",
      type: "crimson",
      size: [4.2, 2.55, 0.65],
      position: [12, 1.275, 32],
      traversalType: "CLIMB_WALL",
      traversalLandingOffset: 0.45,
    });

    this._createWorldLabel("VAULT", [-12, 1.4, 31.7], 3.2, 0.8);
    this._createWorldLabel("CLIMB", [0, 2.15, 31.7], 3.2, 0.8);
    this._createWorldLabel("WALL CLIMB", [12, 3.05, 31.62], 4.2, 0.8);
  }

  // =========================================================================
  // 10. OBSTACLE COURSE — color-coded by category
  // =========================================================================

  _buildObstacleCourse() {
    // ---------------------------------------------------------------------
    // HEIGHT BLOCKS — gradient from EASY → HARD
    // ---------------------------------------------------------------------
    const hurdleData = [
      {
        name: "SMHeightBlock_025",
        size: [7, 0.5, 3],
        position: [-27, 0.25, -12],
        label: "0.5 M",
        type: "amber", // EASY
      },
      {
        name: "SMHeightBlock_100",
        size: [7, 1, 3],
        position: [-19, 0.5, -12],
        label: "1 M",
        type: "amberDark", // EASY+
      },
      {
        name: "SMHeightBlock_150",
        size: [7, 1.5, 3],
        position: [-11, 0.75, -12],
        label: "1.5 M",
        type: "sage", // MEDIUM
      },
      {
        name: "SMHeightBlock_250",
        size: [7, 2.5, 3],
        position: [-3, 1.25, -12],
        label: "2.5 M",
        type: "crimson", // HARD
      },
    ];

    hurdleData.forEach((item) => {
      this._makeBox({
        name: item.name,
        type: item.type,
        size: item.size,
        position: item.position,
      });
      this._createWorldLabel(
        item.label,
        [
          item.position[0],
          item.position[1] + item.size[1] * 0.2,
          item.position[2] + item.size[2] * 0.51,
        ],
        3.4,
        1.05,
      );
    });

    // ---------------------------------------------------------------------
    // VAULT BOXES — amber family (jump-over obstacles)
    // ---------------------------------------------------------------------
    this._makeBox({
      name: "SMVaultLow",
      type: "amber",
      size: [5, 1, 5],
      position: [-24, 0.5, 14],
    });
    this._makeBox({
      name: "SMVaultMedium",
      type: "amberDark",
      size: [5, 2, 5],
      position: [-17, 1, 14],
    });
    this._makeBox({
      name: "SMVaultHigh",
      type: "crimson",
      size: [5, 3.2, 5],
      position: [-10, 1.6, 14],
    });

    // ---------------------------------------------------------------------
    // BALANCE BEAM — sage (medium balance challenge)
    // Supports — slate (structural, recedes)
    // ---------------------------------------------------------------------
    this._makeBox({
      name: "SMBalanceBeam",
      type: "sage",
      size: [14, 0.8, 1.2],
      position: [-3, 3, -24],
    });
    this._makeBox({
      name: "SMBalanceSupportLeft",
      type: "slate",
      size: [1.2, 6, 1.2],
      position: [-9, 3, -24],
      grid: false,
    });
    this._makeBox({
      name: "SMBalanceSupportRight",
      type: "slate",
      size: [1.2, 6, 1.2],
      position: [3, 3, -24],
      grid: false,
    });

    // ---------------------------------------------------------------------
    // JUMP PLATFORMS — amber (hop-up challenges)
    // ---------------------------------------------------------------------
    this._makeBox({
      name: "SMJumpPlatform01",
      type: "amber",
      size: [5, 0.8, 5],
      position: [8, 3.4, -18],
    });
    this._makeBox({
      name: "SMJumpPlatform02",
      type: "amberDark",
      size: [5, 0.8, 5],
      position: [15, 5, -18],
    });
    this._makeBox({
      name: "SMJumpPlatform03",
      type: "crimson",
      size: [5, 0.8, 5],
      position: [22, 6.6, -18],
    });

    // ---------------------------------------------------------------------
    // CURVED RAMP — neutral gray (path element)
    // ---------------------------------------------------------------------
    this._createCurvedRamp({
      name: "SMGameplayCurvedRamp",
      width: 7,
      length: 19,
      height: 8,
      position: [24, 0.05, 0],
    });

    // ---------------------------------------------------------------------
    // RAMP LANDING + STEPS — neutral gray (path continues)
    // ---------------------------------------------------------------------
    this._makeBox({
      name: "SMRampLanding",
      type: "gray",
      size: [8, 1, 8],
      position: [24, 8.5, 12],
    });
    this._makeBox({
      name: "SMStep01",
      type: "gray",
      size: [4, 0.6, 4],
      position: [37, 0.3, 15],
    });
    this._makeBox({
      name: "SMStep02",
      type: "gray",
      size: [4, 1.2, 4],
      position: [41.5, 0.6, 15],
    });
    this._makeBox({
      name: "SMStep03",
      type: "gray",
      size: [4, 1.8, 4],
      position: [46, 0.9, 15],
    });

    // ---------------------------------------------------------------------
    // FAR WALLS — crimson (wall climb, hard)
    // Far platform — gray (landing zone)
    // ---------------------------------------------------------------------
    this._makeBox({
      name: "SMFarWall01",
      type: "crimson",
      size: [14, 4, 2],
      position: [35, 2, -28],
    });
    this._makeBox({
      name: "SMFarWall02",
      type: "crimsonDark",
      size: [2, 7, 10],
      position: [42, 3.5, -23],
    });
    this._makeBox({
      name: "SMFarPlatform",
      type: "gray",
      size: [14, 1, 9],
      position: [32, 3.5, -22],
    });
  }

  // =========================================================================
  // 11. SHADOW CASTER PREP
  // =========================================================================

  prepareShadowCasters() {
    if (!this.root) return;

    this.root.traverse((object) => {
      if (!object?.isMesh) return;

      const name = String(object.name || "");
      const parentName = String(object.parent?.name || "");
      const material = Array.isArray(object.material)
        ? object.material[0]
        : object.material;

      const isDecoration =
        object.userData?.isGameplayDecoration === true ||
        object.userData?.noCastShadow === true ||
        material?.isMeshBasicMaterial === true ||
        /Label|Decal|SpawnArena|SpawnMark|Text|Helper|Gizmo/i.test(name) ||
        /Helper|Gizmo/i.test(parentName);

      if (object === this.floor) {
        object.castShadow = false;
        object.receiveShadow = true;
        object.userData.noCastShadow = true;
        object.userData.forceReceiveShadow = true;
        return;
      }

      if (isDecoration) {
        object.castShadow = false;
        object.receiveShadow = false;
        return;
      }

      object.castShadow = true;
      object.receiveShadow = true;
    });
  }

  // =========================================================================
  // 12. BUILD
  // =========================================================================

  build() {
    if (this._built) return this.getWorld();
    if (!this.scene) {
      console.warn("[Gameplay Sample] Scene is not available.");
      return null;
    }
    this._built = true;

    const floorTexture = this.createUE5FloorGridTexture();
    floorTexture.repeat.set(
      this.floorSize / this.gridWorldSize,
      this.floorSize / this.gridWorldSize,
    );

    // Neutral matte concrete — let texture's mid-gray albedo show through
    const floorMaterial = new THREE.MeshStandardMaterial({
      name: "SMGameplaySampleFloorMaterial",
      color: new THREE.Color("#ffffff"),
      map: floorTexture,
      roughness: 0.72,
      metalness: 0.0,
      side: THREE.FrontSide,
      shadowSide: THREE.FrontSide,
      envMapIntensity: 0.12,
      dithering: true,
    });

    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(this.floorSize, this.floorSize, 1, 1),
      floorMaterial,
    );
    this.floor.name = "SMGameplaySampleFloor";
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = 0;
    this.floor.castShadow = false;
    this.floor.receiveShadow = true;
    this.floor.frustumCulled = false;

    this._tagObject(this.floor, {
      static: true,
      physicsShape: "trimesh",
      collisionEnabled: true,
      collisionLayer: "world-static",
      bodyType: "static",
      collisionSurface: true,
      horizontalBlocking: false,
      noTraversal: true,
      friction: 0.88,
      restitution: 0.015,
      noCastShadow: true,
      forceReceiveShadow: true,
    });

    this.root.add(this.floor);
    this.root.add(this.obstaclesGroup);
    this.collidableMeshes.push(this.floor);

    window.SMPlayerCollisionRegistry?.registerObject?.(this.floor, {
      collisionLayer: "world-static",
      bodyType: "static",
      physicsShape: "trimesh",
      horizontalBlocking: false,
      traversalType: false,
    });

    this._createGameAnimationSampleDecal(14);
    this._buildObstacleCourse();
    this._buildMotionMatchingLane();
    this.prepareShadowCasters();

    this.root.visible = false;
    this.floor.frustumCulled = false;

    this.scene.add(this.root);
    return this.getWorld();
  }

  setVisible(visible) {
    const state = !!visible;
    this.root.visible = state;
    this.root.traverse((child) => {
      child.visible = state;
    });
  }

  getWorld() {
    return {
      root: this.root,
      ground: this.floor,
      floor: this.floor,
      obstaclesGroup: this.obstaclesGroup,
      collidableMeshes: this.collidableMeshes,
      traversalMeshes: this.traversalMeshes,
    };
  }

  dispose() {
    const geometries = new Set();
    const materials = new Set();

    window.SMPlayerCollisionRegistry?.unregisterObject?.(this.root);

    this.root.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => {
          if (material) materials.add(material);
        });
      } else if (object.material) {
        materials.add(object.material);
      }
    });

    geometries.forEach((geometry) => geometry?.dispose?.());
    materials.forEach((material) => material?.dispose?.());

    this._textures.forEach((texture) => texture?.dispose?.());
    this._textures.length = 0;
    this._materials.clear();

    this.root.parent?.remove(this.root);
    this.obstaclesGroup.clear?.();
    this.root.clear?.();

    this.collidableMeshes.length = 0;
    this.traversalMeshes.length = 0;
    this.floor = null;
    this._built = false;
  }
}

window.SMGameplaySampleCourse = SMGameplaySampleCourse;
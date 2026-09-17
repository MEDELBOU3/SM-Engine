// ============================================================================
// nodes/core/BaseTerrainNode.js
// SM Engine Terrain Node System v2 — core data model + deterministic math.
// Plain browser script: no npm / no ES modules required.
// ============================================================================
(function (global) {
    'use strict';
    const NS = global.SMTerrainNodes = global.SMTerrainNodes || {};
    if (NS.BaseTerrainNode) return;

    const EPS = 1e-8;
    let NEXT_ID = 1;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const clamp01 = v => clamp(v, 0, 1);
    const lerp = (a, b, t) => a + (b - a) * t;
    const smoothstep = (a, b, x) => {
        if (Math.abs(b - a) < EPS) return x < a ? 0 : 1;
        const t = clamp01((x - a) / (b - a));
        return t * t * (3 - 2 * t);
    };
    const uid = (prefix = 'tn') => `${prefix}-${Date.now().toString(36)}-${(++NEXT_ID).toString(36)}`;

    function hash32(value) {
        let x = value | 0;
        x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
        x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
        x ^= x >>> 16;
        return x >>> 0;
    }
    function hash2D(x, y, seed = 0) {
        return hash32(Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(y | 0, 0x5f356495) ^ (seed | 0)) / 4294967295;
    }
    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    class FastSimplex2D {
        constructor(seed = 1337) {
            this.seed = Number(seed) || 0;
            const random = mulberry32(hash32(this.seed | 0));
            const p = new Uint8Array(256);
            for (let i = 0; i < 256; i++) p[i] = i;
            for (let i = 255; i > 0; i--) {
                const j = Math.floor(random() * (i + 1));
                const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
            }
            this.perm = new Uint8Array(512);
            for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
        }
        noise2D(xin, yin) {
            const grad = FastSimplex2D.GRAD3;
            const F2 = 0.5 * (Math.sqrt(3) - 1);
            const G2 = (3 - Math.sqrt(3)) / 6;
            const s = (xin + yin) * F2;
            const i = Math.floor(xin + s), j = Math.floor(yin + s);
            const t = (i + j) * G2;
            const x0 = xin - (i - t), y0 = yin - (j - t);
            const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
            const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
            const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
            const ii = i & 255, jj = j & 255;
            const gi0 = (this.perm[ii + this.perm[jj]] % 12) * 3;
            const gi1 = (this.perm[ii + i1 + this.perm[jj + j1]] % 12) * 3;
            const gi2 = (this.perm[ii + 1 + this.perm[jj + 1]] % 12) * 3;
            const contrib = (x, y, gi) => {
                let q = 0.5 - x * x - y * y;
                if (q < 0) return 0;
                q *= q;
                return q * q * (grad[gi] * x + grad[gi + 1] * y);
            };
            return 70 * (contrib(x0, y0, gi0) + contrib(x1, y1, gi1) + contrib(x2, y2, gi2));
        }
    }
    FastSimplex2D.GRAD3 = new Float32Array([
        1,1,0,-1,1,0,1,-1,0,-1,-1,0, 1,0,1,-1,0,1,1,0,-1,-1,0,-1, 0,1,1,0,-1,1,0,1,-1,0,-1,-1
    ]);

    const TerrainMath = {
        EPS, clamp, clamp01, lerp, smoothstep, hash32, hash2D, mulberry32,
        clone: a => new Float32Array(a || 0),
        minMax(array) {
            let min = Infinity, max = -Infinity;
            for (let i = 0; i < array.length; i++) { const v = array[i]; if (v < min) min = v; if (v > max) max = v; }
            return { min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 0 };
        },
        fbm(noise, x, y, o = {}) {
            const oct = Math.max(1, Math.floor(o.octaves ?? 6));
            let f = Number(o.frequency ?? 1), a = 1, sum = 0, norm = 0;
            const lac = Number(o.lacunarity ?? 2), gain = Number(o.gain ?? 0.5);
            for (let i = 0; i < oct; i++) { sum += noise.noise2D(x * f, y * f) * a; norm += a; f *= lac; a *= gain; }
            return norm > EPS ? sum / norm : 0;
        },
        ridged(noise, x, y, o = {}) {
            const oct = Math.max(1, Math.floor(o.octaves ?? 6));
            let f = Number(o.frequency ?? 1), a = 1, sum = 0, norm = 0, weight = 1;
            const lac = Number(o.lacunarity ?? 2.1), gain = Number(o.gain ?? 0.5), sharp = Math.max(0.25, Number(o.sharpness ?? 2));
            for (let i = 0; i < oct; i++) {
                let n = 1 - Math.abs(noise.noise2D(x * f, y * f));
                n = Math.pow(clamp01(n), sharp) * weight;
                weight = clamp(n * 2, 0.15, 1); sum += n * a; norm += a; f *= lac; a *= gain;
            }
            return norm > EPS ? sum / norm : 0;
        },
        domainWarp(noise, x, y, o = {}) {
            const f = Number(o.frequency ?? 0.01), s = Number(o.strength ?? 20), oct = Math.max(1, Math.floor(o.octaves ?? 3));
            const qx = TerrainMath.fbm(noise, x, y, { frequency: f, octaves: oct, lacunarity: 2, gain: 0.5 });
            const qy = TerrainMath.fbm(noise, x + 17.31, y - 9.17, { frequency: f, octaves: oct, lacunarity: 2, gain: 0.5 });
            return { x: x + qx * s, y: y + qy * s };
        },
        worley2D(x, y, seed = 0, jitter = 1) {
            const cx0 = Math.floor(x), cy0 = Math.floor(y);
            let f1 = Infinity, f2 = Infinity, value = 0;
            for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
                const cx = cx0 + ox, cy = cy0 + oy;
                const px = cx + 0.5 + (hash2D(cx, cy, seed) - 0.5) * jitter;
                const py = cy + 0.5 + (hash2D(cx, cy, seed + 911) - 0.5) * jitter;
                const dx = px - x, dy = py - y, d = Math.sqrt(dx * dx + dy * dy);
                if (d < f1) { f2 = f1; f1 = d; value = hash2D(cx, cy, seed + 1777) * 2 - 1; }
                else if (d < f2) f2 = d;
            }
            return { f1, f2, edge: f2 - f1, value };
        },
        sampleBilinear(array, sizeX, sizeZ, x, z) {
            const fx = clamp(x, 0, sizeX - 1), fz = clamp(z, 0, sizeZ - 1);
            const x0 = Math.floor(fx), z0 = Math.floor(fz), x1 = Math.min(sizeX - 1, x0 + 1), z1 = Math.min(sizeZ - 1, z0 + 1);
            const tx = fx - x0, tz = fz - z0;
            const a = array[z0 * sizeX + x0], b = array[z0 * sizeX + x1], c = array[z1 * sizeX + x0], d = array[z1 * sizeX + x1];
            return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
        },
        sampleHeightAndGradient(array, sizeX, sizeZ, x, z) {
            const fx = clamp(x, 0, sizeX - 1.001), fz = clamp(z, 0, sizeZ - 1.001);
            const x0 = Math.floor(fx), z0 = Math.floor(fz), x1 = Math.min(sizeX - 1, x0 + 1), z1 = Math.min(sizeZ - 1, z0 + 1);
            const tx = fx - x0, tz = fz - z0;
            const h00 = array[z0 * sizeX + x0], h10 = array[z0 * sizeX + x1], h01 = array[z1 * sizeX + x0], h11 = array[z1 * sizeX + x1];
            return {
                height: h00*(1-tx)*(1-tz)+h10*tx*(1-tz)+h01*(1-tx)*tz+h11*tx*tz,
                gradientX: (h10-h00)*(1-tz)+(h11-h01)*tz,
                gradientZ: (h01-h00)*(1-tx)+(h11-h10)*tx
            };
        },
        blur3x3(source, sizeX, sizeZ, strength = 1) {
            const out = new Float32Array(source.length), s = clamp01(strength);
            for (let z = 0; z < sizeZ; z++) for (let x = 0; x < sizeX; x++) {
                const i = z * sizeX + x; let sum = 0, wsum = 0;
                for (let oz=-1; oz<=1; oz++) for (let ox=-1; ox<=1; ox++) {
                    const nx = clamp(x+ox,0,sizeX-1), nz = clamp(z+oz,0,sizeZ-1);
                    const w = (ox===0&&oz===0)?4:(ox===0||oz===0)?2:1;
                    sum += source[nz*sizeX+nx]*w; wsum += w;
                }
                out[i] = lerp(source[i], sum/wsum, s);
            }
            return out;
        }
    };

    function createTerrainContext(terrain, baseHeights = null) {
        if (!terrain) throw new Error('[Terrain Nodes] Missing terrain.');
        const ud = terrain.userData || (terrain.userData = {}), td = ud.terrainData || null, cfg = ud.config || {}, settings = ud.settings || {};
        const raw = baseHeights || td?.heights || ud.heightData || null, pos = terrain.geometry?.attributes?.position || null;
        const count = raw?.length || pos?.count || 0;
        if (!count) throw new Error('[Terrain Nodes] Terrain has no height samples.');
        let sizeX = Number(td?.resolutionX) || (Number.isFinite(Number(td?.quadsX)) ? Number(td.quadsX)+1 : 0) || (Number.isFinite(Number(cfg.resolution)) ? Number(cfg.resolution)+1 : 0);
        let sizeZ = Number(td?.resolutionZ) || (Number.isFinite(Number(td?.quadsZ)) ? Number(td.quadsZ)+1 : 0) || (Number.isFinite(Number(cfg.resolutionZ)) ? Number(cfg.resolutionZ)+1 : 0);
        if (!sizeX || !sizeZ || sizeX * sizeZ !== count) {
            const side = Math.round(Math.sqrt(count));
            if (side * side === count) { sizeX = side; sizeZ = side; }
            else if (sizeX && count % sizeX === 0) sizeZ = count / sizeX;
            else if (sizeZ && count % sizeZ === 0) sizeX = count / sizeZ;
            else throw new Error(`[Terrain Nodes] Cannot infer grid dimensions for ${count} samples.`);
        }
        const width = Number(td?.width) || Number(cfg.width) || Number(settings.width) || 100;
        const length = Number(td?.length) || Number(td?.depth) || Number(cfg.length) || Number(settings.length) || Number(settings.depth) || width;
        const source = new Float32Array(count);
        if (raw?.length === count) source.set(raw); else for (let i=0;i<count;i++) source[i] = pos.getY(i);
        if (!ud.maskData || ud.maskData.length !== count) ud.maskData = new Float32Array(count).fill(1);
        return {
            terrain, terrainData: td, userData: ud, width, length, sizeX, sizeZ, count,
            cellSizeX: width / Math.max(1,sizeX-1), cellSizeZ: length / Math.max(1,sizeZ-1),
            seed: Number(ud.terrainSeed) || Number(settings.seed) || Number(cfg.seed) || 1337,
            baseHeights: source, maskData: ud.maskData,
            index(x,z){return z*sizeX+x;},
            worldX(x){return (x/Math.max(1,sizeX-1)-0.5)*width;}, worldZ(z){return (z/Math.max(1,sizeZ-1)-0.5)*length;},
            gridX(wx){return (wx/width+0.5)*(sizeX-1);}, gridZ(wz){return (wz/length+0.5)*(sizeZ-1);}
        };
    }

    const ValueType = Object.freeze({ HEIGHT:'height', MASK:'mask', SCALAR:'scalar', ANY:'any' });

    class BaseTerrainNode {
        constructor(o = {}) {
            this.id = o.id || uid('terrain-node'); this.type = o.type || this.constructor.type || this.constructor.name;
            this.name = o.name || this.constructor.label || this.type; this.category = o.category || this.constructor.category || 'filter';
            this.params = { ...(o.defaultParams || {}), ...(o.params || {}) }; this.paramSchema = { ...(o.paramSchema || {}) };
            this.inputs = { ...(o.inputs || {}) }; this.outputs = { ...(o.outputs || {height:{type:ValueType.HEIGHT}}) };
            this.enabled = o.enabled !== false; this.x = Number(o.x)||0; this.y = Number(o.y)||0; this.userData = { ...(o.userData||{}) };
        }
        getParamKeys(){return Object.keys(this.params);}
        getSignature(){const p={}; Object.keys(this.params).sort().forEach(k=>p[k]=this.params[k]); return JSON.stringify({type:this.type,enabled:this.enabled,params:p});}
        getInput(inputs,name,fallback=null){return inputs && inputs[name]!==undefined ? inputs[name] : fallback;}
        getHeightInput(inputs,name,ctx,fallback=true){const v=this.getInput(inputs,name,null); return v instanceof Float32Array && v.length===ctx.count ? v : fallback ? ctx.baseHeights : null;}
        getMaskInput(inputs,name,ctx,fallback=1){const v=this.getInput(inputs,name,null); if(v instanceof Float32Array&&v.length===ctx.count)return v; return new Float32Array(ctx.count).fill(clamp01(fallback));}
        evaluate(ctx,inputs={}){return {height:new Float32Array(this.getHeightInput(inputs,'height',ctx,true))};}
        serialize(){return {id:this.id,type:this.type,name:this.name,params:{...this.params},enabled:this.enabled!==false,x:this.x,y:this.y,userData:{...this.userData}};}
    }

    Object.assign(NS,{uid,ValueType,FastSimplex2D,TerrainMath,createTerrainContext,BaseTerrainNode});
    global.BaseTerrainNode = global.BaseTerrainNode || BaseTerrainNode;
})(window);

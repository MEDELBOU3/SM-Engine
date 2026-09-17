// ============================================================================
// registry/utility.js v2 — Group IO, fields, math, vector, noise and inputs.
// ============================================================================
(function (global) {
    'use strict';

    const registry = global.getGeometryNodeRegistry?.();
    const Field = global.GeometryField;
    const F = global.FieldSystem;
    if (!registry || !Field || !F) return;

    registry.register({
        type: 'Geometry_Input',
        displayName: 'Group Input',
        category: 'Group',
        color: '#3f8f8f',
        inputs: [],
        outputs: [{ name: 'Geometry', type: 'geometry' }],
        isInput: true,
        evaluate: (v, ctx, node) => node.geometryOverride || ctx.globals.geometryNodeInput || null
    });

    registry.register({
        type: 'Geometry_Output',
        displayName: 'Group Output',
        category: 'Group',
        color: '#a96838',
        inputs: [
            { name: 'Geometry', type: 'geometry' },
            { name: 'Material', type: 'material', optional: true }
        ],
        outputs: [],
        isOutput: true
    });

    registry.registerMany([
        {
            type: 'Float', displayName: 'Value', category: 'Input', color: '#8a8a8a',
            inputs: [], outputs: [{ name: 'Value', type: 'float' }],
            widget: 'slider', defaultValue: 0.5,
            field: (v, node) => Number(node.value ?? .5) || 0
        },
        {
            type: 'Integer', displayName: 'Integer', category: 'Input', color: '#7187a6',
            inputs: [], outputs: [{ name: 'Integer', type: 'integer' }],
            widget: 'int', defaultValue: 1,
            field: (v, node) => Math.round(Number(node.value ?? 1) || 0)
        },
        {
            type: 'Boolean_Field', displayName: 'Boolean', category: 'Input', color: '#a55f5f',
            inputs: [], outputs: [{ name: 'Boolean', type: 'boolean' }],
            widget: 'bool', defaultValue: true,
            field: (v, node) => !!node.value
        },
        {
            type: 'Vector', displayName: 'Vector', category: 'Input', color: '#4d86b5',
            inputs: [
                { name: 'X', type: 'float', default: 0 },
                { name: 'Y', type: 'float', default: 0 },
                { name: 'Z', type: 'float', default: 0 }
            ],
            outputs: [{ name: 'Vector', type: 'vector' }],
            field: v => F.lift('vector', (x, y, z) => [Number(x)||0, Number(y)||0, Number(z)||0], v.X, v.Y, v.Z)
        },
        {
            type: 'Color', displayName: 'Color', category: 'Input', color: '#b59d45',
            inputs: [], outputs: [{ name: 'Color', type: 'color' }],
            widget: 'color', defaultValue: '#ffffff',
            field: (v, node) => node.value || '#ffffff'
        }
    ]);

    registry.register({
        type: 'Position',
        displayName: 'Position',
        category: 'Input',
        color: '#7c5b9c',
        inputs: [],
        outputs: [{ name: 'Position', type: 'vector', domain: 'POINT' }],
        field: () => new Field('vector', ctx => Array.isArray(ctx.position) ? [...ctx.position] : [0,0,0], {
            label: 'Position', domain: 'POINT'
        })
    });

    registry.register({
        type: 'Normal',
        displayName: 'Normal',
        category: 'Input',
        color: '#6b7ca8',
        inputs: [],
        outputs: [{ name: 'Normal', type: 'vector', domain: 'POINT' }],
        field: () => new Field('vector', ctx => Array.isArray(ctx.normal) ? [...ctx.normal] : [0,1,0], {
            label: 'Normal', domain: 'POINT'
        })
    });

    registry.register({
        type: 'Index',
        displayName: 'Index',
        category: 'Input',
        color: '#728a9f',
        inputs: [],
        outputs: [{ name: 'Index', type: 'integer' }],
        field: () => new Field('integer', ctx => Number(ctx.index) || 0, { label: 'Index' })
    });

    registry.register({
        type: 'ID',
        displayName: 'ID',
        category: 'Input',
        color: '#728a9f',
        inputs: [],
        outputs: [{ name: 'ID', type: 'integer' }],
        field: () => new Field('integer', ctx => Number(ctx.id ?? ctx.index) || 0, { label: 'ID' })
    });

    registry.register({
        type: 'Random_Value',
        displayName: 'Random Value',
        category: 'Utilities',
        color: '#678c78',
        inputs: [
            { name: 'Min', type: 'float', default: 0 },
            { name: 'Max', type: 'float', default: 1 },
            { name: 'Seed', type: 'integer', default: 0 }
        ],
        outputs: [{ name: 'Value', type: 'float' }],
        field: v => new Field('float', ctx => {
            const min = F.number(v.Min, 0, ctx);
            const max = F.number(v.Max, 1, ctx);
            const seed = F.number(v.Seed, 0, ctx);
            const r = F.hash(seed, ctx.id ?? ctx.index ?? 0);
            return min + (max - min) * r;
        }, { label: 'Random Value' })
    });

    registry.register({
        type: 'Noise',
        displayName: 'Noise',
        category: 'Utilities',
        color: '#4e8c7e',
        inputs: [
            { name: 'Vector', type: 'vector', default: null, optional: true },
            { name: 'Scale', type: 'float', default: 1, min: .001, max: 1000, step: .1 },
            { name: 'Detail', type: 'integer', default: 3, min: 1, max: 8, step: 1 },
            { name: 'Roughness', type: 'float', default: .5, min: 0, max: 1, step: .01 },
            { name: 'Seed', type: 'float', default: 0 }
        ],
        outputs: [{ name: 'Fac', type: 'float' }],
        field: v => new Field('float', ctx => {
            const source = v.Vector == null
                ? (ctx.position || [0,0,0])
                : F.vector(v.Vector, ctx.position || [0,0,0], ctx);
            const scale = Math.max(.0001, F.number(v.Scale, 1, ctx));
            const detail = Math.max(1, Math.min(8, Math.round(F.number(v.Detail, 3, ctx))));
            const rough = Math.max(0, Math.min(1, F.number(v.Roughness, .5, ctx)));
            const seed = F.number(v.Seed, 0, ctx);

            let amplitude = 1;
            let frequency = scale;
            let sum = 0;
            let total = 0;
            for (let octave = 0; octave < detail; octave++) {
                const n = F.noise3(source[0] * frequency, source[1] * frequency, source[2] * frequency, seed + octave * 13.1);
                sum += n * amplitude;
                total += amplitude;
                amplitude *= rough;
                frequency *= 2;
            }
            return total > 0 ? sum / total : 0;
        }, { label: 'Noise' })
    });

    registry.register({
        type: 'Math',
        displayName: 'Math',
        category: 'Utilities',
        color: '#a66c3a',
        inputs: [
            { name: 'A', type: 'float', default: 0 },
            { name: 'B', type: 'float', default: 0 },
            { name: 'Operation', type: 'enum', default: 'ADD',
              opts: ['ADD','SUBTRACT','MULTIPLY','DIVIDE','POWER','MINIMUM','MAXIMUM','ABSOLUTE','SINE','COSINE','FLOOR','MODULO'] }
        ],
        outputs: [{ name: 'Value', type: 'float' }],
        field: v => F.lift('float', (a, b) => mathOp(v.Operation, Number(a)||0, Number(b)||0), v.A, v.B)
    });

    registry.register({
        type: 'Vector_Math',
        displayName: 'Vector Math',
        category: 'Utilities',
        color: '#4a7ca8',
        inputs: [
            { name: 'A', type: 'vector', default: [0,0,0] },
            { name: 'B', type: 'vector', default: [0,0,0] },
            { name: 'Scale', type: 'float', default: 1 },
            { name: 'Operation', type: 'enum', default: 'ADD',
              opts: ['ADD','SUBTRACT','MULTIPLY','SCALE','NORMALIZE','CROSS','DOT','LENGTH','DISTANCE'] }
        ],
        outputs: [{ name: 'Vector', type: 'vector' }, { name: 'Value', type: 'float' }],
        hasMultipleOutputs: true,
        field: v => {
            const op = String(v.Operation || 'ADD');
            const vectorField = F.lift('vector', (a,b,s) => vectorOp(op, a,b,s).vector, v.A, v.B, v.Scale);
            const valueField = F.lift('float', (a,b,s) => vectorOp(op, a,b,s).value, v.A, v.B, v.Scale);
            return [vectorField, valueField];
        }
    });

    registry.register({
        type: 'Map_Range',
        displayName: 'Map Range',
        category: 'Utilities',
        color: '#568f83',
        inputs: [
            { name: 'Value', type: 'float', default: .5 },
            { name: 'From Min', type: 'float', default: 0 },
            { name: 'From Max', type: 'float', default: 1 },
            { name: 'To Min', type: 'float', default: 0 },
            { name: 'To Max', type: 'float', default: 1 },
            { name: 'Clamp', type: 'boolean', default: false }
        ],
        outputs: [{ name: 'Result', type: 'float' }],
        field: v => F.lift('float', (value, fmin, fmax, tmin, tmax, clamp) => {
            let t = fmax !== fmin ? (value - fmin) / (fmax - fmin) : 0;
            if (clamp) t = Math.max(0, Math.min(1, t));
            return tmin + (tmax - tmin) * t;
        }, v.Value, v['From Min'], v['From Max'], v['To Min'], v['To Max'], v.Clamp)
    });

    registry.register({
        type: 'Compare',
        displayName: 'Compare',
        category: 'Utilities',
        color: '#8b6b61',
        inputs: [
            { name: 'A', type: 'float', default: 0 },
            { name: 'B', type: 'float', default: 0 },
            { name: 'Operation', type: 'enum', default: 'GREATER_THAN',
              opts: ['GREATER_THAN','LESS_THAN','EQUAL','NOT_EQUAL','GREATER_EQUAL','LESS_EQUAL'] }
        ],
        outputs: [{ name: 'Result', type: 'boolean' }],
        field: v => F.lift('boolean', (a,b) => compare(v.Operation, Number(a)||0, Number(b)||0), v.A, v.B)
    });

    registry.register({
        type: 'Combine_XYZ',
        displayName: 'Combine XYZ',
        category: 'Utilities',
        color: '#5685ad',
        inputs: [
            { name: 'X', type: 'float', default: 0 },
            { name: 'Y', type: 'float', default: 0 },
            { name: 'Z', type: 'float', default: 0 }
        ],
        outputs: [{ name: 'Vector', type: 'vector' }],
        field: v => F.lift('vector', (x,y,z) => [Number(x)||0, Number(y)||0, Number(z)||0], v.X, v.Y, v.Z)
    });

    registry.register({
        type: 'Separate_XYZ',
        displayName: 'Separate XYZ',
        category: 'Utilities',
        color: '#5685ad',
        inputs: [{ name: 'Vector', type: 'vector', default: [0,0,0] }],
        outputs: [
            { name: 'X', type: 'float' },
            { name: 'Y', type: 'float' },
            { name: 'Z', type: 'float' }
        ],
        hasMultipleOutputs: true,
        field: v => {
            const x = F.lift('float', a => Array.isArray(a) ? Number(a[0])||0 : 0, v.Vector);
            const y = F.lift('float', a => Array.isArray(a) ? Number(a[1])||0 : 0, v.Vector);
            const z = F.lift('float', a => Array.isArray(a) ? Number(a[2])||0 : 0, v.Vector);
            return [x,y,z];
        }
    });

    registry.register({
        type: 'Scene_Time',
        displayName: 'Scene Time',
        category: 'Input',
        color: '#6e908f',
        inputs: [],
        outputs: [{ name: 'Seconds', type: 'float' }],
        dynamic: true,
        field: (v, node, ctx) => ctx.time
    });

    registry.register({
        type: 'Object_Info',
        displayName: 'Object Info',
        category: 'Input',
        color: '#a96b4d',
        inputs: [
            { name: 'Object Name', type: 'string', default: '' },
            { name: 'As Instance', type: 'boolean', default: false }
        ],
        outputs: [
            { name: 'Geometry', type: 'geometry' },
            { name: 'Location', type: 'vector' },
            { name: 'Rotation', type: 'rotation' },
            { name: 'Scale', type: 'vector' }
        ],
        evaluate: (v, ctx) => {
            const object = findObject(ctx.globals, v['Object Name']);
            if (!object?.isMesh) {
                return { __nodeOutputs: true, values: [global.GeometryData.empty(), [0,0,0],[0,0,0],[1,1,1]] };
            }
            const data = new global.GeometryData(object.geometry.clone(), { material: object.material });
            if (v['As Instance']) {
                const instanced = new global.GeometryData(null);
                instanced.addInstance({ data, matrix: object.matrixWorld.clone(), material: object.material });
                return { __nodeOutputs: true, values: [instanced, object.position.toArray(), radToDeg(object.rotation.toArray().slice(0,3)), object.scale.toArray()] };
            }
            return { __nodeOutputs: true, values: [data, object.position.toArray(), radToDeg(object.rotation.toArray().slice(0,3)), object.scale.toArray()] };
        }
    });

    function mathOp(op, a, b) {
        switch (op) {
            case 'SUBTRACT': return a - b;
            case 'MULTIPLY': return a * b;
            case 'DIVIDE': return b !== 0 ? a / b : 0;
            case 'POWER': return Math.pow(a, b);
            case 'MINIMUM': return Math.min(a, b);
            case 'MAXIMUM': return Math.max(a, b);
            case 'ABSOLUTE': return Math.abs(a);
            case 'SINE': return Math.sin(a);
            case 'COSINE': return Math.cos(a);
            case 'FLOOR': return Math.floor(a);
            case 'MODULO': return b !== 0 ? a % b : 0;
            default: return a + b;
        }
    }

    function vectorOp(op, a, b, scale) {
        a = Array.isArray(a) ? a : [0,0,0];
        b = Array.isArray(b) ? b : [0,0,0];
        const s = Number(scale) || 0;
        const av = [Number(a[0])||0, Number(a[1])||0, Number(a[2])||0];
        const bv = [Number(b[0])||0, Number(b[1])||0, Number(b[2])||0];

        if (op === 'SUBTRACT') return { vector: av.map((v,i)=>v-bv[i]), value: 0 };
        if (op === 'MULTIPLY') return { vector: av.map((v,i)=>v*bv[i]), value: 0 };
        if (op === 'SCALE') return { vector: av.map(v=>v*s), value: 0 };
        if (op === 'NORMALIZE') {
            const l = Math.hypot(...av) || 1;
            return { vector: av.map(v=>v/l), value: l };
        }
        if (op === 'CROSS') return {
            vector: [
                av[1]*bv[2]-av[2]*bv[1],
                av[2]*bv[0]-av[0]*bv[2],
                av[0]*bv[1]-av[1]*bv[0]
            ],
            value: 0
        };
        if (op === 'DOT') return { vector: [0,0,0], value: av[0]*bv[0]+av[1]*bv[1]+av[2]*bv[2] };
        if (op === 'LENGTH') return { vector: av, value: Math.hypot(...av) };
        if (op === 'DISTANCE') return { vector: av, value: Math.hypot(av[0]-bv[0], av[1]-bv[1], av[2]-bv[2]) };
        return { vector: av.map((v,i)=>v+bv[i]), value: 0 };
    }

    function compare(op, a, b) {
        if (op === 'LESS_THAN') return a < b;
        if (op === 'EQUAL') return Math.abs(a-b) < 1e-6;
        if (op === 'NOT_EQUAL') return Math.abs(a-b) >= 1e-6;
        if (op === 'GREATER_EQUAL') return a >= b;
        if (op === 'LESS_EQUAL') return a <= b;
        return a > b;
    }

    function findObject(g, name) {
        if (!name) return g.selectedObject?.isMesh ? g.selectedObject : null;
        return g.scene?.getObjectByName?.(name) || null;
    }

    function radToDeg(v) {
        return v.map(x => (Number(x)||0) * 180 / Math.PI);
    }
})(typeof window !== 'undefined' ? window : globalThis);
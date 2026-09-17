// ============================================================================
// registry/curve.js v2 — curve creation and conversion nodes.
// ============================================================================
(function (global) {
    'use strict';

    const registry = global.getGeometryNodeRegistry?.();
    const THREE = global.THREE;
    const ops = global.GeometryOps;
    if (!registry || !THREE || !ops) return;

    registry.register({
        type: 'Curve_Line',
        displayName: 'Curve Line',
        category: 'Curve Primitives',
        color: '#9a6f50',
        inputs: [
            { name: 'Start', type: 'vector', default: [0,0,0] },
            { name: 'End', type: 'vector', default: [0,0,2] }
        ],
        outputs: [{ name: 'Curve', type: 'geometry' }],
        create: v => {
            const d = new global.GeometryData(null);
            d.addCurve(new global.CurveData([new THREE.Vector3(...vec(v.Start)), new THREE.Vector3(...vec(v.End))]));
            return d;
        }
    });

    registry.register({
        type: 'Curve_Circle',
        displayName: 'Curve Circle',
        category: 'Curve Primitives',
        color: '#9a6f50',
        inputs: [
            { name: 'Radius', type: 'float', default: 1, min: .001, max: 100, step: .05 },
            { name: 'Resolution', type: 'integer', default: 32, min: 3, max: 512, step: 1 }
        ],
        outputs: [{ name: 'Curve', type: 'geometry' }],
        create: v => {
            const radius = Math.max(.001, Number(v.Radius) || 1);
            const count = Math.max(3, Math.round(Number(v.Resolution) || 32));
            const points = [];
            for (let i = 0; i < count; i++) {
                const a = i / count * Math.PI * 2;
                points.push(new THREE.Vector3(Math.cos(a)*radius, Math.sin(a)*radius, 0));
            }
            const d = new global.GeometryData(null);
            d.addCurve(new global.CurveData(points, { cyclic: true, radius: .1 }));
            return d;
        }
    });

    registry.register({
        type: 'Bezier_Curve',
        displayName: 'Bezier Curve',
        category: 'Curve Primitives',
        color: '#9a6f50',
        inputs: [
            { name: 'Start', type: 'vector', default: [-1,0,0] },
            { name: 'Control 1', type: 'vector', default: [-.5,1,0] },
            { name: 'Control 2', type: 'vector', default: [.5,1,0] },
            { name: 'End', type: 'vector', default: [1,0,0] },
            { name: 'Resolution', type: 'integer', default: 24, min: 2, max: 512, step: 1 }
        ],
        outputs: [{ name: 'Curve', type: 'geometry' }],
        create: v => {
            const c = new THREE.CubicBezierCurve3(
                new THREE.Vector3(...vec(v.Start)),
                new THREE.Vector3(...vec(v['Control 1'])),
                new THREE.Vector3(...vec(v['Control 2'])),
                new THREE.Vector3(...vec(v.End))
            );
            const d = new global.GeometryData(null);
            d.addCurve(new global.CurveData(c.getPoints(Math.max(2, Math.round(Number(v.Resolution) || 24)))));
            return d;
        }
    });

    registry.register({
        type: 'Resample_Curve',
        displayName: 'Resample Curve',
        category: 'Curve',
        color: '#8a6b59',
        inputs: [
            { name: 'Curve', type: 'geometry' },
            { name: 'Count', type: 'integer', default: 16, min: 2, max: 512, step: 1 }
        ],
        outputs: [{ name: 'Curve', type: 'geometry' }],
        primaryInput: 'Curve',
        apply: (g, v) => ops.resampleCurves(g, v.Count)
    });

    registry.register({
        type: 'Curve_To_Mesh',
        displayName: 'Curve to Mesh',
        category: 'Curve',
        color: '#7b6659',
        inputs: [
            { name: 'Curve', type: 'geometry' },
            { name: 'Radius', type: 'float', default: .1, min: .001, max: 10, step: .01 },
            { name: 'Profile Resolution', type: 'integer', default: 8, min: 3, max: 64, step: 1 }
        ],
        outputs: [{ name: 'Mesh', type: 'geometry' }],
        evaluate: v => ops.curveToMesh(v.Curve, v.Radius, v['Profile Resolution'])
    });

    function vec(v) {
        return Array.isArray(v) ? [Number(v[0])||0, Number(v[1])||0, Number(v[2])||0] : [0,0,0];
    }
})(typeof window !== 'undefined' ? window : globalThis);
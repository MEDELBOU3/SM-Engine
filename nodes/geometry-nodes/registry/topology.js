// ============================================================================
// registry/topology.js v2 — topology inspection fields.
// ============================================================================
(function (global) {
    'use strict';

    const registry = global.getGeometryNodeRegistry?.();
    const Field = global.GeometryField;
    if (!registry || !Field) return;

    registry.register({
        type: 'Face_Area',
        displayName: 'Face Area',
        category: 'Mesh Read',
        color: '#647c8d',
        inputs: [],
        outputs: [{ name: 'Area', type: 'float', domain: 'FACE' }],
        field: () => new Field('float', ctx => {
            const g = ctx.geometry;
            const faceIndex = ctx.index ?? 0;
            if (!g?.index || !g.getAttribute?.('position')) return 0;
            const idx = g.index.array;
            const p = g.getAttribute('position');
            const base = faceIndex * 3;
            if (base + 2 >= idx.length) return 0;
            const a = new global.THREE.Vector3().fromBufferAttribute(p, idx[base]);
            const b = new global.THREE.Vector3().fromBufferAttribute(p, idx[base + 1]);
            const c = new global.THREE.Vector3().fromBufferAttribute(p, idx[base + 2]);
            return new global.THREE.Triangle(a,b,c).getArea();
        }, { label: 'Face Area', domain: 'FACE' })
    });

    registry.register({
        type: 'Vertex_Count',
        displayName: 'Vertex Count',
        category: 'Mesh Read',
        color: '#647c8d',
        inputs: [{ name: 'Geometry', type: 'geometry' }],
        outputs: [{ name: 'Count', type: 'integer' }],
        evaluate: v => global.GeometryData.from(v.Geometry).geometry?.getAttribute?.('position')?.count || 0
    });

    registry.register({
        type: 'Instance_Count',
        displayName: 'Instance Count',
        category: 'Instance Read',
        color: '#647c8d',
        inputs: [{ name: 'Geometry', type: 'geometry' }],
        outputs: [{ name: 'Count', type: 'integer' }],
        evaluate: v => global.GeometryData.from(v.Geometry).instances.length
    });
})(typeof window !== 'undefined' ? window : globalThis);
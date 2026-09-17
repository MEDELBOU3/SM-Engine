// ============================================================================
// registry/modify.js v2 — topology and mesh modification nodes.
// ============================================================================
(function (global) {
    'use strict';

    const registry = global.getGeometryNodeRegistry?.();
    const ops = global.GeometryOps;
    if (!registry || !ops) return;

    registry.registerMany([
        {
            type: 'Merge',
            displayName: 'Merge by Distance',
            category: 'Mesh',
            color: '#775f91',
            inputs: [
                { name: 'Geometry', type: 'geometry' },
                { name: 'Distance', type: 'float', default: 0.001, min: 0, max: 1, step: 0.0001 }
            ],
            outputs: [{ name: 'Geometry', type: 'geometry' }],
            apply: (g, v) => ops.mergeVertices(g, Math.max(0, Number(v.Distance) || 0))
        },
        {
            type: 'Subdivide',
            displayName: 'Subdivide Mesh',
            category: 'Mesh',
            color: '#5b8a6d',
            inputs: [
                { name: 'Geometry', type: 'geometry' },
                { name: 'Level', type: 'integer', default: 1, min: 0, max: 5, step: 1 }
            ],
            outputs: [{ name: 'Geometry', type: 'geometry' }],
            apply: (g, v) => ops.subdivideMesh(g, Math.max(0, Math.min(5, Math.round(Number(v.Level) || 0))))
        },
        {
            type: 'Extrude',
            displayName: 'Extrude Mesh',
            category: 'Mesh',
            color: '#a85f52',
            inputs: [
                { name: 'Geometry', type: 'geometry' },
                { name: 'Selection', type: 'boolean', default: true, domain: 'FACE' },
                { name: 'Offset Scale', type: 'float', default: 0.5, min: -100, max: 100, step: .05, domain: 'FACE' }
            ],
            outputs: [{ name: 'Mesh', type: 'geometry' }],
            apply: (g, v) => ops.extrudeMesh(g, v['Offset Scale'], v.Selection)
        },
        {
            type: 'Solidify',
            displayName: 'Solidify',
            category: 'Mesh',
            color: '#5266a1',
            inputs: [
                { name: 'Geometry', type: 'geometry' },
                { name: 'Thickness', type: 'float', default: 0.1, min: -10, max: 10, step: .01 }
            ],
            outputs: [{ name: 'Geometry', type: 'geometry' }],
            apply: (g, v) => ops.solidifyGeometry(g, Number(v.Thickness) || 0)
        },
        {
            type: 'Displace',
            displayName: 'Displace',
            category: 'Geometry',
            color: '#4f83ae',
            inputs: [
                { name: 'Geometry', type: 'geometry' },
                { name: 'Selection', type: 'boolean', default: true, domain: 'POINT' },
                { name: 'Strength', type: 'float', default: 0.3, min: -20, max: 20, step: .05, domain: 'POINT' },
                { name: 'Scale', type: 'float', default: 1, min: .001, max: 100, step: .1, domain: 'POINT' },
                { name: 'Seed', type: 'float', default: 0, min: -10000, max: 10000, step: 1 }
            ],
            outputs: [{ name: 'Geometry', type: 'geometry' }],
            apply: (g, v) => ops.displaceGeometry(g, v.Strength, v.Scale, v.Seed, v.Selection)
        },
        {
            type: 'Delete_Geometry',
            displayName: 'Delete Geometry',
            category: 'Geometry',
            color: '#8d5d5d',
            inputs: [
                { name: 'Geometry', type: 'geometry' },
                { name: 'Selection', type: 'boolean', default: false },
                { name: 'Domain', type: 'enum', default: 'FACE', opts: ['POINT', 'FACE'] }
            ],
            outputs: [{ name: 'Geometry', type: 'geometry' }],
            apply: (g, v) => ops.deleteGeometry(g, v.Selection, v.Domain)
        },
        {
            type: 'Separate_Geometry',
            displayName: 'Separate Geometry',
            category: 'Geometry',
            color: '#7a657f',
            inputs: [
                { name: 'Geometry', type: 'geometry' },
                { name: 'Selection', type: 'boolean', default: false },
                { name: 'Domain', type: 'enum', default: 'FACE', opts: ['POINT', 'FACE'] }
            ],
            outputs: [
                { name: 'Selection', type: 'geometry' },
                { name: 'Inverted', type: 'geometry' }
            ],
            evaluate: v => {
                const result = ops.separateGeometry(v.Geometry, v.Selection, v.Domain);
                return { __nodeOutputs: true, values: result };
            }
        },
        {
            type: 'Join',
            displayName: 'Join Geometry',
            category: 'Geometry',
            color: '#768a50',
            inputs: [
                { name: 'Geometry A', type: 'geometry' },
                { name: 'Geometry B', type: 'geometry' }
            ],
            outputs: [{ name: 'Geometry', type: 'geometry' }],
            evaluate: v => ops.mergeGeometries([v['Geometry A'], v['Geometry B']])
        },
        {
            type: 'Array',
            displayName: 'Array',
            category: 'Geometry',
            color: '#478d8d',
            inputs: [
                { name: 'Geometry', type: 'geometry' },
                { name: 'Count', type: 'integer', default: 3, min: 1, max: 1000, step: 1 },
                { name: 'Offset', type: 'vector', default: [2,0,0] }
            ],
            outputs: [{ name: 'Geometry', type: 'geometry' }],
            apply: (g, v) => ops.arrayGeometry(g, v.Count, v.Offset)
        },
        {
            type: 'Triangulate',
            displayName: 'Triangulate',
            category: 'Mesh',
            color: '#907b4d',
            inputs: [{ name: 'Geometry', type: 'geometry' }],
            outputs: [{ name: 'Geometry', type: 'geometry' }],
            apply: g => ops.triangulateGeometry(g)
        },
        {
            type: 'Reverse',
            displayName: 'Flip Faces',
            category: 'Mesh',
            color: '#777777',
            inputs: [{ name: 'Geometry', type: 'geometry' }],
            outputs: [{ name: 'Geometry', type: 'geometry' }],
            apply: g => ops.reverseWinding(g)
        },
        {
            type: 'Boolean',
            displayName: 'Mesh Boolean',
            category: 'Mesh',
            color: '#a94a43',
            inputs: [
                { name: 'Mesh 1', type: 'geometry' },
                { name: 'Mesh 2', type: 'geometry' },
                { name: 'Operation', type: 'enum', default: 'DIFFERENCE', opts: ['DIFFERENCE', 'UNION', 'INTERSECT'] }
            ],
            outputs: [{ name: 'Mesh', type: 'geometry' }],
            evaluate: v => ops.booleanGeometries(
                v['Mesh 1'],
                v['Mesh 2'],
                String(v.Operation || 'DIFFERENCE').toLowerCase()
            )
        },
        {
            type: 'Reroute',
            displayName: 'Reroute',
            category: 'Layout',
            color: '#777f87',
            inputs: [{ name: 'Input', type: 'any' }],
            outputs: [{ name: 'Output', type: 'any' }],
            evaluate: v => v.Input,
            isReroute: true,
            noHeader: true,
            w: 70
        }
    ]);
})(typeof window !== 'undefined' ? window : globalThis);
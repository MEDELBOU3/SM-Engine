// ============================================================================
// registry/transform.js v2 — geometry and field-aware transform nodes.
// ============================================================================
(function (global) {
    'use strict';

    const registry = global.getGeometryNodeRegistry?.();
    const ops = global.GeometryOps;
    if (!registry || !ops) return;

    registry.registerMany([
        {
            type: 'Transform',
            displayName: 'Transform Geometry',
            category: 'Geometry',
            color: '#4f6090',
            inputs: [
                { name: 'Geometry', type: 'geometry' },
                { name: 'Translation', type: 'vector', default: [0,0,0] },
                { name: 'Rotation', type: 'rotation', default: [0,0,0] },
                { name: 'Scale', type: 'vector', default: [1,1,1] }
            ],
            outputs: [{ name: 'Geometry', type: 'geometry' }],
            apply: (g, v) => ops.transformGeometry(g, v.Translation, v.Rotation, v.Scale)
        },
        {
            type: 'Set_Position',
            displayName: 'Set Position',
            category: 'Geometry',
            color: '#4f7fbf',
            inputs: [
                { name: 'Geometry', type: 'geometry' },
                { name: 'Selection', type: 'boolean', default: true, domain: 'POINT' },
                { name: 'Position', type: 'vector', default: null, optional: true, domain: 'POINT' },
                { name: 'Offset', type: 'vector', default: [0,0,0], domain: 'POINT' }
            ],
            outputs: [{ name: 'Geometry', type: 'geometry' }],
            apply: (g, v) => ops.setPosition(g, v.Position, v.Offset, v.Selection)
        },
        {
            type: 'Translate_Instances',
            displayName: 'Translate Instances',
            category: 'Instances',
            color: '#5d6d8d',
            inputs: [
                { name: 'Instances', type: 'geometry' },
                { name: 'Translation', type: 'vector', default: [0,0,0], domain: 'INSTANCE' }
            ],
            outputs: [{ name: 'Instances', type: 'geometry' }],
            primaryInput: 'Instances',
            apply: (g, v) => ops.transformInstances(g, v.Translation, [0,0,0], [1,1,1])
        },
        {
            type: 'Rotate_Instances',
            displayName: 'Rotate Instances',
            category: 'Instances',
            color: '#6f5d8d',
            inputs: [
                { name: 'Instances', type: 'geometry' },
                { name: 'Rotation', type: 'rotation', default: [0,0,0], domain: 'INSTANCE' }
            ],
            outputs: [{ name: 'Instances', type: 'geometry' }],
            primaryInput: 'Instances',
            apply: (g, v) => ops.transformInstances(g, [0,0,0], v.Rotation, [1,1,1])
        },
        {
            type: 'Scale_Instances',
            displayName: 'Scale Instances',
            category: 'Instances',
            color: '#5f7d5f',
            inputs: [
                { name: 'Instances', type: 'geometry' },
                { name: 'Scale', type: 'vector', default: [1,1,1], domain: 'INSTANCE' }
            ],
            outputs: [{ name: 'Instances', type: 'geometry' }],
            primaryInput: 'Instances',
            apply: (g, v) => ops.transformInstances(g, [0,0,0], [0,0,0], v.Scale)
        }
    ]);
})(typeof window !== 'undefined' ? window : globalThis);
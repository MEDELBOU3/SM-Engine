// ============================================================================
// registry/instances.js v2 — Blender-style points / instance nodes.
// ============================================================================
(function (global) {
    'use strict';

    const registry = global.getGeometryNodeRegistry?.();
    const ops = global.GeometryOps;
    if (!registry || !ops) return;


    registry.register({
        type: 'Mesh_To_Points',
        displayName: 'Mesh to Points',
        category: 'Points',
        color: '#6d805c',
        inputs: [
            { name: 'Mesh', type: 'geometry' },
            { name: 'Radius', type: 'float', default: 0.1, min: 0.001, max: 100, step: 0.01 }
        ],
        outputs: [{ name: 'Points', type: 'geometry' }],
        evaluate: v => ops.meshToPoints(v.Mesh, v.Radius)
    });

    registry.register({
        type: 'Distribute_Points_On_Faces',
        displayName: 'Distribute Points on Faces',
        category: 'Points',
        color: '#6a7f54',
        inputs: [
            { name: 'Mesh', type: 'geometry' },
            { name: 'Selection', type: 'boolean', default: true, domain: 'FACE' },
            { name: 'Density', type: 'float', default: 10, min: 0, max: 10000, step: 1, domain: 'FACE' },
            { name: 'Seed', type: 'integer', default: 0 }
        ],
        outputs: [{ name: 'Points', type: 'geometry' }],
        evaluate: v => ops.distributePointsOnFaces(v.Mesh, v.Density, v.Seed, v.Selection)
    });

    registry.register({
        type: 'Instance_On_Points',
        displayName: 'Instance on Points',
        category: 'Instances',
        color: '#6a6f9a',
        inputs: [
            { name: 'Points', type: 'geometry' },
            { name: 'Selection', type: 'boolean', default: true, domain: 'POINT' },
            { name: 'Instance', type: 'geometry' },
            { name: 'Rotation', type: 'rotation', default: [0,0,0], domain: 'POINT' },
            { name: 'Scale', type: 'vector', default: [1,1,1], domain: 'POINT' }
        ],
        outputs: [{ name: 'Instances', type: 'geometry' }],
        evaluate: v => ops.instanceOnPoints(v.Points, v.Instance, v.Scale, v.Rotation, v.Selection)
    });

    registry.register({
        type: 'Realize_Instances',
        displayName: 'Realize Instances',
        category: 'Instances',
        color: '#596d8b',
        inputs: [{ name: 'Geometry', type: 'geometry' }],
        outputs: [{ name: 'Geometry', type: 'geometry' }],
        apply: g => ops.realizeInstances(g)
    });
})(typeof window !== 'undefined' ? window : globalThis);
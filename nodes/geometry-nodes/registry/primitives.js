// ============================================================================
// registry/primitives.js v2 — mesh primitive generator nodes.
// ============================================================================
(function (global) {
    'use strict';

    const registry = global.getGeometryNodeRegistry?.();
    const THREE = global.THREE;
    if (!registry || !THREE) return;

    const geo = g => new global.GeometryData(g);

    registry.registerMany([
        {
            type: 'Cube', displayName: 'Cube', category: 'Mesh Primitives', color: '#3f7f93',
            inputs: [
                { name: 'Size', type: 'vector', default: [2, 2, 2] },
                { name: 'Vertices X', type: 'integer', default: 2, min: 2, max: 128, step: 1 },
                { name: 'Vertices Y', type: 'integer', default: 2, min: 2, max: 128, step: 1 },
                { name: 'Vertices Z', type: 'integer', default: 2, min: 2, max: 128, step: 1 }
            ],
            outputs: [{ name: 'Mesh', type: 'geometry' }],
            create: v => {
                const s = vec(v.Size, [2,2,2]);
                return geo(new THREE.BoxGeometry(
                    Math.max(.001, s[0]), Math.max(.001, s[1]), Math.max(.001, s[2]),
                    Math.max(1, Math.round((v['Vertices X'] ?? 2) - 1)),
                    Math.max(1, Math.round((v['Vertices Y'] ?? 2) - 1)),
                    Math.max(1, Math.round((v['Vertices Z'] ?? 2) - 1))
                ));
            }
        },
        {
            type: 'Grid', displayName: 'Grid', category: 'Mesh Primitives', color: '#4f8f85',
            inputs: [
                { name: 'Size X', type: 'float', default: 10, min: .01, max: 1000, step: .1 },
                { name: 'Size Y', type: 'float', default: 10, min: .01, max: 1000, step: .1 },
                { name: 'Vertices X', type: 'integer', default: 16, min: 2, max: 512, step: 1 },
                { name: 'Vertices Y', type: 'integer', default: 16, min: 2, max: 512, step: 1 }
            ],
            outputs: [{ name: 'Mesh', type: 'geometry' }],
            create: v => geo(new THREE.PlaneGeometry(
                Math.max(.01, Number(v['Size X']) || 10),
                Math.max(.01, Number(v['Size Y']) || 10),
                Math.max(1, Math.round((Number(v['Vertices X']) || 16) - 1)),
                Math.max(1, Math.round((Number(v['Vertices Y']) || 16) - 1))
            ))
        },
        {
            type: 'Plane', displayName: 'Plane', category: 'Mesh Primitives', color: '#5f8f7f',
            inputs: [
                { name: 'Size', type: 'float', default: 2, min: .001, max: 1000, step: .1 },
                { name: 'Vertices X', type: 'integer', default: 2, min: 2, max: 512, step: 1 },
                { name: 'Vertices Y', type: 'integer', default: 2, min: 2, max: 512, step: 1 }
            ],
            outputs: [{ name: 'Mesh', type: 'geometry' }],
            create: v => geo(new THREE.PlaneGeometry(
                Math.max(.001, Number(v.Size) || 2),
                Math.max(.001, Number(v.Size) || 2),
                Math.max(1, Math.round((Number(v['Vertices X']) || 2) - 1)),
                Math.max(1, Math.round((Number(v['Vertices Y']) || 2) - 1))
            ))
        },
        {
            type: 'Sphere', displayName: 'UV Sphere', category: 'Mesh Primitives', color: '#3f8f8f',
            inputs: [
                { name: 'Radius', type: 'float', default: 1, min: .001, max: 100, step: .05 },
                { name: 'Segments', type: 'integer', default: 32, min: 3, max: 256, step: 1 },
                { name: 'Rings', type: 'integer', default: 16, min: 2, max: 128, step: 1 }
            ],
            outputs: [{ name: 'Mesh', type: 'geometry' }],
            create: v => geo(new THREE.SphereGeometry(
                Math.max(.001, Number(v.Radius) || 1),
                Math.max(3, Math.round(Number(v.Segments) || 32)),
                Math.max(2, Math.round(Number(v.Rings) || 16))
            ))
        },
        {
            type: 'Icosphere', displayName: 'Ico Sphere', category: 'Mesh Primitives', color: '#4a985e',
            inputs: [
                { name: 'Radius', type: 'float', default: 1, min: .001, max: 100, step: .05 },
                { name: 'Subdivisions', type: 'integer', default: 2, min: 0, max: 6, step: 1 }
            ],
            outputs: [{ name: 'Mesh', type: 'geometry' }],
            create: v => geo(new THREE.IcosahedronGeometry(
                Math.max(.001, Number(v.Radius) || 1),
                Math.max(0, Math.min(6, Math.round(Number(v.Subdivisions) || 0)))
            ))
        },
        {
            type: 'Cylinder', displayName: 'Cylinder', category: 'Mesh Primitives', color: '#9a873d',
            inputs: [
                { name: 'Radius', type: 'float', default: 1, min: 0, max: 100, step: .05 },
                { name: 'Depth', type: 'float', default: 2, min: .001, max: 100, step: .05 },
                { name: 'Vertices', type: 'integer', default: 32, min: 3, max: 256, step: 1 }
            ],
            outputs: [{ name: 'Mesh', type: 'geometry' }],
            create: v => geo(new THREE.CylinderGeometry(
                Math.max(0, Number(v.Radius) || 0),
                Math.max(0, Number(v.Radius) || 0),
                Math.max(.001, Number(v.Depth) || 2),
                Math.max(3, Math.round(Number(v.Vertices) || 32))
            ))
        },
        {
            type: 'Cone', displayName: 'Cone', category: 'Mesh Primitives', color: '#a06740',
            inputs: [
                { name: 'Radius Top', type: 'float', default: 0, min: 0, max: 100, step: .05 },
                { name: 'Radius Bottom', type: 'float', default: 1, min: 0, max: 100, step: .05 },
                { name: 'Depth', type: 'float', default: 2, min: .001, max: 100, step: .05 },
                { name: 'Vertices', type: 'integer', default: 32, min: 3, max: 256, step: 1 }
            ],
            outputs: [{ name: 'Mesh', type: 'geometry' }],
            create: v => geo(new THREE.CylinderGeometry(
                Math.max(0, Number(v['Radius Top']) || 0),
                Math.max(0, Number(v['Radius Bottom']) || 0),
                Math.max(.001, Number(v.Depth) || 2),
                Math.max(3, Math.round(Number(v.Vertices) || 32))
            ))
        },
        {
            type: 'Torus', displayName: 'Torus', category: 'Mesh Primitives', color: '#875087',
            inputs: [
                { name: 'Major Radius', type: 'float', default: 1, min: .001, max: 100, step: .05 },
                { name: 'Minor Radius', type: 'float', default: .25, min: .001, max: 50, step: .02 },
                { name: 'Major Segments', type: 'integer', default: 48, min: 3, max: 512, step: 1 },
                { name: 'Minor Segments', type: 'integer', default: 12, min: 3, max: 128, step: 1 }
            ],
            outputs: [{ name: 'Mesh', type: 'geometry' }],
            create: v => geo(new THREE.TorusGeometry(
                Math.max(.001, Number(v['Major Radius']) || 1),
                Math.max(.001, Number(v['Minor Radius']) || .25),
                Math.max(3, Math.round(Number(v['Minor Segments']) || 12)),
                Math.max(3, Math.round(Number(v['Major Segments']) || 48))
            ))
        },
        {
            type: 'Circle', displayName: 'Mesh Circle', category: 'Mesh Primitives', color: '#8585ad',
            inputs: [
                { name: 'Radius', type: 'float', default: 1, min: .001, max: 100, step: .05 },
                { name: 'Vertices', type: 'integer', default: 32, min: 3, max: 512, step: 1 }
            ],
            outputs: [{ name: 'Mesh', type: 'geometry' }],
            create: v => geo(new THREE.CircleGeometry(
                Math.max(.001, Number(v.Radius) || 1),
                Math.max(3, Math.round(Number(v.Vertices) || 32))
            ))
        }
    ]);

    function vec(v, fallback) {
        return Array.isArray(v)
            ? [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0]
            : [...fallback];
    }
})(typeof window !== 'undefined' ? window : globalThis);
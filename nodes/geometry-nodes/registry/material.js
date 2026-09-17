// ============================================================================
// registry/material.js v2 — material payload and Set Material nodes.
// ============================================================================
(function (global) {
    'use strict';

    const registry = global.getGeometryNodeRegistry?.();
    if (!registry) return;

    registry.register({
        type: 'Material',
        displayName: 'Material',
        category: 'Material',
        color: '#965e9c',
        inputs: [
            { name: 'Base Color', type: 'color', default: '#8e8e8e' },
            { name: 'Roughness', type: 'float', default: 0.5, min: 0, max: 1, step: .01 },
            { name: 'Metallic', type: 'float', default: 0, min: 0, max: 1, step: .01 },
            { name: 'Opacity', type: 'float', default: 1, min: 0, max: 1, step: .01 }
        ],
        outputs: [{ name: 'Material', type: 'material' }],
        field: v => ({
            __mat: true,
            color: normalizeColor(v['Base Color']),
            roughness: clamp01(v.Roughness, .5),
            metalness: clamp01(v.Metallic, 0),
            opacity: clamp01(v.Opacity, 1)
        })
    });

    registry.register({
        type: 'Set_Material',
        displayName: 'Set Material',
        category: 'Material',
        color: '#86558d',
        inputs: [
            { name: 'Geometry', type: 'geometry' },
            { name: 'Material', type: 'material' }
        ],
        outputs: [{ name: 'Geometry', type: 'geometry' }],
        apply: (g, v) => {
            const out = global.GeometryData.from(g).clone();
            out.material = v.Material || null;
            return out;
        }
    });

    function normalizeColor(value) {
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) {
            const to255 = n => Math.max(0, Math.min(255, Math.round((Number(n) || 0) * 255)));
            return '#' + value.slice(0, 3).map(v => to255(v).toString(16).padStart(2, '0')).join('');
        }
        return '#8e8e8e';
    }

    function clamp01(v, fallback) {
        const n = Number(v);
        return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
    }
})(typeof window !== 'undefined' ? window : globalThis);
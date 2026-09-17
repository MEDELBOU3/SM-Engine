// ============================================================================
// registry/attributes.js v2 — lightweight named attribute nodes.
// ============================================================================
(function (global) {
    'use strict';

    const registry = global.getGeometryNodeRegistry?.();
    const Field = global.GeometryField;
    if (!registry || !Field) return;

    registry.register({
        type: 'Store_Named_Attribute',
        displayName: 'Store Named Attribute',
        category: 'Attributes',
        color: '#6f6f9b',
        inputs: [
            { name: 'Geometry', type: 'geometry' },
            { name: 'Name', type: 'string', default: 'attribute' },
            { name: 'Domain', type: 'enum', default: 'POINT', opts: ['POINT','FACE','INSTANCE'] },
            { name: 'Value', type: 'any', default: 0 }
        ],
        outputs: [{ name: 'Geometry', type: 'geometry' }],
        apply: (g, v) => {
            const d = global.GeometryData.from(g).clone();
            const name = String(v.Name || 'attribute');
            const domain = String(v.Domain || 'POINT').toUpperCase();
            d.setAttribute(name, domain, v.Value);
            return d;
        }
    });

    registry.register({
        type: 'Named_Attribute',
        displayName: 'Named Attribute',
        category: 'Attributes',
        color: '#6f6f9b',
        inputs: [
            { name: 'Name', type: 'string', default: 'attribute' },
            { name: 'Domain', type: 'enum', default: 'POINT', opts: ['POINT','FACE','INSTANCE'] }
        ],
        outputs: [{ name: 'Attribute', type: 'any' }],
        field: v => new Field('any', ctx => {
            const d = ctx.geometryData;
            const attr = d?.getAttribute?.(String(v.Name || 'attribute'), String(v.Domain || 'POINT'));
            if (Array.isArray(attr) || ArrayBuffer.isView(attr)) return attr[ctx.index] ?? 0;
            return attr ?? 0;
        }, { label: 'Named Attribute', domain: String(v.Domain || 'POINT') })
    });
})(typeof window !== 'undefined' ? window : globalThis);
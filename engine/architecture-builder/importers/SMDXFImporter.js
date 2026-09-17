// engine/architecture/importers/SMDXFImporter.js
// Lightweight ASCII DXF importer for LINE entities on semantic layers.
(function (global) {
    'use strict';

    class SMDXFImporter {
        static parse(text, options = {}) {
            const lines = String(text || '').replace(/\r/g, '').split('\n');
            const pairs = [];
            for (let i = 0; i < lines.length - 1; i += 2) {
                pairs.push({
                    code: Number(lines[i].trim()),
                    value: lines[i + 1].trim()
                });
            }

            const scale = Number(options.dxfUnitsToMeters ?? 1);
            const floor = {
                level: 0,
                elevation: 0,
                walls: [],
                rooms: [],
                columns: [],
                stairs: []
            };

            const entities = [];
            let current = null;
            for (const pair of pairs) {
                if (pair.code === 0) {
                    if (current) entities.push(current);
                    current = { type: pair.value, data: {} };
                    continue;
                }
                if (!current) continue;
                current.data[pair.code] = current.data[pair.code] ?? [];
                current.data[pair.code].push(pair.value);
            }
            if (current) entities.push(current);

            const layerName = (e) => String(e.data[8]?.[0] || '').toUpperCase();
            const val = (e, code, fallback = 0) => {
                const n = Number(e.data[code]?.[0]);
                return Number.isFinite(n) ? n : fallback;
            };

            for (const entity of entities) {
                const layer = layerName(entity);

                if (entity.type === 'LINE' && /WALL/.test(layer)) {
                    floor.walls.push({
                        id: `wall_${floor.walls.length + 1}`,
                        from: [val(entity, 10) * scale, val(entity, 20) * scale],
                        to: [val(entity, 11) * scale, val(entity, 21) * scale],
                        height: Number(options.wallHeight || 3.2),
                        thickness: Number(options.wallThickness || 0.22),
                        material: 'wall'
                    });
                }
            }

            return {
                version: 1,
                units: 'meters',
                building: {
                    name: options.name || 'DXF Building'
                },
                floors: [floor],
                roof: { enabled: false },
                metadata: {
                    source: 'dxf',
                    note: 'v1 importer reads LINE entities from WALL layers.'
                }
            };
        }
    }

    global.SMDXFImporter = SMDXFImporter;
})(typeof window !== 'undefined' ? window : globalThis);

// engine/architecture/importers/SMSVGFloorPlanImporter.js
// Semantic SVG importer. Prefer data-sm-* attributes over colors.
(function (global) {
    'use strict';

    class SMSVGFloorPlanImporter {
        static _num(value, fallback = 0) {
            const n = Number(value);
            return Number.isFinite(n) ? n : fallback;
        }

        static _parsePoints(value) {
            return String(value || '')
                .trim()
                .split(/\s+/)
                .map((chunk) => chunk.split(',').map(Number))
                .filter((p) => p.length >= 2 && p.every(Number.isFinite))
                .map((p) => [p[0], p[1]]);
        }

        static _type(el) {
            return String(
                el.getAttribute('data-sm-type') ||
                el.getAttribute('data-type') ||
                el.getAttribute('class') ||
                ''
            ).toLowerCase();
        }

        static parse(svgText, options = {}) {
            if (typeof DOMParser === 'undefined') {
                throw new Error('DOMParser is required for SVG floor-plan import.');
            }

            const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
            const svg = doc.documentElement;
            if (!svg || svg.tagName.toLowerCase() !== 'svg') {
                throw new Error('Invalid SVG document.');
            }

            const scale = this._num(
                options.svgUnitsToMeters ??
                svg.getAttribute('data-sm-units-to-meters'),
                0.01
            );

            const floor = {
                level: this._num(svg.getAttribute('data-sm-level'), 0),
                elevation: this._num(svg.getAttribute('data-sm-elevation'), 0),
                walls: [],
                rooms: [],
                columns: [],
                stairs: []
            };

            const wallById = new Map();

            for (const el of svg.querySelectorAll('[data-sm-type], [data-type], line, polyline, polygon, rect, circle')) {
                const type = this._type(el);

                if (type.includes('wall') && el.tagName.toLowerCase() === 'line') {
                    const wall = {
                        id: el.id || `wall_${floor.walls.length + 1}`,
                        from: [
                            this._num(el.getAttribute('x1')) * scale,
                            this._num(el.getAttribute('y1')) * scale
                        ],
                        to: [
                            this._num(el.getAttribute('x2')) * scale,
                            this._num(el.getAttribute('y2')) * scale
                        ],
                        height: this._num(el.getAttribute('data-sm-height'), 3.2),
                        thickness: this._num(el.getAttribute('data-sm-thickness'), 0.22),
                        material: el.getAttribute('data-sm-material') || 'wall',
                        doors: [],
                        windows: []
                    };
                    floor.walls.push(wall);
                    wallById.set(wall.id, wall);
                    continue;
                }

                if (type.includes('room') && (el.tagName.toLowerCase() === 'polygon' || el.tagName.toLowerCase() === 'polyline')) {
                    floor.rooms.push({
                        id: el.id || `room_${floor.rooms.length + 1}`,
                        name: el.getAttribute('data-sm-name') || el.id || `Room ${floor.rooms.length + 1}`,
                        type: el.getAttribute('data-sm-room-type') || 'room',
                        polygon: this._parsePoints(el.getAttribute('points')).map((p) => [p[0] * scale, p[1] * scale]),
                        floorMaterial: el.getAttribute('data-sm-floor-material') || 'floor'
                    });
                    continue;
                }

                if (type.includes('column')) {
                    const tag = el.tagName.toLowerCase();
                    let x = 0, y = 0, radius = 0.2;
                    if (tag === 'circle') {
                        x = this._num(el.getAttribute('cx')) * scale;
                        y = this._num(el.getAttribute('cy')) * scale;
                        radius = this._num(el.getAttribute('r'), 20) * scale;
                    } else if (tag === 'rect') {
                        x = (this._num(el.getAttribute('x')) + this._num(el.getAttribute('width')) * 0.5) * scale;
                        y = (this._num(el.getAttribute('y')) + this._num(el.getAttribute('height')) * 0.5) * scale;
                    }

                    floor.columns.push({
                        id: el.id || `column_${floor.columns.length + 1}`,
                        position: [x, y],
                        radius,
                        height: this._num(el.getAttribute('data-sm-height'), 3.2),
                        material: el.getAttribute('data-sm-material') || 'column'
                    });
                    continue;
                }

                if (type.includes('door') || type.includes('window')) {
                    const wallId = el.getAttribute('data-sm-wall');
                    const wall = wallById.get(wallId);
                    if (!wall) continue;

                    const opening = {
                        id: el.id || `${type}_${(wall.doors.length + wall.windows.length) + 1}`,
                        offset: this._num(el.getAttribute('data-sm-offset')) * scale,
                        width: this._num(el.getAttribute('data-sm-width'), type.includes('door') ? 95 : 120) * scale,
                        height: this._num(el.getAttribute('data-sm-height'), type.includes('door') ? 210 : 120) * scale,
                        sillHeight: this._num(el.getAttribute('data-sm-sill-height'), type.includes('door') ? 0 : 90) * scale
                    };
                    if (type.includes('door')) wall.doors.push(opening);
                    else wall.windows.push(opening);
                }
            }

            return {
                version: 1,
                units: 'meters',
                building: {
                    name: options.name || svg.getAttribute('data-sm-name') || 'SVG Building'
                },
                floors: [floor],
                roof: { enabled: false }
            };
        }
    }

    global.SMSVGFloorPlanImporter = SMSVGFloorPlanImporter;
})(typeof window !== 'undefined' ? window : globalThis);

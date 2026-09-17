// engine/architecture/core/SMBuildingMapParser.js
(function (global) {
    'use strict';

    class SMBuildingMapParser {
        static parse(input, options = {}) {
            if (!global.SMBuildingSchema) {
                throw new Error('SMBuildingSchema must be loaded before SMBuildingMapParser.');
            }

            let raw = input;

            if (typeof input === 'string') {
                const trimmed = input.trim();
                if (!trimmed) throw new Error('Building map string is empty.');

                if (trimmed.startsWith('<svg') || trimmed.includes('<svg')) {
                    if (!global.SMSVGFloorPlanImporter) {
                        throw new Error('SMSVGFloorPlanImporter is required to parse SVG building maps.');
                    }
                    raw = global.SMSVGFloorPlanImporter.parse(trimmed, options);
                } else {
                    try {
                        raw = JSON.parse(trimmed);
                    } catch (error) {
                        throw new Error(`Could not parse building map JSON: ${error.message}`);
                    }
                }
            }

            if (raw?.format === 'SM_BUILDING_MAP' && options.skipNormalization === true) {
                return raw;
            }

            return global.SMBuildingSchema.normalize(raw);
        }

        static async parseFile(file, options = {}) {
            if (!file) throw new Error('parseFile() requires a File/Blob.');

            const name = String(file.name || '').toLowerCase();
            const text = await file.text();

            if (name.endsWith('.svg')) {
                if (!global.SMSVGFloorPlanImporter) {
                    throw new Error('SMSVGFloorPlanImporter is not loaded.');
                }
                return global.SMBuildingSchema.normalize(
                    global.SMSVGFloorPlanImporter.parse(text, options)
                );
            }

            if (name.endsWith('.dxf')) {
                if (!global.SMDXFImporter) {
                    throw new Error('SMDXFImporter is not loaded.');
                }
                return global.SMBuildingSchema.normalize(
                    global.SMDXFImporter.parse(text, options)
                );
            }

            return this.parse(text, options);
        }

        static stringify(map, spacing = 2) {
            const normalized = map?.format === 'SM_BUILDING_MAP'
                ? map
                : this.parse(map);
            return JSON.stringify(normalized, null, spacing);
        }

        static clone(map) {
            return this.parse(JSON.parse(JSON.stringify(map)));
        }
    }

    global.SMBuildingMapParser = SMBuildingMapParser;
})(typeof window !== 'undefined' ? window : globalThis);

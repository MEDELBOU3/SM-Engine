// engine/architecture/importers/SMPlanVisionBridge.js
// Provider-agnostic bridge: AI/vision output -> validated SM_BUILDING_MAP.
// It intentionally does not hard-code a vendor/API key.
(function (global) {
    'use strict';

    class SMPlanVisionBridge {
        constructor(options = {}) {
            this.analyze = options.analyze || null;
            this.strict = options.strict !== false;
            this.lastResult = null;
        }

        setAnalyzer(fn) {
            if (fn !== null && typeof fn !== 'function') {
                throw new TypeError('SMPlanVisionBridge.setAnalyzer expects a function or null.');
            }
            this.analyze = fn;
            return this;
        }

        getPromptContract() {
            return {
                role: 'Convert an architectural plan into deterministic SM Engine building-map JSON.',
                requiredTopLevel: ['version', 'units', 'building', 'floors'],
                coordinates: 'Use meters. Plan coordinates map to X/Z in the 3D scene.',
                walls: 'Each wall needs id, from [x,z], to [x,z], height, thickness.',
                openings: 'Doors/windows must reference a wall id and use center offset measured from wall start.',
                rooms: 'Rooms use polygon [[x,z], ...].',
                rule: 'Do not invent upper floors, dimensions, doors, windows or roof details that are not visible. Mark uncertainty in metadata.'
            };
        }

        async convert(input, options = {}) {
            if (typeof this.analyze !== 'function') {
                throw new Error(
                    'No vision analyzer configured. Pass { analyze: async (input, contract) => buildingMapObject }.'
                );
            }

            const raw = await this.analyze(
                input,
                this.getPromptContract(),
                options
            );

            const map = global.SMBuildingMapParser.parse(raw);
            const validation = global.SMBuildingSchema.validate(map);

            if (this.strict && !validation.valid) {
                const error = new Error('Plan vision result failed SMBuildingSchema validation.');
                error.validation = validation;
                throw error;
            }

            this.lastResult = {
                map,
                validation,
                generatedAt: Date.now()
            };
            return this.lastResult;
        }
    }

    global.SMPlanVisionBridge = SMPlanVisionBridge;
    global.smPlanVisionBridge = global.smPlanVisionBridge || new SMPlanVisionBridge();
})(typeof window !== 'undefined' ? window : globalThis);

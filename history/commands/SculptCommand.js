(function () {
    'use strict';
    const H = window.SMHistory = window.SMHistory || {};
    const BaseCommand = H.BaseCommand || window.BaseCommand;

    class SculptCommand extends BaseCommand {
        constructor(object, beforePositions, afterPositions, name = null) {
            const objName = object?.name || 'Mesh';
            super(name || `Sculpt: ${objName}`, 'sculpt');

            this.object = object;
            this.before = beforePositions instanceof Float32Array ? beforePositions : new Float32Array(beforePositions);
            this.after = afterPositions instanceof Float32Array ? afterPositions : new Float32Array(afterPositions);

            this.byteSize = (this.before.byteLength || 0) + (this.after.byteLength || 0);
        }

        apply(positions) {
            if (!this.object?.geometry?.attributes?.position || !positions) return;

            const attr = this.object.geometry.attributes.position;
            attr.array.set(positions);
            attr.needsUpdate = true;

            this.object.geometry.computeVertexNormals();
            this.object.geometry.computeBoundingBox();
            this.object.geometry.computeBoundingSphere();

            if (window.sculptingSystem && window.sculptingSystem.currentMesh === this.object) {
                if (typeof window.sculptingSystem.buildSpatialIndex === 'function') {
                    window.sculptingSystem.buildSpatialIndex();
                }
            }
        }

        execute() { this.apply(this.after); }
        undo() { this.apply(this.before); }
        redo() { this.apply(this.after); }

        dispose() {
            this.before = null;
            this.after = null;
        }
    }

    H.SculptCommand = SculptCommand;
})();
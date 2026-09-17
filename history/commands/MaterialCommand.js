(function () {
    'use strict';
    const H = window.SMHistory = window.SMHistory || {};
    const BaseCommand = H.BaseCommand || window.BaseCommand;

    class MaterialCommand extends BaseCommand {
        constructor(object, oldMaterial, newMaterial, name = null) {
            const objName = object?.name || 'Object';
            super(name || `Material: ${objName}`, 'material');

            this.object = object;
            this.oldMat = this.cloneMaterial(oldMaterial);
            this.newMat = this.cloneMaterial(newMaterial);
            this.byteSize = 512;
        }

        cloneMaterial(mat) {
            if (!mat) return null;
            if (Array.isArray(mat)) return mat.map(m => m ? m.clone() : null);
            return mat.clone();
        }

        apply(matState) {
            if (!this.object || !matState) return;

            if (Array.isArray(matState)) {
                if (Array.isArray(this.object.material)) {
                    matState.forEach((m, idx) => {
                        if (this.object.material[idx] && m) {
                            this.object.material[idx].copy(m);
                            this.object.material[idx].needsUpdate = true;
                        }
                    });
                } else if (matState[0]) {
                    this.object.material.copy(matState[0]);
                    this.object.material.needsUpdate = true;
                }
            } else if (this.object.material) {
                this.object.material.copy(matState);
                this.object.material.needsUpdate = true;
            }
        }

        execute() { this.apply(this.newMat); }
        undo() { this.apply(this.oldMat); }
        redo() { this.apply(this.newMat); }

        dispose() {
            const free = m => {
                if (!m) return;
                if (Array.isArray(m)) m.forEach(sub => sub?.dispose?.());
                else m.dispose?.();
            };
            free(this.oldMat);
            free(this.newMat);
        }
    }

    H.MaterialCommand = MaterialCommand;
})();
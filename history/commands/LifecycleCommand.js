(function () {
    'use strict';
    const H = window.SMHistory = window.SMHistory || {};
    const BaseCommand = H.BaseCommand || window.BaseCommand;

    class LifecycleCommand extends BaseCommand {
        constructor(scene, object, actionType, serializedData = null, name = null) {
            const objName = object?.name || 'Object';
            super(name || `${actionType === 'add' ? 'Add' : 'Delete'} ${objName}`, 'lifecycle');

            this.scene = scene || window.scene;
            this.object = object;
            this.objectUuid = object?.uuid;
            this.actionType = actionType;
            this.parent = object?.parent || this.scene;

            this.serializedData = serializedData || (actionType === 'delete' ? this.serialize(object) : null);
            this.byteSize = this.serializedData ? JSON.stringify(this.serializedData).length * 2 : 512;
        }

        serialize(object) {
            if (!object) return null;
            try {
                const badKeys = ['mixer', 'physicsBody', 'bboxHelper', 'helper', 'originalMaterial', 'selectionProxy', 'origHighlight'];
                const safeUserData = {};

                for (const key in object.userData) {
                    if (!badKeys.includes(key)) {
                        safeUserData[key] = object.userData[key];
                    }
                }

                const originalUserData = object.userData;
                object.userData = safeUserData;
                const json = object.toJSON();
                object.userData = originalUserData;
                return json;
            } catch (e) {
                console.warn('[LifecycleCommand] Serialization error:', e);
                return null;
            }
        }

        removeFromScene() {
            if (!this.object) return;
            if (this.object.parent) {
                this.object.parent.remove(this.object);
            } else if (this.scene) {
                this.scene.remove(this.object);
            }

            if (typeof window.objects !== 'undefined' && Array.isArray(window.objects)) {
                const idx = window.objects.indexOf(this.object);
                if (idx !== -1) window.objects.splice(idx, 1);
            }
        }

        restoreToScene() {
            if (!this.object && this.serializedData && typeof THREE !== 'undefined') {
                try {
                    const loader = new THREE.ObjectLoader();
                    this.object = loader.parse(this.serializedData);
                } catch (e) {
                    console.error('[LifecycleCommand] ObjectLoader error:', e);
                }
            }

            if (this.object) {
                const targetParent = this.parent || this.scene;
                if (targetParent && !this.object.parent) {
                    targetParent.add(this.object);
                }
                if (typeof window.objects !== 'undefined' && Array.isArray(window.objects)) {
                    if (!window.objects.includes(this.object)) {
                        window.objects.push(this.object);
                    }
                }
            }
        }

        execute() {
            if (this.actionType === 'add') this.restoreToScene();
            else this.removeFromScene();
        }

        undo() {
            if (this.actionType === 'add') this.removeFromScene();
            else this.restoreToScene();
        }

        redo() { this.execute(); }

        dispose() {
            if (this.actionType === 'delete' && this.object) {
                this.object.traverse?.(child => {
                    if (child.geometry) child.geometry.dispose?.();
                    if (child.material) {
                        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose?.());
                        else child.material.dispose?.();
                    }
                });
            }
            this.serializedData = null;
        }
    }

    H.LifecycleCommand = LifecycleCommand;
})();
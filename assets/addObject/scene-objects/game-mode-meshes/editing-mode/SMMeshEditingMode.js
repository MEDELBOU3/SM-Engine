// ============================================================================
// assets/addObject/scene-objects/game-mode-meshes/editing-mode/SMMeshEditingMode.js
// Lightweight mesh-edit mode starter for GAME_DEV blockout workflow
// ============================================================================
(function () {
    if (window.SMMeshEditingMode) return;

    class SMMeshEditingMode {
        constructor(options = {}) {
            this.scene = options.scene || window.scene;
            this.camera = options.camera || window.camera;
            this.renderer = options.renderer || window.renderer;
            this.raycaster = options.raycaster || new THREE.Raycaster();
            this.mouse = new THREE.Vector2();
            this.enabled = false;
            this.target = null;
            this.faceNormalHelper = null;
            this.boundPointerDown = this._onPointerDown.bind(this);
        }

        setTarget(object) {
            this.target = object || window.selectedObject || null;
            return this.target;
        }

        enable(target = null) {
            this.setTarget(target);
            if (!this.renderer?.domElement) return false;
            if (this.enabled) return true;
            this.enabled = true;
            this.renderer.domElement.addEventListener('pointerdown', this.boundPointerDown);
            console.log('[SMMeshEditingMode] Enabled');
            return true;
        }

        disable() {
            if (!this.enabled) return;
            this.enabled = false;
            this.renderer?.domElement?.removeEventListener('pointerdown', this.boundPointerDown);
            this._removeHelper();
            console.log('[SMMeshEditingMode] Disabled');
        }

        _removeHelper() {
            if (this.faceNormalHelper?.parent) this.faceNormalHelper.parent.remove(this.faceNormalHelper);
            this.faceNormalHelper = null;
        }

        _updateMouseFromEvent(event) {
            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        }

        _onPointerDown(event) {
            if (!this.enabled || !this.target?.isMesh) return;
            if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey) return;

            this._updateMouseFromEvent(event);
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const hits = this.raycaster.intersectObject(this.target, true);
            const hit = hits[0];
            if (!hit?.face || !hit.point) return;

            const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
            const helperGeometry = new THREE.BufferGeometry().setFromPoints([
                hit.point.clone(),
                hit.point.clone().add(normal.multiplyScalar(0.75))
            ]);

            const helper = new THREE.Line(
                helperGeometry,
                new THREE.LineBasicMaterial({ color: 0x33a1ff })
            );
            helper.userData = {
                isSystemObject: true,
                ignoreInTimeline: true,
                isMeshEditingHelper: true
            };

            this._removeHelper();
            this.faceNormalHelper = helper;
            this.scene?.add(helper);

            console.log('[SMMeshEditingMode] Face selected:', {
                object: this.target.name,
                point: hit.point,
                normal
            });
        }
    }

    window.SMMeshEditingMode = SMMeshEditingMode;
})();

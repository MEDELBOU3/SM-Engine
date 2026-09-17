// ============================================================================
// assets/addObject/scene-objects/game-mode-meshes/SMCubeGridTool.js
// Starter UE5-like cube grid blockout tool
// ============================================================================
(function () {
    if (window.SMCubeGridTool) return;

    class SMCubeGridTool {
        constructor(scene) {
            this.scene = scene || window.scene;
            this.gridSize = 1;
            this.width = 5;
            this.depth = 3;
            this.height = 3;
            this.origin = new THREE.Vector3(0, 0, 0);
            this.group = null;
            this.preview = null;
        }

        _clearPreview() {
            if (this.preview?.parent) this.preview.parent.remove(this.preview);
            this.preview = null;
        }

        _clearGroup() {
            if (this.group?.parent) this.group.parent.remove(this.group);
            this.group = null;
        }

        buildPreview(options = {}) {
            this.width = Math.max(1, Math.floor(options.width || this.width));
            this.depth = Math.max(1, Math.floor(options.depth || this.depth));
            this.height = Math.max(1, Math.floor(options.height || this.height));
            this.gridSize = Math.max(0.1, options.gridSize || this.gridSize);
            this.origin.copy(options.origin || this.origin);

            this._clearPreview();

            const geometry = new THREE.BoxGeometry(
                this.width * this.gridSize,
                this.height * this.gridSize,
                this.depth * this.gridSize,
                this.width,
                this.height,
                this.depth
            );

            const material = new THREE.MeshStandardMaterial({
                color: 0x9ca3af,
                roughness: 0.92,
                metalness: 0.0,
                wireframe: false,
                transparent: true,
                opacity: 0.65
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(
                this.origin.x,
                this.origin.y + (this.height * this.gridSize) * 0.5,
                this.origin.z
            );

            window.SMShapeMaterialLibrary?.applyMaterial(mesh, 'default', {
                tileWorldSize: this.gridSize
            });

            mesh.name = 'SMCubeGridPreview';
            mesh.userData = {
                isSystemObject: true,
                ignoreInTimeline: true,
                isCubeGridPreview: true
            };

            this.preview = mesh;
            this.scene?.add(mesh);
            return mesh;
        }

        accept(label = 'Cube Grid Blockout') {
            if (!this.preview) return null;

            const object = this.preview.clone();
            object.geometry = this.preview.geometry.clone();
            object.material = Array.isArray(this.preview.material)
                ? this.preview.material.map((m) => m.clone())
                : this.preview.material.clone();

            object.name = label;
            object.userData = {
                isGameDevShape: true,
                isBlockout: true,
                primitiveType: 'cube_grid_blockout',
                workspaceOnly: 'GAME_DEV',
                gridSize: this.gridSize,
                blocksX: this.width,
                blocksY: this.height,
                blocksZ: this.depth
            };

            this._clearPreview();

            if (typeof window.addObjectToScene === 'function') {
                window.addObjectToScene(object, label);
            } else {
                this.scene?.add(object);
            }

            return object;
        }

        cancel() {
            this._clearPreview();
        }
    }

    window.SMCubeGridTool = SMCubeGridTool;
})();

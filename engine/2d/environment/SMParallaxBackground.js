// ============================================================================
// engine/2d/environment/SMParallaxBackground.js
// SM Engine - Infinite Horizontal/Vertical Parallax Scroller
// ============================================================================
(function (root) {
    'use strict';

    class SMParallaxBackground {
        constructor(scene = root.scene) {
            this.scene = scene || root.scene;
            this.group = new THREE.Group();
            this.group.name = 'SMParallaxBackground';
            this.group.userData = { isSystemObject: true, editorOnly: true };
            
            this.layers = []; // [{ mesh, scrollSpeedX, scrollSpeedY, initialX, initialY, width }]
            
            if (this.scene) {
                this.scene.add(this.group);
            }
        }

        addLayer({
            textureUrl,
            scrollFactorX = 0.5,
            scrollFactorY = 0.2,
            width = 40,
            height = 20,
            depthZ = -5,
            yOffset = 0
        }) {
            return new Promise((resolve, reject) => {
                const loader = new THREE.TextureLoader();
                loader.load(
                    textureUrl,
                    (texture) => {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.ClampToEdgeWrapping;
                        texture.magFilter = THREE.NearestFilter;
                        texture.minFilter = THREE.NearestFilter;

                        const geo = new THREE.PlaneGeometry(width, height);
                        const mat = new THREE.MeshBasicMaterial({
                            map: texture,
                            transparent: true,
                            depthWrite: false,
                            depthTest: false
                        });

                        const mesh = new THREE.Mesh(geo, mat);
                        mesh.position.set(0, yOffset, depthZ);
                        mesh.renderOrder = depthZ;

                        this.group.add(mesh);

                        const layer = {
                            mesh,
                            texture,
                            scrollFactorX,
                            scrollFactorY,
                            width,
                            height,
                            yOffset,
                            depthZ
                        };

                        this.layers.push(layer);
                        resolve(layer);
                    },
                    undefined,
                    (err) => reject(err)
                );
            });
        }

        update(cameraX = 0, cameraY = 0) {
            for (const layer of this.layers) {
                // Keep the layer mesh centered horizontally with camera
                layer.mesh.position.x = cameraX;

                // Scroll UV texture offset based on camera movement
                const uvOffsetX = (cameraX * layer.scrollFactorX) / layer.width;
                layer.texture.offset.x = uvOffsetX;

                // Optional subtle vertical parallax
                layer.mesh.position.y = layer.yOffset + (cameraY * layer.scrollFactorY);
            }
        }

        clear() {
            for (const layer of this.layers) {
                layer.mesh.geometry?.dispose?.();
                layer.mesh.material?.dispose?.();
                layer.texture?.dispose?.();
                this.group.remove(layer.mesh);
            }
            this.layers = [];
        }

        dispose() {
            this.clear();
            this.group.parent?.remove(this.group);
        }
    }

    root.SMParallaxBackground = SMParallaxBackground;

})(window);
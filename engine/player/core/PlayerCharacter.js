class SMPlayerCharacter {
    constructor(scene, config = window.SMPlayerConfig) {
        this.scene = scene;
        this.config = config;
        this.model = null;
        this.visual = null;
        this.loaded = false;
        this.loadingPromise = null;
        this.loader = null;
        this.bones = {};
        this.embeddedAnimations = [];
        this.height = 0;
        this.autoScale = 1;
    }
    _getLoader() {
        if (this.loader) return this.loader;
        if (THREE.FBXLoader) {
            this.loader = new THREE.FBXLoader();
            return this.loader;
        }
        if (window.FBXLoader) {
            this.loader = new window.FBXLoader();
            return this.loader;
        }
        throw new Error('FBXLoader is not available.');
    }
    load() {
        if (this.loaded && this.model) return Promise.resolve(this.model);
        if (this.loadingPromise) return this.loadingPromise;
        this.loadingPromise = new Promise((resolve, reject) => {
            const loader = this._getLoader();
            loader.load(this.config.modelPath, fbx => {
                try {
                    this._setupCharacter(fbx);
                    resolve(this.model);
                } catch (error) {
                    console.error('[PlayerCharacter] Setup failed:', error);
                    this.loadingPromise = null;
                    reject(error);
                }
            }, undefined, error => {
                console.error('[PlayerCharacter] Failed to load:', this.config.modelPath, error);
                this.loadingPromise = null;
                reject(error);
            });
        });
        return this.loadingPromise;
    }
    _setupCharacter(fbx) {
        this.embeddedAnimations = Array.isArray(fbx.animations) ? fbx.animations.slice() : [];
        console.log('[Player] Embedded animations:', this.embeddedAnimations.map(clip => ({
            name: clip.name,
            duration: clip.duration,
            tracks: clip.tracks.length
        })));
        const root = new THREE.Group();
        root.name = 'Player';
        root.userData = {
            type: 'Player',
            isPlayer: true,
            isPlayerRoot: true,
            isRuntimeCharacter: true,
            isDynamicMesh: true,
            hasSkeleton: true,
            isSystemObject: false,
            skipAutoRig: true,
            excludeFromNanite: true,
            excludeFromStaticMerge: true,
            ignoreInTimeline: true,
            ignoreInHierarchy: false,
            selectable: true,
            expanded: true,
            workspaceOnly: 'PLAYER'
        };
        this.visual = fbx;
        this.visual.name = 'Player Mesh';
        // Capture the FBX bind pose while the imported hierarchy is still in
        // its original coordinate system.  Calling Skeleton.pose() after the
        // visual has been rotated, scaled, or grounded makes Three.js derive
        // bind matrices from the wrapper transform and stretches the mesh
        // into long spikes as soon as an animation mixer updates it.
        this.visual.position.set(0, 0, 0);
        this.visual.rotation.set(0, 0, 0);
        this.visual.scale.set(1, 1, 1);
        this.visual.updateMatrixWorld(true);
        this.visual.traverse(child => {
            if (!child.isSkinnedMesh || !child.skeleton) return;
            child.skeleton.pose?.();
            child.skeleton.update?.();
        });
        // Apply editor-facing orientation only after the bind pose is stable.
        this.visual.rotation.set(0, this.config.visualYawOffset || 0, 0);
        this.visual.userData = this.visual.userData || {};
        Object.assign(this.visual.userData, {
            type: 'PlayerMesh',
            isPlayer: true,
            isPlayerVisual: true,
            isRuntimeCharacter: true,
            isDynamicMesh: true,
            hasSkeleton: true,
            isSystemObject: false,
            skipAutoRig: true,
            excludeFromNanite: true,
            excludeFromStaticMerge: true,
            ignoreInTimeline: true,
            ignoreInHierarchy: false,
            selectable: true,
            // Keep the visual node open so its individual meshes and bones
            // are available from the hierarchy immediately after loading.
            expanded: true,
            workspaceOnly: 'PLAYER'
        });
        this.visual.updateMatrixWorld(true);
        const rawBox = new THREE.Box3().setFromObject(this.visual);
        const rawSize = new THREE.Vector3();
        rawBox.getSize(rawSize);
        const rawHeight = rawSize.y;
        if (!Number.isFinite(rawHeight) || rawHeight <= 0.0001) {
            throw new Error(`Invalid player height: ${rawHeight}`);
        }
        const targetHeight = this.config.targetHeight ?? 1.8;
        const scale = targetHeight / rawHeight;
        this.autoScale = scale;
        this.visual.scale.setScalar(scale);
        this.visual.updateMatrixWorld(true);
        const scaledBox = new THREE.Box3().setFromObject(this.visual);
        const scaledSize = new THREE.Vector3();
        const scaledCenter = new THREE.Vector3();
        scaledBox.getSize(scaledSize);
        scaledBox.getCenter(scaledCenter);
        this.height = scaledSize.y;
        this.visual.position.x -= scaledCenter.x;
        this.visual.position.z -= scaledCenter.z;
        this.visual.position.y -= scaledBox.min.y;
        this.visual.traverse(child => {
            if (child === this.visual) return;
            child.userData = child.userData || {};
            const isRenderablePart = !!(
                child.isMesh || child.isSkinnedMesh || child.isBone
            );
            Object.assign(child.userData, {
                isPlayer: true,
                isPlayerPart: true,
                isRuntimeCharacter: true,
                isDynamicMesh: true,
                isSystemObject: false,
                skipAutoRig: true,
                excludeFromNanite: true,
                excludeFromStaticMerge: true,
                ignoreInTimeline: true,
                // Player internals are intentionally exposed so artists can
                // choose a mesh or bone as a weapon/attachment target.
                ignoreInHierarchy: false,
                selectable: true,
                isSelectableRoot: isRenderablePart,
                expanded: !!(child.isGroup || child.isBone),
                workspaceOnly: 'PLAYER'
            });
            if (child.isMesh || child.isSkinnedMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.frustumCulled = false;
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(material => {
                    if (!material) return;
                    if (material.map) {
                        if ('colorSpace' in material.map) {
                            material.map.colorSpace = THREE.SRGBColorSpace;
                        } else if ('encoding' in material.map && THREE.sRGBEncoding !== undefined) {
                            material.map.encoding = THREE.sRGBEncoding;
                        }
                        material.map.needsUpdate = true;
                    }
                    if ('metalness' in material) {
                        material.metalness = Math.min(material.metalness ?? 0, 0.15);
                    }
                    if ('roughness' in material) {
                        material.roughness = Math.max(material.roughness ?? 0.5, 0.45);
                    }
                    material.needsUpdate = true;
                });
            }
            if (child.isBone) {
                child.userData.hasSkeleton = true;
            }
        });
        root.add(this.visual);
        root.position.fromArray(this.config.spawnPosition || [0, 0, 0]);
        const spawnRotation = this.config.spawnRotation || [0, 0, 0];
        root.rotation.set(
            Number(spawnRotation[0]) || 0,
            Number(spawnRotation[1]) || 0,
            Number(spawnRotation[2]) || 0
        );
        this.model = root;
        // The bind pose was captured before the wrapper transform above. Only
        // refresh skeleton buffers here; re-running pose() after scaling or
        // grounding would invalidate the imported bind matrices.
        this.visual.traverse(child => {
            if (!child.isSkinnedMesh || !child.skeleton) return;
            child.skeleton.update?.();
        });
        root.updateMatrixWorld(true);
        this._cacheBones();
        this.scene.add(root);
        this.loaded = true;
        this.setVisible(false);
        root.updateMatrixWorld(true);
        window.hierarchyManager?.renderAll?.();
        if (typeof updateHierarchy === 'function') {
            updateHierarchy();
        }
        console.log('[PlayerCharacter] Loaded', {
            name: root.name,
            rawHeight,
            targetHeight,
            autoScale: scale,
            finalHeight: this.height,
            embeddedAnimations: this.embeddedAnimations.length,
            visibleInHierarchy: !root.userData.ignoreInHierarchy,
            meshVisibleInHierarchy: !this.visual.userData.ignoreInHierarchy
        });
    }
    _cacheBones() {
        if (!this.model) return;
        this.bones.hips = SMPlayerUtils.findBone(this.model, ['mixamorigHips', 'hips']);
        this.bones.spine = SMPlayerUtils.findBone(this.model, ['mixamorigSpine', 'spine']);
        this.bones.head = SMPlayerUtils.findBone(this.model, ['mixamorigHead', 'head']);
        this.bones.rightHand = SMPlayerUtils.findBone(this.model, ['mixamorigRightHand', 'righthand', 'right_hand']);
        this.bones.leftHand = SMPlayerUtils.findBone(this.model, ['mixamorigLeftHand', 'lefthand', 'left_hand']);
    }
    getBone(name) {
        return this.bones[name] || null;
    }
    setVisible(visible) {
        if (!this.model) return;
        this.model.visible = !!visible;
    }
    setPosition(x, y, z) {
        if (!this.model) return;
        this.model.position.set(x, y, z);
    }
    getPosition(target = new THREE.Vector3()) {
        if (!this.model) return target.set(0, 0, 0);
        return target.copy(this.model.position);
    }
    getHeight() {
        return this.height;
    }
    dispose() {
        if (!this.model) return;
        this.model.traverse(child => {
            child.geometry?.dispose?.();
            if (Array.isArray(child.material)) {
                child.material.forEach(material => material?.dispose?.());
            } else {
                child.material?.dispose?.();
            }
        });
        this.model.parent?.remove(this.model);
        this.model = null;
        this.visual = null;
        this.embeddedAnimations = [];
        this.loaded = false;
        this.loadingPromise = null;
    }
}
window.SMPlayerCharacter = SMPlayerCharacter;

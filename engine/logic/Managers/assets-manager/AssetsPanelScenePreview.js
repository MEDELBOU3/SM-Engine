// AssetsPanelScenePreview.js
// Material assets, viewport drop, scene placement, preview renderer
// Extracted from AssetsPanel_FULL_9483_PBR_FIXED without rewriting method bodies.
(function(global){
"use strict";
const AssetsPanel=global.AssetsPanel;
if(!AssetsPanel){
throw new Error("[SMAssetsPanelScenePreviewMixin] AssetsPanelCore must load first.");
}
class SMAssetsPanelScenePreviewMixin {
    static addMaterialAsset(name, jsonString, folderId = null) {
        let uniqueName = name;
        let counter = 1;
        const baseName = name.replace(/\.json$/, "");
        while (
            this.assets.some(
                (a) =>
                    !a.isBuiltIn &&
                    a.name === uniqueName &&
                    (a.folderId || null) === (folderId || null),
            )
        ) {
            uniqueName = `${baseName} (${counter++}).json`;
        }

        if (uniqueName !== name) {
            console.warn(
                `AssetsPanel: Asset name conflict for '${name}'. Renamed to '${uniqueName}'.`,
            );
        }

        let definition;
        try {
            definition = JSON.parse(jsonString);
        } catch (e) {
            console.error("Invalid JSON for material asset.");
            return null;
        }

        const id = `material_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const asset = {
            id,
            name: uniqueName,
            type: "material",
            data: jsonString, // Store the raw JSON string
            definition, // Parsed object for quick access
            thumbnail: this._svgIcon("material"),
            isFavorite: false,
            isBuiltIn: false,
            folderId,
            tags: ["material"], // Auto-tagging
            history: [], // Initialize history
            references: [], // Initialize references
        };

        // Optional: Auto-detect references (textures) in the material
        asset.references = this._detectMaterialReferences(definition);

        // Optional: Generate thumbnail if _generateThumbnail exists
        // asset.thumbnail = await this._generateThumbnail(asset);

        // Auto-tag based on content
        this._autoTagAsset(asset);

        this.assets.push(asset);
        this._commitAssetVersion(asset.id, "Initial Material Import");
        this._saveToStorage();
        if (typeof this.onAssetAdded === "function") this.onAssetAdded(asset);
        this.render();
        this._buildTagCloud();

        // Generate a proper sphere thumbnail (UE-like material ball) in background.
        this._generateMaterialThumbnail(definition)
            .then((thumb) => {
                if (!thumb) return;
                asset.thumbnail = thumb;
                this._saveToStorage();
                this.render();
            })
            .catch((err) => {
                console.warn("AssetsPanel: Material thumbnail generation failed.", err);
            });

        return asset;
    }

    // Adds an asset to scene or multiple drop handling - MODIFIED: For Drag-to-UI (and texture asset ID storage)
    /*static async _addToScene(assetId, event = null) {
          const asset = this._findById(assetId)
              || this._getPrimitiveAssets().find(a => a.id === assetId)
              || this._getLightAssets().find(a => a.id === assetId);
  
          if (!asset) {
              console.error(`AssetsPanel: Could not find asset with ID ${assetId}`);
              return;
          }
          if (typeof window.addObjectToScene !== 'function') {
              console.error("AssetsPanel Error: window.addObjectToScene() is not defined. Please define it globally.");
              // If addObjectToScene is crucial, prevent further execution
              return;
          }
  
          // --- NEW: Drag-to-UI handling ---
          // This part of the logic is now handled entirely within _updatePropertiesPanel's
          // texture-slot-input.ondrop event handler.
          // The _addToScene method is primarily for dropping assets *into the 3D scene*.
          // The 'return' statement in _updatePropertiesPanel's drop handler ensures
          // that if a UI drop occurs, _addToScene does not attempt to add the texture to the 3D scene.
          // So, this block is conceptually moved, but its impact is still relevant.
          // For clarity, I'm removing the redundant UI drop handling from here as it's now specific
          // to the properties panel logic.
          // --- END NEW: Drag-to-UI handling ---
  
          let position = new THREE.Vector3(0, 0, 0);
  
          switch (asset.type) {
              case 'model': {
                  const ext = asset.name.split('.').pop().toLowerCase();
                  let loaderPromise;
  
                  const bbox = new THREE.Box3().setFromObject(modelObject);
                  const size = bbox.getSize(new THREE.Vector3());
                  const targetHeight = 1.8; // Standard human height
                  const scaleFactor = targetHeight / size.y;
                  modelObject.scale.setScalar(scaleFactor);
                  if (ext === 'glb' || ext === 'gltf' || ext === 'uasset' || ext === 'umap' || asset.sourceFormat === 'unreal' || asset.unreal) {
                      const modelUrl = asset.data || asset.runtimeURL;
                      loaderPromise = new Promise((resolve, reject) => {
                          this.loaders.gltf.load(modelUrl, gltf => resolve(gltf), undefined, reject);
                      });
                  } else if (ext === 'fbx') {
                      loaderPromise = new Promise((resolve, reject) => {
                          this.loaders.fbx.load(asset.data, obj => resolve(obj), undefined, reject);
                      });
                  } else if (ext === 'obj') {
                      loaderPromise = new Promise((resolve, reject) => {
                          this.loaders.obj.load(asset.data, obj => resolve(obj), undefined, reject);
                      });
                  } else {
                      console.warn(`AssetsPanel: No specific loader for model type '${ext}'. Falling back to GLTF.`);
                      loaderPromise = new Promise((resolve, reject) => {
                          this.loaders.gltf.load(asset.data, gltf => resolve(gltf), undefined, reject);
                      });
                  }
  
  
                  loaderPromise.then(loadedContent => {
                      let modelObject;
                      let animations = [];
  
                      if (loadedContent && loadedContent.scene instanceof THREE.Object3D) {
                          modelObject = loadedContent.scene;
                          animations = loadedContent.animations || [];
                      } else if (loadedContent instanceof THREE.Object3D) {
                          modelObject = loadedContent;
                          animations = loadedContent.animations || [];
                      } else {
                          console.error(`AssetsPanel: Loaded content not valid for ${asset.name}.`, loadedContent);
                          throw new Error("Invalid model content.");
                      }
  
                      let hasSkeletonData = false;
                      modelObject.traverse((child) => {
                          if (child.isSkinnedMesh) {
                              hasSkeletonData = true;
                              if (child.skeleton) {
                                  child.skeleton.update();
                              }
                          }
                      });

                      if (['fbx', 'obj', 'gltf', 'glb', 'uasset', 'umap'].includes(ext) || asset.unreal || asset.sourceFormat === 'unreal') {
                          const bbox = new THREE.Box3().setFromObject(modelObject);
                          if (!bbox.isEmpty()) {
                              const size = bbox.getSize(new THREE.Vector3());
  
                              const targetMaxDim = 1.8;
                              const currentMaxDim = Math.max(size.x, size.y, size.z);
  
                              if (currentMaxDim > 0) {
                                  const scaleFactor = targetMaxDim / currentMaxDim;
                                  modelObject.scale.setScalar(scaleFactor);
                              }

                              const newBbox = new THREE.Box3().setFromObject(modelObject);
                              const newCenter = newBbox.getCenter(new THREE.Vector3());
                              modelObject.position.sub(newCenter);
  
                              if (hasSkeletonData) {
                                  modelObject.traverse((child) => {
                                      if (child.isSkinnedMesh && child.skeleton) {
                                          child.skeleton.update();
                                      }
                                  });
                              }
                          }
                      }
  
                      modelObject.position.copy(position);
                      modelObject.animations = animations;
  
                      if (hasSkeletonData) {
                          modelObject.userData.hasSkeleton = true;
                      }

                      if (asset.sourceFormat === 'unreal' || asset.unreal || ['uasset', 'umap'].includes(ext)) {
                          modelObject.userData = modelObject.userData || {};
                          modelObject.userData.smSourceFormat = 'unreal';
                          modelObject.userData.smUnreal = true;
                          modelObject.userData.smUnrealPackage = asset.metadata?.packagePath || '';
                          modelObject.userData.smUnrealObject = asset.metadata?.meshName || '';
                          modelObject.userData.smUnrealSource = asset.name || '';
                          modelObject.userData.smGlbPath = asset.glbPath || asset.runtimePath || '';
                      }
  
                      window.addObjectToScene(
                          modelObject,
                          asset.name.split('.').slice(0, -1).join('.')
                      );
  
                      if (hasSkeletonData && window.rigManager) {
                          window.rigManager.setupRigForObject(modelObject);
                      }
  
  
  
                      if (typeof this.onAssetAdded === 'function')
                          this.onAssetAdded(asset);
                  }).catch(error => {
                      console.error(`AssetsPanel: Failed to load model '${asset.name}':`, error);
                  });
                  break;
              }
  
              case 'texture': {
                  // If dropping directly onto the 3D scene, apply to the map slot
                  this.loaders.texture.load(asset.data, texture => {
                      const intersects = this.raycaster.intersectObjects(this.scene.children, true);
                      const target = intersects.length > 0 ? intersects[0].object : null;
                      if (target && target.isMesh && target.material) {
                          // For simplicity, apply to 'map' by default
                          target.material.map = texture;
                          target.material.needsUpdate = true;
                          console.log(`Applied texture '${asset.name}' to 'map' of '${target.name}'.`);
                      } else {
                          console.warn("AssetsPanel: Drop texture on a mesh.");
                      }
                  });
                  break;
              }
  
              case 'hdri': {
                  this.loaders.hdri.load(asset.data, texture => {
                      texture.mapping = THREE.EquirectangularReflectionMapping;
                      this.scene.background = texture;
                      this.scene.environment = texture;
                      console.log(`Applied HDRI '${asset.name}' to scene.`);
                  });
                  break;
              }
  
              case 'material': {
                  // Raycast to find the target mesh in the 3D scene
                  const intersects = event ? (() => {
                      const rect = this.renderer.domElement.getBoundingClientRect();
                      const mouse = new THREE.Vector2(
                          (event.clientX - rect.left) / rect.width * 2 - 1,
                          -((event.clientY - rect.top) / rect.height) * 2 + 1
                      );
                      this.raycaster.setFromCamera(mouse, this.camera);
                      return this.raycaster.intersectObjects(this.scene.children, true);
                  })() : [];
  
                  if (intersects.length > 0) {
                      this._applyMaterialToMesh(asset, intersects[0].object);
                  } else {
                      console.warn("AssetsPanel: Drop material on a mesh.");
                  }
                  break;
              }
  
              case 'primitive': {
                  const mesh = asset.factory();
                  mesh.position.copy(position);
                  window.addObjectToScene(mesh, asset.name);
                  break;
              }
  
              case 'light': {
                  const light = asset.factory();
                  light.position.copy(position);
                  if (light.target) {
                      light.target.position.set(0, -1, 0);
                      window.addObjectToScene(light.target, `${asset.name} Target`);
                  }
                  window.addObjectToScene(light, asset.name);
                  break;
              }
              case 'prefab': { // NEW: Handle prefab instancing (basic placeholder)
                  try {
                      const components = JSON.parse(asset.data);
                      const prefabGroup = new THREE.Group();
                      prefabGroup.name = asset.name;
  
                      // This is a basic example; a real prefab would load/clone models
                      // and apply their saved relative transforms and properties.
                      for (const comp of components) {
                          const compAsset = this._findById(comp.id);
                          if (compAsset && compAsset.type === 'model') {
                              // Load/clone model and add to prefabGroup
                              // For simplicity, we'll just log here. Real implementation is complex.
                              console.log(`Prefab: Instantiating component ${comp.name} from prefab ${asset.name}`);
                              // await someLoadModelFunction(compAsset.data).then(model => prefabGroup.add(model));
                          }
                      }
                      if (prefabGroup.children.length > 0) {
                          window.addObjectToScene(prefabGroup, prefabGroup.name);
                          console.log(`AssetsPanel: Instantiated prefab '${asset.name}'. (Components not fully loaded in this example)`);
                      } else {
                          console.warn(`AssetsPanel: Prefab '${asset.name}' has no loadable components.`);
                      }
                  } catch (error) {
                      console.error(`AssetsPanel: Failed to instantiate prefab '${asset.name}':`, error);
                  }
                  break;
              }
          }
      }*/

    /**
     * Enhanced _addToScene method with automatic RigManager integration
     * Drop-in replacement for your existing AssetsPanel._addToScene method
     */
    static _resolveDropPosition(event = null, mode = this._getActiveGameViewportMode()) {
        const activeCamera = window.getActiveViewportCamera?.() || this.camera;
        const fallback = new THREE.Vector3(0, 0, 0);

        if (window.selectedObject?.position?.isVector3) {
            fallback.copy(window.selectedObject.position);
        } else if (activeCamera) {
            const forward = new THREE.Vector3();
            activeCamera.getWorldDirection(forward);
            fallback.copy(activeCamera.position).add(forward.multiplyScalar(mode === "3D" ? 6 : 0));
            if (mode !== "3D") fallback.set(0, 0, 0);
        }

        if (!event || !this.renderer?.domElement || !activeCamera) return fallback;

        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        this.raycaster.setFromCamera(mouse, activeCamera);

        const plane = mode === "3D"
            ? new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
            : new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const point = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(plane, point)) {
            return point;
        }
        return fallback;
    }

    static async _createImageLikeSceneObject(asset, options = {}) {
        const source = this._getAssetSourceUrl(asset);
        if (!source) throw new Error(`Missing image source for asset "${asset?.name || "unknown"}".`);

        const texture = await new Promise((resolve, reject) => {
            this.loaders.texture.load(source, resolve, undefined, reject);
        });
        if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;

        const image = texture.image || {};
        const aspect = image.width && image.height ? image.width / image.height : 1;
        const mode = this._getActiveGameViewportMode();
        const height = Number.isFinite(options.height) ? options.height : (mode === "3D" ? 2.4 : 4);
        const width = Number.isFinite(options.width) ? options.width : Math.max(0.4, height * aspect);

        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(width, Math.max(0.4, height)),
            new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                alphaTest: 0.02,
                side: THREE.DoubleSide,
                depthWrite: false,
                toneMapped: false
            }),
        );
        mesh.name = options.name || asset.name.replace(/\.[^.]+$/, "");
        mesh.userData = {
            ...mesh.userData,
            selectable: true,
            disableAutoShadows: true,
            isMediaPlane: true,
            mediaType: asset.type,
            sourceAssetId: asset.id
        };
        return mesh;
    }

    static async _createVideoSceneObject(asset, options = {}) {
        const source = this._getAssetSourceUrl(asset);
        if (!source) throw new Error(`Missing video source for asset "${asset?.name || "unknown"}".`);

        const video = document.createElement("video");
        video.src = source;
        video.crossOrigin = "anonymous";
        video.loop = options.loop ?? true;
        video.muted = options.muted ?? true;
        video.playsInline = true;
        video.preload = options.preload || "auto";

        await new Promise((resolve) => {
            const done = () => resolve();
            video.addEventListener("loadeddata", done, { once: true });
            video.addEventListener("error", done, { once: true });
            video.load();
        });

        if (options.autoplay !== false) {
            video.play().catch(() => { });
        }

        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;
        const image = texture.image || {};
        const aspect = image.videoWidth && image.videoHeight
            ? image.videoWidth / image.videoHeight
            : 16 / 9;
        const mode = this._getActiveGameViewportMode();
        const height = Number.isFinite(options.height) ? options.height : (mode === "3D" ? 2.8 : 4.5);
        const width = Number.isFinite(options.width) ? options.width : Math.max(0.8, height * aspect);

        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(width, Math.max(0.6, height)),
            new THREE.MeshBasicMaterial({
                map: texture,
                side: THREE.DoubleSide,
                toneMapped: false
            }),
        );
        mesh.name = options.name || asset.name.replace(/\.[^.]+$/, "");
        mesh.userData = {
            ...mesh.userData,
            selectable: true,
            disableAutoShadows: true,
            isMediaPlane: true,
            mediaType: "video",
            sourceAssetId: asset.id,
            videoElement: video
        };
        return mesh;
    }

    static _placeMediaObjectInScene(object, asset, event = null, options = {}) {
        const mode = this._getActiveGameViewportMode();
        const position = options.position?.isVector3
            ? options.position.clone()
            : this._resolveDropPosition(event, mode);

        if (options.position && !options.position.isVector3 && typeof options.position === "object") {
            position.set(
                Number.isFinite(options.position.x) ? options.position.x : position.x,
                Number.isFinite(options.position.y) ? options.position.y : position.y,
                Number.isFinite(options.position.z) ? options.position.z : position.z,
            );
        }

        object.position.copy(position);

        if (mode === "3D") {
            const activeCamera = window.getActiveViewportCamera?.() || this.camera;
            if (activeCamera) object.quaternion.copy(activeCamera.quaternion);
        } else {
            object.rotation.set(0, 0, 0);
        }

        window.addObjectToScene(object, options.name || object.name || asset.name);
        return object;
    }

    static async _addToScene(assetId, event = null, options = {}) {
        const asset =
            this._findById(assetId) ||
            this._getPrimitiveAssets().find((a) => a.id === assetId) ||
            this._getLightAssets().find((a) => a.id === assetId);

        if (!asset) {
            console.error(`AssetsPanel: Could not find asset with ID ${assetId}`);
            return;
        }

        if (typeof window.addObjectToScene !== "function") {
            console.error(
                "AssetsPanel Error: window.addObjectToScene() is not defined.",
            );
            return;
        }

        switch (asset.type) {
            case "model": {
                const ext = asset.name.split(".").pop().toLowerCase();
                let loaderPromise;
                const source = this._getAssetSourceUrl(asset);

                // 1. Setup loaders
                if (ext === "glb" || ext === "gltf") {
                    loaderPromise = new Promise((resolve, reject) => {
                        this.loaders.gltf.load(source, resolve, undefined, reject);
                    });
                } else if (ext === "fbx") {
                    loaderPromise = new Promise((resolve, reject) => {
                        this.loaders.fbx.load(source, resolve, undefined, reject);
                    });
                } else if (ext === "obj") {
                    loaderPromise = new Promise((resolve, reject) => {
                        this.loaders.obj.load(source, resolve, undefined, reject);
                    });
                } else {
                    loaderPromise = new Promise((resolve, reject) => {
                        this.loaders.gltf.load(source, resolve, undefined, reject);
                    });
                }

                return loaderPromise
                    .then((loadedContent) => {
                        let modelObject = loadedContent.scene || loadedContent;
                        let animations = loadedContent.animations || [];
                        let hasBones = false;

                        // --- A. PHYSICAL PROPERTIES PASS ---
                        modelObject.traverse((child) => {
                            if (child.isBone || child.isSkinnedMesh || child.skeleton) {
                                hasBones = true;
                            }
                            if (child.isMesh) {
                                child.castShadow = true;
                                child.receiveShadow = true;

                                if (child.material) {
                                    child.material.shadowSide = THREE.DoubleSide;

                                    const isBuilding = asset.name
                                        .toLowerCase()
                                        .match(/(house|building|wall|room|floor)/);
                                    if (isBuilding) {
                                        child.material.side = THREE.DoubleSide;
                                    }
                                }
                            }
                        });

                        // Ensure world matrices are up to date before bounding calculations
                        modelObject.updateMatrixWorld(true);

                        // --- B. AUTO-SCALING WITH SAFETY ---
                        const bbox = new THREE.Box3().setFromObject(modelObject);
                        const size = bbox.getSize(new THREE.Vector3());
                        const targetHeight = 1.8;
                        if (size.y > 0.0001 && Number.isFinite(size.y)) {
                            const scaleFactor = targetHeight / size.y;
                            if (Number.isFinite(scaleFactor) && scaleFactor > 0.0001 && scaleFactor < 500) {
                                modelObject.scale.setScalar(scaleFactor);
                                modelObject.updateMatrixWorld(true);
                            }
                        }

                        // --- C. GROUNDING WITH SAFETY ---
                        const groundedBbox = new THREE.Box3().setFromObject(modelObject);
                        if (Number.isFinite(groundedBbox.min.y) && Math.abs(groundedBbox.min.y) < 10000) {
                            modelObject.position.y = -groundedBbox.min.y;
                        }

                        modelObject.animations = animations;

                        // Add to scene once
                        window.addObjectToScene(
                            modelObject,
                            asset.name.split('.').slice(0, -1).join('.')
                        );

                        // --- D. ANIMATION & TIMELINE REGISTRATION ---
                        if (animations && animations.length > 0) {
                            if (!modelObject.userData.mixer) {
                                modelObject.userData.mixer = new THREE.AnimationMixer(modelObject);
                            }
                            if (typeof extractAnimationsToTimeline === 'function') {
                                extractAnimationsToTimeline(modelObject, animations);
                            }
                            window.selectedObject = modelObject;
                            if (window.SelectionManager) {
                                window.SelectionManager.select(modelObject);
                            }
                            setTimeout(() => {
                                if (typeof window.updateLayersUI === 'function') window.updateLayersUI();
                                if (typeof window.updateKeyframesUI === 'function') window.updateKeyframesUI();
                                if (typeof window.updateHierarchy === 'function') window.updateHierarchy();
                            }, 50);
                        }

                        // --- E. AUTOMATIC RIG SETUP ---
                        if (hasBones && window.rigManager) {
                            setTimeout(() => {
                                window.rigManager.setupRigForObject(modelObject);
                                window.rigManager.showRigForObject(modelObject);
                                if (window.advancedControlRig?.setActiveObject) {
                                    window.advancedControlRig.setActiveObject(modelObject);
                                }
                                if (typeof updateTimelineHierarchy === "function")
                                    updateTimelineHierarchy();
                            }, 100);
                        }

                        // --- F. ENGINE SENTINEL & LUMEN SYNC ---
                        if (window.lumenSystem && size.y > 5) {
                            window.lumenSystem.updateReflections();
                        }

                        if (typeof updateHierarchy === "function") updateHierarchy();
                        if (typeof this.onAssetAdded === "function")
                            this.onAssetAdded(asset);

                        return modelObject;
                    })
                    .catch((error) => {
                        console.error(
                            `AssetsPanel: Failed to load model '${asset.name}':`,
                            error,
                        );
                        return null;
                    });
            }

            case "texture":
            case "image":
            case "icon": {
                try {
                    const mediaObject = await this._createImageLikeSceneObject(asset, options);
                    return this._placeMediaObjectInScene(mediaObject, asset, event, options);
                } catch (error) {
                    console.error(`AssetsPanel: Failed to place media asset '${asset.name}'.`, error);
                    return null;
                }
            }

            case "video": {
                try {
                    const mediaObject = await this._createVideoSceneObject(asset, options);
                    return this._placeMediaObjectInScene(mediaObject, asset, event, options);
                } catch (error) {
                    console.error(`AssetsPanel: Failed to place video asset '${asset.name}'.`, error);
                    return null;
                }
            }

            case "audio": {
                console.warn(`AssetsPanel: '${asset.name}' is an audio asset. Use it from scripts via Assets.getAudio().`);
                return null;
            }

            case "hdri": {
                try {
                    await this._applyHDRIAsset(asset);
                } catch (error) {
                    console.error(`AssetsPanel: Failed to apply HDRI '${asset.name}'.`, error);
                }
                return null;
            }

            case "material": {
                let targetMesh = null;

                if (event && this.renderer?.domElement && this.camera) {
                    const rect = this.renderer.domElement.getBoundingClientRect();
                    const mouse = new THREE.Vector2(
                        ((event.clientX - rect.left) / rect.width) * 2 - 1,
                        -((event.clientY - rect.top) / rect.height) * 2 + 1,
                    );
                    this.raycaster.setFromCamera(mouse, this.camera);
                    const intersects = this.raycaster.intersectObjects(
                        this.scene.children,
                        true,
                    );
                    targetMesh = intersects.find((it) => it.object?.isMesh)?.object || null;
                }

                // Fallbacks for non-drop usage (double-click, keyboard workflows).
                if (!targetMesh && window.selectedObject?.isMesh) {
                    targetMesh = window.selectedObject;
                }

                if (!targetMesh) {
                    console.warn("AssetsPanel: Select or drop onto a mesh to apply material.");
                    return;
                }

                this._applyMaterialToMesh(asset, targetMesh);
                return targetMesh;
            }

            case "city": {
                const city = asset.factory?.();

                if (!city) {
                    console.error(
                        "AssetsPanel: City factory failed for " + asset.name
                    );
                    return null;
                }

                const position = options.position?.isVector3
                    ? options.position.clone()
                    : this._resolveDropPosition(event, "3D");

                city.position.copy(position);
                city.updateMatrixWorld(true);

                const bounds = new THREE.Box3().setFromObject(city);

                if (!bounds.isEmpty() && Number.isFinite(bounds.min.y)) {
                    city.position.y -= bounds.min.y;
                }

                city.userData = {
                    ...city.userData,
                    selectable: true,
                    isSelectableRoot: true,
                    isCityRoot: true,
                    isProceduralCity: true,
                    isSystemObject: false,
                    ignoreInHierarchy: false,
                    sourceAssetId: asset.id
                };

                city.traverse(child => {
                    child.userData = {
                        ...child.userData,
                        selectable: true,
                        isCityObject: true,
                        isSystemObject: false,
                        ignoreInHierarchy: false,
                        sourceAssetId: asset.id
                    };

                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                window.addObjectToScene(city, asset.name);
                window.transformControls?.attach?.(city);
                window.updateHierarchy?.();

                return city;
            }

            case "obstacle": {
                const obstacle = asset.factory?.();
                if (!obstacle) {
                    console.error("AssetsPanel: Obstacle factory failed for " + asset.name);
                    return null;
                }

                const mode = this._getActiveGameViewportMode();
                const position = options.position?.isVector3
                    ? options.position.clone()
                    : this._resolveDropPosition(event, mode);

                if (options.position && !options.position.isVector3 && typeof options.position === "object") {
                    position.set(
                        Number.isFinite(options.position.x) ? options.position.x : position.x,
                        Number.isFinite(options.position.y) ? options.position.y : position.y,
                        Number.isFinite(options.position.z) ? options.position.z : position.z
                    );
                }

                obstacle.position.copy(position);
                obstacle.updateMatrixWorld(true);

                const bounds = new THREE.Box3().setFromObject(obstacle);
                const groundY = options.position && Number.isFinite(options.position.y)
                    ? options.position.y
                    : 0;
                if (!bounds.isEmpty() && Number.isFinite(bounds.min.y)) {
                    obstacle.position.y += groundY - bounds.min.y;
                }

                obstacle.userData = {
                    ...obstacle.userData,
                    selectable: true,
                    isSelectableRoot: true,
                    isGameObstacle: true,
                    isSystemObject: false,
                    ignoreInHierarchy: false,
                    sourceAssetId: asset.id
                };

                obstacle.traverse((child) => {
                    child.userData = {
                        ...child.userData,
                        selectable: true,
                        isSystemObject: false,
                        ignoreInHierarchy: false,
                        sourceAssetId: asset.id
                    };
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                window.addObjectToScene(obstacle, asset.name);
                window.transformControls?.attach?.(obstacle);
                window.updateHierarchy?.();
                return obstacle;
            }

            case "primitive": {
                const mesh = asset.factory();
                window.addObjectToScene(mesh, asset.name);
                return mesh;
            }

            case "light": {
                const light = asset.factory();
                window.addObjectToScene(light, asset.name);
                return light;
            }

            case "prefab": {
                console.warn(`AssetsPanel: Prefab placement is not fully implemented yet for '${asset.name}'.`);
                return null;
            }

            case "scene": {
                if (!asset.data) return null;
                try {
                    const objectsData = JSON.parse(asset.data);
                    const loader = new THREE.ObjectLoader();
                    const sceneGroup = new THREE.Group();
                    sceneGroup.name = asset.name.replace(/\.scene$/i, "");

                    // Parse and reconstruct all objects in the scene file
                    objectsData.forEach(jsonObj => {
                        const loadedObj = loader.parse(jsonObj);
                        sceneGroup.add(loadedObj);
                    });

                    const position = options.position?.isVector3
                        ? options.position.clone()
                        : this._resolveDropPosition(event, "3D");

                    sceneGroup.position.copy(position);
                    window.addObjectToScene(sceneGroup, sceneGroup.name);
                    window.updateHierarchy?.();
                    return sceneGroup;
                } catch (err) {
                    console.error(`AssetsPanel: Failed to parse scene file '${asset.name}':`, err);
                    return null;
                }
            }
        }
    }

    /**
     * BONUS: Helper method to manually trigger rig detection
     * Call this if you load models through other methods
     */
    static setupRigsForScene() {
        if (!window.rigManager) {
            console.error("RigManager not initialized. Cannot setup rigs.");
            return;
        }

        console.log("AssetsPanel: Scanning entire scene for rigs...");
        const rigsFound = window.rigManager.scanSceneForRigs();

        if (rigsFound === 0) {
            console.log("  └─ No rigs found in scene");
        } else {
            console.log(`  └─ ✓ ${rigsFound} rig(s) initialized`);
        }

        return rigsFound;
    }

    /**
     * BONUS: Call this when deleting objects to clean up rig visuals
     */
    static removeObjectFromScene(object) {
        if (!object) return;

        // Check if object has rig
        let hasBones = false;
        object.traverse((n) => {
            if (n.isBone && n.userData.hasVisual) {
                hasBones = true;
            }
        });

        // Remove rig visuals if present
        if (hasBones && window.rigManager) {
            console.log("AssetsPanel: Removing rig visuals...");
            window.rigManager.removeRigForObject(object);
        }

        // Remove from scene
        if (object.parent) {
            object.parent.remove(object);
        }

        // Dispose of resources
        object.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach((m) => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });

        console.log("AssetsPanel: Object removed from scene");
    }
    // --- Preview Logic (unchanged for core, now handles material definitions referencing assets) ---
    static async _updatePreview(asset) {
        if (!this.previewScene || !this.dom.assetPreviewContainer) return;

        this._clearPreview();
        this.dom.assetPreviewContainer.classList.add("loading");

        try {
            if (asset.type === "model") {
                const ext = asset.name.split(".").pop().toLowerCase();
                let loaderPromise;

                if (ext === "glb" || ext === "gltf" || ext === "uasset" || ext === "umap" || asset.sourceFormat === "unreal" || asset.unreal) {
                    const modelUrl = asset.data || asset.runtimeURL;
                    loaderPromise = new Promise((resolve, reject) =>
                        this.loaders.gltf.load(
                            modelUrl,
                            (gltf) => resolve(gltf.scene),
                            undefined,
                            reject,
                        ),
                    );
                } else if (ext === "fbx") {
                    loaderPromise = new Promise((resolve, reject) =>
                        this.loaders.fbx.load(
                            asset.data,
                            (obj) => resolve(obj),
                            undefined,
                            reject,
                        ),
                    );
                } else if (ext === "obj") {
                    loaderPromise = new Promise((resolve, reject) =>
                        this.loaders.obj.load(
                            asset.data,
                            (obj) => resolve(obj),
                            undefined,
                            reject,
                        ),
                    );
                } else {
                    console.warn(
                        `Preview: No specific loader for model type '${ext}' (asset: ${asset.name}).`,
                    );
                    this._clearPreview();
                    return;
                }

                this.previewModel = await loaderPromise;

                // Scale and center the model in the preview scene
                const bbox = new THREE.Box3().setFromObject(this.previewModel);
                if (!bbox.isEmpty()) {
                    const size = bbox.getSize(new THREE.Vector3());
                    const center = bbox.getCenter(new THREE.Vector3());
                    const maxDim = Math.max(size.x, size.y, size.z);
                    const scaleFactor = 1.5 / maxDim; // Target max dim of 1.5 units for preview

                    this.previewModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
                    this.previewModel.position.sub(
                        center.clone().multiplyScalar(scaleFactor),
                    ); // Adjust position after scaling
                } else {
                    console.warn(
                        `Preview: Model '${asset.name}' bounding box is empty. Displaying empty preview.`,
                    );
                    this._clearPreview(); // Clear on empty model
                    return;
                }

                this.previewScene.add(this.previewModel);
                this.previewControls.target.set(0, 0, 0); // Recenter orbit controls target
                this.previewCamera.position.set(
                    0,
                    0,
                    Math.max(2, (bbox.max.z - bbox.min.z) * 1.5),
                ); // Adjust camera distance
                this.previewControls.update();
            } else if (asset.type === "obstacle" && typeof asset.factory === "function") {
                this.previewModel = asset.factory();
                const bounds = new THREE.Box3().setFromObject(this.previewModel);
                if (!bounds.isEmpty()) {
                    const size = bounds.getSize(new THREE.Vector3());
                    const center = bounds.getCenter(new THREE.Vector3());
                    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
                    const scale = 1.65 / maxDim;
                    this.previewModel.scale.setScalar(scale);
                    this.previewModel.position.sub(center.multiplyScalar(scale));
                }
                this.previewScene.add(this.previewModel);
                this.previewCamera.position.set(2.2, 1.7, 2.8);
                this.previewControls.target.set(0, 0, 0);
                this.previewControls.update();
            } else if (asset.type === "material") {
                const material = new THREE.MeshStandardMaterial({
                    color: asset.definition.color
                        ? new THREE.Color(asset.definition.color)
                        : 0xffffff,
                    roughness: asset.definition.roughness ?? 0.5,
                    metalness: asset.definition.metalness ?? 0.0,
                    emissive: asset.definition.emissive
                        ? new THREE.Color(asset.definition.emissive)
                        : 0x000000,
                    emissiveIntensity: asset.definition.emissiveIntensity ?? 1,
                });
                // IMPORTANT: Fetch texture data from referenced assets, not direct data URLs in definition
                const texturePromises = [];
                const slots = [
                    ["map", "map", true],
                    ["normalMap", "normalMap"],
                    ["roughnessMap", "roughnessMap"],
                    ["metalnessMap", "metalnessMap"],
                    ["aoMap", "aoMap"],
                    ["emissiveMap", "emissiveMap", true],
                    ["displacementMap", "displacementMap"],
                    ["alphaMap", "opacityMap"],
                    ["clearcoatMap", "clearcoatMap"],
                    ["clearcoatRoughnessMap", "clearcoatRoughnessMap"],
                    ["clearcoatNormalMap", "clearcoatNormalMap"],
                    ["transmissionMap", "transmissionMap"],
                    ["thicknessMap", "thicknessMap"],
                    ["specularIntensityMap", "specularIntensityMap"],
                    ["specularColorMap", "specularColorMap", true],
                ];
                for (const [k, slotKey, color] of slots) {
                    const textureAssetId = asset.definition[slotKey]; // Get texture asset ID
                    const textureAsset = textureAssetId
                        ? this._findById(textureAssetId)
                        : null;

                    if (textureAsset && this._isTextureCompatibleAssetType(textureAsset.type)) {
                        texturePromises.push(
                            this._loadMaterialTextureAsset(textureAsset, {
                                color: color === true,
                                tiling: asset.definition.tiling ?? 1,
                                binding: asset.definition.textureBindings?.[slotKey] || null
                            }).then((texture) => {
                                if (texture) material[k] = texture;
                                material.needsUpdate = true;
                            })
                        );
                    }
                }
                await Promise.all(texturePromises);
                this.previewModel = new THREE.Mesh(
                    new THREE.SphereGeometry(1, 32, 16),
                    material,
                );
                this.previewScene.add(this.previewModel);
                this.previewCamera.position.set(0, 0, 2);
                this.previewControls.target.set(0, 0, 0);
                this.previewControls.update();
            } else if (asset.type === "texture" || asset.type === "image" || asset.type === "icon" || asset.type === "hdri") {
                const resolvedHDRI = asset.type === "hdri"
                    ? (window.SMHDRIPackage?.sourceFromAsset?.(asset, this) || null)
                    : null;
                const source = this._getAssetSourceUrl(resolvedHDRI?.asset || asset);
                const loader = resolvedHDRI?.kind === "exr"
                    ? this.loaders.exr
                    : resolvedHDRI?.kind === "hdr"
                        ? this.loaders.hdri
                        : this.loaders.texture;
                const texture = await new Promise((res) => {
                    if (!loader || !source) {
                        res(null);
                        return;
                    }
                    loader.load(source, res, undefined, res);
                });
                if (asset.type === "hdri" && texture)
                    texture.mapping = THREE.EquirectangularReflectionMapping;

                const material = new THREE.MeshBasicMaterial({
                    map: texture,
                    side: THREE.DoubleSide,
                });
                // Use a sphere for HDRI preview to show mapping better, plane for regular texture
                this.previewModel = new THREE.Mesh(
                    asset.type === "hdri"
                        ? new THREE.SphereGeometry(1, 32, 16)
                        : new THREE.PlaneGeometry(2, 2),
                    material,
                );
                this.previewScene.add(this.previewModel);
                this.previewCamera.position.set(0, 0, 2);
                this.previewControls.target.set(0, 0, 0);
                this.previewControls.update();
            } else if (asset.type === "video") {
                const video = document.createElement("video");
                video.src = this._getAssetSourceUrl(asset);
                video.crossOrigin = "anonymous";
                video.muted = true;
                video.loop = true;
                video.playsInline = true;
                await new Promise((resolve) => {
                    const done = () => resolve();
                    video.addEventListener("loadeddata", done, { once: true });
                    video.addEventListener("error", done, { once: true });
                    video.load();
                });
                video.play().catch(() => { });
                const texture = new THREE.VideoTexture(video);
                texture.colorSpace = THREE.SRGBColorSpace;
                const material = new THREE.MeshBasicMaterial({
                    map: texture,
                    side: THREE.DoubleSide,
                    toneMapped: false
                });
                this.previewModel = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
                this.previewModel.userData.previewVideoElement = video;
                this.previewScene.add(this.previewModel);
                this.previewCamera.position.set(0, 0, 2);
                this.previewControls.target.set(0, 0, 0);
                this.previewControls.update();
            } else if (asset.type === "code" || asset.type === "prefab") {
                // NEW: No visual preview for code/prefab
                this._clearPreview();
                this.dom.assetPreviewContainer.classList.add("empty"); // Show empty state for code/prefab
                return;
            }
            // If anything was successfully loaded, remove the 'empty' class
            if (this.previewModel) {
                this.dom.assetPreviewContainer.classList.remove("empty");
            } else {
                this.dom.assetPreviewContainer.classList.add("empty"); // Fallback to empty if model somehow wasn't set
            }
        } catch (error) {
            console.error("Error loading preview asset:", error);
            this._clearPreview(); // Clear on error
        } finally {
            this.dom.assetPreviewContainer.classList.remove("loading");
        }
    }

    static _clearPreview() {
        if (this.previewScene) {
            // Dispose of previous preview model if it exists
            if (this.previewModel) {
                const previewVideo = this.previewModel.userData?.previewVideoElement;
                if (previewVideo) {
                    previewVideo.pause();
                    previewVideo.removeAttribute("src");
                    previewVideo.load();
                }
                this.previewScene.remove(this.previewModel);
                this._disposeHierarchy(this.previewModel); // Custom recursive dispose
                this.previewModel = null;
            }

            // Reset camera and controls to default state
            this.previewCamera.position.set(0, 0, 3);
            this.previewControls.target.set(0, 0, 0);
            this.previewControls.update();

            // Show the "Select an asset for preview" overlay
            this.dom.assetPreviewContainer.classList.add("empty");
            this.dom.assetPreviewContainer.classList.remove("loading");
        }
    }

    // Helper to dispose of Three.js objects recursively (unchanged)
    static _disposeHierarchy(object) {
        if (!object) return;
        // Dispose geometry
        if (object.geometry) {
            object.geometry.dispose();
            object.geometry = undefined;
        }
        // Dispose material(s) and textures
        if (object.material) {
            const materials = Array.isArray(object.material)
                ? object.material
                : [object.material];
            for (const material of materials) {
                for (const key in material) {
                    if (
                        material[key] &&
                        typeof material[key].isTexture === "boolean" &&
                        material[key].isTexture
                    ) {
                        material[key].dispose();
                        material[key] = undefined;
                    }
                }
                material.dispose();
                material = undefined;
            }
        }
        // Recursively dispose children
        if (object.children) {
            // Important: iterate backwards when removing children from a collection being traversed
            for (let i = object.children.length - 1; i >= 0; i--) {
                this._disposeHierarchy(object.children[i]);
                object.remove(object.children[i]); // Remove from parent after disposing
            }
        }
    }

    // ------------------------------------------------------------------
    // Persistent Asset Library (IndexedDB + optional device folder)
    // ------------------------------------------------------------------
}
for(const key of Reflect.ownKeys(SMAssetsPanelScenePreviewMixin)){
if(key==="length"||key==="name"||key==="prototype")continue;
const descriptor=Object.getOwnPropertyDescriptor(SMAssetsPanelScenePreviewMixin,key);
if(!descriptor)continue;
Object.defineProperty(AssetsPanel,key,descriptor);
}
global.__SMAssetsPanelLoadedModules=global.__SMAssetsPanelLoadedModules||[];
global.__SMAssetsPanelLoadedModules.push("AssetsPanelScenePreview");
})(window);

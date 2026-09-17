(function () {
    'use strict';
    class SMAssetReferenceScanner {
        constructor(options = {}) {
            this.extensions = new Set((options.extensions || SMAssetReferenceScanner.defaultExtensions()).map(ext => String(ext).toLowerCase()));
            this.assetKeys = new Set(options.assetKeys || ['src', 'url', 'uri', 'path', 'asset', 'assetPath', 'assetId', 'model', 'texture', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'envMap', 'audio', 'clip', 'font', 'icon', 'thumbnail', 'prefabId', 'materialId', 'textureId', 'animationId']);
            this.maxDepth = Math.max(4, Number(options.maxDepth || 32));
            this.includeExternal = options.includeExternal !== false;
            this.graph = options.graph || new window.SMAssetDependencyGraph();
            this.references = [];
            this._seen = new WeakSet();
        }
        scanProject(project, options = {}) {
            this.reset();
            const rootId = String(options.rootId || 'project');
            this.graph.addNode(rootId, { type: 'project', path: rootId });
            this.scanValue(project, rootId, 'project', 0);
            return this.result([rootId]);
        }
        scanRuntime(options = {}) {
            this.reset();
            const roots = [];
            const scene = options.scene || window.scene;
            if (scene) {
                const id = 'scene:active';
                roots.push(id);
                this.graph.addNode(id, { type: 'scene', path: id });
                this.scanObject3D(scene, id);
            }
            const levelRegistry = options.levelRegistry || window.SMLevelRegistry;
            const levels = levelRegistry?.list?.() || [];
            for (const level of levels) {
                const id = `level:${level.id}`;
                roots.push(id);
                this.graph.addNode(id, { type: 'level', path: level.id, metadata: { levelId: level.id } });
                this.scanValue(level, id, 'level', 0);
            }
            const prefabRegistry = options.prefabRegistry || window.SMPrefabRegistry;
            const prefabs = prefabRegistry?.list?.() || [];
            for (const item of prefabs) {
                const prefab = item?.prefab || item;
                if (!prefab) continue;
                const id = `prefab:${prefab.id || item.id || Math.random().toString(36).slice(2)}`;
                roots.push(id);
                this.graph.addNode(id, { type: 'prefab', path: prefab.id || item.id || id });
                this.scanValue(prefab, id, 'prefab', 0);
            }
            return this.result(roots);
        }
        scanObject3D(root, parentId = 'scene:active') {
            if (!root) return;
            const visit = object => {
                const objectId = `object:${object.uuid || object.name || Math.random().toString(36).slice(2)}`;
                this.graph.addNode(objectId, { type: 'object', path: object.name || object.uuid || objectId, metadata: { uuid: object.uuid || null, name: object.name || '' } });
                this.graph.addDependency(parentId, objectId);
                this.scanValue(object.userData, objectId, 'userData', 0);
                this._scanMaterial(object.material, objectId);
                this._scanGeometry(object.geometry, objectId);
                for (const clip of object.animations || []) this.scanValue(clip, objectId, 'animation', 0);
            };
            if (root.traverse) root.traverse(visit);
            else visit(root);
        }
        scanValue(value, parentId, context = 'value', depth = 0, path = '') {
            if (value === null || value === undefined || depth > this.maxDepth) return;
            if (typeof value === 'string') {
                this._captureString(value, parentId, context, path);
                return;
            }
            if (typeof value !== 'object') return;
            if (value.isObject3D) {
                this.scanObject3D(value, parentId);
                return;
            }
            if (value instanceof ArrayBuffer || ArrayBuffer.isView(value) || value instanceof Blob) return;
            if (this._seen.has(value)) return;
            this._seen.add(value);
            if (Array.isArray(value)) {
                for (let i = 0; i < value.length; i++)this.scanValue(value[i], parentId, context, depth + 1, `${path}[${i}]`);
                return;
            }
            for (const [key, child] of Object.entries(value)) {
                if (typeof child === 'function') continue;
                const childPath = path ? `${path}.${key}` : key;
                if (typeof child === 'string' && this.assetKeys.has(key)) this._captureString(child, parentId, key, childPath, true);
                else this.scanValue(child, parentId, key, depth + 1, childPath);
            }
        }
        result(roots = []) {
            return { graph: this.graph, references: [...this.references], roots: [...roots], cycles: this.graph.findCycles(), reachable: this.graph.reachableFrom(roots) };
        }
        reset() {
            this.graph.clear();
            this.references.length = 0;
            this._seen = new WeakSet();
            return this;
        }
        static defaultExtensions() {
            return ['.glb', '.gltf', '.fbx', '.obj', '.dae', '.stl', '.ply', '.3ds', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tga', '.hdr', '.exr', '.ktx', '.ktx2', '.dds', '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.mp4', '.webm', '.json', '.bin', '.wasm', '.ttf', '.otf', '.woff', '.woff2', '.svg', '.css', '.js', '.smetaudio', '.smprefab', '.smlevel'];
        }
        _scanMaterial(material, parentId) {
            const list = Array.isArray(material) ? material : [material];
            for (const item of list) {
                if (!item) continue;
                const id = `material:${item.uuid || item.name || Math.random().toString(36).slice(2)}`;
                this.graph.addNode(id, { type: 'material', path: item.name || item.uuid || id });
                this.graph.addDependency(parentId, id);
                for (const [key, value] of Object.entries(item)) {
                    if (value?.isTexture) {
                        const textureId = `texture:${value.uuid || value.name || Math.random().toString(36).slice(2)}`;
                        this.graph.addNode(textureId, { type: 'texture', path: value.name || value.uuid || textureId });
                        this.graph.addDependency(id, textureId);
                        const src = value.image?.currentSrc || value.image?.src || value.source?.data?.src || value.userData?.src || value.userData?.path;
                        if (src) this._captureString(src, textureId, 'texture', key, true);
                    } else if (key === 'userData') this.scanValue(value, id, 'material.userData', 0);
                }
            }
        }
        _scanGeometry(geometry, parentId) {
            if (!geometry) return;
            const id = `geometry:${geometry.uuid || geometry.name || Math.random().toString(36).slice(2)}`;
            this.graph.addNode(id, { type: 'geometry', path: geometry.name || geometry.uuid || id });
            this.graph.addDependency(parentId, id);
            this.scanValue(geometry.userData, id, 'geometry.userData', 0);
        }
        _captureString(value, parentId, context, path, force = false) {
            const raw = String(value || '').trim();
            if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return;
            const normalized = raw.replace(/\\/g, '/');
            const clean = normalized.split(/[?#]/)[0];
            const lower = clean.toLowerCase();
            const external = /^(https?:)?\/\//i.test(normalized);
            const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : '';
            const looksLikeAsset = force || this.extensions.has(ext) || normalized.startsWith('assets/') || normalized.startsWith('./assets/') || normalized.startsWith('../assets/');
            if (!looksLikeAsset) return;
            if (external && !this.includeExternal) return;
            const id = `asset:${normalized}`;
            this.graph.addNode(id, { type: this._typeFromExtension(ext), path: normalized, external, metadata: { extension: ext } });
            this.graph.addDependency(parentId, id);
            if (!this.references.some(ref => ref.id === id && ref.parentId === parentId)) this.references.push({ id, parentId, path: normalized, context, pathHint: path, external, type: this._typeFromExtension(ext) });
        }
        _typeFromExtension(ext) {
            if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tga', '.hdr', '.exr', '.ktx', '.ktx2', '.dds', '.svg'].includes(ext)) return 'texture';
            if (['.glb', '.gltf', '.fbx', '.obj', '.dae', '.stl', '.ply', '.3ds'].includes(ext)) return 'model';
            if (['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'].includes(ext)) return 'audio';
            if (['.mp4', '.webm'].includes(ext)) return 'video';
            if (['.ttf', '.otf', '.woff', '.woff2'].includes(ext)) return 'font';
            if (['.js', '.css', '.json', '.bin', '.wasm'].includes(ext)) return 'code-data';
            return 'asset';
        }
        debug() {
            const state = { references: this.references.length, nodes: this.graph.nodes.size, cycles: this.graph.findCycles() };
            console.log('[SMAssetReferenceScanner]', state);
            return state;
        }
    }
    window.SMAssetReferenceScanner = SMAssetReferenceScanner;
    window.SMAssetReferenceScannerClass = SMAssetReferenceScanner;
})();
class SMPlayerAnimationLoader {
    constructor(manifest = window.SMPlayerAnimationManifest, character = null) {
        this.manifest = manifest;
        this.character = character;
        this.loader = null;
        this.clips = new Map();
        this.failed = new Map();
        this.loadingPromise = null;
        this.nodeMap = new Map();
        this._idleWarningIssued = false;
        this._buildNodeMap();
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
    _normalizeNodeName(name) {
        return String(name || '')
            .toLowerCase()
            .replace(/mixamorig/g, '')
            .replace(/[^a-z0-9]/g, '');
    }
    _buildNodeMap() {
        this.nodeMap.clear();
        const root = this.character?.visual || this.character?.model;
        if (!root) return;
        root.traverse(node => {
            if (!node.name) return;
            node.userData = node.userData || {};
            const baseName = node.userData.smPlayerBoneBaseName || node.name;
            node.userData.smPlayerBoneBaseName = baseName;
            const normalized = this._normalizeNodeName(baseName);
            if (!normalized) return;
            const targets = this.nodeMap.get(normalized) || [];
            // player.fbx has several skinned meshes with duplicate Mixamo
            // names. AnimationMixer can only bind one object per name, so
            // duplicate bones receive stable names and duplicate tracks.
            if (node.isBone && targets.length > 0) {
                const uniqueName = `${baseName}__smBone${targets.length + 1}`;
                if (node.name !== uniqueName) node.name = uniqueName;
            }
            targets.push(node.name);
            this.nodeMap.set(normalized, targets);
        });
        console.log('[PlayerAnimationLoader] Character rig mapped:', {
            uniqueNodes: this.nodeMap.size,
            targets: Array.from(this.nodeMap.values()).reduce((count, names) => count + names.length, 0)
        });
    }
    _findCharacterNodeNames(animationNodeName) {
        const normalized = this._normalizeNodeName(animationNodeName);
        if (this.nodeMap.has(normalized)) {
            return this.nodeMap.get(normalized);
        }
        // Fuzzy fallback: only accept a suffix/prefix match when it's the
        // ONE unambiguous candidate. A generic character bone name ("Hand")
        // matching both "LeftHand" and "RightHand" tracks was collapsing
        // distinct bones onto one target — corrupting the pose.
        const candidates = [];
        for (const [key, realNames] of this.nodeMap.entries()) {
            if (key.endsWith(normalized) || normalized.endsWith(key)) {
                candidates.push(realNames);
            }
        }
        if (candidates.length === 1) {
            return candidates[0];
        }
        if (candidates.length > 1) {
            console.warn(`[PlayerAnimationLoader] Ambiguous bone match for "${animationNodeName}" — ${candidates.length} candidates, skipping track instead of guessing.`);
        }
        return [];
    }
    _retargetClip(sourceClip, key) {
        const clip = sourceClip.clone();
        clip.name = key;
        const tracks = [];
        let mapped = 0;
        let missing = 0;
        let filtered = 0;
        clip.tracks.forEach(sourceTrack => {
            const originalName = String(sourceTrack.name || '');
            const propertyDot = originalName.lastIndexOf('.');
            if (propertyDot === -1) {
                tracks.push(sourceTrack.clone());
                return;
            }
            const animationNodeName = originalName.substring(0, propertyDot);
            const propertyName = originalName.substring(propertyDot);
            const realNodeNames = this._findCharacterNodeNames(animationNodeName);
            if (!realNodeNames.length) {
                missing++;
                return;
            }
            const normalizedNode = this._normalizeNodeName(animationNodeName);
            const isRootBone =
                normalizedNode === 'hips' ||
                normalizedNode === 'root' ||
                normalizedNode === 'armature';
            realNodeNames.forEach((realNodeName, duplicateIndex) => {
                // Do not animate bind-pose scale or child-bone translation.
                // They can stretch a skinned mesh when clips come from a
                // different FBX export.
                if (propertyName === '.scale') {
                    filtered++;
                    return;
                }
                if (propertyName === '.position' && !isRootBone) {
                    filtered++;
                    return;
                }
                // Root motion belongs to one canonical root. Applying it to
                // nested duplicate skeletons compounds their local offsets.
                if (propertyName === '.position' && isRootBone && duplicateIndex > 0) {
                    filtered++;
                    return;
                }
                // NEW: duplicate bones (separate skinned-mesh rigs) rarely share the
                // primary's bind rotation. Applying the same quaternion track to them
                // twists/detaches that mesh instead of animating it correctly.
                if (propertyName === '.quaternion' && duplicateIndex > 0) { filtered++; return; }
                const track = sourceTrack.clone();
                track.name = `${realNodeName}${propertyName}`;
                if (track.values && !Array.from(track.values).every(Number.isFinite)) {
                    filtered++;
                    return;
                }
                if (
                    isRootBone &&
                    propertyName === '.position' &&
                    track.values?.length >= 3
                ) {
                    const baseX = track.values[0];
                    const baseZ = track.values[2];
                    for (let i = 0; i < track.values.length; i += 3) {
                        track.values[i] = baseX;
                        track.values[i + 2] = baseZ;
                    }
                }
                tracks.push(track);
                mapped++;
            });
        });
        clip.tracks = tracks;
        clip.resetDuration();
        console.log(`[PlayerAnimationLoader] ${key}: ${mapped} tracks mapped, ${missing} tracks skipped, ${filtered} unsafe tracks filtered.`);
        return clip;
    }
    loadAll() {
        if (this.loadingPromise) return this.loadingPromise;
        this._buildNodeMap();
        const entries = Object.entries(this.manifest || {});
        this.failed.clear();
        this.loadingPromise = Promise.all(
            entries.map(([key, definition]) =>
                this._loadOne(key, definition).catch(error => {
                    this.failed.set(key, { definition, error });
                    console.error(`[PlayerAnimationLoader] Continuing without ${key}:`, error);
                    return null;
                })
            )
        ).then(() => {
            const parkourKeys = ['BIG_JUMP', 'CLIMB_UP_WALL', 'CLIMB', 'FALL_ROLL', 'VAULT'];
            const missingParkour = parkourKeys.filter(key => !this.clips.has(key));
            console.log('[PlayerAnimationLoader] Animation load summary:', {
                loaded: this.clips.size,
                failed: Array.from(this.failed.keys()),
                parkourReady: missingParkour.length === 0,
                missingParkour
            });
            return this.clips;
        });
        return this.loadingPromise;
    }
    _loadOne(key, definition) {
        return new Promise((resolve, reject) => {
            this._getLoader().load(definition.file, fbx => {
                const sourceClip = fbx.animations?.[0];
                if (!sourceClip) {
                    console.warn(`[PlayerAnimationLoader] No animation inside: ${definition.file}`);
                    resolve(null);
                    return;
                }
                const clip = this._retargetClip(sourceClip, key);
                if (!clip.tracks.length) {
                    console.error(`[PlayerAnimationLoader] ${key} has ZERO compatible tracks after retargeting.`);
                    resolve(null);
                    return;
                }
                this.clips.set(key, clip);
                console.log(`[PlayerAnimationLoader] Loaded ${key}:`, {
                    file: definition.file,
                    duration: clip.duration,
                    tracks: clip.tracks.length
                });
                resolve(clip);
            }, undefined, error => {
                console.error(`[PlayerAnimationLoader] Failed ${key}:`, definition.file, error);
                reject(error);
            });
        });
    }
    registerEmbeddedIdle(character = this.character) {
        const embedded = Array.isArray(character?.embeddedAnimations)
            ? character.embeddedAnimations
            : [];
        const validEmbedded = embedded.filter(clip => {
            if (!clip) return false;
            if (!Number.isFinite(clip.duration)) return false;
            if (clip.duration < 0.25) return false;
            if (!Array.isArray(clip.tracks) || clip.tracks.length === 0) return false;
            return true;
        });
        if (validEmbedded.length) {
            const namedIdle = validEmbedded.find(clip => {
                const name = String(clip?.name || '').toLowerCase();
                return name.includes('idle') ||
                    name.includes('stand') ||
                    name.includes('breath');
            });
            if (namedIdle) {
                const idleClip = this._retargetClip(namedIdle, 'IDLE');
                this.clips.set('IDLE', idleClip);
                console.log('[PlayerAnimationLoader] Real embedded IDLE registered:', {
                    source: namedIdle.name,
                    duration: idleClip.duration,
                    tracks: idleClip.tracks.length
                });
                return true;
            }
        }
        const walkClip = this.clips.get('WALK_FORWARD');
        if (walkClip) {
            const idleClip = this._createStaticPoseClip(
                walkClip,
                'IDLE'
            );
            if (idleClip) {
                this.clips.set('IDLE', idleClip);
                console.warn('[PlayerAnimationLoader] player.fbx embedded clip rejected because it is only one frame. Using Walk Forward first frame as temporary IDLE.');
                return true;
            }
        }
        if (!this._idleWarningIssued) {
            this._idleWarningIssued = true;
            console.warn('[PlayerAnimationLoader] No valid IDLE animation available.');
        }
        return false;
    }
    _createStaticPoseClip(sourceClip, name = 'IDLE') {
        if (!sourceClip?.tracks?.length) return null;
        const tracks = [];
        sourceClip.tracks.forEach(sourceTrack => {
            const valueSize = sourceTrack.getValueSize();
            if (!valueSize || sourceTrack.values.length < valueSize) return;
            const firstValue = Array.from(sourceTrack.values.slice(0, valueSize));
            const values = [...firstValue, ...firstValue];
            try {
                const track = new sourceTrack.constructor(
                    sourceTrack.name,
                    [0, 1],
                    values,
                    sourceTrack.getInterpolation?.()
                );
                tracks.push(track);
            } catch (error) {
                console.warn('[PlayerAnimationLoader] Static pose track failed:', sourceTrack.name, error);
            }
        });
        if (!tracks.length) return null;
        return new THREE.AnimationClip(name, 1, tracks);
    }
    get(key) {
        return this.clips.get(key) || null;
    }
    has(key) {
        return this.clips.has(key);
    }
}
window.SMPlayerAnimationLoader = SMPlayerAnimationLoader;

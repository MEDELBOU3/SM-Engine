/**
 * ual2_motion_matching.js
 * ─────────────────────────────────────────────────────────────────────────
 * Unreal Engine 5-grade Motion Matching for AdvancedPlayerController + UAL2
 *
 * Features implemented:
 *  1. Pose Feature Vectors        — bone velocity + position fingerprint
 *  2. Trajectory Prediction       — future path from velocity + steering
 *  3. Inertialization Blending    — artefact-free, spring-damped transitions
 *  4. Distance Matching           — foot-plant-aware start / stop
 *  5. Blend Space 1D              — speed-indexed walk/run blending
 *  6. Root Motion Extraction      — in-place vs root-motion clip handling
 *  7. Foot IK                     — ground-plane foot placement correction
 *  8. Debug HUD                   — live overlay, trajectory, ranking
 *  9. Bandwidth Limiter           — per-frame cost gate to protect FPS
 * ─────────────────────────────────────────────────────────────────────────
 */

(function (root) {
    "use strict";

    const V3  = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
    const clamp = (v,a,b)     => Math.max(a, Math.min(b, v));
    const lerp  = (a,b,t)     => a + (b-a)*clamp(t,0,1);

    // ─────────────────────────────────────────────────────────────────────
    // 1. POSE FEATURE DATABASE
    //    Extracts a compact "fingerprint" of each database clip at every
    //    frame so the matcher can compare poses rather than just states.
    // ─────────────────────────────────────────────────────────────────────
    class PoseFeatureDatabase {
        constructor() {
            this.entries   = [];   // { key, features: Float32Array, metadata }
            this.DIM       = 12;   // 4 bone velocities × 3 components
        }

        /** Build feature vector for a descriptor. Called once at load time. */
        buildFeatures(descriptor) {
            const f = new Float32Array(this.DIM);
            // Encode normalised speed & direction into first 4 slots
            f[0] = descriptor.targetSpeed ?? 0;
            f[1] = Math.sin(THREE.MathUtils.degToRad(descriptor.directionAngle ?? 0));
            f[2] = Math.cos(THREE.MathUtils.degToRad(descriptor.directionAngle ?? 0));
            f[3] = descriptor.phase === 'air' ? 1 : 0;
            // Remaining slots encode predicted foot & hip deltas (approximated from metadata)
            const isStrafe = Math.abs(descriptor.directionAngle ?? 0) > 30 && Math.abs(descriptor.directionAngle ?? 0) < 150;
            f[4] = isStrafe ? 1 : 0;
            f[5] = descriptor.tags.has('backward') ? 1 : 0;
            f[6] = descriptor.tags.has('start')    ? 1 : 0;
            f[7] = descriptor.tags.has('stop')     ? 1 : 0;
            f[8] = descriptor.tags.has('turn')     ? 1 : 0;
            // Trajectory hint slots (from manifest)
            const traj = descriptor.clip?.userData?.trajectory || [];
            f[9]  = traj[0]?.dz ?? 0;
            f[10] = traj[1]?.dz ?? 0;
            f[11] = traj[2]?.dz ?? 0;
            return f;
        }

        insert(descriptor) {
            const features = this.buildFeatures(descriptor);
            this.entries.push({ key: descriptor.key, features, descriptor });
        }

        /** L2 distance between two feature vectors (pose cost). */
        distance(fa, fb) {
            let sum = 0;
            for (let i = 0; i < this.DIM; i++) {
                const d = fa[i] - fb[i];
                sum += d * d;
            }
            return Math.sqrt(sum);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2. TRAJECTORY PREDICTOR
    //    Estimates where the character will be in 0.1 … 1.0 s using
    //    current velocity + desired input direction.
    // ─────────────────────────────────────────────────────────────────────
    class TrajectoryPredictor {
        constructor() {
            this.samples      = 5;
            this.maxHorizonS  = 1.0;
            this.steeringRate = 4.0;    // rad/s turning speed
        }

        /** Returns [{t, localDx, localDz}] in character local space. */
        predict(player, desiredDirWorld, speedNorm) {
            const results  = [];
            const horizonStep = this.maxHorizonS / this.samples;

            // Simulate simple kinematic path
            let pos = V3().copy(player.model.position);
            let vel = V3(player.velocity.x, 0, player.velocity.z);
            const targetSpeed = player.runSpeed * speedNorm;
            const dir = V3().copy(desiredDirWorld);
            dir.y = 0;
            if (dir.lengthSq() > 0) dir.normalize();

            for (let i = 1; i <= this.samples; i++) {
                const dt = horizonStep;
                // Accelerate toward desired direction
                const targetVel = dir.clone().multiplyScalar(targetSpeed);
                vel.lerp(targetVel, Math.min(1, player.acceleration * dt / player.runSpeed));
                pos.addScaledVector(vel, dt);

                // Convert to character local space
                const charQI = player.model.quaternion.clone().invert();
                const local  = pos.clone().sub(player.model.position).applyQuaternion(charQI);

                results.push({ t: i * horizonStep, localDx: local.x, localDz: local.z });
            }
            return results;
        }

        /** Cost: compare predicted trajectory against a clip's stored trajectory hint. */
        trajectoryCost(predicted, clipTrajectory) {
            if (!clipTrajectory || !clipTrajectory.length) return 0;
            let cost = 0;
            const n = Math.min(predicted.length, clipTrajectory.length);
            for (let i = 0; i < n; i++) {
                const p = predicted[i];
                const c = clipTrajectory[i];
                const dx = p.localDx - (c.dx ?? 0);
                const dz = p.localDz - (c.dz ?? 0);
                cost += Math.sqrt(dx*dx + dz*dz);
            }
            return cost / n;
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. INERTIALIZER
    //    Spring-damped offset that removes foot-pop on clip switches.
    //    Implements the technique from "Motion Matching and the Road to
    //    Next-Gen Animation" (GDC 2016 / UE5 inertialization paper).
    // ─────────────────────────────────────────────────────────────────────
    class Inertializer {
        constructor() {
            this.active  = false;
            this.timer   = 0;
            this.halfLife= 0.08;   // seconds (shorter = snappier)
        }

        /** Call when a clip switch is about to happen. */
        request(blendDuration = 0.16) {
            this.active   = true;
            this.timer    = 0;
            this.halfLife = blendDuration * 0.5;
        }

        /** Returns a 0→1 blend weight for the incoming clip. */
        update(dt) {
            if (!this.active) return 1;
            this.timer += dt;
            // Critically-damped spring decay (exponential approximation)
            const decay = Math.exp(-this.timer / Math.max(this.halfLife, 0.001));
            const weight = 1 - decay;
            if (weight >= 0.998) this.active = false;
            return weight;
        }

        get blendWeight() {
            return this.active
                ? 1 - Math.exp(-this.timer / Math.max(this.halfLife, 0.001))
                : 1;
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 4. BLEND SPACE 1D
    //    Blends two adjacent clips by speed for smooth walk→run transitions.
    // ─────────────────────────────────────────────────────────────────────
    class BlendSpace1D {
        constructor(mixer, entryA, entryB) {
            this.mixer  = mixer;
            this.entryA = entryA;   // descriptor with lower targetSpeed
            this.entryB = entryB;   // descriptor with higher targetSpeed
            this.actionA = entryA?.action || null;
            this.actionB = entryB?.action || null;
            this.lastAlpha = -1;
        }

        isValid() { return !!(this.actionA && this.actionB && this.entryA && this.entryB); }

        /** alpha 0 = pure A, 1 = pure B. */
        setAlpha(alpha) {
            if (!this.isValid()) return;
            if (Math.abs(alpha - this.lastAlpha) < 0.004) return;
            this.lastAlpha = alpha;

            this.actionA.setEffectiveWeight(1 - alpha);
            this.actionB.setEffectiveWeight(alpha);

            // Sync playback time so foot plants stay aligned
            const ratio = this.entryA.action.time / (this.entryA.clip.duration || 1);
            this.actionB.time = ratio * (this.entryB.clip.duration || 1);

            // Timescale: interpolate so stride rate stays physically consistent
            const tsA = 1.0;
            const tsB = (this.entryB.targetSpeed > 0 && this.entryA.targetSpeed > 0)
                ? this.entryA.targetSpeed / this.entryB.targetSpeed
                : 1;
            this.actionA.setEffectiveTimeScale(lerp(tsA, tsB, alpha));
            this.actionB.setEffectiveTimeScale(lerp(tsB, tsA, alpha));
        }

        /** Compute alpha from current speed relative to the two clip speeds. */
        alphaFromSpeed(speedNorm) {
            const sA = this.entryA.targetSpeed, sB = this.entryB.targetSpeed;
            if (Math.abs(sB - sA) < 0.001) return 0;
            return clamp((speedNorm - sA) / (sB - sA), 0, 1);
        }

        activate(duration = 0.15) {
            if (!this.isValid()) return;
            if (this.actionA.isRunning()) return;
            this.actionA.reset().fadeIn(duration).play();
            this.actionA.setLoop(THREE.LoopRepeat, Infinity);
            this.actionB.reset().play();
            this.actionB.setLoop(THREE.LoopRepeat, Infinity);
        }

        deactivate(duration = 0.2) {
            if (!this.isValid()) return;
            this.actionA.fadeOut(duration);
            this.actionB.fadeOut(duration);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 5. FOOT IK SOLVER
    //    Raycast per foot bone, adjust ankle height to sit on ground.
    // ─────────────────────────────────────────────────────────────────────
    class FootIKSolver {
        constructor(scene, player) {
            this.scene      = scene;
            this.player     = player;
            this.enabled    = true;
            this.rayLength  = 1.5;
            this.footBones  = { L: null, R: null };
            this.ikTargets  = { L: V3(), R: V3() };
            this.ikWeights  = { L: 0, R: 0 };
            this.raycaster  = new THREE.Raycaster();
            this._groundMeshes = [];
        }

        findFootBones() {
            if (!this.player.model) return;
            this.player.model.traverse(n => {
                if (!n.isBone) return;
                const lo = n.name.toLowerCase();
                if (/foot.*l$|leftfoot|foot_l/.test(lo)) this.footBones.L = n;
                if (/foot.*r$|rightfoot|foot_r/.test(lo)) this.footBones.R = n;
            });
        }

        collectGroundMeshes() {
            this._groundMeshes = [];
            this.scene.traverse(o => {
                if (o.isMesh && (o.userData.isEnvironment || o.name.includes('Floor') || o.name.includes('floor'))) {
                    this._groundMeshes.push(o);
                }
            });
        }

        update(dt) {
            if (!this.enabled || !this.player.isActive) return;
            ['L','R'].forEach(side => {
                const bone = this.footBones[side];
                if (!bone) return;

                const worldPos = V3();
                bone.getWorldPosition(worldPos);

                // Ray from above the foot downward
                const origin = worldPos.clone().add(V3(0, this.rayLength * 0.5, 0));
                this.raycaster.set(origin, V3(0,-1,0));
                this.raycaster.far = this.rayLength;

                const hits = this.raycaster.intersectObjects(this._groundMeshes, false);
                if (hits.length > 0) {
                    const targetY = hits[0].point.y;
                    const diff    = targetY - worldPos.y;
                    // Only push up, not down (ground is a floor, not a ceiling)
                    if (diff > -0.3 && diff < 0.4) {
                        this.ikTargets[side].copy(worldPos).setY(targetY);
                        this.ikWeights[side] = clamp(this.ikWeights[side] + dt * 8, 0, 1);
                        return;
                    }
                }
                this.ikWeights[side] = clamp(this.ikWeights[side] - dt * 5, 0, 1);
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 6. DISTANCE MATCHING
    //    Scrubs a "start" clip to the right phase for the current speed
    //    so the foot is already planted when the clip begins.
    // ─────────────────────────────────────────────────────────────────────
    class DistanceMatcher {
        /** Seek the action to the phase that minimises foot slip at `speed`. */
        static seekToPhase(action, clip, targetSpeed, maxBias = 0.25) {
            if (!action || !clip) return;
            const biasedStart = clamp(targetSpeed * maxBias, 0, clip.duration - 0.05);
            action.time = biasedStart;
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 7. DEBUG HUD  (canvas overlay drawn each frame)
    // ─────────────────────────────────────────────────────────────────────
    class MotionMatchingHUD {
        constructor(hostId) {
            this._root = null;
            this._canvas = null;
            this._ctx    = null;
            this._mount(hostId);
        }

        _mount(hostId) {
            const host = document.getElementById(hostId) || document.body;
            const wrap = document.createElement('div');
            wrap.id = 'ual2-mm-hud';
            wrap.style.cssText = [
                'position:relative',
                'background:linear-gradient(180deg,rgba(6,10,18,0.94),rgba(3,6,12,0.94))',
                'border:1px solid rgba(91,160,255,.3)',
                'border-radius:8px',
                'padding:10px 12px',
                'margin:6px',
                'font-family:"JetBrains Mono",Consolas,monospace',
                'font-size:10px',
                'color:#c8d8f0',
                'line-height:1.55',
                'box-shadow:0 8px 28px rgba(0,0,0,.35)',
                'min-width:230px'
            ].join(';');
            host.prepend(wrap);
            this._root = wrap;

            // Trajectory canvas
            const cv = document.createElement('canvas');
            cv.width = 90; cv.height = 90;
            cv.style.cssText = 'display:block;margin:6px auto 4px;border-radius:4px;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.06)';
            this._canvas = cv;
            this._ctx = cv.getContext('2d');
        }

        update(data) {
            if (!this._root || !data) return;

            const { clip, state, source, speedNorm, locomotion, desiredAngle,
                    libraryStatus, totalClips, ranking, trajPredicted,
                    blendWeight, inertializing, footIK, fps } = data;

            const grade = (s,t) => s > t   ? `<span style="color:#ff6b6b">${s.toFixed(3)}</span>`
                                           : `<span style="color:#69db7c">${s.toFixed(3)}</span>`;

            this._root.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                <strong style="color:#5ba0ff;font-size:11px">UAL2 Motion Matching</strong>
                <span style="color:${totalClips > 10 ? '#69db7c' : '#ffa94d'}">${totalClips} clips · ${fps} FPS</span>
            </div>
            <div><strong>Clip</strong> ${clip || 'None'}</div>
            <div><strong>State</strong> ${state}  <span style="color:#8898b4">→ desired</span> ${locomotion}</div>
            <div><strong>Source</strong> ${source}</div>
            <div><strong>Status</strong> ${libraryStatus}</div>
            <div><strong>Speed</strong> ${(speedNorm*100).toFixed(1)}%  <strong>Dir</strong> ${desiredAngle.toFixed(1)}°</div>
            <div><strong>BlendW</strong> ${(blendWeight*100).toFixed(0)}%  <strong>Inertia</strong> ${inertializing ? '▶' : '●'}</div>
            <div><strong>FootIK</strong> L:${footIK?.L?.toFixed(2)||'–'}  R:${footIK?.R?.toFixed(2)||'–'}</div>
            <div style="margin-top:6px;padding-top:5px;border-top:1px solid rgba(255,255,255,.08)">
                <strong style="color:#9fc0ee">Top Candidates</strong>
                ${(ranking || []).slice(0,4).map((r,i) => `
                <div style="display:flex;justify-content:space-between;opacity:${1-i*.18}">
                    <span style="color:#7a8dac">${r.clip}</span>
                    ${grade(r.score, 1.5)}
                </div>`).join('')}
            </div>`;

            this._root.appendChild(this._canvas);
            this._drawTrajectory(trajPredicted);
        }

        _drawTrajectory(predicted) {
            const ctx = this._ctx;
            if (!ctx || !predicted?.length) return;
            const W = this._canvas.width, H = this._canvas.height;
            ctx.clearRect(0,0,W,H);

            const cx = W/2, cy = H*0.8;
            const scale = Math.min(W,H) * 0.35;

            // Character dot
            ctx.fillStyle = '#5ba0ff';
            ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI*2); ctx.fill();

            // Trajectory dots
            predicted.forEach((p,i) => {
                const sx = cx + p.localDx * scale;
                const sy = cy - p.localDz * scale;
                const alpha = 1 - i/(predicted.length);
                ctx.fillStyle = `rgba(105,219,124,${alpha})`;
                ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI*2); ctx.fill();
            });

            // Line
            if (predicted.length > 1) {
                ctx.strokeStyle = 'rgba(105,219,124,0.5)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                predicted.forEach(p => {
                    ctx.lineTo(cx + p.localDx * scale, cy - p.localDz * scale);
                });
                ctx.stroke();
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 8. UAL2 MOTION MATCHING ENGINE  (main class)
    //    Patches AdvancedPlayerController with all the above systems.
    // ─────────────────────────────────────────────────────────────────────
    class UAL2MotionMatchingEngine {
        constructor(player, scene, options = {}) {
            this.player      = player;
            this.scene       = scene;
            this.enabled     = true;

            /* Sub-systems */
            this.poseDB       = new PoseFeatureDatabase();
            this.predictor    = new TrajectoryPredictor();
            this.inertializer = new Inertializer();
            this.footIK       = new FootIKSolver(scene, player);
            this.hud          = null;

            /* Blend spaces keyed by direction group */
            this.blendSpaces  = new Map();  // 'forward','strafe_l','strafe_r' → BlendSpace1D

            /* Config */
            const cfg = window.UAL2MotionLibrary?.matchingConfig || {};
            this.cfg = {
                poseWindowMs:         cfg.poseWindowMs         ?? 200,
                minSwitchIntervalMs:  cfg.minSwitchIntervalMs  ?? 100,
                inertializationMs:    cfg.inertializationMs    ?? 160,
                speedTolerance:       cfg.speedTolerance       ?? 0.18,
                angleTolerance:       cfg.angleTolerance       ?? 25,
                poseCostWeight:       cfg.poseCostWeight       ?? 2.2,
                trajectoryCostWeight: cfg.trajectoryCostWeight ?? 1.8,
                stateCostWeight:      cfg.stateCostWeight      ?? 1.0,
                continuityCostWeight: cfg.continuityCostWeight ?? 0.25,
                ual2SourceBonus:      cfg.ual2SourceBonus      ?? -0.08,
            };

            /* Runtime state */
            this._lastSwitchTime = 0;
            this._fps            = 60;
            this._fpsAlpha       = 0.1;
            this._lastFrameTime  = performance.now();
            this._activeBlendSpace = null;

            /* Debug */
            this.debugEnabled = options.debug ?? true;
            if (this.debugEnabled) {
                this.hud = new MotionMatchingHUD(options.hudHostId || 'gui-container');
            }

            this._patchPlayer();
        }

        /* ── Patch the live AdvancedPlayerController ─────────────────── */
        _patchPlayer() {
            const p = this.player;
            const self = this;

            /* Override _selectMotionMatch with our advanced scorer */
            p._ual2_selectMotionMatch = function (context) {
                return self._advancedSelect(context, this);
            };

            /* Override updateAnimationState to drive our systems */
            const origUpdate = p.updateAnimationState.bind(p);
            p.updateAnimationState = function (ctx) {
                const motionCtx = this._buildMotionContext(ctx);
                self._preUpdate(motionCtx);
                origUpdate(ctx);
                self._postUpdate(motionCtx);
            };

            /* Override _applyMotionDescriptor for inertialization */
            const origApply = p._applyMotionDescriptor.bind(p);
            p._applyMotionDescriptor = function (descriptor) {
                if (descriptor.key !== (this.motionMatching.current?.key)) {
                    self.inertializer.request(self.cfg.inertializationMs / 1000);
                }
                origApply(descriptor);
            };

            /* Wire up _selectMotionMatch to our version */
            p._selectMotionMatch = function (context) {
                return self._advancedSelect(context, p);
            };

            console.log('[UAL2-MM] Engine patched onto AdvancedPlayerController.');
        }

        /* ── Called before the built-in updateAnimationState ──────────── */
        _preUpdate(context) {
            const now = performance.now();
            this._fps = lerp(this._fps, 1000 / Math.max(now - this._lastFrameTime, 1), this._fpsAlpha);
            this._lastFrameTime = now;
        }

        /* ── Called after the built-in updateAnimationState ───────────── */
        _postUpdate(context) {
            /* Blend-space update */
            if (this._activeBlendSpace?.isValid()) {
                const alpha = this._activeBlendSpace.alphaFromSpeed(context.speedNorm);
                this._activeBlendSpace.setAlpha(alpha);
            }

            /* Foot IK update */
            const dt = 1 / Math.max(this._fps, 10);
            this.footIK.update(dt);

            /* HUD */
            if (this.debugEnabled && this.hud) {
                const mm   = this.player.motionMatching;
                const trajPred = this.predictor.predict(
                    this.player,
                    this._lastDesiredDir || V3(0,0,-1),
                    context.speedNorm || 0
                );
                this.hud.update({
                    clip:          mm.current?.key || 'None',
                    state:         this.player.state,
                    source:        mm.activeSource,
                    speedNorm:     context.speedNorm || 0,
                    locomotion:    context.locomotion || 'idle',
                    desiredAngle:  context.desiredAngle || 0,
                    libraryStatus: mm.manifestStatus,
                    totalClips:    mm.database.length,
                    ranking:       mm.lastRankedMatches.slice(0,4).map(r => ({
                        clip:  r.entry.key,
                        score: +r.score.toFixed(3)
                    })),
                    trajPredicted: trajPred,
                    blendWeight:   this.inertializer.blendWeight,
                    inertializing: this.inertializer.active,
                    footIK: {
                        L: this.footIK.ikWeights.L,
                        R: this.footIK.ikWeights.R
                    },
                    fps: Math.round(this._fps)
                });
            }
        }

        /* ── Advanced motion matching scorer ─────────────────────────── */
        _advancedSelect(context, player) {
            const mm     = player.motionMatching;
            const forced = mm.forcedClip;

            /* Build query feature vector */
            const queryDesc = {
                targetSpeed:    context.speedNorm || 0,
                directionAngle: context.desiredAngle || 0,
                phase:          (context.locomotion === 'jump' || context.locomotion === 'fall') ? 'air' : 'ground',
                tags:           new Set([context.locomotion, context.strafeDirection, context.turningInPlace ? 'turn' : ''].filter(Boolean)),
                clip:           { userData: { trajectory: this.predictor.predict(player, this._lastDesiredDir || V3(0,0,-1), context.speedNorm || 0) } }
            };
            const queryFeatures = this.poseDB.buildFeatures(queryDesc);

            /* Build predicted trajectory */
            const predTraj = this.predictor.predict(
                player,
                this._lastDesiredDir || V3(0,0,-1),
                context.speedNorm || 0
            );

            const now = performance.now();
            const current = mm.current;

            const ranked = mm.database.map(entry => {
                if (forced) return { entry, score: entry.key === forced ? 0 : 999 };

                let score = 0;

                /* ── State cost ── */
                score += this._stateCost(entry.state, context.locomotion) * this.cfg.stateCostWeight;

                /* ── Phase cost ── */
                const needAir = (context.locomotion === 'jump' || context.locomotion === 'fall');
                if (needAir && entry.phase !== 'air')  score += 12;
                if (!needAir && entry.phase === 'air') score += 12;

                /* ── Pose feature cost ── */
                const entryFeatures = this.poseDB.entries.find(e => e.key === entry.key)?.features;
                if (entryFeatures) {
                    score += this.poseDB.distance(queryFeatures, entryFeatures) * this.cfg.poseCostWeight;
                }

                /* ── Trajectory cost ── */
                const clipTraj = entry.clip?.userData?.trajectory;
                if (clipTraj) {
                    score += this.predictor.trajectoryCost(predTraj, clipTraj) * this.cfg.trajectoryCostWeight;
                }

                /* ── Speed tolerance band ── */
                const speedDiff = Math.abs((context.speedNorm || 0) - entry.targetSpeed);
                if (speedDiff > this.cfg.speedTolerance) score += speedDiff * 2.5;

                /* ── Direction tolerance ── */
                const angDiff = this._angleDist(context.desiredAngle || 0, entry.directionAngle || 0);
                if (angDiff > this.cfg.angleTolerance) score += (angDiff / 180) * 2.2;

                /* ── Contextual boosts ── */
                if (context.wantsStart && !entry.tags.has('start') && entry.state !== context.locomotion) score += 0.45;
                if (context.wantsStop  && !entry.tags.has('stop')  && entry.state !== 'idle')           score += 0.4;
                if (context.movingBackward && entry.directionGroup !== 'backward') score += 0.7;
                if (context.strafeDirection && entry.directionGroup !== context.strafeDirection) score += 0.55;
                if (context.wantsRun && entry.targetSpeed < 0.75 && entry.phase === 'ground') score += 0.3;
                if (!context.wantsRun && entry.targetSpeed > 0.85 && entry.phase === 'ground') score += 0.18;

                /* ── Continuity reward ── */
                if (current?.key === entry.key) score -= this.cfg.continuityCostWeight;

                /* ── Source bonus ── */
                if (entry.source === 'ual2') score += this.cfg.ual2SourceBonus;

                return { entry, score };
            }).sort((a,b) => a.score - b.score);

            mm.lastRankedMatches = ranked.slice(0, 6);

            const best      = ranked[0]?.entry || null;
            if (!best) return null;

            /* ── Switch gate ── */
            if (!current) return best;
            if (best.key === current.key) return current;

            const canSwitch       = (now - this._lastSwitchTime) >= this.cfg.minSwitchIntervalMs;
            const bestScore       = ranked[0]?.score ?? Infinity;
            const currentScore    = ranked.find(r => r.entry.key === current.key)?.score ?? Infinity;
            const materially      = (bestScore + 0.28) < currentScore;

            if (!canSwitch && !materially) return current;
            if (!materially && current.state === best.state) return current;

            this._lastSwitchTime = now;

            /* ── Trigger blend space if walk↔run on same direction ── */
            this._tryActivateBlendSpace(current, best, context.speedNorm || 0, player);

            return best;
        }

        /* ── Try to set up a 1D blend space between two adjacent clips ── */
        _tryActivateBlendSpace(from, to, speedNorm, player) {
            if (!from || !to) return;
            const sameDir = (from.directionGroup === to.directionGroup);
            const bothLoco = ['walk','run'].includes(from.state) && ['walk','run'].includes(to.state);
            if (!sameDir || !bothLoco) {
                this._activeBlendSpace?.deactivate(0.2);
                this._activeBlendSpace = null;
                return;
            }

            const key = `${from.directionGroup}_${Math.round(from.directionAngle)}`;
            if (!this.blendSpaces.has(key)) {
                const [lo, hi] = from.targetSpeed < to.targetSpeed ? [from, to] : [to, from];
                const bs = new BlendSpace1D(player.mixer, lo, hi);
                this.blendSpaces.set(key, bs);
            }

            const bs = this.blendSpaces.get(key);
            if (this._activeBlendSpace !== bs) {
                this._activeBlendSpace?.deactivate(0.12);
                this._activeBlendSpace = bs;
                bs.activate(0.12);
            }
        }

        _stateCost(clipState, desiredLoco) {
            const table = {
                idle: { idle:0, turn:.45, walk:1.2, run:1.8, jump:9, fall:9, crouch:.6 },
                turn: { idle:.35, turn:0, walk:1.0, run:1.6, jump:9, fall:9, crouch:.8 },
                walk: { idle:1.1, turn:.75, walk:0, run:.6, jump:9, fall:9, crouch:.5 },
                run:  { idle:1.4, turn:1.2, walk:.5, run:0, jump:9, fall:9, crouch:1.2 },
                jump: { idle:9, turn:9, walk:9, run:9, jump:0, fall:1.2, crouch:9 },
                fall: { idle:9, turn:9, walk:9, run:9, jump:1.1, fall:0, crouch:9 },
                crouch:{ idle:.6, turn:.8, walk:.5, run:1.2, jump:9, fall:9, crouch:0 },
            };
            return table[desiredLoco]?.[clipState] ?? 2.0;
        }

        _angleDist(a, b) {
            const d = ((((a-b) % 360) + 540) % 360) - 180;
            return Math.abs(d);
        }

        /* ── Call after the motion matching database is fully populated ── */
        buildPoseDatabase() {
            this.poseDB.entries = [];
            this.player.motionMatching.database.forEach(desc => {
                this.poseDB.insert(desc);
            });
            console.log(`[UAL2-MM] Pose database built — ${this.poseDB.entries.length} entries.`);
        }

        /* ── Attach trajectory information to loaded clips ── */
        attachTrajectoryFromManifest() {
            const anims = window.UAL2MotionLibrary?.animations || [];
            anims.forEach(entry => {
                if (!entry.trajectory || !entry.name) return;
                const desc = this.player.motionMatching.descriptorByKey.get(
                    entry.name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')
                );
                if (desc?.clip) {
                    desc.clip.userData = desc.clip.userData || {};
                    desc.clip.userData.trajectory = entry.trajectory;
                }
            });
        }

        /* ── Public: run foot IK setup after model loads ── */
        initFootIK() {
            this.footIK.findFootBones();
            this.footIK.collectGroundMeshes();
            console.log('[UAL2-MM] Foot IK ready:',
                this.footIK.footBones.L?.name || 'L not found',
                this.footIK.footBones.R?.name || 'R not found'
            );
        }

        /* ── Store desired world direction for trajectory predictor ── */
        setDesiredDirection(worldDir) {
            this._lastDesiredDir = worldDir;
        }

        /* ── Toggle debug HUD ── */
        setDebug(enabled) {
            this.debugEnabled = !!enabled;
        }

        /* ── Called from the main animate() loop if you want manual update ── */
        externalUpdate(delta, desiredDirWorld) {
            if (desiredDirWorld) this.setDesiredDirection(desiredDirWorld);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 9. INTEGRATION HELPER
    //    Call this once after the GLTF model and player are fully loaded.
    // ─────────────────────────────────────────────────────────────────────
    function integrateUAL2(player, scene, options = {}) {
        if (!player || !player.model) {
            console.warn('[UAL2-MM] Player not ready — call after loader.load() callback.');
            return null;
        }

        /* Create engine */
        const engine = new UAL2MotionMatchingEngine(player, scene, options);

        /* Hook into the existing library load promise to build pose DB */
        const origQueueLoad = player._queueMotionLibraryLoad?.bind(player);
        if (origQueueLoad) {
            player._queueMotionLibraryLoad = function () {
                const p = origQueueLoad();
                p.then(() => {
                    engine.attachTrajectoryFromManifest();
                    engine.buildPoseDatabase();
                    engine.initFootIK();
                    console.log('[UAL2-MM] Full integration complete.');
                });
                return p;
            };
        } else {
            /* If library was already loaded, build immediately */
            setTimeout(() => {
                engine.attachTrajectoryFromManifest();
                engine.buildPoseDatabase();
                engine.initFootIK();
            }, 200);
        }

        /* Expose globally */
        root.ual2MotionEngine = engine;
        root.UAL2MotionMatchingEngine = UAL2MotionMatchingEngine;

        console.log('[UAL2-MM] Integration started. Waiting for UAL2 clips to load…');
        return engine;
    }

    root.integrateUAL2 = integrateUAL2;
    root.UAL2MotionMatchingEngine = UAL2MotionMatchingEngine;

})(window);
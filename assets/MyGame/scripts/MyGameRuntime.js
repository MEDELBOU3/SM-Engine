/**
 * Neon Core Run - playable MyGame runtime.
 * WASD/Arrows move, Shift sprints. Collect six cores, avoid sentries,
 * then enter the green extraction ring.
 */
(function (root) {
    "use strict";

    const PROJECT_ID = "smgame_mygame_starter";

    const MyGameRuntime = {
        running: false,
        ended: false,
        world: null,
        collectibles: [],
        hazards: [],
        extraction: null,
        score: 0,
        health: 3,
        timeLeft: 90,
        lastFrame: 0,
        damageCooldownUntil: 0,
        animationFrame: 0,
        hud: null,
        refs: {},
        audio: null,
        lastPlayerPosition: null,
        nextFootstepAt: 0,

        _isMyGame() {
            const runtime = root.SMGameProjectRuntime;
            return !!runtime?.activeProject && (
                runtime.activeManifest?.id === PROJECT_ID ||
                runtime.activeProject?.projectId === PROJECT_ID ||
                String(runtime.activeProject?.name || "").toLowerCase() === "mygame"
            );
        },

        _getViewportHost() {
            return (
                document.getElementById("editor-scene") ||
                root.renderer?.domElement?.parentElement ||
                null
            );
        },

        _ensureHUD() {
            const viewport = this._getViewportHost();
            if (this.hud?.isConnected) {
                if (viewport && this.hud.parentElement !== viewport) {
                    viewport.appendChild(this.hud);
                }
                return this.hud;
            }

            if (!document.getElementById("mygame-runtime-style")) {
                const style = document.createElement("style");
                style.id = "mygame-runtime-style";
                style.textContent = `
                    #editor-scene > #mygame-hud{position:absolute;top:16px;right:18px;z-index:40;width:min(300px,calc(100% - 36px));max-height:calc(100% - 32px);overflow:hidden;color:#eefaff;font:600 12px/1.4 Inter,Arial,sans-serif;pointer-events:none;filter:drop-shadow(0 10px 24px #0008);box-sizing:border-box}
                    #mygame-hud .mg-card{background:linear-gradient(145deg,#071426e8,#102a43e8);padding:14px 16px;clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px));box-shadow:inset 0 0 28px #21d4fd12}
                    #mygame-hud .mg-title{font-size:17px;letter-spacing:.12em;color:#57e8ff;margin-bottom:3px}
                    #mygame-hud .mg-objective{color:#a9c9dc;font-weight:500;margin-bottom:12px}
                    #mygame-hud .mg-stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
                    #mygame-hud .mg-stat{background:#020a12aa;border:1px solid #ffffff12;padding:7px;text-align:center}
                    #mygame-hud .mg-stat b{display:block;color:#fff;font-size:18px}.mg-label{color:#6da6c5;font-size:9px;letter-spacing:.1em}
                    #mygame-hud .mg-status{margin-top:10px;padding:7px 9px;border-left:3px solid #21d4fd;background:#10243aaa;color:#dff8ff}
                    #mygame-hud .mg-controls{margin-top:7px;color:#6f9bb4;font-weight:500;text-align:right}
                    #mygame-hud .mg-result{display:none;margin-top:10px;padding:14px;text-align:center;font-size:20px;letter-spacing:.08em;background:#020a12e8;border:1px solid #57ff8a88}
                    #mygame-hud.mg-ended .mg-result{display:block}
                `;
                document.head.appendChild(style);
            }

            const hud = document.createElement("div");
            hud.id = "mygame-hud";
            hud.style.display = "none";
            hud.innerHTML = `
                <div class="mg-card">
                    <div class="mg-title">NEON CORE RUN</div>
                    <div class="mg-objective">Collect all cores and reach extraction.</div>
                    <div class="mg-stats">
                        <div class="mg-stat"><b data-mg-score>0/0</b><span class="mg-label">CORES</span></div>
                        <div class="mg-stat"><b data-mg-health>3</b><span class="mg-label">HEALTH</span></div>
                        <div class="mg-stat"><b data-mg-time>90</b><span class="mg-label">TIME</span></div>
                    </div>
                    <div class="mg-status" data-mg-status>Find the energy cores.</div>
                    <div class="mg-controls">WASD / Arrows · Shift to sprint</div>
                </div>
                <div class="mg-result" data-mg-result></div>
            `;
            (viewport || document.body).appendChild(hud);
            this.hud = hud;
            this.refs = {
                score: hud.querySelector("[data-mg-score]"),
                health: hud.querySelector("[data-mg-health]"),
                time: hud.querySelector("[data-mg-time]"),
                status: hud.querySelector("[data-mg-status]"),
                result: hud.querySelector("[data-mg-result]")
            };
            return hud;
        },

        _ensureAudio() {
            if (this.audio?.context) return this.audio;
            const AudioContextClass = root.AudioContext || root.webkitAudioContext;
            if (!AudioContextClass) return null;

            const context = new AudioContextClass();
            const master = context.createGain();
            const ambience = context.createGain();
            const effects = context.createGain();
            master.gain.value = 0.38;
            ambience.gain.value = 0.18;
            effects.gain.value = 0.72;
            ambience.connect(master);
            effects.connect(master);
            master.connect(context.destination);
            this.audio = { context, master, ambience, effects, ambientNodes: [] };
            return this.audio;
        },

        _resumeAudio() {
            const audio = this._ensureAudio();
            if (!audio) return null;
            audio.context.resume?.().catch?.(() => {});
            return audio;
        },

        _tone(frequency, options = {}) {
            const audio = this._resumeAudio();
            if (!audio) return;
            const context = audio.context;
            const start = context.currentTime + Number(options.delay || 0);
            const duration = Math.max(0.04, Number(options.duration || 0.16));
            const volume = Math.max(0.0001, Number(options.volume || 0.16));
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = options.type || "sine";
            oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
            if (Number.isFinite(options.endFrequency)) {
                oscillator.frequency.exponentialRampToValueAtTime(
                    Math.max(20, options.endFrequency),
                    start + duration
                );
            }
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(
                volume,
                start + Math.min(0.025, duration * 0.25)
            );
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
            oscillator.connect(gain);
            gain.connect(audio.effects);
            oscillator.start(start);
            oscillator.stop(start + duration + 0.03);
        },

        _playCue(name) {
            if (name === "start") {
                [220, 330, 440].forEach((note, index) =>
                    this._tone(note, { delay: index * 0.09, duration: 0.2, volume: 0.12 })
                );
            } else if (name === "pickup") {
                this._tone(620, { duration: 0.1, volume: 0.16, endFrequency: 920 });
                this._tone(1240, { delay: 0.07, duration: 0.15, volume: 0.1 });
            } else if (name === "unlock") {
                [392, 523.25, 659.25, 783.99].forEach((note, index) =>
                    this._tone(note, { delay: index * 0.08, duration: 0.28, volume: 0.13, type: "triangle" })
                );
            } else if (name === "damage") {
                this._tone(155, { duration: 0.34, volume: 0.2, type: "sawtooth", endFrequency: 62 });
            } else if (name === "step") {
                this._tone(78, { duration: 0.055, volume: 0.045, type: "triangle", endFrequency: 48 });
            } else if (name === "win") {
                [261.63, 329.63, 392, 523.25, 659.25].forEach((note, index) =>
                    this._tone(note, { delay: index * 0.11, duration: 0.38, volume: 0.16, type: "triangle" })
                );
            } else if (name === "lose") {
                [220, 174.61, 130.81, 82.41].forEach((note, index) =>
                    this._tone(note, { delay: index * 0.13, duration: 0.38, volume: 0.14, type: "sawtooth" })
                );
            }
        },

        _startAmbience() {
            const audio = this._resumeAudio();
            if (!audio || audio.ambientNodes.length) return;
            const context = audio.context;
            [55, 82.5].forEach((frequency, index) => {
                const oscillator = context.createOscillator();
                const gain = context.createGain();
                oscillator.type = index ? "sine" : "triangle";
                oscillator.frequency.value = frequency;
                gain.gain.value = index ? 0.035 : 0.05;
                oscillator.connect(gain);
                gain.connect(audio.ambience);
                oscillator.start();
                audio.ambientNodes.push({ oscillator, gain });
            });
        },

        _stopAmbience() {
            const audio = this.audio;
            if (!audio?.ambientNodes?.length) return;
            const now = audio.context.currentTime;
            audio.ambientNodes.forEach(({ oscillator, gain }) => {
                try {
                    gain.gain.cancelScheduledValues(now);
                    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
                    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
                    oscillator.stop(now + 0.14);
                } catch {}
            });
            audio.ambientNodes = [];
        },

        bindWorld(scene = root.scene) {
            if (!scene || !this._isMyGame()) return false;
            this.world = scene.getObjectByName("MyGameWorld") || null;
            this.collectibles = [];
            this.hazards = [];
            this.extraction = null;
            scene.traverse(object => {
                const type = object.userData?.gameplayType;
                if (type === "collectible") this.collectibles.push(object);
                if (type === "hazard") this.hazards.push(object);
                if (type === "extraction") this.extraction = object;
            });
            this.collectibles.sort((a, b) =>
                Number(a.userData.collectibleIndex || 0) - Number(b.userData.collectibleIndex || 0)
            );
            this._ensureHUD();
            return !!this.world;
        },

        _teleportToSpawn() {
            const spawn =
                root.SMGameProjectRuntime?.activeManifest?.player?.spawnPosition ||
                [0, 0, 22];
            root.playerSystem?.teleport?.(
                Number(spawn[0] || 0),
                Number(spawn[1] || 0),
                Number(spawn[2] || 0)
            );
        },

        reset() {
            this.score = 0;
            this.health = Number(
                root.SMGameProjectRuntime?.activeManifest?.gameplay?.startingHealth || 3
            );
            this.timeLeft = Number(
                root.SMGameProjectRuntime?.activeManifest?.gameplay?.timeLimit || 90
            );
            this.ended = false;
            this.damageCooldownUntil = 0;
            this.nextFootstepAt = 0;
            this.lastPlayerPosition = null;

            this.collectibles.forEach(core => {
                core.visible = true;
                core.userData.collected = false;
                core.scale.setScalar(1);
            });
            if (this.extraction) {
                this.extraction.visible = true;
                this.extraction.userData.locked = true;
                this.extraction.material.color.setHex(0x517080);
                this.extraction.material.emissive.setHex(0x17384b);
                this.extraction.material.opacity = 0.24;
            }

            this.hud?.classList.remove("mg-ended");
            if (this.refs.result) this.refs.result.textContent = "";
            this._teleportToSpawn();
            root.playerSystem?.setRuntimeControlActive?.(true);
            this._setStatus("Find the energy cores.");
            this._updateHUD();
        },

        start() {
            if (!this._isMyGame() || this.running) return false;
            if (!this.bindWorld(root.scene)) return false;
            this.running = true;
            this.lastFrame = performance.now();
            this.reset();
            this.hud.style.display = "block";
            this._startAmbience();
            this._playCue("start");
            this.animationFrame = requestAnimationFrame(time => this._tick(time));
            console.log("[MyGame] Neon Core Run started.");
            return true;
        },

        stop({ hideHUD = true } = {}) {
            this.running = false;
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = 0;
            this._stopAmbience();
            if (hideHUD && this.hud) this.hud.style.display = "none";
            return true;
        },

        _playerPosition() {
            return root.playerSystem?.character?.model?.position || null;
        },

        _setStatus(message, color = "#21d4fd") {
            if (!this.refs.status) return;
            this.refs.status.textContent = message;
            this.refs.status.style.borderLeftColor = color;
        },

        _updateHUD() {
            if (this.refs.score) {
                this.refs.score.textContent = `${this.score}/${this.collectibles.length}`;
            }
            if (this.refs.health) this.refs.health.textContent = String(this.health);
            if (this.refs.time) this.refs.time.textContent = String(Math.max(0, Math.ceil(this.timeLeft)));
        },

        _collect(core) {
            if (!core.visible || core.userData.collected) return;
            core.userData.collected = true;
            core.visible = false;
            this.score += 1;
            this._playCue("pickup");
            if (this.score >= this.collectibles.length) {
                if (this.extraction) {
                    this.extraction.userData.locked = false;
                    this.extraction.material.color.setHex(0x57ff8a);
                    this.extraction.material.emissive.setHex(0x16b94b);
                    this.extraction.material.opacity = 0.55;
                }
                this._playCue("unlock");
                this._setStatus("Extraction unlocked — reach the green ring!", "#57ff8a");
            } else {
                this._setStatus(`Energy core secured. ${this.collectibles.length - this.score} remaining.`);
            }
            this._updateHUD();
        },

        _takeDamage(now) {
            if (now < this.damageCooldownUntil || this.ended) return;
            this.damageCooldownUntil = now + 1500;
            this.health -= 1;
            this._playCue("damage");
            this._teleportToSpawn();
            if (this.health <= 0) {
                this._finish(false, "MISSION FAILED");
            } else {
                this._setStatus("Sentry hit! Returned to spawn.", "#ff315c");
            }
            this._updateHUD();
        },

        _finish(won, message) {
            if (this.ended) return;
            this.ended = true;
            root.playerSystem?.setRuntimeControlActive?.(false);
            this._stopAmbience();
            this._playCue(won ? "win" : "lose");
            this.hud?.classList.add("mg-ended");
            if (this.refs.result) {
                this.refs.result.textContent = message;
                this.refs.result.style.color = won ? "#57ff8a" : "#ff5575";
                this.refs.result.style.borderColor = won ? "#57ff8a88" : "#ff315c88";
            }
            this._setStatus(
                won ? "All cores extracted successfully." : "Press Stop, then Play to retry.",
                won ? "#57ff8a" : "#ff315c"
            );
        },

        _tick(now) {
            if (!this.running) return;
            const delta = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
            this.lastFrame = now;

            if (!this.ended && root.__smGamePaused !== true) {
                this.timeLeft -= delta;
                if (this.timeLeft <= 0) {
                    this.timeLeft = 0;
                    this._finish(false, "TIME EXPIRED");
                }

                const playerPosition = this._playerPosition();
                if (playerPosition) {
                    playerPosition.x = THREE.MathUtils.clamp(playerPosition.x, -28, 28);
                    playerPosition.z = THREE.MathUtils.clamp(playerPosition.z, -28, 28);

                    if (!this.lastPlayerPosition) {
                        this.lastPlayerPosition = playerPosition.clone();
                    } else {
                        const moved = this.lastPlayerPosition.distanceToSquared(playerPosition) > 0.0025;
                        if (moved && now >= this.nextFootstepAt) {
                            this._playCue("step");
                            this.nextFootstepAt = now + 330;
                        }
                        this.lastPlayerPosition.copy(playerPosition);
                    }

                    this.collectibles.forEach((core, index) => {
                        if (!core.visible) return;
                        core.rotation.y += delta * 1.8;
                        core.rotation.x += delta * 0.65;
                        core.position.y = Number(core.userData.baseY || 1.4) +
                            Math.sin(now * 0.0025 + index) * 0.22;
                        if (core.position.distanceTo(playerPosition) < 1.7) this._collect(core);
                    });

                    this.hazards.forEach((hazard, index) => {
                        hazard.rotation.y += delta * (index % 2 ? -1.4 : 1.4);
                        hazard.position.y = Number(hazard.userData.baseY || 0.8) +
                            Math.sin(now * 0.003 + index * 0.8) * 0.12;
                        if (hazard.position.distanceTo(playerPosition) < 1.9) this._takeDamage(now);
                    });

                    if (this.extraction) {
                        this.extraction.rotation.z += delta * 0.45;
                        if (
                            this.extraction.userData.locked !== true &&
                            this.extraction.position.distanceTo(playerPosition) < 3.2
                        ) {
                            this._finish(true, "MISSION COMPLETE");
                        }
                    }
                }
                this._updateHUD();
            }
            this.animationFrame = requestAnimationFrame(time => this._tick(time));
        }
    };

    root.MyGameRuntime = MyGameRuntime;
    // Unlock Web Audio on the actual Play pointer gesture. This keeps sound
    // reliable in Electron/Chromium even when PIE startup awaits async work.
    document.addEventListener("pointerdown", event => {
        if (!event.target?.closest?.("#sim-play")) return;
        if (MyGameRuntime._isMyGame()) MyGameRuntime._resumeAudio();
    }, true);
    root.addEventListener("sm-game-project-loaded", event => {
        if (event.detail?.manifest?.id !== PROJECT_ID) return;
        MyGameRuntime.stop();
        MyGameRuntime.bindWorld(event.detail.scene || root.scene);
        MyGameRuntime._teleportToSpawn();
        MyGameRuntime._setStatus("Game loaded. Press Play to begin.");
    });
    root.addEventListener("sm-game-project-play", () => MyGameRuntime.start());
    root.addEventListener("sm:pie-start", () => {
        if (MyGameRuntime._isMyGame()) MyGameRuntime.start();
    });
    root.addEventListener("sm-game-project-stop", () => MyGameRuntime.stop());
    root.addEventListener("sm:pie-stop", () => MyGameRuntime.stop());
    root.addEventListener("sm-game-project-unloaded", () => {
        MyGameRuntime.stop();
        MyGameRuntime.world = null;
        MyGameRuntime.collectibles = [];
        MyGameRuntime.hazards = [];
        MyGameRuntime.extraction = null;
    });
})(window);

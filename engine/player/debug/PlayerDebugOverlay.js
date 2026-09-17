// SM Engine - Player runtime diagnostics overlay.
// Visualizes the live capsule and registered collision bounds without
// participating in physics, selection, serialization, or scene export.
(function () {
    'use strict';

    class SMPlayerDebugOverlay {
        constructor() {
            this.collisionEnabled = false;
            this.animationEnabled = false;
            this.scene = null;
            this.root = null;
            this.capsule = null;
            this.velocityArrow = null;
            this.groundArrow = null;
            this.worldBounds = null;
            this.hud = null;
            this._worldSignature = '';
            this._lastWorldRefresh = 0;
            this._timer = window.setInterval(() => this.update(), 100);
        }

        _isGameWorkspace() {
            const panel = window.SMViewportSystem?.getActivePanel?.();
            const mode = String(
                panel?.workspaceMode || window.workspaceManager?.currentMode || ''
            ).toUpperCase();
            return mode === 'GAME_DEV' || mode === 'GAMEPLAY_SAMPLE';
        }

        _getPlayer() {
            return window.playerSystem || null;
        }

        _ensureRoot() {
            if (this.root?.parent) return true;
            if (!window.THREE || !window.scene) return false;
            this.scene = window.scene;
            this.root = new THREE.Group();
            this.root.name = 'SM Player Debug Overlay';
            this.root.userData = {
                isSystemObject: true,
                isEditorHelper: true,
                ignoreInHierarchy: true,
                ignoreInTimeline: true,
                skipAutoRig: true,
                excludeFromNanite: true,
                excludeFromStaticMerge: true
            };
            this.worldBounds = new THREE.Group();
            this.worldBounds.name = 'Collision Bounds';
            this.scene.add(this.root);
            // Bounds are already expressed in world coordinates. Keep them a
            // scene sibling of the moving player helper so they never receive
            // the player's transform a second time.
            this.scene.add(this.worldBounds);
            return true;
        }

        _ensurePlayerHelper(player) {
            if (this.capsule || !window.THREE) return;
            const physics = player?.playerPhysics;
            const radius = Math.max(0.08, Number(physics?.radius ?? player?.config?.playerColliderRadius ?? 0.34));
            const height = Math.max(radius * 2, Number(physics?.height ?? player?.config?.playerColliderHeight ?? 1.78));
            const cylinderHeight = Math.max(0.001, height - radius * 2);
            const material = new THREE.MeshBasicMaterial({
                color: 0xb0b0b0,
                wireframe: true,
                transparent: true,
                opacity: 0.85,
                depthTest: false,
                depthWrite: false
            });
            const capsule = new THREE.Group();
            capsule.name = 'Player Capsule';
            const middle = new THREE.Mesh(
                new THREE.CylinderGeometry(radius, radius, cylinderHeight, 12, 1, true),
                material
            );
            middle.position.y = height * 0.5;
            const bottom = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), material);
            bottom.position.y = radius;
            const top = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), material);
            top.position.y = height - radius;
            capsule.add(middle, bottom, top);
            this.capsule = capsule;
            this.root.add(capsule);

            this.velocityArrow = new THREE.ArrowHelper(
                new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 0.1, 0xb0b0b0, 0.18, 0.09
            );
            this.velocityArrow.line.material.depthTest = false;
            this.velocityArrow.cone.material.depthTest = false;
            this.groundArrow = new THREE.ArrowHelper(
                new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.65, 0x7f7f7f, 0.14, 0.07
            );
            this.groundArrow.line.material.depthTest = false;
            this.groundArrow.cone.material.depthTest = false;
            this.root.add(this.velocityArrow, this.groundArrow);
        }

        _ensureHud() {
            if (this.hud) return this.hud;
            const hud = document.createElement('aside');
            hud.id = 'sm-player-debug-hud';
            hud.className = 'sm-player-debug-hud';
            hud.setAttribute('aria-live', 'polite');
            hud.innerHTML = '<header><i class="fas fa-person-running"></i><strong>PLAYER DEBUG</strong><span data-debug-live>OFFLINE</span></header><dl></dl>';
            document.body.appendChild(hud);
            this.hud = hud;
            return hud;
        }

        _setWorldBounds(physics) {
            if (!this.worldBounds || !physics) return;
            const entries = Array.isArray(physics.entries) ? physics.entries : [];
            const signature = entries.map(entry => `${entry.object?.uuid || ''}:${entry.box?.min?.toArray?.().join(',') || ''}:${entry.box?.max?.toArray?.().join(',') || ''}`).join('|');
            if (signature === this._worldSignature) return;
            this._worldSignature = signature;
            this.worldBounds.traverse(child => {
                child.geometry?.dispose?.();
                child.material?.dispose?.();
            });
            this.worldBounds.clear();
            // The debug view remains useful in complex scenes without turning
            // a 1000-object project into a sea of helper lines.
            entries.slice(0, 96).forEach(entry => {
                if (!entry?.box?.isBox3) return;
                const helper = new THREE.Box3Helper(entry.box.clone(), 0x6f6f6f);
                helper.userData.isEditorHelper = true;
                helper.material.depthTest = false;
                helper.material.transparent = true;
                helper.material.opacity = 0.42;
                this.worldBounds.add(helper);
            });
        }

        _updateCollision(player) {
            const visible = this.collisionEnabled && this._isGameWorkspace();
            if (!visible || !player?.character?.model || !this._ensureRoot()) {
                if (this.root) this.root.visible = false;
                if (this.worldBounds) this.worldBounds.visible = false;
                return;
            }
            this._ensurePlayerHelper(player);
            const physics = player.playerPhysics;
            if (!this.capsule || !physics) return;
            this.root.visible = true;
            this.worldBounds.visible = true;
            player.character.model.getWorldPosition(this.root.position);
            const grounded = physics.grounded === true;
            const helperColor = grounded ? 0x8a8a8a : 0xb0b0b0;
            this.capsule.traverse(child => {
                if (child.material?.color) child.material.color.setHex(helperColor);
            });

            const velocity = player.movement?.velocity || new THREE.Vector3();
            const horizontal = new THREE.Vector3(velocity.x || 0, 0, velocity.z || 0);
            const speed = horizontal.length();
            this.velocityArrow.visible = speed > 0.02;
            if (this.velocityArrow.visible) {
                this.velocityArrow.position.set(0, physics.height + 0.12, 0);
                this.velocityArrow.setDirection(horizontal.normalize());
                this.velocityArrow.setLength(Math.min(2.5, Math.max(0.22, speed * 0.36)), 0.18, 0.09);
            }
            this.groundArrow.visible = grounded;
            if (grounded) {
                this.groundArrow.position.set(0, 0.04, 0);
                this.groundArrow.setDirection((physics.groundNormal || new THREE.Vector3(0, 1, 0)).clone().normalize());
            }
            const now = performance.now();
            if (now - this._lastWorldRefresh > 450) {
                this._lastWorldRefresh = now;
                physics.refreshWorld?.();
                this._setWorldBounds(physics);
            }
        }

        _updateHud(player) {
            const hud = this._ensureHud();
            const visible = this.animationEnabled && this._isGameWorkspace();
            hud.hidden = !visible;
            if (!visible) return;
            const state = player?.getDebugState?.() || null;
            const animation = state?.animation || {};
            const movement = state?.movement || {};
            const physics = state?.physics || {};
            const input = state?.input || {};
            const live = hud.querySelector('[data-debug-live]');
            if (live) live.textContent = state?.player?.ready ? 'LIVE' : 'WAITING';
            const rows = [
                ['Clip', animation.current || 'None'],
                ['State', animation.state || 'None'],
                ['Speed', `${Number(movement.speed || 0).toFixed(2)} m/s`],
                ['Input', `${input.forward || 0}, ${input.right || 0}`],
                ['Ground', physics.grounded === true ? (physics.groundObject || 'Ground') : 'Airborne'],
                ['Vertical', `${Number(physics.verticalVelocity || 0).toFixed(2)} m/s`]
            ];
            hud.querySelector('dl').innerHTML = rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${String(value)}</dd></div>`).join('');
        }

        update() {
            const player = this._getPlayer();
            this._updateCollision(player);
            this._updateHud(player);
        }

        setCollisionEnabled(enabled) {
            this.collisionEnabled = !!enabled;
            this.update();
            return this.collisionEnabled;
        }

        setAnimationEnabled(enabled) {
            this.animationEnabled = !!enabled;
            this.update();
            return this.animationEnabled;
        }

        refreshCollision() {
            this._worldSignature = '';
            this._getPlayer()?.playerPhysics?.refreshWorld?.(true);
            this.update();
        }

        dispose() {
            window.clearInterval(this._timer);
            this.hud?.remove?.();
            this.root?.removeFromParent?.();
            this.worldBounds?.removeFromParent?.();
            this.root?.traverse?.(child => {
                child.geometry?.dispose?.();
                child.material?.dispose?.();
            });
            this.worldBounds?.traverse?.(child => {
                child.geometry?.dispose?.();
                child.material?.dispose?.();
            });
            this.root = null;
            this.worldBounds = null;
            this.hud = null;
        }
    }

    window.SMPlayerDebugOverlay = window.SMPlayerDebugOverlay || new SMPlayerDebugOverlay();
}());

// ============================================================
// engine/motion-matching-player-control.js
//
// Player-mode (walk/orbit) toggle UI + keybinding, and the
// "Game Animation Sample" motion-matching demo course that can
// be spawned into the scene. Depends on 00-globals.js.
// ============================================================

let updatePlayerControlHint;
let syncPlayerControlState;
let setPlayerControlMode;

/**
 * Creates the "Press P for Player Mode" hint element inside the
 * given container and wires up window.setPlayerControlMode /
 * window.toggleControlMode plus the 'P' keydown shortcut.
 */
function setupPlayerControlUI(container) {
    const hint = document.createElement('div');
    hint.id = 'control-hint';
    hint.style.color = 'white';
    hint.style.backgroundColor = 'rgba(0, 50, 100, 0.7)';
    hint.style.padding = '8px';
    hint.style.margin = '5px';
    hint.style.textAlign = 'center';
    hint.style.fontFamily = 'monospace';
    hint.style.borderRadius = '4px';
    hint.style.border = '1px solid #555';
    hint.textContent = "Press 'P' for Player Mode | Use Arrow Keys to move | Shift+Up to run";

    if (container) container.prepend(hint);
    else document.body.appendChild(hint);

    controlHint = hint;

    updatePlayerControlHint = (active, message = '') => {
        if (!controlHint) return;
        if (message) {
            controlHint.textContent = message;
            return;
        }
        controlHint.textContent = active
            ? "Player Mode | Up walk | Shift+Up run | Left/Right turn | Down back up | P to exit"
            : "Press 'P' for Player Mode | Use Arrow Keys to move | Shift+Up to run";
    };

    syncPlayerControlState = (active) => {
        isPlayerControlActive = !!active;
        window.isPlayerControlActive = isPlayerControlActive;
        if (player) player.isPlayerControlActive = isPlayerControlActive;
    };

    setPlayerControlMode = (active, options = {}) => {
        const desiredState = !!active;
        const { silent = false } = options;
        const motionMatchingButton = document.getElementById('motion-matching-toolbar-btn');

        if (!player || !player.model) {
            syncPlayerControlState(false);
            motionMatchingButton?.classList.remove('active');
            updatePlayerControlHint(false, "Player is still loading. Wait a moment, then press 'P' again.");
            if (!silent) {
                console.warn('Player Mode unavailable: player model is not ready yet.');
            }
            return false;
        }

        if (desiredState && !tpsCamera) {
            tpsCamera = new ThirdPersonCamera(camera, player.model);
        }

        syncPlayerControlState(desiredState);

        if (typeof controls !== 'undefined' && controls) {
            controls.enabled = !isPlayerControlActive;
        }

        if (desiredState) {
            player.activate();
            motionMatchingButton?.classList.add('active');
            if (tpsCamera && player.model) {
                const startPos = player.model.position.clone().add(new THREE.Vector3(0, 2, -5));
                tpsCamera.currentPosition.copy(startPos);
                tpsCamera.currentLookAt.copy(player.model.position);
                tpsCamera.target = player.model;
                tpsCamera.update(0.016);
            }
            updatePlayerControlHint(true);
            if (!silent) console.log('Player Mode: ON');
        } else {
            player.deactivate();
            motionMatchingButton?.classList.remove('active');
            window.playerGraphEditor?.pauseRuntime?.('Paused outside Player Mode');
            updatePlayerControlHint(false);
            if (!silent) console.log('Orbit Mode: ON');
        }

        return true;
    };

    window.setPlayerControlMode = setPlayerControlMode;
    window.toggleControlMode = function (forceActive) {
        if (typeof forceActive === 'boolean') {
            return setPlayerControlMode(forceActive);
        }
        return setPlayerControlMode(!isPlayerControlActive);
    };

    if (!window.__smPlayerModeKeyBound) {
        window.addEventListener('keydown', (event) => {
            const targetTag = event.target?.tagName?.toLowerCase?.() || '';
            const isTyping = targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select' || !!event.target?.isContentEditable;
            if (isTyping || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;

            if (event.code === 'KeyP') {
                event.preventDefault();
                window.toggleControlMode();
            }
        });
        window.__smPlayerModeKeyBound = true;
    }

    return hint;
}

function tagMotionMatchingSampleObject(object) {
    if (!object) return object;
    object.userData = object.userData || {};
    object.userData.isSystemObject = true;
    object.userData.ignoreInTimeline = true;
    object.userData.ignoreInHierarchy = true;
    object.userData.selectable = false;
    object.traverse?.(child => {
        child.userData = child.userData || {};
        child.userData.isSystemObject = true;
        child.userData.ignoreInTimeline = true;
        child.userData.ignoreInHierarchy = true;
        child.userData.selectable = false;
    });
    return object;
}

function createMotionMatchingBadge({
    text,
    width = 1024,
    height = 320,
    background = 'rgba(0,0,0,0)',
    foreground = '#eac29f',
    border = 'rgba(234, 194, 159, 0.15)',
    fontSize = 82,
    lineHeight = 1.08,
    circle = false,
    worldWidth = 14,
    opacity = 0.92
}) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = background;
    if (circle) {
        const radius = Math.min(width, height) * 0.42;
        ctx.beginPath();
        ctx.arc(width * 0.5, height * 0.5, radius, 0, Math.PI * 2);
        ctx.fill();
        if (border && border !== 'transparent') {
            ctx.strokeStyle = border;
            ctx.lineWidth = Math.max(6, width * 0.01);
            ctx.stroke();
        }
    } else if (background !== 'rgba(0,0,0,0)') {
        ctx.fillRect(0, 0, width, height);
    }

    const lines = String(text || '').split('\n');
    ctx.fillStyle = foreground;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${fontSize}px "Segoe UI", Arial, sans-serif`;
    const totalHeight = lines.length * fontSize * lineHeight;
    lines.forEach((line, index) => {
        const y = (height * 0.5) - (totalHeight * 0.5) + (index * fontSize * lineHeight) + (fontSize * 0.55);
        ctx.fillText(line, width * 0.5, y);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    const worldHeight = worldWidth * (height / width);
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(worldWidth, worldHeight),
        new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity,
            depthWrite: false,
            side: THREE.DoubleSide
        })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 5;
    return tagMotionMatchingSampleObject(mesh);
}

function ensureMotionMatchingSampleCourse() {
    if (!scene) return null;
    let sampleGroup = scene.getObjectByName('MotionMatchingSampleCourse');
    if (sampleGroup) {
        sampleGroup.visible = true;
        return sampleGroup;
    }

    sampleGroup = tagMotionMatchingSampleObject(new THREE.Group());
    sampleGroup.name = 'MotionMatchingSampleCourse';

    const title = createMotionMatchingBadge({
        text: 'GAME ANIMATION\nSAMPLE',
        width: 1600,
        height: 460,
        foreground: '#d7b08c',
        worldWidth: 24,
        opacity: 0.95
    });
    title.position.set(0, 0.055, 8);
    sampleGroup.add(title);

    const startPad = createMotionMatchingBadge({
        text: 'Start\nObstacle\nCourse 1',
        width: 540,
        height: 540,
        background: 'rgba(57, 124, 246, 0.85)',
        foreground: '#ffffff',
        border: 'rgba(255,255,255,0.28)',
        fontSize: 54,
        circle: true,
        worldWidth: 5.5
    });
    startPad.position.set(-19, 0.06, 18);
    sampleGroup.add(startPad);

    const widgetPad = createMotionMatchingBadge({
        text: 'Game\nAnimation\nWidget',
        width: 720,
        height: 400,
        background: 'rgba(31, 109, 236, 0.88)',
        foreground: '#ffffff',
        border: 'rgba(255,255,255,0.2)',
        fontSize: 56,
        worldWidth: 7.5
    });
    widgetPad.position.set(22, 0.06, 18);
    sampleGroup.add(widgetPad);

    scene.add(sampleGroup);
    return sampleGroup;
}

window.activateMotionMatchingSampleMode = function () {
    window.workspaceManager?.setMode?.('GAME_DEV');
    ensureMotionMatchingSampleCourse();
    if (ground) ground.visible = true;
    if (obstaclesGroup) {
        obstaclesGroup.children.forEach(obstacle => {
            obstacle.updateMatrixWorld(true);

            const worldPos = new THREE.Vector3();
            const worldQuat = new THREE.Quaternion();
            obstacle.getWorldPosition(worldPos);
            obstacle.getWorldQuaternion(worldQuat);

            let shape = 'box';
            if (obstacle.geometry.type.includes('Cylinder')) shape = 'cylinder';

            physicsSystem.addBody(obstacle, {
                mass: 0,
                shapeType: shape,
                pos: worldPos,
                quat: worldQuat,
                friction: 0.8,
                restitution: 0.1,
                size: [
                    obstacle.geometry.parameters.width || (obstacle.geometry.parameters.radiusTop * 2),
                    obstacle.geometry.parameters.height,
                    obstacle.geometry.parameters.depth || (obstacle.geometry.parameters.radiusBottom * 2)
                ]
            });
        });
    }
    if (distanceMarkers) distanceMarkers.visible = true;
    scene.getObjectByName('MotionMatchingSampleCourse')?.traverse?.(child => { child.visible = true; });
    window.dedupeHemisphereLights?.({ preserveCustomLights: false });

    if (window.skyLightingSystem) {
        try {
            window.skyLightingSystem.setVisible(true);
            window.skyLightingSystem.applyWorkspaceProfile?.('ue5-editor');
            window.skyLightingSystem.setWeather?.('clear');
            if (scene.fog?.isFogExp2) {
                scene.fog = null;
            }
            window.skyLightingSystem.refreshShadows?.();
            window.skyLightingSystem.update?.(0);
        } catch (error) {
            console.warn('Motion Matching sample sky setup warning:', error);
        }
    } else {
        scene.background = new THREE.Color(0xc8ccd8);
        scene.fog = new THREE.Fog(0xc8ccd8, 210, 2600);
    }

    if (controls) {
        controls.enabled = true;
        controls.target.set(4, 1.5, 0);
    }
    camera.position.set(-9, 8, 26);
    camera.lookAt(4, 1.5, 0);
    controls?.update?.();

    if (!player || !player.model) {
        updatePlayerControlHint?.(false, "Player is still loading. Wait a moment, then press Motion Matching again.");
        console.warn('Motion Matching sample unavailable: player model is not ready yet.');
        return false;
    }

    player.setMotionMatchingEnabled?.(true);
    player.setMotionMatchingMode?.('auto');
    player._queueMotionLibraryLoad?.();

    const spawnPosition = new THREE.Vector3(-14, 0, 16);
    const groundY = typeof player.getGroundHeight === 'function'
        ? player.getGroundHeight(spawnPosition)
        : (ground?.position?.y ?? 0);

    player.model.position.set(spawnPosition.x, groundY + 0.02, spawnPosition.z);
    player.model.rotation.set(0, Math.PI * 0.18, 0);
    player.velocity.set(0, 0, 0);
    player.updatePlayerBox?.();

    if (!tpsCamera) {
        tpsCamera = new ThirdPersonCamera(camera, player.model);
    }
    if (tpsCamera) {
        tpsCamera.target = player.model;
        tpsCamera.currentPosition.copy(player.model.position.clone().add(new THREE.Vector3(-3.5, 2.4, 5.8)));
        tpsCamera.currentLookAt.copy(player.model.position.clone().add(new THREE.Vector3(0, 1.5, 0)));
        tpsCamera.update(0.016);
    }

    setPlayerControlMode(true);
    document.getElementById('motion-matching-toolbar-btn')?.classList.add('active');
    return true;
};
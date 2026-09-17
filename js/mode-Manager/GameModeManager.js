/**
 * SM Engine Game Mode Manager — 2D, 2.5D, 3D viewport switching
 * Integrates with WorkspaceManager and provides game development modes
 */

class GameModeManager {
  constructor() {
    this.currentGameMode = null;
    this.gameModes = {
      MODE_2D: {
        name: "2D Game",
        icon: "fa-image",
        tag: "2D",
        tagColor: "#ec4899",
        description: "Top-down or side-scrolling 2D games",
        settings: {
          cameraMode: "orthographic",
          cameraPosition: { x: 0, y: 30, z: 0 },
          cameraLookAt: { x: 0, y: 0, z: 0 },
          fov: 75,
          orthographicScale: 25,
          renderingMode: "2d",
          physics: "arcade", // Arcade physics for 2D
          lighting: "simple", // Minimal lighting
          backgroundType: "flat",
          gridVisible: true,
          gridSize: 1000,
          gridDivisions: 100,
        },
      },
      MODE_2_5D: {
        name: "2.5D Game",
        icon: "fa-cube",
        tag: "2.5D",
        tagColor: "#f59e0b",
        description: "Isometric or pseudo-3D games (like platformers)",
        settings: {
          cameraMode: "perspective",
          cameraPosition: { x: 0, y: 5, z: 18 },
          cameraLookAt: { x: 0, y: 2, z: 0 },
          fov: 60,
          orthographicScale: 20,
          renderingMode: "2.5d",
          physics: "rapier", // Full physics for depth
          lighting: "moderate", // Normal lighting with directional
          backgroundType: "sky",
          gridVisible: true,
          gridSize: 1000,
          gridDivisions: 100,
        },
      },
      MODE_3D: {
        name: "3D Game",
        icon: "fa-dice-d20",
        tag: "3D",
        tagColor: "#10b981",
        description: "Full 3D games with complete spatial freedom",
        settings: {
          cameraMode: "perspective",
          cameraPosition: { x: 10, y: 15, z: 20 },
          cameraLookAt: { x: 0, y: 0, z: 0 },
          fov: 75,
          orthographicScale: 30,
          renderingMode: "3d",
          physics: "rapier", // Full physics
          lighting: "advanced", // Advanced lighting with HDRI
          backgroundType: "hdri",
          gridVisible: false,
          gridSize: 1000,
          gridDivisions: 100,
        },
      },
    };

    this._initUI();
  }

  /**
   * Initialize the game mode selector UI in the toolbar
   */
  _initUI() {
    // Wait for DOM to be ready
    if (!document.body) {
      setTimeout(() => this._initUI(), 100);
      return;
    }

    // Create game mode selector panel
    this.modePanel = document.createElement("div");
    this.modePanel.id = "game-mode-panel";
    this.modePanel.className = "game-mode-panel";

    // Create the modal container
    this.modeModal = document.createElement("div");
    this.modeModal.id = "game-mode-modal";
    this.modeModal.className = "game-mode-modal";
    this.modeModal.innerHTML = `
<div class="gm-window gm-layout">
    <div class="gm-header">
        <div class="gm-title">
            <i class="fas fa-gamepad"></i>
            <span>Select Game Mode</span>
        </div>
        <button class="gm-close-btn" id="gm-close-btn">
            <i class="fas fa-times"></i>
        </button>
    </div>

    <div class="gm-modes-container">
        <div class="gm-mode-card" data-mode="MODE_2D">
            <div class="gm-card-icon mode-2d-icon">
                <i class="fas fa-image"></i>
            </div>
            <h3>2D Game</h3>
            <p>Top-down or side-scrolling</p>
            <ul class="gm-feature-list">
                <li><i class="fas fa-check"></i> Orthographic camera</li>
                <li><i class="fas fa-check"></i> Arcade physics</li>
                <li><i class="fas fa-check"></i> Simple lighting</li>
                <li><i class="fas fa-check"></i> Flat background</li>
            </ul>
            <div class="gm-select-btn">Select 2D</div>
        </div>

        <div class="gm-mode-card" data-mode="MODE_2_5D">
            <div class="gm-card-icon mode-25d-icon">
                <i class="fas fa-cube"></i>
            </div>
            <h3>2.5D Game</h3>
            <p>Isometric platformer style</p>
            <ul class="gm-feature-list">
                <li><i class="fas fa-check"></i> Perspective camera</li>
                <li><i class="fas fa-check"></i> Full physics engine</li>
                <li><i class="fas fa-check"></i> Dynamic lighting</li>
                <li><i class="fas fa-check"></i> Sky background</li>
            </ul>
            <div class="gm-select-btn">Select 2.5D</div>
        </div>

        <div class="gm-mode-card" data-mode="MODE_3D">
            <div class="gm-card-icon mode-3d-icon">
                <i class="fas fa-dice-d20"></i>
            </div>
            <h3>3D Game</h3>
            <p>Full 3D with complete freedom</p>
            <ul class="gm-feature-list">
                <li><i class="fas fa-check"></i> Free camera control</li>
                <li><i class="fas fa-check"></i> Advanced physics</li>
                <li><i class="fas fa-check"></i> Advanced lighting</li>
                <li><i class="fas fa-check"></i> HDRI environment</li>
            </ul>
            <div class="gm-select-btn">Select 3D</div>
        </div>
    </div>

    <div class="gm-footer">
        <button class="gm-btn gm-btn-cancel" id="gm-cancel-btn">
            <i class="fas fa-times"></i> Cancel
        </button>
        <p class="gm-footer-text">Switch game development modes at any time</p>
    </div>
</div>

<style>
.game-mode-modal {
    position: fixed;
    inset: 0;
    z-index: 100000;
    display: none;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(8px);
}

.game-mode-modal.active {
    display: flex;
}

.gm-layout {
    background: #161618;
    color: #d4d4d4;
    border: 1px solid #28282c;
    border-radius: 12px;
    width: min(920px, 96vw);
    max-height: 85vh;
    overflow-y: auto;
    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
    box-shadow: 0 40px 100px rgba(0, 0, 0, 0.8);
    display: flex;
    flex-direction: column;
}

/* Header */
.gm-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid #232323;
    gap: 12px;
}

.gm-title {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 18px;
    font-weight: 600;
    color: #fff;
    letter-spacing: 0.3px;
}

.gm-title i {
    color: #10b981;
    font-size: 20px;
}

.gm-close-btn {
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    font-size: 18px;
    padding: 8px;
    border-radius: 6px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.gm-close-btn:hover {
    background: #2a2a2a;
    color: #fff;
}

/* Modes Container */
.gm-modes-container {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 20px;
    padding: 24px;
    flex: 1;
}

/* Mode Card */
.gm-mode-card {
    background: #1a1a1c;
    border: 2px solid transparent;
    border-radius: 12px;
    padding: 0;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}

.gm-mode-card:hover {
    transform: translateY(-6px);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
    border-color: #3a3a40;
}

.gm-mode-card[data-mode="MODE_2D"]:hover {
    border-color: #ec4899;
}

.gm-mode-card[data-mode="MODE_2_5D"]:hover {
    border-color: #f59e0b;
}

.gm-mode-card[data-mode="MODE_3D"]:hover {
    border-color: #10b981;
}

/* Card Icon */
.gm-card-icon {
    width: 60px;
    height: 60px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    margin: 20px auto 12px;
}

.mode-2d-icon {
    background: rgba(236, 72, 153, 0.15);
    color: #ec4899;
}

.mode-25d-icon {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
}

.mode-3d-icon {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
}

/* Card Content */
.gm-mode-card h3 {
    margin: 0 20px 6px;
    font-size: 18px;
    font-weight: 600;
    color: #fff;
    text-align: center;
    letter-spacing: -0.2px;
}

.gm-mode-card p {
    margin: 0 20px 14px;
    color: #888;
    font-size: 12px;
    text-align: center;
    line-height: 1.4;
}

.gm-feature-list {
    list-style: none;
    margin: 0 20px 16px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
}

.gm-feature-list li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #aaa;
    line-height: 1.4;
}

.gm-feature-list i {
    color: #4ade80;
    font-size: 11px;
    width: 14px;
    text-align: center;
}

/* Select Button */
.gm-select-btn {
    margin: 0 20px 18px;
    padding: 10px 14px;
    background: #25252a;
    border: 1px solid #333;
    border-radius: 8px;
    color: #888;
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    letter-spacing: 0.3px;
}

.gm-mode-card[data-mode="MODE_2D"]:hover .gm-select-btn {
    background: #ec4899;
    color: #fff;
    border-color: #ec4899;
}

.gm-mode-card[data-mode="MODE_2_5D"]:hover .gm-select-btn {
    background: #f59e0b;
    color: #fff;
    border-color: #f59e0b;
}

.gm-mode-card[data-mode="MODE_3D"]:hover .gm-select-btn {
    background: #10b981;
    color: #fff;
    border-color: #10b981;
}

/* Footer */
.gm-footer {
    border-top: 1px solid #1e1e1e;
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
}

.gm-footer-text {
    margin: 0;
    font-size: 12px;
    color: #666;
    flex: 1;
    text-align: center;
    letter-spacing: 0.2px;
}

.gm-btn {
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid #333;
    transition: all 0.2s;
    white-space: nowrap;
}

.gm-btn-cancel {
    background: #252525;
    color: #888;
}

.gm-btn-cancel:hover {
    background: #2e2e2e;
    color: #ccc;
    border-color: #444;
}

/* Game Mode Indicator in Toolbar */
.game-mode-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    color: #999;
    padding: 7px 14px;
    font-size: 12px;
    cursor: pointer;
    border-radius: 6px;
    height: calc(100% - 4px);
    transition: all 0.15s;
    white-space: nowrap;
}

.game-mode-btn:hover {
    background: #2a2a2a;
    color: #ccc;
}

.game-mode-btn i {
    font-size: 14px;
}

.game-mode-indicator {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-left: 4px;
}

.game-mode-btn.mode-2d .game-mode-indicator {
    background: #ec4899;
}

.game-mode-btn.mode-25d .game-mode-indicator {
    background: #f59e0b;
}

.game-mode-btn.mode-3d .game-mode-indicator {
    background: #10b981;
}

.game-mode-btn.hidden {
    display: none;
}
</style>
        `;

    document.body.appendChild(this.modeModal);
    this._bindModalEvents();
  }

  /**
   * Bind events to the game mode modal
   */
  _bindModalEvents() {
    const modal = this.modeModal;

    modal.addEventListener("click", (e) => {
      // Mode card selection
      const card = e.target.closest(".gm-mode-card");
      if (card) {
        const mode = card.dataset.mode;
        this.setGameMode(mode);
        this.close();
        return;
      }

      // Close button
      if (
        e.target.closest("#gm-close-btn") ||
        e.target.closest("#gm-cancel-btn")
      ) {
        this.close();
        return;
      }

      // Overlay click
      if (e.target === modal) {
        this.close();
      }
    });
  }

  /**
   * Show the game mode selector modal
   */
  open() {
    this.modeModal.classList.add("active");
  }

  /**
   * Close the game mode selector modal
   */
  close() {
    this.modeModal.classList.remove("active");
  }

  /**
   * Toggle the game mode modal
   */
  toggle() {
    if (this.modeModal.classList.contains("active")) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Set active game mode and apply viewport/rendering settings
   */
  setGameMode(modeKey) {
    if (!this.gameModes[modeKey]) {
      console.warn(`[GameModeManager] Unknown game mode: ${modeKey}`);
      return;
    }

    const isFirstTime = this.currentGameMode === null;
    const modeChanged = this.currentGameMode !== modeKey;

    this.currentGameMode = modeKey;
    localStorage.setItem("sm_game_mode", modeKey);

    const mode = this.gameModes[modeKey];
    const settings = mode.settings;

    // Apply viewport changes
    this._applyGameViewport(settings);

    // Update toolbar indicator
    this._updateGameModeIndicator(modeKey);

    if (!isFirstTime && modeChanged) {
      this._showToast(`Switched to ${mode.name}`);
    }

    console.log(`[GameModeManager] Mode set to: ${modeKey}`, mode);
  }

  /**
   * Apply viewport and rendering settings for the selected game mode
   */
  _applyGameViewport(settings) {
    const scene = window.scene;
    const camera = window.camera;
    const renderer = window.renderer;

    if (!scene || !camera || !renderer) {
      setTimeout(() => this._applyGameViewport(settings), 500);
      return;
    }

    // Camera setup
    if (settings.cameraMode === "orthographic") {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const scale = settings.orthographicScale;

      const orthoCamera = new THREE.OrthographicCamera(
        (-w / h) * scale,
        (w / h) * scale,
        scale,
        -scale,
        0.1,
        1000,
      );

      orthoCamera.position.set(
        settings.cameraPosition.x,
        settings.cameraPosition.y,
        settings.cameraPosition.z,
      );
      orthoCamera.lookAt(
        settings.cameraLookAt.x,
        settings.cameraLookAt.y,
        settings.cameraLookAt.z,
      );

      // Replace camera in window
      window.camera = orthoCamera;
      renderer.render(scene, orthoCamera);
    } else {
      // Perspective camera (2.5D and 3D)
      camera.fov = settings.fov;
      camera.position.set(
        settings.cameraPosition.x,
        settings.cameraPosition.y,
        settings.cameraPosition.z,
      );
      camera.lookAt(
        settings.cameraLookAt.x,
        settings.cameraLookAt.y,
        settings.cameraLookAt.z,
      );
      camera.updateProjectionMatrix();
    }

    // Grid visibility
    const grid = scene.getObjectByName("advancedGrid");
    if (grid) {
      grid.visible = settings.gridVisible;
    }

    // Lighting adjustments
    this._applyGameLighting(scene, settings);

    // Background
    this._applyGameBackground(scene, settings);

    // Physics system update (if available)
    if (typeof window.updatePhysicsMode === "function") {
      window.updatePhysicsMode(settings.physics);
    }

    console.log(
      `[GameModeManager] Applied viewport for ${settings.renderingMode}`,
    );
  }

  _syncGlobalLightingAuthority(modeKey, scene = window.scene) {
    if (!scene) return;

    const mode = String(modeKey || this.currentMode || "").toUpperCase();

    const sun =
      window.smSunController?.light ||
      window.smHDRSkySystem?.sunLight ||
      window.skyLightingSystem?.sunLight ||
      null;

    /*
     * Disable legacy global lights.
     */
    scene.traverse((object) => {
      if (!object?.isLight) return;

      if (
        object === sun ||
        object.userData?.isGameplaySample === true ||
        object.userData?.isUserLight === true
      ) {
        return;
      }

      const name = String(object.name || "");

      if (
        name === "GameSunLight" ||
        name === "GameHemiLight" ||
        name === "GameFillLight" ||
        name === "GameAmbientLight" ||
        name === "GameRimLight" ||
        name === "WorkspaceMainLight" ||
        name === "WorkspaceAmbient"
      ) {
        object.visible = false;
        object.castShadow = false;
      }
    });

    if (!sun) return;

    /*
     * Sun visibility is controlled by workspace.
     */
    sun.visible =
      mode === "GAME_DEV" || mode === "TERRAIN" || mode === "GAMEPLAY_SAMPLE";

    /*
     * Only the authoritative Sun may cast global shadows.
     */
    sun.castShadow = true;

    sun.userData = {
      ...(sun.userData || {}),
      isGlobalWorkspaceSun: true,
      ws_globalSun: true,
    };

    if (sun.shadow) {
      sun.shadow.needsUpdate = true;
    }

    if (window.renderer?.shadowMap) {
      window.renderer.shadowMap.enabled = true;
      window.renderer.shadowMap.needsUpdate = true;
    }
  }
  /**
   * Apply lighting based on game mode
   */
  _applyGameLighting(scene, settings) {
    const lighting = settings.lighting;

    scene.traverse((obj) => {
      if (!obj.isLight) return;

      // Disable all lights initially
      obj.visible = false;
    });

    // Re-enable appropriate lights for the mode
    if (lighting === "simple") {
      // Just ambient light for 2D
      const ambient =
        scene.getObjectByName("GameAmbientLight") ||
        scene.getObjectByName("AmbientLight");
      if (ambient) ambient.visible = true;
    } else if (lighting === "moderate") {
      // Directional + ambient for 2.5D
      const lights = ["GameSunLight", "GameAmbientLight", "GameFillLight"];
      lights.forEach((name) => {
        const light = scene.getObjectByName(name);
        if (light) light.visible = true;
      });
    } else if (lighting === "advanced") {
      // All lights for 3D
      scene.traverse((obj) => {
        if (obj.isLight && obj.userData?.ws_gameLight) {
          obj.visible = true;
        }
      });
    }
  }

  /**
   * Apply background based on game mode
   */
  _applyGameBackground(scene, settings) {
    const bgType = settings.backgroundType;

    if (bgType === "flat") {
      scene.background = new THREE.Color(0x1c1c1c);
      scene.fog = null;
    } else if (bgType === "sky") {
      const sky = scene.getObjectByName("SkySphere");
      if (sky) sky.visible = true;
      scene.fog = new THREE.FogExp2(0x2a2a2a, 0.008);
    } else if (bgType === "hdri") {
      if (window.skyLightingSystem) {
        window.skyLightingSystem.setVisible(true);
      }
    }
  }

  /**
   * Update the toolbar game mode indicator
   */
  _updateGameModeIndicator(modeKey) {
    let btn = document.querySelector(".game-mode-btn");

    if (!btn) {
      // Create if doesn't exist
      const toolbar =
        document.querySelector("nav") ||
        document.querySelector('[role="toolbar"]');
      if (!toolbar) return;

      btn = document.createElement("button");
      btn.className = "game-mode-btn";
      btn.innerHTML =
        '<i class="fas fa-gamepad"></i><span id="game-mode-label">Game Mode</span><div class="game-mode-indicator"></div>';
      btn.addEventListener("click", () => this.open());

      // Insert after workspace button if possible
      const wsBtn = document.querySelector('[id*="workspace"]');
      if (wsBtn) {
        wsBtn.parentNode.insertBefore(btn, wsBtn.nextSibling);
      } else {
        toolbar.appendChild(btn);
      }
    }

    // Update button appearance and label
    const mode = this.gameModes[modeKey];
    const modeClass = modeKey.replace("MODE_", "mode-").toLowerCase();

    btn.className = `game-mode-btn ${modeClass}`;
    btn.title = mode.name;
    btn.innerHTML = `<i class="${this._getModeIcon(modeKey)}"></i><span id="game-mode-label">${mode.tag}</span><div class="game-mode-indicator"></div>`;
  }

  /**
   * Get icon for a game mode
   */
  _getModeIcon(modeKey) {
    return this.gameModes[modeKey]?.icon || "fa-gamepad";
  }

  /**
   * Show a toast notification
   */
  _showToast(message) {
    let toast = document.getElementById("gm-toast");

    if (!toast) {
      toast = document.createElement("div");
      toast.id = "gm-toast";
      toast.className = "gm-toast";
      document.body.appendChild(toast);

      const style = document.createElement("style");
      style.textContent = `
                .gm-toast {
                    position: fixed;
                    bottom: 24px;
                    right: 24px;
                    z-index: 100001;
                    background: #1e1e1e;
                    border: 1px solid #2a2a2a;
                    color: #d4d4d4;
                    padding: 12px 18px;
                    border-radius: 8px;
                    font-size: 12px;
                    opacity: 0;
                    transform: translateY(8px);
                    transition: all 0.3s ease;
                    pointer-events: none;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
                }
                .gm-toast.show {
                    opacity: 1;
                    transform: translateY(0);
                }
            `;
      document.head.appendChild(style);
    }

    toast.textContent = message;
    toast.classList.add("show");

    setTimeout(() => {
      toast.classList.remove("show");
    }, 2500);
  }

  /**
   * Get current game mode
   */
  getCurrentMode() {
    return this.currentGameMode;
  }

  /**
   * Get mode settings
   */
  getModeSettings(modeKey) {
    return this.gameModes[modeKey]?.settings || null;
  }

  /**
   * Check if running in a specific game mode
   */
  isMode(modeKey) {
    return this.currentGameMode === modeKey;
  }
}

// Auto-initialize
function initGameModeManager() {
  if (!window.gameModeManager) {
    window.gameModeManager = new GameModeManager();

    // Restore saved mode
    const saved = localStorage.getItem("sm_game_mode");
    if (saved && window.gameModeManager.gameModes[saved]) {
      window.gameModeManager.setGameMode(saved);
    }

    console.log("[SM Engine] GameModeManager initialized");
  }
}

// Initialize when script loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initGameModeManager);
} else {
  initGameModeManager();
}

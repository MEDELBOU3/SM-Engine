/**
 * Game Mode UI Integration
 * Adds game mode selector button to the main toolbar/menu
 */

function initGameModeUI() {
    // Wait for DOM and toolbar to be ready
    const checkToolbar = setInterval(() => {
        // Try to find the toolbar or menu bar
        const menu = document.querySelector('[id*="menu"]') || 
                     document.querySelector('nav') || 
                     document.querySelector('[role="toolbar"]') ||
                     document.querySelector('.toolbar') ||
                     document.querySelector('#toggle-status');

        if (menu || typeof window.gameModeManager !== 'undefined') {
            clearInterval(checkToolbar);

            // Create and add the game mode button
            const gameModeBtn = document.createElement('button');
            gameModeBtn.id = 'game-mode-selector-btn';
            gameModeBtn.className = 'toolbar-btn game-mode-selector';
            gameModeBtn.title = 'Switch Game Development Mode (2D/2.5D/3D)';
            gameModeBtn.innerHTML = `
                <i class="fas fa-gamepad"></i>
                <span class="mode-label" id="mode-label">Game Mode</span>
            `;

            gameModeBtn.addEventListener('click', () => {
                if (window.gameModeManager) {
                    window.gameModeManager.open();
                }
            });

            // Try to add to toolbar
            if (menu) {
                menu.appendChild(gameModeBtn);
            } else if (document.body) {
                // Fallback: add to body
                document.body.appendChild(gameModeBtn);
            }

            // Add CSS for the button
            addGameModeButtonStyles();

            console.log('[GameModeUI] Button initialized');
        }
    }, 100);

    // Clear after 5 seconds if toolbar not found
    setTimeout(() => clearInterval(checkToolbar), 5000);
}

function addGameModeButtonStyles() {
    const styleId = 'game-mode-button-styles';
    
    // Check if styles already exist
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .game-mode-selector {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: transparent;
            border: 1px solid transparent;
            color: #999;
            padding: 7px 12px;
            font-size: 12px;
            cursor: pointer;
            border-radius: 6px;
            height: calc(100% - 4px);
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            white-space: nowrap;
            font-weight: 500;
            letter-spacing: 0.3px;
        }

        .game-mode-selector:hover {
            background: rgba(58, 134, 255, 0.1);
            color: #3a86ff;
            border-color: rgba(58, 134, 255, 0.3);
        }

        .game-mode-selector i {
            font-size: 13px;
        }

        .game-mode-selector .mode-label {
            display: inline-block;
            max-width: 120px;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        /* Mode-specific styling */
        .game-mode-selector.mode-2d {
            color: #ec4899;
            border-color: rgba(236, 72, 153, 0.3);
            background: rgba(236, 72, 153, 0.08);
        }

        .game-mode-selector.mode-2d:hover {
            background: rgba(236, 72, 153, 0.15);
            color: #ff1493;
        }

        .game-mode-selector.mode-25d {
            color: #f59e0b;
            border-color: rgba(245, 158, 11, 0.3);
            background: rgba(245, 158, 11, 0.08);
        }

        .game-mode-selector.mode-25d:hover {
            background: rgba(245, 158, 11, 0.15);
            color: #fbbf24;
        }

        .game-mode-selector.mode-3d {
            color: #10b981;
            border-color: rgba(16, 185, 129, 0.3);
            background: rgba(16, 185, 129, 0.08);
        }

        .game-mode-selector.mode-3d:hover {
            background: rgba(16, 185, 129, 0.15);
            color: #34d399;
        }

        /* Animation for mode indicator */
        .game-mode-selector i {
            animation: pulse-gamepad 2s ease-in-out infinite;
        }

        @keyframes pulse-gamepad {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.05); opacity: 0.8; }
        }

        .game-mode-selector:not(:hover) i {
            animation: none;
        }
    `;

    document.head.appendChild(style);
}

/**
 * Update game mode button appearance based on current mode
 */
function updateGameModeBtnAppearance(modeKey) {
    const btn = document.getElementById('game-mode-selector-btn');
    if (!btn) return;

    const gameModeManager = window.gameModeManager;
    if (!gameModeManager) return;

    const mode = gameModeManager.gameModes[modeKey];
    const modeClass = modeKey.replace('MODE_', 'mode-').toLowerCase();

    // Remove all mode classes
    btn.classList.remove('mode-2d', 'mode-25d', 'mode-3d');
    
    // Add current mode class
    btn.classList.add(modeClass);

    // Update label
    const label = document.getElementById('mode-label');
    if (label) {
        label.textContent = mode.tag;
        btn.title = `Current: ${mode.name} - Click to change game mode`;
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGameModeUI);
} else {
    initGameModeUI();
}

// Hook into GameModeManager to update button appearance
const originalSetGameMode = GameModeManager.prototype.setGameMode;
GameModeManager.prototype.setGameMode = function(modeKey) {
    originalSetGameMode.call(this, modeKey);
    updateGameModeBtnAppearance(modeKey);
};

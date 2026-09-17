/**
 * Game Mode System - Test & Initialization Helper
 * Include this in DevTools console to test the game mode system
 */

// ============================================================
// GAME MODE TESTER & DEBUG
// ============================================================

const GameModeTester = {
    /**
     * Check if GameModeManager is properly initialized
     */
    checkInitialization() {
        console.group('🎮 GameModeManager Initialization Check');
        
        const hasMgr = !!window.gameModeManager;
        console.log('GameModeManager exists:', hasMgr ? '✓' : '✗');
        
        if (hasMgr) {
            console.log('Current mode:', window.gameModeManager.currentGameMode);
            console.log('Available modes:', Object.keys(window.gameModeManager.gameModes));
            console.log('Modal element:', !!window.gameModeManager.modeModal ? '✓' : '✗');
        }
        
        console.groupEnd();
        return hasMgr;
    },

    /**
     * Test mode switching
     */
    testModeSwitching() {
        console.group('🔄 Mode Switching Test');
        
        const modes = ['MODE_2D', 'MODE_2_5D', 'MODE_3D'];
        
        modes.forEach(mode => {
            const settings = window.gameModeManager.getModeSettings(mode);
            console.log(`${mode}:`, {
                cameraMode: settings.cameraMode,
                cameraPosition: settings.cameraPosition,
                physics: settings.physics,
                lighting: settings.lighting
            });
        });
        
        console.groupEnd();
    },

    /**
     * Test camera setup
     */
    testCameraSetup() {
        console.group('📷 Camera Setup Test');
        
        const camera = window.camera;
        if (camera) {
            console.log('Current Camera Type:', camera.isOrthographicCamera ? 'Orthographic' : 'Perspective');
            console.log('Camera Position:', camera.position);
            console.log('Camera FOV:', camera.fov || 'N/A (Orthographic)');
        } else {
            console.warn('No camera found in window.camera');
        }
        
        console.groupEnd();
    },

    /**
     * Test scene setup
     */
    testSceneSetup() {
        console.group('🌍 Scene Setup Test');
        
        const scene = window.scene;
        if (scene) {
            const lightCount = scene.children.filter(o => o.isLight).length;
            const meshCount = scene.children.filter(o => o.isMesh).length;
            
            console.log('Total objects in scene:', scene.children.length);
            console.log('Lights:', lightCount);
            console.log('Meshes:', meshCount);
            
            const grid = scene.getObjectByName('advancedGrid');
            console.log('Grid found:', !!grid ? '✓' : '✗');
            if (grid) console.log('Grid visible:', grid.visible);
        } else {
            console.warn('No scene found in window.scene');
        }
        
        console.groupEnd();
    },

    /**
     * Test localStorage persistence
     */
    testPersistence() {
        console.group('💾 Persistence Test');
        
        const saved = localStorage.getItem('sm_game_mode');
        console.log('Saved mode in localStorage:', saved || 'None');
        
        // Test saving
        localStorage.setItem('sm_game_mode', 'MODE_3D');
        const newSaved = localStorage.getItem('sm_game_mode');
        console.log('Test save result:', newSaved === 'MODE_3D' ? '✓ Pass' : '✗ Fail');
        
        console.groupEnd();
    },

    /**
     * Run all tests
     */
    runAllTests() {
        console.log('='.repeat(60));
        console.log('🎮 GAME MODE SYSTEM - COMPREHENSIVE TEST');
        console.log('='.repeat(60));
        
        this.checkInitialization();
        console.log('');
        this.testSceneSetup();
        console.log('');
        this.testCameraSetup();
        console.log('');
        this.testModeSwitching();
        console.log('');
        this.testPersistence();
        
        console.log('');
        console.log('='.repeat(60));
        console.log('✓ Tests Complete');
        console.log('='.repeat(60));
    },

    /**
     * Manually switch to each mode and verify changes
     */
    testModeSwitchingSequence() {
        console.log('Starting mode switching test sequence...');
        
        const testSequence = async () => {
            // Test 2D
            console.log('Switching to 2D...');
            window.gameModeManager.setGameMode('MODE_2D');
            await new Promise(r => setTimeout(r, 1000));
            console.log('Current camera type:', window.camera.isOrthographicCamera ? 'Orthographic ✓' : 'Perspective ✗');
            
            // Test 2.5D
            console.log('Switching to 2.5D...');
            window.gameModeManager.setGameMode('MODE_2_5D');
            await new Promise(r => setTimeout(r, 1000));
            console.log('Current camera position:', window.camera.position);
            
            // Test 3D
            console.log('Switching to 3D...');
            window.gameModeManager.setGameMode('MODE_3D');
            await new Promise(r => setTimeout(r, 1000));
            console.log('Current mode:', window.gameModeManager.getCurrentMode());
            
            console.log('✓ Mode switching test complete!');
        };
        
        return testSequence();
    },

    /**
     * Get detailed stats about current mode
     */
    getDetailedStats() {
        console.group('📊 Detailed Stats');
        
        const mgr = window.gameModeManager;
        const mode = mgr.currentGameMode;
        const settings = mgr.getModeSettings(mode);
        const modeInfo = mgr.gameModes[mode];
        
        console.log('=== MODE INFO ===');
        console.log('Mode Key:', mode);
        console.log('Name:', modeInfo.name);
        console.log('Description:', modeInfo.description);
        console.log('Tag:', modeInfo.tag);
        console.log('');
        
        console.log('=== CAMERA SETTINGS ===');
        console.log('Type:', settings.cameraMode);
        console.log('Position:', settings.cameraPosition);
        console.log('Look At:', settings.cameraLookAt);
        console.log('FOV:', settings.fov);
        console.log('');
        
        console.log('=== RENDERING ===');
        console.log('Mode:', settings.renderingMode);
        console.log('Lighting:', settings.lighting);
        console.log('Background:', settings.backgroundType);
        console.log('Physics:', settings.physics);
        console.log('Grid Visible:', settings.gridVisible);
        
        console.groupEnd();
    },

    /**
     * Quick commands reference
     */
    showQuickCommands() {
        console.clear();
        console.log('%c 🎮 GAME MODE QUICK COMMANDS', 'color: #10b981; font-size: 16px; font-weight: bold;');
        console.log('');
        console.log('%cSwitch Modes:', 'font-weight: bold;');
        console.log("  window.gameModeManager.setGameMode('MODE_2D')");
        console.log("  window.gameModeManager.setGameMode('MODE_2_5D')");
        console.log("  window.gameModeManager.setGameMode('MODE_3D')");
        console.log('');
        console.log('%cControl Modal:', 'font-weight: bold;');
        console.log("  window.gameModeManager.open()     // Open selector");
        console.log("  window.gameModeManager.close()    // Close selector");
        console.log("  window.gameModeManager.toggle()   // Toggle selector");
        console.log('');
        console.log('%cCheck Status:', 'font-weight: bold;');
        console.log("  window.gameModeManager.getCurrentMode()");
        console.log("  window.gameModeManager.isMode('MODE_3D')");
        console.log("  window.gameModeManager.getModeSettings('MODE_2D')");
        console.log('');
        console.log('%cTesting:', 'font-weight: bold;');
        console.log("  GameModeTester.runAllTests()                 // Full test suite");
        console.log("  GameModeTester.checkInitialization()         // Check init");
        console.log("  GameModeTester.testModeSwitchingSequence()   // Test switching");
        console.log("  GameModeTester.getDetailedStats()            // Current mode stats");
        console.log("  GameModeTester.showQuickCommands()           // This menu");
        console.log('');
    }
};

// Auto-show commands on load
if (window.location.href.includes('localhost') || window.location.href.includes('127.0.0.1')) {
    console.log('💡 Tip: Use GameModeTester.showQuickCommands() to see available commands');
}

// ============================================================
// AUTOMATED INITIALIZATION
// ============================================================

/**
 * Auto-initialize and report status
 */
function initializeGameModeSystemCheck() {
    const timeout = 10000; // 10 seconds max wait
    const startTime = Date.now();
    
    const check = setInterval(() => {
        const mgr = window.gameModeManager;
        
        if (mgr) {
            clearInterval(check);
            console.log('%c✓ GameModeManager initialized successfully', 'color: #10b981; font-weight: bold;');
            
            // Show available modes
            const modes = Object.keys(mgr.gameModes);
            console.log(`Available modes: ${modes.join(', ')}`);
            
            // Store in window for easy access
            window.GameModeTester = GameModeTester;
            console.log('GameModeTester available as window.GameModeTester');
        } else if (Date.now() - startTime > timeout) {
            clearInterval(check);
            console.warn('%c✗ GameModeManager not initialized within 10 seconds', 'color: #ef4444; font-weight: bold;');
        }
    }, 500);
}

// Run initialization check
initializeGameModeSystemCheck();

// ============================================================
// EXPORT FOR TESTING
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameModeTester;
}

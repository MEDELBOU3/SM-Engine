// SM Engine Panel: SecondaryPanels
window.SecondaryPanels = {
    init() {
        const rm = document.getElementById('renderingMenu');
        if (rm) {
            rm.innerHTML = ` 
               <!-- Populated by SMRenderPipeline._upgradeRenderingMenu() on boot -->
               <button id="startStopRender"><i class="fas fa-play"></i> Start/Stop Render Loop</button>
               <button id="toggleCleanRender"><i class="fas fa-wand-magic-sparkles"></i> Clean Render</button>
               <hr>
               <button id="exportImage"><i class="fas fa-camera"></i> Export Image</button>
               <button id="exportImageHD"><i class="fas fa-camera-retro"></i> Export HD Image</button>
               <hr>
               <button id="toggleWireframe"><i class="fas fa-border-all"></i> Toggle Wireframe</button>
               <button id="turntableRender"><i class="fas fa-sync-alt"></i> 360° Turntable</button>
            `;
        }
        const nc = document.getElementById('navigator-container');
        if (nc) {
            nc.innerHTML = `            <div class="navigator-header">
                <div id="navigator-tabs" class="navigator-tabs"></div>
                <div class="navigator-controls">
                    <button id="navigator-close-btn" title="Close Navigator"
                        onclick="if(window.navigatorSystem){window.navigatorSystem.hide();}else{this.closest('#navigator-container').style.display='none';window.dispatchEvent(new Event('resize'));}">Ã—</button>
                </div>
            </div>
            <div id="navigator-content" class="navigator-content">
                <div class="navigator-placeholder">Select a tab to start editing...</div>
            </div>
`;
        }
        const tl = document.getElementById('terrain-loader');
        if (tl) {
            tl.innerHTML = `        display: none;
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 320px;
        height: 28px;
        background: #333; /* tape background */
        border-radius: 6px;
        overflow: hidden;
        font-family: sans-serif;
        z-index: 99999;
    ">
            <div id="terrain-loader-bar" style="
        width: 0%;
        height: 100%;
        background: linear-gradient(270deg, #5a9fd4, #3a7bbf, #5a9fd4);
        background-size: 200% 100%;
        animation: loaderShimmer 1.5s linear infinite;
        transition: width 0.1s;
    "></div>
            <span id="terrain-loader-text" style="
        position: absolute;
        width: 100%;
        text-align: center;
        color: white;
        line-height: 28px;
        font-size: 14px;
        pointer-events: none;
    ">Loading Terrain...</span>
`;
        }
        console.log('SecondaryPanels initialized');
    }
};

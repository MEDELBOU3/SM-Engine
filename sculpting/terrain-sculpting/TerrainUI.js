// sculpting/terrain-sculpting/TerrainUI.js
// DOM bindings for terrain settings and brush controls.

(() => {
    const NS = window.TerrainSculpting;
    if (!NS?.generator || !NS?.preview) {
        throw new Error(
            'TerrainGenerator.js and TerrainBrushPreview.js must be loaded before TerrainUI.js'
        );
    }

    const state = NS.state;

    function setupUIEventListeners() {
        const nodeEditorPanel =
            document.getElementById('node-editor-panel-terrain');

        const nodeEditorToggleButton =
            document.getElementById('node-editor-toggle');

        if (
            nodeEditorToggleButton &&
            nodeEditorPanel &&
            nodeEditorToggleButton.dataset.terrainNodeToggleBound !== '1'
        ) {
            nodeEditorToggleButton.dataset.terrainNodeToggleBound = '1';

            nodeEditorToggleButton.addEventListener(
                'click',
                () => {
                    const computedDisplay =
                        getComputedStyle(nodeEditorPanel).display;

                    const isVisible =
                        nodeEditorPanel.style.display === 'block' ||
                        (
                            nodeEditorPanel.style.display === '' &&
                            computedDisplay !== 'none'
                        );

                    nodeEditorPanel.style.display =
                        isVisible ? 'none' : 'block';
                }
            );
        }

        NS.generator.bindCreateTerrainButton();
        setupPlayerTestControls();
    }

    function updateTerrainInspectorUI() {
        const currentSettings =
            window.terrain?.userData?.settings || {
                width: 50,
                length: 50,
                resolution: 100,
                textureResolution: 1024
            };

        const widthInput =
            document.getElementById('terrainWidth');

        const lengthInput =
            document.getElementById('terrainLength');

        const resolutionInput =
            document.getElementById('terrainResolution');

        const textureResolutionInput =
            document.getElementById(
                'terrainTextureResolution'
            );

        if (widthInput) {
            widthInput.value = currentSettings.width;
        }

        if (lengthInput) {
            lengthInput.value = currentSettings.length;
        }

        if (resolutionInput) {
            resolutionInput.value =
                currentSettings.resolution;
        }

        if (textureResolutionInput) {
            textureResolutionInput.value =
                currentSettings.textureResolution;
        }
    }

    function setupTerrainControls() {
        const applyButton =
            document.getElementById('applyTerrainChanges');

        if (!applyButton) return;

        updateTerrainInspectorUI();

        if (
            applyButton.dataset.terrainApplyBound === '1'
        ) {
            return;
        }

        applyButton.dataset.terrainApplyBound = '1';

        applyButton.addEventListener('click', () => {
            const current =
                window.terrain?.userData?.settings || {};

            const readNumber = (id, fallback) => {
                const element = document.getElementById(id);
                const value = Number(element?.value);
                return Number.isFinite(value) ? value : fallback;
            };

            const newSettings = {
                ...current,

                width: readNumber(
                    'terrainWidth',
                    current.width || 100
                ),

                length: readNumber(
                    'terrainLength',
                    current.length || 100
                ),

                resolution: Math.floor(
                    readNumber(
                        'terrainResolution',
                        current.resolution || 96
                    )
                ),

                textureResolution: Math.floor(
                    readNumber(
                        'terrainTextureResolution',
                        current.textureResolution || 1024
                    )
                ),

                initialMode: 'flat',
                isNewTerrain: true
            };

            NS.generator.createTerrain(newSettings);
        });
    }

    function setupBrushControls() {
        const sculptSizeSlider =
            document.getElementById('brushSize');

        const sculptStrengthSlider =
            document.getElementById('brushStrength');

        const sculptFalloffSlider =
            document.getElementById('brushFalloff');

        if (
            sculptSizeSlider &&
            sculptSizeSlider.dataset.terrainBrushBound !== '1'
        ) {
            sculptSizeSlider.dataset.terrainBrushBound = '1';

            state.brushSize =
                Number(sculptSizeSlider.value) ||
                state.brushSize;

            sculptSizeSlider.addEventListener(
                'input',
                (event) => {
                    const value = Number(event.target.value);
                    if (!Number.isFinite(value)) return;

                    state.brushSize = Math.max(0.001, value);

                    if (state.brushPreview) {
                        state.brushPreview.scale.setScalar(
                            state.brushSize
                        );
                    }

                    if (state.brushPreviewMesh) {
                        state.brushPreviewMesh.scale.setScalar(
                            state.brushSize
                        );
                    }
                }
            );
        }

        if (
            sculptStrengthSlider &&
            sculptStrengthSlider.dataset.terrainBrushBound !== '1'
        ) {
            sculptStrengthSlider.dataset.terrainBrushBound = '1';

            state.brushStrength =
                Number(sculptStrengthSlider.value) ||
                state.brushStrength;

            sculptStrengthSlider.addEventListener(
                'input',
                (event) => {
                    const value = Number(event.target.value);
                    if (!Number.isFinite(value)) return;

                    state.brushStrength = Math.max(
                        0,
                        value
                    );
                }
            );
        }

        if (
            sculptFalloffSlider &&
            sculptFalloffSlider.dataset.terrainBrushBound !== '1'
        ) {
            sculptFalloffSlider.dataset.terrainBrushBound = '1';

            state.brushFalloff =
                Number(sculptFalloffSlider.value) ||
                state.brushFalloff;

            sculptFalloffSlider.addEventListener(
                'input',
                (event) => {
                    const value = Number(event.target.value);
                    if (!Number.isFinite(value)) return;

                    state.brushFalloff = Math.max(
                        0,
                        Math.min(1, value)
                    );
                }
            );
        }

        console.log(
            '✅ Terrain sculpting brush inputs connected.'
        );
    }

    function bindToolButtons() {
        document
            .querySelectorAll('[data-terrain-tool]')
            .forEach((button) => {
                if (
                    button.dataset.terrainToolBound === '1'
                ) {
                    return;
                }

                button.dataset.terrainToolBound = '1';

                button.addEventListener('click', () => {
                    const tool =
                        button.dataset.terrainTool;

                    NS.interaction?.setActiveTool?.(tool);
                });
            });
    }

    function setupPlayerTestControls() {
        if (!NS.playerPlay) return false;

        let panel =
            document.getElementById(
                'terrain-player-test-controls'
            );

        if (!panel) {
            const createTerrainButton =
                document.getElementById(
                    'createTerrain'
                );

            const host =
                document.getElementById(
                    'terrain-player-test-container'
                ) ||
                createTerrainButton
                    ?.closest?.(
                        '.panel-section, .inspector-section, .terrain-section, .panel-content, .settings-content'
                    ) ||
                document.getElementById(
                    'sculpting-panel'
                );

            if (!host) return false;

            if (
                !document.getElementById(
                    'terrain-player-test-style'
                )
            ) {
                const style =
                    document.createElement(
                        'style'
                    );

                style.id =
                    'terrain-player-test-style';

                style.textContent = `
                    #terrain-player-test-controls {
                        margin: 8px 0;
                        padding: 8px;
                        background: var(--panel-bg, #333333);
                        border-top: 1px solid var(--border-color, #4d4d4d81);
                        border-bottom: 1px solid var(--border-color, #4d4d4d81);
                        color: var(--text-primary, #ffffff);
                        font: 11px var(--ui-font, "Segoe UI", Arial, sans-serif);
                    }

                    #terrain-player-test-controls .tpt-head {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        margin-bottom: 7px;
                    }

                    #terrain-player-test-controls .tpt-head strong {
                        font-size: 10px;
                        text-transform: uppercase;
                        letter-spacing: .05em;
                        color: var(--text-secondary, #b0b0b0);
                    }

                    #terrain-player-test-controls .tpt-actions {
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 4px;
                    }

                    #terrain-player-test-controls button {
                        min-height: 27px;
                        border: 0;
                        border-radius: 2px;
                        background: var(--secondary-dark, #3c3c3c);
                        color: var(--text-primary, #ffffff);
                        cursor: pointer;
                        font: inherit;
                    }

                    #terrain-player-test-controls button:hover {
                        background: var(--hover-bg, #474747);
                    }

                    #terrain-player-test-controls button svg {
                        width: 12px;
                        height: 12px;
                        margin-right: 5px;
                        vertical-align: -2px;
                    }

                    #terrain-player-test-controls .tpt-grid {
                        display: grid;
                        grid-template-columns: 1fr 70px;
                        gap: 5px 8px;
                        align-items: center;
                        margin-top: 7px;
                    }

                    #terrain-player-test-controls input {
                        width: 100%;
                        box-sizing: border-box;
                        min-height: 24px;
                        border: 1px solid var(--input-border, #555555);
                        border-radius: 2px;
                        background: var(--input-bg, #333333);
                        color: var(--text-primary, #ffffff);
                        padding: 0 5px;
                    }

                    #terrain-player-test-controls .tpt-status {
                        color: var(--text-muted, #8e8e96);
                        font-size: 9px;
                    }

                    #terrain-player-test-controls .tpt-hint {
                        margin: 6px 0 0;
                        color: var(--text-muted, #8e8e96);
                        font-size: 9px;
                        line-height: 1.35;
                    }
                `;

                document.head.appendChild(
                    style
                );
            }

            panel =
                document.createElement(
                    'div'
                );

            panel.id =
                'terrain-player-test-controls';

            panel.innerHTML = `
                <div class="tpt-head">
                    <strong>Player Test</strong>
                    <span class="tpt-status" data-terrain-player-status>Ready</span>
                </div>

                <div class="tpt-actions">
                    <button type="button" data-terrain-add-player>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="3"/><path d="M7 21v-4a5 5 0 0 1 10 0v4"/><path d="M19 5v6M16 8h6"/></svg>
                        Add Player
                    </button>
                </div>

                <p class="tpt-hint">Add Player places an idle player. Use Sim-Play in the top toolbar to start or stop testing.</p>

                <div class="tpt-grid">
                    <label>Slope Limit</label>
                    <input type="number" min="1" max="89" step="1" value="48" data-terrain-slope-limit>

                    <label>Step Height</label>
                    <input type="number" min="0" max="2" step="0.05" value="0.45" data-terrain-step-height>
                </div>
            `;

            host.appendChild(panel);
        }

        if (
            panel.dataset
                .terrainPlayerBound ===
            '1'
        ) {
            return true;
        }

        panel.dataset.terrainPlayerBound =
            '1';

        const status =
            panel.querySelector(
                '[data-terrain-player-status]'
            );

        const setStatus =
            text => {
                if (status) {
                    status.textContent =
                        text;
                }
            };

        if (NS.playerPlay.state?.playerAdded) {
            setStatus(
                NS.playerPlay.state.playing
                    ? 'Testing'
                    : 'Player placed · Sim-Play'
            );
        }

        panel
            .querySelector(
                '[data-terrain-add-player]'
            )
            ?.addEventListener(
                'click',
                async () => {
                    try {
                        setStatus('Adding…');

                        await NS.playerPlay
                            .addPlayer();

                        setStatus('Player placed · Sim-Play');
                    } catch (error) {
                        console.error(error);
                        setStatus('Failed');
                    }
                }
            );

        panel
            .querySelector(
                '[data-terrain-slope-limit]'
            )
            ?.addEventListener(
                'change',
                event => {
                    NS.playerPlay
                        .setSlopeLimit(
                            event.target.value
                        );
                }
            );

        panel
            .querySelector(
                '[data-terrain-step-height]'
            )
            ?.addEventListener(
                'change',
                event => {
                    NS.playerPlay
                        .setStepHeight(
                            event.target.value
                        );
                }
            );

        return true;
    }

    function setSymmetry(enabled, axis = state.symmetryAxis) {
        state.symmetryEnabled = !!enabled;

        if (axis === 'x' || axis === 'z') {
            state.symmetryAxis = axis;
        }
    }

    NS.ui = {
        setupUIEventListeners,
        updateTerrainInspectorUI,
        setupTerrainControls,
        setupBrushControls,
        bindToolButtons,
        setupPlayerTestControls,
        setSymmetry
    };

    // Compatibility name used by the terrain generator/older code.
    window.updateTerrainInspectorUI =
        updateTerrainInspectorUI;
})();

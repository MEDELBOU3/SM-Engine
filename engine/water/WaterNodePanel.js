(function () {
    class SMWaterNodePanel {
        static attach(system) {
            if (!system || typeof document === 'undefined') return;
            const root = document.getElementById('water-system-panel');
            const bodyRoot = root?.querySelector('.smw-body');
            if (!bodyRoot || bodyRoot.querySelector('.smw-node-section')) return;
            const graph = system.createNodeGraph?.();
            if (!graph) return;

            const section = document.createElement('section');
            section.className = 'smw-section smw-node-section';
            section.innerHTML = `
                <div class="smw-section-title"><i class="fas fa-project-diagram"></i> Water Nodes</div>
                <div class="smw-hint">UE-style authoring chain: level → flow → surface → terrain carve → riverbank foam → underwater.</div>
                <label class="smw-field"><span class="smw-control-label">Level Offset</span><input type="number" step="0.01" data-swm-node="levelOffset"></label>
                <label class="smw-field"><span class="smw-control-label">Flow Speed</span><input type="number" min="0" step="0.05" data-swm-node="flowSpeed"></label>
                <label class="smw-field"><span class="smw-control-label">Wave Height</span><input type="number" min="0" step="0.01" data-swm-node="waveHeight"></label>
                <label class="smw-field"><span class="smw-control-label">Wave Length</span><input type="number" min="0.2" step="0.1" data-swm-node="waveLength"></label>
                <label class="smw-field"><span class="smw-control-label">Wave Scale</span><input type="number" min="0.08" step="0.01" data-swm-node="waveScale"></label>
                <label class="smw-field"><span class="smw-control-label">Steepness</span><input type="number" min="0" max="1.5" step="0.01" data-swm-node="waveSteepness"></label>
                <label class="smw-field"><span class="smw-control-label">Wave Spread</span><input type="number" min="0" max="2" step="0.01" data-swm-node="waveSpread"></label>
                <label class="smw-field"><span class="smw-control-label">Wind Speed</span><input type="number" min="0" step="0.05" data-swm-node="windSpeed"></label>
                <label class="smw-field"><span class="smw-control-label">Normal Detail</span><input type="number" min="0" max="1.5" step="0.01" data-swm-node="normalStrength"></label>
                <label class="smw-field"><span class="smw-control-label">Foam Strength</span><input type="number" min="0" max="1" step="0.01" data-swm-node="foamStrength"></label>
                <label class="smw-field"><span class="smw-control-label">Bed Depth</span><input type="number" min="0.02" step="0.1" data-swm-node="bedDepth"></label>
                <label class="smw-field"><span class="smw-control-label">Shore Width</span><input type="number" min="0.05" step="0.1" data-swm-node="shoreWidth"></label>
                <label class="smw-field"><span class="smw-control-label">Shore Depth</span><input type="number" min="0.01" step="0.01" data-swm-node="shoreDepth"></label>
                <label class="smw-field"><span class="smw-control-label">Bank Foam Width</span><input type="number" min="0.08" max="3" step="0.01" data-swm-node="riverbankFoamWidth"></label>
                <label class="smw-field"><span class="smw-control-label">Bank Foam Thickness</span><input type="number" min="0" max="0.3" step="0.005" data-swm-node="riverbankFoamThickness"></label>
                <label class="smw-field"><span class="smw-control-label">Bank Foam Intensity</span><input type="number" min="0" max="1.5" step="0.01" data-swm-node="riverbankFoamIntensity"></label>
                <label class="smw-field"><span class="smw-control-label">Bank Foam Flow</span><input type="number" min="0" max="3" step="0.01" data-swm-node="riverbankFoamFlow"></label>
                <label class="smw-field"><span class="smw-control-label">Underwater Fog</span><input type="number" min="0.001" max="0.2" step="0.001" data-swm-node="underwaterFogDensity"></label>
                <label class="smw-check"><input type="checkbox" data-swm-node="terrainCarve" checked><span>Carve terrain bed</span></label>
                <button type="button" class="smw-node-apply primary"><i class="fas fa-bolt"></i>Apply Water Nodes</button>`;
            bodyRoot.appendChild(section);

            const input = key => section.querySelector(`[data-swm-node="${key}"]`);
            const read = () => {
                graph.setNode('level', { levelOffset: Number(input('levelOffset').value || 0) });
                graph.setNode('flow', { flowSpeed: Number(input('flowSpeed').value || 0) });
                graph.setNode('surface', {
                    waveHeight: Number(input('waveHeight').value || 0),
                    waveLength: Number(input('waveLength').value || 9),
                    waveScale: Number(input('waveScale').value || 1),
                    waveSteepness: Number(input('waveSteepness').value || 0.42),
                    waveSpread: Number(input('waveSpread').value || 0.72),
                    windSpeed: Number(input('windSpeed').value || 1),
                    normalStrength: Number(input('normalStrength').value || 0.28),
                    foamStrength: Number(input('foamStrength').value || 0)
                });
                graph.setNode('carve', {
                    bedDepth: Number(input('bedDepth').value || 0),
                    shoreWidth: Number(input('shoreWidth').value || 0),
                    shoreDepth: Number(input('shoreDepth').value || 0.08),
                    terrainCarve: input('terrainCarve').checked
                });
                graph.setNode('shoreFoam', {
                    enabled: true,
                    riverbankFoamEnabled: true,
                    riverbankFoamWidth: Number(input('riverbankFoamWidth').value || 0.62),
                    riverbankFoamThickness: Number(input('riverbankFoamThickness').value || 0.045),
                    riverbankFoamIntensity: Number(input('riverbankFoamIntensity').value || 0.58),
                    riverbankFoamFlow: Number(input('riverbankFoamFlow').value || 1)
                });
                graph.setNode('underwater', { underwaterFogDensity: Number(input('underwaterFogDensity').value || 0.045) });
            };

            section.querySelector('.smw-node-apply')?.addEventListener('click', () => {
                read();
                let waterBody = system.activeBody;
                if (!waterBody && system.editor?.mode !== 'idle') waterBody = system.finishDraw();
                if (!waterBody && system.editor?.points?.length) waterBody = system.createFromEditor();
                if (!waterBody) {
                    system.emit('status', { text: 'Draw a river, lake or pool boundary and finish it before applying water nodes.' });
                    return;
                }
                if (!system.applyNodeGraph(waterBody)) return;
                system.emit('status', { text: 'Water nodes applied to the active body.' });
            });

            system.on('selectionchange', ({ body }) => {
                const c = body?.config || system.settings;
                input('levelOffset').value = Number(c.levelOffset || 0);
                input('flowSpeed').value = Number(c.flowSpeed || 0);
                input('waveHeight').value = Number(c.waveHeight ?? 0.22);
                input('waveLength').value = Number(c.waveLength ?? 9);
                input('waveScale').value = Number(c.waveScale ?? 1);
                input('waveSteepness').value = Number(c.waveSteepness ?? 0.42);
                input('waveSpread').value = Number(c.waveSpread ?? 0.72);
                input('windSpeed').value = Number(c.windSpeed ?? 1);
                input('normalStrength').value = Number(c.normalStrength ?? 0.28);
                input('foamStrength').value = Number(c.foamStrength ?? 0.30);
                input('bedDepth').value = Number(c.bedDepth ?? c.volumeDepth ?? 3);
                input('shoreWidth').value = Number(c.shoreWidth ?? 1.5);
                input('shoreDepth').value = Number(c.shoreDepth ?? 0.08);
                input('riverbankFoamWidth').value = Number(c.riverbankFoamWidth ?? 0.62);
                input('riverbankFoamThickness').value = Number(c.riverbankFoamThickness ?? 0.045);
                input('riverbankFoamIntensity').value = Number(c.riverbankFoamIntensity ?? 0.58);
                input('riverbankFoamFlow').value = Number(c.riverbankFoamFlow ?? 1);
                input('underwaterFogDensity').value = Number(c.underwaterFogDensity ?? 0.045);
                input('terrainCarve').checked = c.terrainCarve !== false;
            });
            system.emit('selectionchange', { body: system.activeBody });
        }
    }

    window.SMWaterNodePanel = SMWaterNodePanel;
})();

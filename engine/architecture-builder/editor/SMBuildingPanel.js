// engine/architecture/editor/SMBuildingPanel.js
// Lightweight optional editor panel. It does not assume a specific dock framework.
(function (global) {
    'use strict';

    class SMBuildingPanel {
        constructor(options = {}) {
            this.host = options.host || null;
            this.generator = options.generator || global.smBuildingGenerator || null;
            this.root = null;
        }

        mount(host = this.host) {
            if (!host) return false;
            this.host = host;
            host.innerHTML = '';

            const root = document.createElement('div');
            root.className = 'sm-building-panel';
            root.innerHTML = `
                <div style="display:flex;gap:8px;align-items:center;padding:8px;">
                    <input data-sm-building-file type="file"
                        accept=".smbuilding.json,.smap,.json,.svg,.dxf" />
                    <button data-sm-building-generate type="button">Generate Building</button>
                </div>
                <div data-sm-building-status style="padding:8px;font:12px/1.4 monospace;white-space:pre-wrap;"></div>
            `;

            host.appendChild(root);
            this.root = root;

            const input = root.querySelector('[data-sm-building-file]');
            const button = root.querySelector('[data-sm-building-generate]');
            const status = root.querySelector('[data-sm-building-status]');

            button.addEventListener('click', async () => {
                const file = input.files?.[0];
                if (!file) {
                    status.textContent = 'Choose a building-map file first.';
                    return;
                }

                try {
                    status.textContent = 'Parsing...';
                    const map = await global.SMBuildingMapParser.parseFile(file);
                    this.generator =
                        this.generator ||
                        global.smBuildingGenerator ||
                        new global.SMBuildingGenerator();
                    global.smBuildingGenerator = this.generator;

                    const building = this.generator.generate(map);
                    if (typeof global.addObjectToScene === 'function') {
                        global.addObjectToScene(building, building.name);
                    } else {
                        global.scene?.add?.(building);
                        global.updateHierarchy?.();
                    }

                    status.textContent =
                        `Generated: ${building.name}\n` +
                        JSON.stringify(building.userData.smBuildingStats || {}, null, 2);
                } catch (error) {
                    console.error('[SMBuildingPanel]', error);
                    status.textContent = `Error: ${error.message}`;
                }
            });

            return true;
        }

        unmount() {
            this.root?.remove?.();
            this.root = null;
        }
    }

    global.SMBuildingPanel = SMBuildingPanel;
})(typeof window !== 'undefined' ? window : globalThis);

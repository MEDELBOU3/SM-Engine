(function () {
    'use strict';
    class SMWebExporter extends window.SMExportTarget {
        constructor(options = {}) {
            super({ id: 'web', name: 'Web', description: 'Standalone browser game export.', extension: '.zip', capabilities: { standalone: true, zip: true, offline: false }, ...options });
            this.externalScripts = options.externalScripts || window.SMStandaloneRuntime?.getDefaultExternalScripts?.() || [];
            this.supportScripts = options.supportScripts || SMWebExporter.defaultSupportScripts();
        }
        static defaultSupportScripts() {
            return [
                'physics/PhysicsSystem.js',
                'physics/zones.js',
                'physics/main.js',
                'physics/physics-compat.js',
                'engine/audio/SMAudioAssetManager.js',
                'engine/audio/SMAudioBus.js',
                'engine/audio/SMAudioListenerManager.js',
                'engine/audio/SMAudioSource.js',
                'engine/audio/SMAudioZone.js',
                'engine/audio/SMAudioSceneActor.js',
                'engine/audio/SMAudioSystem.js',
                'engine/audio/SMAudioSceneRuntime.js',
                'game-ui/core/GameUIDocument.js',
                'game-ui/widgets/UIWidget.js',
                'game-ui/widgets/UIPanel.js',
                'game-ui/widgets/UIText.js',
                'game-ui/widgets/UIImage.js',
                'game-ui/widgets/UIButton.js',
                'game-ui/widgets/UIProgressBar.js',
                'game-ui/widgets/UIWidgetLibrary.js',
                'game-ui/layout/UIAnchorSystem.js',
                'game-ui/layout/UIConstraintSystem.js',
                'game-ui/layout/UISafeAreaSystem.js',
                'game-ui/layout/UILayoutEngine.js',
                'game-ui/binding/UIDataBindingSystem.js',
                'game-ui/binding/UIEventBindingSystem.js',
                'game-ui/binding/UIBindingContext.js',
                'game-ui/animation/UIKeyframeEvaluator.js',
                'game-ui/animation/UIAnimationSystem.js',
                'game-ui/animation/UITransitionLibrary.js',
                'game-ui/input/UIFocusManager.js',
                'game-ui/input/UIEventSystem.js',
                'game-ui/input/UINavigationSystem.js',
                'game-ui/runtime/GameUIScreenRenderer.js',
                'game-ui/runtime/GameUIVisibilitySystem.js',
                'game-ui/runtime/GameUIRuntime.js',
                'game-ui/core/GameUISerializer.js',
                'game-ui/core/GameUIManager.js',
                'game-ui/prefabs/UIPrefabManager.js',
                'game-ui/prefabs/UIPrefabInstance.js',
                'game-ui/prefabs/UIPresetLibrary.js',
                'game-ui/runtime/GameUIAssetLoader.js',
                'game-ui/runtime/GameUIEngineBridge.js'
            ];
        }
        async export(buildResult, options = {}) {
            const validation = await this.validate(buildResult, options);
            if (!validation.ok) throw new Error(`Web export validation failed: ${validation.errors.join(' ')}`);
            const bundle = await this._cloneBundle(buildResult.bundle, { name: buildResult.config?.name || 'SMGame-Web' });
            const requiredRuntime = options.runtimeScripts || window.SMStandaloneRuntime?.getDefaultScriptPaths?.() || [];
            const playerRuntime = options.playerRuntimeScripts || window.SMStandaloneRuntime?.getPlayerRuntimeScriptPaths?.() || [];
            const support = options.supportScripts || this.supportScripts;
            const custom = Array.isArray(options.customScripts) ? options.customScripts : [];
            const copied = [];
            const warnings = [...validation.warnings];
            await this._copyScripts(bundle, support, { required: false, copied, warnings, resolveSource: options.resolveSource });
            await this._copyScripts(bundle, requiredRuntime, { required: options.allowMissingRuntimeScripts !== true, copied, warnings, resolveSource: options.resolveSource });
            await this._copyScripts(bundle, playerRuntime, { required: true, copied, warnings, resolveSource: options.resolveSource });
            await this._copyScripts(bundle, custom, { required: options.requireCustomScripts === true, copied, warnings, resolveSource: options.resolveSource });
            const localScripts = this._unique([...support.filter(path => copied.includes(path)), ...requiredRuntime.filter(path => copied.includes(path)), ...playerRuntime.filter(path => copied.includes(path)), ...custom.filter(path => copied.includes(path))]);
            const external = this._unique(options.externalScripts || this.externalScripts);
            const config = { manifestURL: 'game.manifest.json', preloadAssets: options.preloadAssets === true, openStartLevel: options.openStartLevel !== false, background: options.background ?? 0x111111, pixelRatio: options.pixelRatio || 'auto', ...options.bootConfig };
            const manifestJSON = buildResult.manifest?.toJSON?.() || {};
            manifestJSON.runtime = localScripts.map(path => ({ path, metadata: { standalone: true } }));
            manifestJSON.metadata = { ...(manifestJSON.metadata || {}), exportTarget: 'web', exportedAt: Date.now() };
            manifestJSON.warnings = Array.from(new Set([...(manifestJSON.warnings || []), ...warnings]));
            bundle.addJSON('game.manifest.json', manifestJSON, { pretty: true });
            bundle.addJSON('runtime/web-export.json', { target: 'web', externalScripts: external, localScripts, bootConfig: config, warnings });
            bundle.addText('index.html', this._createIndexHTML(buildResult, external, localScripts, config, options), { type: 'html', mimeType: 'text/html' });
            bundle.addText('README.txt', this._readme(buildResult, warnings), { type: 'text' });
            const packageResult = await this._package(bundle, buildResult, options);
            const result = { ok: true, target: 'web', bundle, package: packageResult, buildResult, localScripts, externalScripts: external, warnings, validation };
            window.dispatchEvent(new CustomEvent('sm:export-web-complete', { detail: result }));
            return result;
        }
        async _copyScripts(bundle, paths, options = {}) {
            for (const path of this._unique(paths || [])) {
                if (bundle.has(path)) { options.copied?.push(path); continue; }
                try {
                    const source = await this._readSource(path, options.resolveSource);
                    if (source === null || source === undefined) throw new Error('Source was not resolved.');
                    bundle.addText(path, source, { type: 'runtime-script', mimeType: 'text/javascript', source: path });
                    options.copied?.push(path);
                } catch (error) {
                    const message = `Could not copy runtime script "${path}": ${error?.message || error}`;
                    if (options.required) throw new Error(message);
                    options.warnings?.push(message);
                    console.warn('[SMWebExporter]', message);
                }
            }
        }
        async _readSource(path, resolver) {
            if (typeof resolver === 'function') {
                const value = await resolver(path);
                if (value !== undefined && value !== null) return await this._toText(value);
            }
            const response = await fetch(path, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.text();
        }
        async _cloneBundle(source, options = {}) {
            const bundle = new window.SMAssetBundle({ name: options.name || source?.name || 'SMGame' });
            for (const file of source?.list?.() || []) bundle.add(file.path, file.data, { type: file.type, mimeType: file.mimeType, source: file.source, hash: file.hash, metadata: file.metadata });
            return bundle;
        }
        _createIndexHTML(buildResult, externalScripts, localScripts, bootConfig, options = {}) {
            const title = this._escape(buildResult.config?.name || 'SM Game');
            const scripts = [...externalScripts, ...localScripts].map(src => `<script src="${this._escapeAttribute(src)}"></script>`).join('\n    ');
            const config = JSON.stringify(bootConfig).replace(/</g, '\\u003c');
            return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
    <meta name="theme-color" content="#111111">
    <title>${title}</title>
    <style>html,body,#sm-game-root{width:100%;height:100%;margin:0;overflow:hidden;background:#111}body{font-family:Inter,Segoe UI,Arial,sans-serif}canvas{display:block}</style>
</head>
<body>
    <div id="sm-game-root"></div>
    ${scripts}
    <script>
        window.SM_GAME_BOOT_CONFIG=${config};
        window.addEventListener('DOMContentLoaded',function(){
            if(!window.SMGameBootstrap){document.body.textContent='SMGameBootstrap failed to load.';return;}
            window.SMGameBootstrap.autoStart(window.SM_GAME_BOOT_CONFIG).catch(function(error){console.error(error);document.body.innerHTML='<pre style="color:#fff;background:#111;padding:20px;white-space:pre-wrap">'+String(error&&error.stack||error)+'</pre>';});
        });
    </script>
</body>
</html>`;
        }
        async _package(bundle, buildResult, options = {}) {
            if (options.zip === false) return { type: 'virtual', bundle, files: bundle.list(), name: this.getDefaultFilename(buildResult).replace(/\.zip$/, '') };
            if (!window.JSZip) return { type: 'virtual', bundle, files: bundle.list(), name: this.getDefaultFilename(buildResult).replace(/\.zip$/, '') };
            const blob = await bundle.toZip({ compression: buildResult.config?.assets?.compress === false ? 'STORE' : 'DEFLATE', level: 6 });
            return { type: 'zip', blob, name: options.filename || this.getDefaultFilename(buildResult), size: blob.size };
        }
        _readme(buildResult, warnings) {
            return `${buildResult.config?.name || 'SM Game'}
SM Engine Web Export
Build: ${buildResult.buildId || 'unknown'}
Start Level: ${buildResult.manifest?.startLevel || buildResult.config?.startLevel || 'none'}
Run this folder through an HTTP server. Opening index.html directly through file:// may block asset requests.
Warnings: ${warnings.length}
${warnings.map(item => '- ' + item).join('\n')}`;
        }
        _unique(values) {
            return Array.from(new Set((values || []).filter(Boolean).map(String)));
        }
        async _toText(value) {
            if (typeof value === 'string') return value;
            if (value instanceof Blob) return await value.text();
            if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return new TextDecoder().decode(value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
            return JSON.stringify(value);
        }
        _escape(value) {
            return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
        _escapeAttribute(value) {
            return this._escape(value).replace(/'/g, '&#39;');
        }
    }
    window.SMWebExporter = SMWebExporter;
    window.SMWebExporterClass = SMWebExporter;
})();
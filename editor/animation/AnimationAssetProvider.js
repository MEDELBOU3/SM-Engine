// SM Engine - AnimationAssetProvider
(function () {
    const Provider = {
        registry: null,
        initialized: false,
        install() {
            this.registry = window.playerAnimationClipRegistry || new window.PlayerAnimationClipRegistry();
            this.initialized = true;
            this.refresh();
            window.addEventListener('sm:player-animation-clips-changed', () => this.refresh());
            window.addEventListener('sm:node-editor-tab-changed', event => {
                if (event.detail?.target === 'animation-graph-wrapper') setTimeout(() => this.refresh(), 0);
            });
            console.log('[AnimationAssetProvider] installed');
        },
        async refresh() {
            if (!this.registry) return;
            await this.registry.ensureLoaded?.();
            const host = document.getElementById('anim-assets-list');
            if (!host) return;
            const items = this.registry.list();
            if (!items.length) {
                host.innerHTML = '<div class="anim-empty-details"><span>No player animation clips loaded</span></div>';
                return;
            }
            host.innerHTML = '';
            items.forEach(item => {
                const row = document.createElement('div');
                row.className = 'anim-asset';
                row.draggable = true;
                row.dataset.animation = item.key;
                row.dataset.animationGraphName = this.registry.getGraphNameForKey(item.key);
                row.title = `${item.key} • ${item.duration.toFixed(2)}s • ${item.tracks} tracks`;
                row.innerHTML = `<i class="fas fa-film"></i><span>${this._escape(this.registry.getGraphNameForKey(item.key))}</span><small>${item.duration.toFixed(2)}s</small>`;
                row.addEventListener('dragstart', event => {
                    event.dataTransfer.setData('text/sm-animation-clip', item.key);
                    event.dataTransfer.setData('text/plain', item.key);
                    event.dataTransfer.effectAllowed = 'copy';
                });
                row.addEventListener('dblclick', () => {
                    const editor = window.AnimationGraphEditor;
                    if (!editor?.canvas) return;
                    const rect = editor.canvas.getBoundingClientRect();
                    const point = editor.screenToGraph(rect.width * 0.5, rect.height * 0.5);
                    const node = editor.addNode({ type: 'clip', title: this.registry.getGraphNameForKey(item.key), x: point.x - 90, y: point.y - 40, data: { clip: item.key, loop: true, playRate: 1 } });
                    editor.selectNode?.(node);
                });
                host.appendChild(row);
            });
            this._patchSearch();
        },
        _patchSearch() {
            const search = document.getElementById('anim-asset-search');
            if (!search || search.dataset.registrySearchBound === '1') return;
            search.dataset.registrySearchBound = '1';
            search.addEventListener('input', () => {
                const q = search.value.trim().toLowerCase();
                document.querySelectorAll('#anim-assets-list .anim-asset').forEach(row => {
                    const text = `${row.dataset.animation || ''} ${row.dataset.animationGraphName || ''}`.toLowerCase();
                    row.style.display = !q || text.includes(q) ? '' : 'none';
                });
            });
        },
        _escape(value) {
            return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
        }
    };
    window.AnimationAssetProvider = Provider;
    const boot = () => Provider.install();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0), { once: true });
    else setTimeout(boot, 0);
})();
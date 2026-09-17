function openMaterialNodeEditor() {
    const globalContainer = document.getElementById('global-node-editor-container');
    if (!globalContainer) return;

    globalContainer.style.display = 'flex';

    document.querySelectorAll('.node-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.node-sub-editor').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });

    const matTab = document.getElementById('tab-mat-nodes');
    const matWrapper = document.getElementById('material-graph-wrapper');

    matTab.classList.add('active');
    matWrapper.style.display = 'flex';
    matWrapper.classList.add('active');

    initMaterialCanvas();
}

const expandBtn = document.getElementById('expandNodeEditorBtn');
const nodModal = document.getElementById('nodeEditorModal');
const modalBody = document.getElementById('nodeEditorModalBody');
const closeBtn = document.getElementById('closeNodeEditorBtn');
const resizeBtn = document.getElementById('resizeNodeEditorBtn');
const nodeGraph = document.getElementById('node-graph-container');
const workspace = document.getElementById('nodeEditorWorkspace');

let isExpanded = false;
let isFullScreen = false;

// Open Modal
expandBtn.addEventListener('click', () => {
    if (!isExpanded) {
        workspace.appendChild(nodeGraph);
        nodModal.classList.add('visible');
        isExpanded = true;
    }
});

// Close Modal
closeBtn.addEventListener('click', () => {
    if (isExpanded) {
        document.getElementById('node-editor-panel-terrain').appendChild(nodeGraph);
        nodModal.classList.remove('visible');
        isExpanded = false;
    }
});

// Resize Modal
resizeBtn.addEventListener('click', () => {
    isFullScreen = !isFullScreen;
    nodModal.classList.toggle('fullscreen', isFullScreen);
});

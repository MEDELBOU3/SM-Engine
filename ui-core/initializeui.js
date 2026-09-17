function initializeUI() {
    // Ensure timeline and inspector are visible
    const timeline = document.querySelector('.timeline');
    const inspector = document.querySelector('.inspector-panel');
    if (timeline) timeline.style.display = 'flex';
    if (inspector) inspector.style.display = 'flex';
}

// Utility function to add an action to history and update UI (Delegates to window.historyManager)
function recordHistoryAction(type, objectName, undoAction = null, redoAction = null) {
    if (window.historyManager) {
        window.historyManager.recordCustomAction(type, objectName, undoAction, redoAction);
    }
}

function undo() {
    if (window.historyManager) {
        window.historyManager.undo();
    }
}

function redo() {
    if (window.historyManager) {
        window.historyManager.redo();
    }
}

function clearHistory() {
    if (window.historyManager) {
        window.historyManager.undoStack = [];
        window.historyManager.redoStack = [];
        window.historyManager.updateUI();
    }
}

function updateHistoryPanel() {
    if (window.historyManager) {
        window.historyManager.updateUI();
    }
}

// Initialize everything
function initializeAll() {
    initializeUI();
    if (typeof setupClipboardOperations === 'function') setupClipboardOperations();
    if (typeof optimizeScene === 'function') {
        const objectPool = optimizeScene();
        window.objectPool = objectPool;
    }
}

// Call initialization when the page loads
window.addEventListener('load', initializeAll);

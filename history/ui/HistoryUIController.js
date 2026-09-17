(function () {
    'use strict';
    const H = window.SMHistory = window.SMHistory || {};

    class HistoryUIController {
        constructor(historyManager) {
            this.historyManager = historyManager;
            this.searchBar = null;
            this.shortcuts = null;

            this.init();
        }

        init() {
            this.setupHeaderToggle();
            this.setupSidebarToggle();
            this.setupActionButtons();

            this.searchBar = new H.HistorySearchBar(this.historyManager, () => this.updateUI());
            this.shortcuts = new H.KeyboardShortcuts(this.historyManager);

            // Re-render UI on every history or state change
            window.addEventListener('historyChanged', () => this.updateUI());

            // Initial render
            this.updateUI();
        }

        setupHeaderToggle() {
            const historySystemHeader = document.querySelector('.history-system .panel-header');
            if (historySystemHeader && !historySystemHeader.dataset.bound) {
                historySystemHeader.dataset.bound = "1";
                historySystemHeader.style.cursor = 'pointer';
                historySystemHeader.addEventListener('click', () => {
                    const hPanel = document.getElementById('history-panel');
                    if (hPanel) {
                        const hidden = hPanel.style.display === 'none';
                        hPanel.style.display = hidden ? 'flex' : 'none';
                        const icon = historySystemHeader.querySelector('.expand-button i');
                        if (icon) {
                            icon.className = hidden ? 'fas fa-caret-down' : 'fas fa-caret-right';
                        }
                    }
                });
            }
        }

        setupSidebarToggle() {
            const historyBtn = document.getElementById("historyBtn");
            const historyPanel = document.getElementById("historyPanel");

            if (historyBtn && !historyBtn.dataset.historySidebarBound) {
                historyBtn.dataset.historySidebarBound = "1";
                historyBtn.addEventListener('click', () => {
                    if (window.SecondarySidebar) {
                        window.SecondarySidebar.open('history');
                    } else if (historyPanel) {
                        const isVisible = historyPanel.style.display !== 'none';
                        historyPanel.style.display = isVisible ? 'none' : 'flex';
                        document.body.classList.toggle('side-panel-open', !isVisible);
                        document.body.classList.toggle('history-active', !isVisible);
                        if (!isVisible) this.updateUI();
                    }
                });
            }
        }

        setupActionButtons() {
            const undoBtns = [document.getElementById("historyUndo"), document.getElementById("panelUndoBtn")].filter(Boolean);
            const redoBtns = [document.getElementById("historyRedo"), document.getElementById("panelRedoBtn")].filter(Boolean);

            undoBtns.forEach(btn => {
                btn.onclick = (e) => {
                    e.preventDefault();
                    this.historyManager?.undo();
                };
            });

            redoBtns.forEach(btn => {
                btn.onclick = (e) => {
                    e.preventDefault();
                    this.historyManager?.redo();
                };
            });
        }

        updateUI() {
            if (!this.historyManager) return;

            const undoList = this.historyManager.undoStack || [];
            const redoList = this.historyManager.redoStack || [];

            // Update button disabled state
            const undoBtns = [document.getElementById("historyUndo"), document.getElementById("panelUndoBtn")].filter(Boolean);
            const redoBtns = [document.getElementById("historyRedo"), document.getElementById("panelRedoBtn")].filter(Boolean);

            undoBtns.forEach(btn => btn.disabled = undoList.length === 0);
            redoBtns.forEach(btn => btn.disabled = redoList.length === 0);

            // Assemble list: Future (Redos) -> Current State -> Past (Undos)
            let allActions = [
                ...redoList.map(a => ({ ...a, status: 'future' })).reverse(),
                ...undoList.map((a, i) => ({
                    ...a,
                    status: (i === undoList.length - 1) ? 'current-state' : 'past'
                })).reverse()
            ];

            // Filter by search query
            const query = (this.historyManager.searchQuery || '').toLowerCase().trim();
            if (query) {
                allActions = allActions.filter(a => a.name && a.name.toLowerCase().includes(query));
            }

            const jumpHandler = (id) => this.historyManager.jumpToId(id);

            // Render to #historyListContainer (Secondary Sidebar)
            const listContainer = document.getElementById("historyListContainer");
            if (listContainer) {
                listContainer.innerHTML = "";
                if (allActions.length === 0) {
                    listContainer.innerHTML = `<div style="padding:15px; color:#666; text-align:center; font-size:11px;">No history events found.</div>`;
                } else {
                    allActions.forEach(action => {
                        listContainer.appendChild(H.HistoryListRenderer.createSidebarRow(action, jumpHandler));
                    });
                }
            }

            // Render to #history-items (Dockable Panel)
            const historyItemsList = document.getElementById("history-items");
            if (historyItemsList) {
                historyItemsList.innerHTML = "";
                if (allActions.length === 0) {
                    historyItemsList.innerHTML = `<div style="padding:12px; color:#777; font-size:11px; text-align:center;">No history actions logged.</div>`;
                } else {
                    allActions.forEach(action => {
                        historyItemsList.appendChild(H.HistoryListRenderer.createSystemItemRow(action, jumpHandler));
                    });
                }
            }
        }
    }

    H.HistoryUIController = HistoryUIController;
})();
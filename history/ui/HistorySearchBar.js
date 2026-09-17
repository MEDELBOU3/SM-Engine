(function () {
    'use strict';
    const H = window.SMHistory = window.SMHistory || {};

    class HistorySearchBar {
        constructor(historyManager, onSearchCallback) {
            this.historyManager = historyManager;
            this.onSearchCallback = onSearchCallback;
            this.init();
        }

        init() {
            const historyPanel = document.getElementById('historyPanel');
            if (!historyPanel || document.getElementById('historySearch')) return;

            const searchContainer = document.createElement('div');
            searchContainer.className = "pp-search-container";
            searchContainer.innerHTML = `
                <input type="text" id="historySearch" placeholder="Search History..." class="pp-search-input">
                <i class="fas fa-search pp-search-icon"></i>
            `;

            const header = historyPanel.querySelector('.pp-header-row');
            if (header) {
                historyPanel.insertBefore(searchContainer, header.nextSibling);
            } else {
                historyPanel.prepend(searchContainer);
            }

            const searchInput = document.getElementById('historySearch');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    const query = e.target.value.toLowerCase().trim();
                    if (this.historyManager) this.historyManager.searchQuery = query;
                    if (typeof this.onSearchCallback === 'function') this.onSearchCallback(query);
                });

                // Prevent space/letters from triggering viewport shortcuts
                searchInput.addEventListener('keydown', (e) => e.stopPropagation());
            }
        }
    }

    H.HistorySearchBar = HistorySearchBar;
})();
// SM Engine Panel: HierarchyPanel
window.HierarchyPanel = {
    init() {
        const el = document.getElementById('hierarchy-panel');
        if (el) {
            el.innerHTML = `            <div id="hierarchy-header" class="panel-header">
                <i class="fas fa-sitemap"></i> Hierarchy
                <select id="hierarchyViewMode">
                    <option value="tree">Tree View</option>
                    <option value="flat">Flat View</option>
                    <option value="type">Type View</option>
                </select>

                <button id="sm-create-entity-btn" class="hm-header-create" type="button" title="Create an empty Entity">
                    <i class="fas fa-plus"></i> Entity
                </button>

                <span class="expand-button" style="margin-left: 8px;" aria-hidden="true"><i
                        class="fas fa-caret-down"></i></span>
            </div>
            <div id="hierarchy-list-content" class="panel-content">
                <div class="hierarchy-search">
                    <input type="text" id="hierarchy-search-input" placeholder="Search objects...">
                    <button id="hierarchy-search-clear">x</button>
                </div>
                <div class="hierarchy-content" id="hierarchy-content">

                </div>
            </div>
            <div id="selection-sets-header" class="panel-header">
                <i class="fas fa-layer-group"></i> Selection Sets
                <span class="expand-button" aria-hidden="true"><i class="fas fa-caret-down"></i></span>
            </div>

            <div id="selection-sets-content" class="panel-content">
                <div class="panel-header">Utility : Selection Groups</div>

                <div class="selection-set-toolbar">
                    <input type="text" id="selection-set-name" placeholder="SET_NAME_01">
                    <button id="create-selection-set" class="panel-button-set">Save</button>
                </div>

                <div class="selection-set-actions">
                    <button id="isolate-selection-btn" class="panel-button-set" disabled>Isolate</button>
                    <button id="exit-isolation-btn" class="panel-button-set" disabled>Un-Isolate</button>
                </div>

                <div class="panel-header" style="margin-top: 15px;">Saved Registry</div>
                <div id="selection-set-list" class="selection-set-list">
                    <!-- Example of how a dynamic row should look -->
                    <div class="selection-set-item">
                        <span>SET_01</span>
                        <small style="color: #666;">5 objects</small>
                    </div>
                </div>
            </div>

            <!-- Storyboard Panel (Visible only in 2D Mode) -->
            <div id="storyboard-header" class="panel-header animation-2d-only" style="display: none;">
                <i class="fas fa-film"></i> Storyboard
                <span class="expand-button" aria-hidden="true"><i class="fas fa-caret-down"></i></span>
            </div>
            <div id="storyboard-panel" class="panel-content animation-2d-only"
                style="display: none; padding: 0; overflow: auto; height: auto; max-height: 600px;">
                <!-- Storyboard Manager will inject content here -->
            </div>

            <!-- Anime Color Studio Panel (Visible only in 2D Mode) -->
            <div id="anime-color-studio-header" class="panel-header animation-2d-only" style="display: none;">
                <i class="fas fa-palette"></i> Anime Color Studio
                <span class="expand-button" aria-hidden="true"><i class="fas fa-caret-down"></i></span>
            </div>
            <div id="anime-color-studio-content" class="panel-content animation-2d-only"
                style="display: none; padding: 10px;">
                <!-- Content will be injected by AnimeColoringSystem.js -->
            </div>

            <!-- =========================================================
     PROFESSIONAL MEDIA POOL
     SM Engine Video Editing
     ========================================================= -->

    <div
        id="media-pool-header"
        class="panel-header video-mode-element">
        <span>
            <i class="fas fa-photo-video"></i>
            Media Pool
        </span>
    
        <span class="expand-button">
            <i class="fas fa-caret-down"></i>
        </span>
    </div>
    
    <div
        id="media-pool-content"
        class="panel-content video-mode-element sm-media-pool-pro">
    
        <div
            class="sm-media-pool-shell"
            data-media-pool-shell>
    
            <!-- TOP COMMAND BAR -->
            <div class="sm-media-pool-commandbar">
                <div class="sm-media-command-left">
    
                    <button
                        type="button"
                        id="import-media-btn"
                        class="sm-media-icon-button sm-media-import-button"
                        title="Import Media">
                        <span>Import</span>
                    </button>
    
                    <button
                        type="button"
                        class="sm-media-icon-button"
                        data-media-action="new-bin"
                        title="New Bin">
                        + Bin
                    </button>
                </div>
    
                <div class="sm-media-search">
                    <span></span>
    
                    <input
                        type="search"
                        data-media-search
                        spellcheck="false"
                        placeholder="Search Media Pool">
    
                    <button
                        type="button"
                        data-media-action="clear-search"
                        title="Clear Search">
                        ×
                    </button>
                </div>
    
                <div class="sm-media-command-right">
                    <button
                        type="button"
                        class="sm-media-icon-button active"
                        data-media-view="grid"
                        title="Thumbnail View">
                        Grid
                    </button>
    
                    <button
                        type="button"
                        class="sm-media-icon-button"
                        data-media-view="list"
                        title="List View">
                        List
                    </button>
                </div>
            </div>
    
            <input
                type="file"
                id="media-upload-input"
                multiple
                accept="video/*,image/*,audio/*"
                hidden>
    
            <!-- FILTER / SORT BAR -->
            <div class="sm-media-pool-subbar">
    
                <div
                    class="media-pool-filters"
                    role="tablist"
                    aria-label="Media type filters">
    
                    <button
                        type="button"
                        class="panel-button-set active"
                        data-media-filter="all">
                        All
                    </button>
    
                    <button
                        type="button"
                        class="panel-button-set"
                        data-media-filter="video">
                        Video
                    </button>
    
                    <button
                        type="button"
                        class="panel-button-set"
                        data-media-filter="image">
                        Image
                    </button>
    
                    <button
                        type="button"
                        class="panel-button-set"
                        data-media-filter="audio">
                        Audio
                    </button>
                </div>
    
                <div class="sm-media-sort">
                    <select
                        data-media-sort
                        title="Sort Media">
                        <option value="name">Name</option>
                        <option value="type">Type</option>
                        <option value="duration">Duration</option>
                        <option value="resolution">Resolution</option>
                        <option value="date">Date Imported</option>
                    </select>
    
                    <button
                        type="button"
                        class="sm-media-icon-button compact"
                        data-media-action="sort-direction"
                        title="Sort Direction">
                        ↕
                    </button>
                </div>
            </div>
    
            <!-- MAIN WORKSPACE -->
            <div class="sm-media-pool-workspace">
    
                <!-- BINS -->
                <aside class="sm-media-bin-panel">
                    <div class="sm-media-bin-header">
                        <span>BINS</span>
    
                        <button
                            type="button"
                            data-media-action="new-bin"
                            title="New Bin">
                            +
                        </button>
                    </div>
    
                    <div
                        class="sm-media-bin-list"
                        data-media-bin-list>
                    </div>
                </aside>
    
                <!-- MEDIA BROWSER -->
                <main class="sm-media-browser">
    
                    <div class="sm-media-browser-header">
                        <div>
                            <strong data-media-current-bin>
                                Master
                            </strong>
    
                            <span data-media-browser-summary>
                                0 items
                            </span>
                        </div>
    
                        <div class="sm-media-browser-actions">
                            <button
                                type="button"
                                data-media-action="select-all"
                                title="Select All">
                                Select
                            </button>
    
                            <button
                                type="button"
                                data-media-action="remove-selected"
                                title="Remove Selected">
                                Delete
                            </button>
                        </div>
                    </div>
    
                    <div
                        id="media-pool-grid"
                        class="media-grid sm-media-grid grid-view"
                        data-media-view-root>
    
                        <div data-media-empty>
                            No media imported.
                        </div>
                    </div>
                </main>
            </div>
    
            <!-- STATUS BAR -->
            <footer class="sm-media-pool-status">
                <span data-media-pool-status>
                    Media Pool Ready
                </span>
    
                <span data-media-selection-status>
                    0 selected
                </span>
            </footer>
        </div>
    </div>
            <div id="hierarchy-resize-handle" class="resize-handle-hierarchy" role="separator"
                aria-orientation="vertical" aria-label="Resize hierarchy panel"></div>
`;
            console.log('HierarchyPanel initialized');
        } else {
            console.warn('HierarchyPanel element not found: hierarchy-panel');
        }
    }
};

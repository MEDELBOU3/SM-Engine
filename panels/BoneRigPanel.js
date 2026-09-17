// SM Engine Panel: BoneRigPanel
window.BoneRigPanel = {
    init() {
        const el = document.getElementById('bone-editor');
        if (el) {
            el.innerHTML = `
                <!-- ── MODE BAR ─────────────────────────────────────── -->
                <div class="rig-mode-bar">
                    <div class="rig-brand">
                        <span class="rig-brand-dot"></span>
                        <span class="rig-brand-label">Bone Rig</span>
                    </div>

                    <div class="rig-mode-tabs">
                        <button class="rig-mode-tab active" data-rig-mode="pose">Pose Mode</button>
                        <button class="rig-mode-tab" data-rig-mode="edit">Edit Mode</button>
                        <button class="rig-mode-tab" data-rig-mode="object">Object Mode</button>
                    </div>

                    <span class="rig-mode-badge" id="rig-mode-badge">Pose Mode</span>

                    <div class="rig-toolbar">
                        <button id="rig-setup-btn" class="rig-toolbar-btn btn-accent"
                            title="Create a rig for any selected character, car, machine or object">
                            <i class="fas fa-bone"></i> Create Rig
                        </button>
                        <button id="add-bone-btn" class="rig-toolbar-btn"
                            title="Add a child bone: click its position in Rig View">
                            <i class="fas fa-plus"></i> Add Bone
                        </button>
                        <button id="rig-parent-part-btn" class="rig-toolbar-btn"
                            title="Parent the last selected object part to the selected bone (Keep Transform)">
                            <i class="fas fa-link"></i> Parent Part
                        </button>
                        <button id="rig-unparent-part-btn" class="rig-toolbar-btn"
                            title="Clear the rig parent of the last selected object part (Keep Transform)">
                            <i class="fas fa-link-slash"></i> Clear Parent
                        </button>
                        <button id="deselect-bone-btn" class="rig-toolbar-btn"
                            title="Deselect bone, re-select rig owner">
                            <i class="fas fa-mouse-pointer"></i> Deselect
                        </button>
                        <button id="rig-key-selected-btn" class="rig-toolbar-btn btn-accent"
                            title="Insert keyframe for selected bones">
                            <i class="fas fa-diamond"></i> Key
                        </button>
                        <button id="rig-record-pose-btn" class="rig-toolbar-btn"
                            title="Record the current full-body pose at the playhead">
                            <i class="fas fa-circle"></i> Record
                        </button>
                        <button id="rig-bake-clip-btn" class="rig-toolbar-btn"
                            title="Bake recorded pose keys into an animation clip">
                            <i class="fas fa-film"></i> Bake Clip
                        </button>
                        <button id="rig-preview-clip-btn" class="rig-toolbar-btn"
                            title="Preview the most recently baked rig animation">
                            <i class="fas fa-play"></i> Preview
                        </button>
                        <button id="rig-runtime-btn" class="rig-toolbar-btn"
                            title="Create a game and cinematic runtime rig profile">
                            <i class="fas fa-gamepad"></i> Runtime
                        </button>
                        <button id="rig-focus-timeline-btn" class="rig-toolbar-btn" title="Sync selection to timeline">
                            <i class="fas fa-link"></i> Sync
                        </button>
                        <button id="rig-pose-lib-btn" class="rig-toolbar-btn" title="Toggle Pose Library">
                            <i class="fas fa-bookmark"></i> Poses
                        </button>
                        <button class="rig-toolbar-btn" id="bone-editor-expand">
                            <i class="fas fa-expand"></i> Expand
                        </button>
                    </div>
                </div>

                <!-- ── STATUS BAR ───────────────────────────────────── -->
                <div class="rig-status-bar">
                    <span class="rig-status-item" id="rig-status-mode"><strong>Mode</strong> Pose</span>
                    <span class="rig-status-item"><strong>Display</strong> Skeleton + Controllers</span>
                    <span class="rig-status-item"><strong>XRay</strong> On</span>
                    <span class="rig-status-item" id="rig-status-selection"><strong>Active</strong> None</span>
                </div>

                <!-- ── BODY: 3 columns ──────────────────────────────── -->
                <div class="rig-editor-body bone-rig-editor-body">

                    <!-- ┌──────────────────────────────────────────────
             │  LEFT — HIERARCHY TREE
             └────────────────────────────────────────────── -->
                    <aside class="rig-sidebar-left">
                        <!-- Overview / Stats -->
                        <div class="rig-panel-head">
                            <span>Overview</span>
                        </div>
                        <div id="rig-profile-summary" class="rig-scroll"></div>

                        <!-- Bone Hierarchy -->
                        <div class="rig-panel-head" style="margin-top:auto;flex-shrink:0;">
                            <span>Skeleton</span>
                        </div>
                        <div class="rig-search-wrap">
                            <input id="rig-hierarchy-search" class="rig-search-input" type="search"
                                placeholder="Search bones…" autocomplete="off">
                        </div>
                        <div id="rig-hierarchy-tree" class="rig-scroll-full"></div>

                        <!-- Chains quick-access -->
                        <div class="rig-panel-head" style="flex-shrink:0;">
                            <span>Chains</span>
                        </div>
                        <div id="rig-profile-chains" class="rig-scroll" style="max-height:120px;flex-shrink:0;"></div>
                    </aside>

                    <!-- Resizer -->
                    <div class="rig-resizer" data-rig-resize="hierarchy" role="separator" aria-orientation="vertical"
                        aria-label="Resize hierarchy sidebar"></div>

                    <!-- ┌──────────────────────────────────────────────
             │  CENTER — CONTROLLER GRID
             └────────────────────────────────────────────── -->
                    <main class="rig-workspace">
                        <div class="rig-workspace-header">
                            <div>
                                <div class="rig-ws-title">Controllers</div>
                            </div>
                            <div class="rig-filter-row">
                                <button class="rig-filter-btn active" data-ctrl-filter="all">All</button>
                                <button class="rig-filter-btn" data-ctrl-filter="control">Ctrl</button>
                                <button class="rig-filter-btn" data-ctrl-filter="deform">Deform</button>
                                <button class="rig-filter-btn" data-ctrl-filter="ik">IK</button>
                                <select class="rig-sort-select" id="rig-sort-select">
                                    <option value="hierarchy">By Hierarchy</option>
                                    <option value="alpha">Alphabetical</option>
                                    <option value="role">By Role</option>
                                </select>
                            </div>
                        </div>
                        <div id="rig-profile-controls" class="rig-scroll-full"></div>
                    </main>

                    <!-- Resizer -->
                    <div class="rig-resizer" data-rig-resize="right" role="separator" aria-orientation="vertical"
                        aria-label="Resize details sidebar"></div>

                    <aside class="rig-sidebar-right">
                        <div class="rig-panel-head">
                            <span>Details</span>
                        </div>
                        <div id="rig-selection-details">
                            <div class="rig-inspector-empty">
                                <p>Select a bone or controller to inspect its properties.</p>
                            </div>
                        </div>
                    </aside>
                </div>
`;
            console.log('BoneRigPanel initialized');
        } else {
            console.warn('BoneRigPanel element not found: bone-editor');
        }
    }
};

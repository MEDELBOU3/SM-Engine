/**
 * MediaPoolManager.js — PHASE 14 COMPACT PROFESSIONAL MEDIA POOL
 * SM Engine professional media ingest + Resolve-style media organization.
 *
 * Media authority:
 *   window.videoProject.media
 *
 * Runtime File objects are intentionally kept OUTSIDE project JSON.
 * The project stores metadata + source URL + relink information.
 */
(function (global) {
  "use strict";

  class MediaPoolManager {
    constructor(project = null) {
      this.project =
        project ||
        global.ensureVideoProjectState?.() ||
        global.videoProject ||
        null;

      this.filter = "all";
      this.query = "";
      this.viewMode = "grid";
      this.sortBy = "name";
      this.sortDirection = "asc";
      this.activeBinId = "master";
      this.selectedIds = new Set();

      this.content = null;
      this.grid = null;
      this.input = null;

      this._audioContext = null;
      this._runtimeFiles = new Map();
      this._objectUrls = new Set();
      this._unsubProject = null;
      this._bound = false;
      this._contextMenu = null;
      this._renderQueued = false;

      this._ensurePoolState();
      this._styles();
      this._ensureProfessionalDOM();
      this._restoreUIState();
      this._bind();
      this._bindProject();
      this.render();
    }

    /* ==============================================================
           CANONICAL MEDIA ARRAY
           ============================================================== */

    get media() {
      if (this.project) {
        return this.project.media;
      }

      if (!this._fallbackMedia) {
        this._fallbackMedia = [];
      }

      return this._fallbackMedia;
    }

    set media(value) {
      const array = Array.isArray(value) ? value : [];

      if (this.project) {
        this.project.state.media = array;
      } else {
        this._fallbackMedia = array;
      }
    }

    bindProject(project) {
      if (!project) return false;

      this._unsubProject?.();

      this.project = project;

      this._bindProject();
      this.render();

      return true;
    }

    _bindProject() {
      this._unsubProject?.();
      this._unsubProject = null;

      if (!this.project?.subscribe) return;

      this._unsubProject = this.project.subscribe("media.*", () => {
        this.render();
      });

      this.project.attachLegacySystems?.({
        manager: global.videoEditingManager || null,
        sequencer: global.sequencerManager || null,
        mediaPool: this,
        capture: false,
        bindEvents: false,
      });
    }

    /* ==============================================================
           MEDIA POOL UI STATE / BINS
           ============================================================== */

    _ensurePoolState() {
      if (!this.project?.state) return null;

      const state = this.project.state.mediaPool || {};

      if (!Array.isArray(state.bins)) {
        state.bins = [];
      }

      if (!state.bins.some((bin) => bin.id === "master")) {
        state.bins.unshift({
          id: "master",
          name: "Master",
          parentId: null,
          system: true,
          createdAt: new Date().toISOString(),
        });
      }

      state.activeBinId = state.activeBinId || "master";

      state.filter = state.filter || "all";

      state.query = state.query || "";

      state.viewMode = ["grid", "list"].includes(state.viewMode)
        ? state.viewMode
        : "grid";

      state.sortBy = state.sortBy || "name";

      state.sortDirection = state.sortDirection === "desc" ? "desc" : "asc";

      this.project.state.mediaPool = state;

      return state;
    }

    _restoreUIState() {
      const state = this._ensurePoolState();

      if (!state) return;

      this.activeBinId = state.activeBinId || "master";

      this.filter = state.filter || "all";

      this.query = state.query || "";

      this.viewMode = state.viewMode || "grid";

      this.sortBy = state.sortBy || "name";

      this.sortDirection = state.sortDirection || "asc";
    }

    _saveUIState() {
      const state = this._ensurePoolState();

      if (!state) return;

      state.activeBinId = this.activeBinId;

      state.filter = this.filter;

      state.query = this.query;

      state.viewMode = this.viewMode;

      state.sortBy = this.sortBy;

      state.sortDirection = this.sortDirection;

      this.project?.touch?.(
        "media.pool.ui",
        {
          ...state,
        },
        {
          dirty: false,
          autosave: false,
        },
      );
    }

    get bins() {
      return (
        this._ensurePoolState()?.bins || [
          {
            id: "master",
            name: "Master",
            system: true,
          },
        ]
      );
    }

    createBin(name = null) {
      const state = this._ensurePoolState();

      if (!state) return null;

      const requested = String(
        name || global.prompt?.("Bin name", "New Bin") || "",
      ).trim();

      if (!requested) return null;

      const duplicate = state.bins.some(
        (bin) => String(bin.name).toLowerCase() === requested.toLowerCase(),
      );

      const finalName = duplicate
        ? `${requested} ${state.bins.length}`
        : requested;

      const bin = {
        id:
          this.project?.makeId?.("bin") ||
          `bin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: finalName,
        parentId: null,
        system: false,
        createdAt: new Date().toISOString(),
      };

      state.bins.push(bin);

      this.activeBinId = bin.id;

      this._saveUIState();

      this.project?.touch?.("media.pool.bins", {
        action: "create",
        bin,
      });

      this.render();

      return bin;
    }

    renameBin(id, name = null) {
      if (!id || id === "master") {
        return false;
      }

      const state = this._ensurePoolState();

      const bin = state?.bins?.find((candidate) => candidate.id === id);

      if (!bin) return false;

      const nextName = String(
        name || global.prompt?.("Rename Bin", bin.name) || "",
      ).trim();

      if (!nextName) return false;

      bin.name = nextName;

      this.project?.touch?.("media.pool.bins", {
        action: "rename",
        binId: id,
        name: nextName,
      });

      this.render();

      return true;
    }

    removeBin(id) {
      if (!id || id === "master") {
        return false;
      }

      const state = this._ensurePoolState();

      if (!state) return false;

      const index = state.bins.findIndex((bin) => bin.id === id);

      if (index < 0) {
        return false;
      }

      const bin = state.bins[index];

      const accepted = global.confirm
        ? global.confirm(
            `Delete bin "${bin.name}"?\nMedia will be moved to Master.`,
          )
        : true;

      if (!accepted) {
        return false;
      }

      state.bins.splice(index, 1);

      this.media.forEach((entry) => {
        if ((entry.binId || "master") === id) {
          this._updateProjectMedia(entry.id, {
            binId: "master",
          });
        }
      });

      if (this.activeBinId === id) {
        this.activeBinId = "master";
      }

      this._saveUIState();

      this.project?.touch?.("media.pool.bins", {
        action: "remove",
        binId: id,
      });

      this.render();

      return true;
    }

    setActiveBin(id) {
      const exists = this.bins.some((bin) => bin.id === id);

      if (!exists) return false;

      this.activeBinId = id;

      this.selectedIds.clear();

      this._saveUIState();
      this.render();

      return true;
    }

    moveMediaToBin(mediaIds, binId) {
      const ids = Array.isArray(mediaIds) ? mediaIds : [mediaIds];

      const exists = this.bins.some((bin) => bin.id === binId);

      if (!exists) return false;

      ids.forEach((id) => {
        this._updateProjectMedia(id, {
          binId,
        });
      });

      this.project?.touch?.("media.pool.move", {
        ids,
        binId,
      });

      this.render();

      return true;
    }

    /* ==============================================================
           PROFESSIONAL DOM
           ============================================================== */

    _ensureProfessionalDOM() {
      const content = document.getElementById("media-pool-content");

      if (!content) {
        return false;
      }

      this.content = content;

      content.classList.add("sm-media-pool-pro");

      /*
       * Always migrate old Phase 13 HTML automatically.
       * The previous HTML shell used text buttons in places where the
       * Phase 13 CSS expected compact icon buttons, producing the
       * overlapping "SelectDelete" layout visible in the screenshot.
       */
      let shell = content.querySelector("[data-media-pool-shell]");

      const version = shell?.dataset?.mediaPoolVersion;

      if (!shell || version !== "14") {
        content.innerHTML = `
                    <div
                        class="sm-media-pool-shell"
                        data-media-pool-shell
                        data-media-pool-version="14">

                        <div class="sm-media-pool-commandbar">
                            <button
                                type="button"
                                id="import-media-btn"
                                class="sm-media-primary-button"
                                title="Import Media">
                                ${this._svg("import")}
                                <span>Import</span>
                            </button>

                            <button
                                type="button"
                                class="sm-media-tool-button"
                                data-media-action="new-bin"
                                title="New Bin">
                                ${this._svg("folder-plus")}
                            </button>

                            <label class="sm-media-search">
                                <span>
                                    ${this._svg("search")}
                                </span>

                                <input
                                    type="search"
                                    data-media-search
                                    spellcheck="false"
                                    placeholder="Search media">

                                <button
                                    type="button"
                                    data-media-action="clear-search"
                                    title="Clear Search">
                                    ${this._svg("close")}
                                </button>
                            </label>

                            <button
                                type="button"
                                class="sm-media-tool-button"
                                data-media-view="grid"
                                title="Thumbnail View">
                                ${this._svg("grid")}
                            </button>

                            <button
                                type="button"
                                class="sm-media-tool-button"
                                data-media-view="list"
                                title="List View">
                                ${this._svg("list")}
                            </button>
                        </div>

                        <input
                            type="file"
                            id="media-upload-input"
                            multiple
                            accept="video/*,image/*,audio/*"
                            hidden>

                        <div class="sm-media-pool-subbar">
                            <div
                                class="media-pool-filters"
                                role="tablist"
                                aria-label="Media Filters">

                                <button
                                    type="button"
                                    class="panel-button-set"
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
                                    <option value="date">Imported</option>
                                </select>

                                <button
                                    type="button"
                                    class="sm-media-tool-button compact"
                                    data-media-action="sort-direction"
                                    title="Sort Direction">
                                    ${this._svg("sort-asc")}
                                </button>
                            </div>
                        </div>

                        <div class="sm-media-pool-workspace">
                            <aside class="sm-media-bin-panel">
                                <div class="sm-media-bin-header">
                                    <span>BINS</span>

                                    <button
                                        type="button"
                                        data-media-action="new-bin"
                                        title="New Bin">
                                        ${this._svg("plus")}
                                    </button>
                                </div>

                                <div
                                    class="sm-media-bin-list"
                                    data-media-bin-list>
                                </div>
                            </aside>

                            <main class="sm-media-browser">
                                <div class="sm-media-browser-header">
                                    <div class="sm-media-browser-title">
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
                                            ${this._svg("select")}
                                        </button>

                                        <button
                                            type="button"
                                            data-media-action="remove-selected"
                                            title="Remove Selected">
                                            ${this._svg("trash")}
                                        </button>
                                    </div>
                                </div>

                                <div
                                    id="media-pool-grid"
                                    class="media-grid sm-media-grid grid-view"
                                    data-media-view-root>
                                </div>
                            </main>
                        </div>

                        <footer class="sm-media-pool-status">
                            <span data-media-pool-status>
                                Media Pool Ready
                            </span>

                            <span data-media-selection-status>
                                0 selected
                            </span>
                        </footer>
                    </div>
                `;

        shell = content.querySelector("[data-media-pool-shell]");
      }

      this.grid = content.querySelector("#media-pool-grid");

      this.input = content.querySelector("#media-upload-input");

      const search = content.querySelector("[data-media-search]");

      if (search && search.value !== this.query) {
        search.value = this.query || "";
      }

      return true;
    }

    /* ==============================================================
           DOM
           ============================================================== */

    _bind() {
      if (this._bound) return;

      this._bound = true;

      this._onDocumentClick = (event) => {
        const header = event.target.closest?.("#media-pool-header");

        if (header && !event.target.closest("button,input,select")) {
          this.toggleCollapsed();
          return;
        }

        const content = event.target.closest?.("#media-pool-content");

        if (!content) return;

        const importButton = event.target.closest?.("#import-media-btn");

        if (importButton) {
          event.preventDefault();
          this.triggerImport();
          return;
        }

        const filterButton = event.target.closest?.("[data-media-filter]");

        if (filterButton) {
          this.setFilter(filterButton.dataset.mediaFilter);
          return;
        }

        const viewButton = event.target.closest?.("[data-media-view]");

        if (viewButton) {
          this.setViewMode(viewButton.dataset.mediaView);
          return;
        }

        const binButton = event.target.closest?.("[data-media-bin-id]");

        if (binButton) {
          this.setActiveBin(binButton.dataset.mediaBinId);
          return;
        }

        const actionButton = event.target.closest?.("[data-media-action]");

        if (actionButton) {
          this._handleAction(actionButton.dataset.mediaAction, actionButton);
          return;
        }

        const addButton = event.target.closest?.("[data-media-add]");

        if (addButton) {
          event.stopPropagation();
          this.addToCanvas(addButton.dataset.mediaAdd);
          return;
        }

        const cell = event.target.closest?.(".media-item");

        if (cell) {
          this.selectMedia(cell.dataset.id, {
            additive: event.ctrlKey || event.metaKey,
            range: event.shiftKey,
          });
        }
      };

      this._onDocumentDblClick = (event) => {
        const cell = event.target.closest?.("#media-pool-content .media-item");

        if (!cell) return;

        event.preventDefault();

        this.addToCanvas(cell.dataset.id);
      };

      this._onDocumentChange = (event) => {
        if (event.target.id === "media-upload-input") {
          this.importFiles(event.target.files, this.activeBinId);

          event.target.value = "";

          return;
        }

        if (event.target.matches?.("[data-media-sort]")) {
          this.sortBy = event.target.value;

          this._saveUIState();
          this.render();
        }
      };

      this._onDocumentInput = (event) => {
        if (
          !event.target.matches?.("#media-pool-content [data-media-search]")
        ) {
          return;
        }

        this.query = event.target.value || "";

        this._saveUIState();
        this.render();
      };

      this._onDocumentContextMenu = (event) => {
        const cell = event.target.closest?.("#media-pool-content .media-item");

        const bin = event.target.closest?.(
          "#media-pool-content [data-media-bin-id]",
        );

        if (cell) {
          event.preventDefault();

          if (!this.selectedIds.has(cell.dataset.id)) {
            this.selectMedia(cell.dataset.id);
          }

          this._openMediaContextMenu(
            event.clientX,
            event.clientY,
            cell.dataset.id,
          );

          return;
        }

        if (bin && bin.dataset.mediaBinId !== "master") {
          event.preventDefault();

          this._openBinContextMenu(
            event.clientX,
            event.clientY,
            bin.dataset.mediaBinId,
          );
        }
      };

      this._onDocumentDragStart = (event) => {
        const cell = event.target.closest?.("#media-pool-content .media-item");

        if (!cell) return;

        const id = cell.dataset.id;

        if (!this.selectedIds.has(id)) {
          this.selectMedia(id);
        }

        const ids = this.selectedIds.size ? [...this.selectedIds] : [id];

        const payload = ids
          .map((mediaId) => this.getMedia(mediaId))
          .filter(Boolean)
          .map((entry) => ({
            id: entry.id,
            name: entry.name,
            mediaType: entry.mediaType,
            sourceMediaId: entry.id,
          }));

        event.dataTransfer?.setData(
          "application/x-sm-media",
          JSON.stringify(payload),
        );

        event.dataTransfer?.setData("text/plain", JSON.stringify(payload));

        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "copy";
        }

        cell.classList.add("dragging");
      };

      this._onDocumentDragEnd = (event) => {
        event.target.closest?.(".media-item")?.classList.remove("dragging");
      };

      this._onDocumentDragOver = (event) => {
        const grid = event.target.closest?.(
          "#media-pool-content #media-pool-grid",
        );

        if (!grid) return;

        event.preventDefault();

        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "copy";
        }

        grid.classList.add("drop-active");
      };

      this._onDocumentDragLeave = (event) => {
        const grid = event.target.closest?.(
          "#media-pool-content #media-pool-grid",
        );

        grid?.classList.remove("drop-active");
      };

      this._onDocumentDrop = (event) => {
        const grid = event.target.closest?.(
          "#media-pool-content #media-pool-grid",
        );

        if (!grid) return;

        event.preventDefault();

        grid.classList.remove("drop-active");

        const files = event.dataTransfer?.files;

        if (files?.length) {
          this.importFiles(files, this.activeBinId);
        }
      };

      this._onDocumentKeyDown = (event) => {
        if (
          !document.activeElement?.closest?.("#media-pool-content") &&
          !event.target?.closest?.("#media-pool-content")
        ) {
          return;
        }

        if (event.key === "Delete") {
          this.removeSelected();
        } else if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "a"
        ) {
          event.preventDefault();
          this.selectAllVisible();
        } else if (event.key === "Enter" && this.selectedIds.size === 1) {
          this.addToCanvas([...this.selectedIds][0]);
        }
      };

      document.addEventListener("click", this._onDocumentClick);

      document.addEventListener("dblclick", this._onDocumentDblClick);

      document.addEventListener("change", this._onDocumentChange);

      document.addEventListener("input", this._onDocumentInput);

      document.addEventListener("contextmenu", this._onDocumentContextMenu);

      document.addEventListener("dragstart", this._onDocumentDragStart);

      document.addEventListener("dragend", this._onDocumentDragEnd);

      document.addEventListener("dragover", this._onDocumentDragOver);

      document.addEventListener("dragleave", this._onDocumentDragLeave);

      document.addEventListener("drop", this._onDocumentDrop);

      document.addEventListener("keydown", this._onDocumentKeyDown);
    }

    toggleCollapsed() {
      const content = document.getElementById("media-pool-content");

      const icon = document.querySelector(
        "#media-pool-header .expand-button i",
      );

      if (!content) return;

      const collapsed = content.style.display === "none";

      content.style.display = collapsed ? "" : "none";

      icon?.classList.toggle("fa-caret-right", !collapsed);

      icon?.classList.toggle("fa-caret-down", collapsed);
    }

    triggerImport() {
      this.input?.click();
    }

    /* ==============================================================
           IMPORT
           ============================================================== */

    importFiles(fileList, binId = this.activeBinId) {
      const files = Array.from(fileList || []);

      if (!files.length) return [];

      const imported = [];

      files.forEach((file) => {
        const mediaType = file.type.startsWith("video/")
          ? "video"
          : file.type.startsWith("image/")
            ? "image"
            : file.type.startsWith("audio/")
              ? "audio"
              : null;

        if (!mediaType) return;

        const src = URL.createObjectURL(file);

        this._objectUrls.add(src);

        const raw = {
          id:
            this.project?.makeId?.("media") ||
            `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          mediaType,
          type: "media",
          mimeType: file.type || "",
          src,
          duration: 0,
          mediaWidth: 0,
          mediaHeight: 0,
          thumb: null,
          thumbnails: [],
          audioPeaks: null,
          status: "loading",
          binId: binId || "master",
          importedAt: Date.now(),
          metadata: {
            fileName: file.name,
            fileSize: file.size,
            lastModified: file.lastModified || 0,
          },
        };

        const entry = this.project?.addMedia ? this.project.addMedia(raw) : raw;

        if (!this.project) {
          this.media.push(entry);
        }

        this._runtimeFiles.set(entry.id, file);

        imported.push(entry);

        this._hydrateEntry(entry, file).catch((error) => {
          console.warn("[MediaPool] metadata failed:", file.name, error);

          this._updateProjectMedia(entry.id, {
            status: "ready",
            metadata: {
              ...(entry.metadata || {}),
              analyzeError: String(error?.message || error),
            },
          });

          this.render();
        });
      });

      this.render();

      return imported;
    }

    async _hydrateEntry(entry, file) {
      if (entry.mediaType === "image") {
        await this._hydrateImage(entry);
      } else if (entry.mediaType === "video") {
        await this._hydrateVideo(entry);
      } else if (entry.mediaType === "audio") {
        await this._hydrateAudio(entry, file);
      }

      this._updateProjectMedia(entry.id, {
        status: "ready",
        duration: Number(entry.duration || 0),
        mediaWidth: Number(entry.mediaWidth || 0),
        mediaHeight: Number(entry.mediaHeight || 0),
        thumb: entry.thumb || null,
        thumbnails: Array.isArray(entry.thumbnails)
          ? entry.thumbnails.slice()
          : [],
        audioPeaks: entry.audioPeaks
          ? ArrayBuffer.isView(entry.audioPeaks)
            ? Array.from(entry.audioPeaks)
            : entry.audioPeaks
          : null,
        codecWarning: entry.codecWarning || null,
      });

      this._propagateMetadataToTimeline(entry.id);

      this.render();

      const manager = global.videoEditingManager;

      const sequencer = global.sequencerManager;

      manager?.renderCompositeAt?.(
        sequencer?.state?.playhead ?? manager.currentTime ?? 0,
      );
    }

    _updateProjectMedia(id, patch) {
      const entry = this.media.find((media) => media.id === id);

      if (!entry) return null;

      if (this.project?.updateMedia) {
        return this.project.updateMedia(id, patch);
      }

      Object.assign(entry, patch);

      return entry;
    }

    _propagateMetadataToTimeline(sourceMediaId) {
      const entry = this.media.find((media) => media.id === sourceMediaId);

      if (!entry) return;

      const manager = global.videoEditingManager;

      const instances =
        manager?.items?.filter?.(
          (item) => item.sourceMediaId === sourceMediaId,
        ) || [];

      // Update existing compositor instances.
      instances.forEach((item) => {
        item.duration = entry.duration || item.duration || 0;

        item.sourceDuration = entry.duration || item.sourceDuration || 0;

        item.mediaWidth = entry.mediaWidth || item.mediaWidth || 0;

        item.mediaHeight = entry.mediaHeight || item.mediaHeight || 0;

        if (entry.thumb) {
          item.thumb = entry.thumb;
        }

        if (Array.isArray(entry.thumbnails) && entry.thumbnails.length) {
          item.thumbnails = entry.thumbnails.slice();
        }

        if (entry.audioPeaks) {
          item.audioPeaks = entry.audioPeaks;
        }
      });

      // Timeline is project-backed now.
      const clips =
        this.project?.timeline?.clips ||
        global.sequencerManager?.state?.clips ||
        [];

      const instanceIds = new Set(instances.map((item) => item.id));

      clips.forEach((clip) => {
        const referencesSource =
          clip.sourceMediaId === sourceMediaId ||
          instanceIds.has(clip.mediaRef);

        if (!referencesSource) {
          return;
        }

        const wasDefault =
          !clip.sourceDuration && Math.abs((clip.duration || 0) - 4) < 0.001;

        clip.sourceMediaId = sourceMediaId;

        clip.sourceDuration = entry.duration || clip.sourceDuration || 0;

        clip.mediaWidth = entry.mediaWidth || clip.mediaWidth || 0;

        clip.mediaHeight = entry.mediaHeight || clip.mediaHeight || 0;

        if (entry.thumb) {
          clip.thumb = entry.thumb;
        }

        if (Array.isArray(entry.thumbnails) && entry.thumbnails.length) {
          clip.thumbnails = entry.thumbnails.slice();
        }

        if (entry.audioPeaks) {
          clip.audioPeaks = ArrayBuffer.isView(entry.audioPeaks)
            ? Array.from(entry.audioPeaks)
            : entry.audioPeaks;
        }

        if (wasDefault && entry.duration > 0) {
          clip.duration = entry.duration;

          clip.sourceOut = clip.sourceIn + clip.duration;
        }
      });

      this.project?.touch?.("timeline.clips", {
        reason: "media-metadata",
        sourceMediaId,
      });

      global.sequencerManager?.renderer?.render?.();
    }

    /* ==============================================================
           HYDRATION
           ============================================================== */

    _captureSource(
      source,
      width,
      height,
      targetWidth = 180,
      targetHeight = 100,
    ) {
      if (!width || !height) {
        return null;
      }

      const canvas = document.createElement("canvas");

      canvas.width = targetWidth;

      canvas.height = targetHeight;

      const context = canvas.getContext("2d");

      if (!context) {
        return null;
      }

      const scale = Math.max(targetWidth / width, targetHeight / height);

      const drawWidth = width * scale;

      const drawHeight = height * scale;

      const x = (targetWidth - drawWidth) / 2;

      const y = (targetHeight - drawHeight) / 2;

      context.fillStyle = "#111";
      context.fillRect(0, 0, targetWidth, targetHeight);

      context.drawImage(source, x, y, drawWidth, drawHeight);

      try {
        return canvas.toDataURL("image/jpeg", 0.72);
      } catch (_) {
        return null;
      }
    }

    _hydrateImage(entry) {
      return new Promise((resolve, reject) => {
        const image = new Image();

        image.onload = () => {
          entry.mediaWidth = image.naturalWidth;

          entry.mediaHeight = image.naturalHeight;

          entry.thumb =
            this._captureSource(
              image,
              image.naturalWidth,
              image.naturalHeight,
            ) || entry.src;

          entry.thumbnails = [entry.thumb];

          resolve();
        };

        image.onerror = reject;

        image.src = entry.src;
      });
    }

    _hydrateVideo(entry) {
      return new Promise((resolve, reject) => {
        const video = document.createElement("video");

        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.preload = "auto";

        if (
          entry.mimeType &&
          video.canPlayType &&
          video.canPlayType(entry.mimeType) === ""
        ) {
          entry.codecWarning = `Browser reports ${entry.mimeType} may be unsupported`;

          console.warn("[MediaPool]", entry.codecWarning, entry.name);
        }

        video.src = entry.src;

        video.load();

        let done = false;

        const finish = () => {
          if (done) return;

          done = true;

          entry.thumb = entry.thumbnails?.[0] || entry.thumb;

          try {
            video.pause();
            video.removeAttribute("src");
            video.load();
          } catch (_) {}

          resolve();
        };

        video.addEventListener(
          "loadedmetadata",
          async () => {
            entry.duration = Number.isFinite(video.duration)
              ? video.duration
              : 0;

            entry.mediaWidth = video.videoWidth || 0;

            entry.mediaHeight = video.videoHeight || 0;

            const duration = Math.max(0.01, entry.duration || 1);

            const sampleCount = Math.min(
              8,
              Math.max(3, Math.ceil(duration / 4)),
            );

            const times = Array.from(
              {
                length: sampleCount,
              },
              (_, index) =>
                Math.min(
                  Math.max(
                    0.01,
                    duration * (index / Math.max(1, sampleCount - 1)),
                  ),
                  Math.max(0.01, duration - 0.03),
                ),
            );

            entry.thumbnails = [];

            for (const time of times) {
              try {
                await this._seekVideo(video, time);

                const thumbnail = this._captureSource(
                  video,
                  video.videoWidth,
                  video.videoHeight,
                );

                if (thumbnail) {
                  entry.thumbnails.push(thumbnail);
                }
              } catch (_) {
                break;
              }
            }

            finish();
          },
          { once: true },
        );

        video.addEventListener("error", reject, { once: true });

        setTimeout(finish, 7000);
      });
    }

    _seekVideo(video, time) {
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          video.removeEventListener("seeked", onSeek);

          video.removeEventListener("error", onError);
        };

        const onSeek = () => {
          cleanup();
          resolve();
        };

        const onError = () => {
          cleanup();

          reject(new Error("seek failed"));
        };

        video.addEventListener("seeked", onSeek, { once: true });

        video.addEventListener("error", onError, { once: true });

        try {
          video.currentTime = time;
        } catch (error) {
          cleanup();
          reject(error);
        }
      });
    }

    async _hydrateAudio(entry, file) {
      const AudioContextClass =
        global.AudioContext || global.webkitAudioContext;

      if (!AudioContextClass || !file) {
        return;
      }

      this._audioContext = this._audioContext || new AudioContextClass();

      const buffer = await file.arrayBuffer();

      const audio = await this._audioContext.decodeAudioData(buffer.slice(0));

      entry.duration = audio.duration || 0;

      const channel = audio.getChannelData(0);

      const bucketCount = 1600;

      const stride = Math.max(1, Math.floor(channel.length / bucketCount));

      const peaks = new Float32Array(
        Math.min(bucketCount, Math.ceil(channel.length / stride)),
      );

      for (let index = 0; index < peaks.length; index++) {
        const start = index * stride;

        const end = Math.min(channel.length, start + stride);

        let peak = 0;

        for (let sample = start; sample < end; sample++) {
          peak = Math.max(peak, Math.abs(channel[sample]));
        }

        peaks[index] = peak;
      }

      entry.audioPeaks = Array.from(peaks);
    }

    /* ==============================================================
           PROJECT MEDIA OPERATIONS
           ============================================================== */

    removeMedia(id, options = {}) {
      const entry = this.media.find((media) => media.id === id);

      if (!entry) return null;

      const file = this._runtimeFiles.get(id);

      this._runtimeFiles.delete(id);

      if (entry.src && this._objectUrls.has(entry.src)) {
        try {
          URL.revokeObjectURL(entry.src);
        } catch (_) {}

        this._objectUrls.delete(entry.src);
      }

      let removed;

      if (this.project?.removeMedia) {
        removed = this.project.removeMedia(id, {
          removeClips: options.removeClips === true,
        });
      } else {
        const index = this.media.findIndex((media) => media.id === id);

        removed = index >= 0 ? this.media.splice(index, 1)[0] : null;
      }

      this.render();
      global.sequencerManager?.renderer?.render?.();

      return removed;
    }

    getMedia(id) {
      return this.media.find((media) => media.id === id) || null;
    }

    setFilter(filter) {
      if (!["all", "video", "image", "audio"].includes(filter)) {
        return false;
      }

      this.filter = filter;

      this._saveUIState();
      this.render();

      return true;
    }

    /* ==============================================================
           RENDER
           ============================================================== */

    render() {
      this._ensureProfessionalDOM();

      if (!this.grid) return;

      this._syncControls();
      this._renderBins();

      const visible = this._visibleMedia();

      this.grid.classList.toggle("list-view", this.viewMode === "list");

      this.grid.classList.toggle("grid-view", this.viewMode !== "list");

      this.grid.innerHTML = "";

      if (!this.media.length) {
        this.grid.appendChild(
          this._emptyState(
            "Media Pool is empty",
            "Import video, image or audio files to begin editing.",
            "import",
          ),
        );

        this._updateStatus(visible);

        return;
      }

      if (!visible.length) {
        this.grid.appendChild(
          this._emptyState(
            "No matching media",
            this.query
              ? `No results for "${this.query}".`
              : "No media matches the active filters.",
            "search",
          ),
        );

        this._updateStatus(visible);

        return;
      }

      if (this.viewMode === "list") {
        this.grid.appendChild(this._buildListHeader());
      }

      const fragment = document.createDocumentFragment();

      visible.forEach((entry) => fragment.appendChild(this._buildCell(entry)));

      this.grid.appendChild(fragment);

      this._updateStatus(visible);
    }

    _buildCell(entry) {
      const cell = document.createElement("article");

      cell.className = "media-item";

      cell.dataset.id = entry.id;

      cell.dataset.type = entry.mediaType || "media";

      cell.draggable = true;

      cell.tabIndex = 0;

      cell.classList.toggle("selected", this.selectedIds.has(entry.id));

      if (entry.status === "loading") {
        cell.classList.add("loading");
      }

      if (entry.persistence?.requiresRelink) {
        cell.classList.add("offline");
      }

      const preview = this._buildPreview(entry);

      const name = document.createElement("div");

      name.className = "media-item-name";

      name.textContent = entry.name || "Untitled Media";

      name.title = entry.name || "";

      const duration = entry.duration ? this._time(entry.duration) : "—";

      const resolution = entry.mediaWidth
        ? `${entry.mediaWidth}×${entry.mediaHeight}`
        : "—";

      const typeLabel = String(entry.mediaType || "media").toUpperCase();

      const meta = document.createElement("div");

      meta.className = "media-item-meta";

      meta.innerHTML = `
                <span class="media-meta-type">
                    ${this._typeIcon(entry.mediaType)}
                    ${this._esc(typeLabel)}
                </span>

                <span class="media-meta-duration">
                    ${this._esc(duration)}
                </span>

                <span class="media-meta-resolution">
                    ${this._esc(resolution)}
                </span>

                <span class="media-meta-size">
                    ${this._esc(
                      this._formatBytes(entry.metadata?.fileSize || 0),
                    )}
                </span>
            `;

      const info = document.createElement("div");

      info.className = "media-item-info";

      info.append(name, meta);

      const actions = document.createElement("div");

      actions.className = "media-item-actions";

      actions.innerHTML = `
                <button
                    type="button"
                    data-media-add="${this._esc(entry.id)}"
                    title="Add to Timeline">
                    ${this._svg("timeline-plus")}
                </button>

                <button
                    type="button"
                    data-media-action="item-menu"
                    data-media-id="${this._esc(entry.id)}"
                    title="Media Options">
                    ${this._svg("more")}
                </button>
            `;

      cell.append(preview, info, actions);

      return cell;
    }

    _visibleMedia() {
      const query = String(this.query || "")
        .trim()
        .toLowerCase();

      let visible = this.media.filter((entry) => {
        const binMatches =
          this.activeBinId === "master"
            ? true
            : (entry.binId || "master") === this.activeBinId;

        const typeMatches =
          this.filter === "all" || entry.mediaType === this.filter;

        const searchMatches =
          !query ||
          [
            entry.name,
            entry.mediaType,
            entry.mimeType,
            entry.metadata?.fileName,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query);

        return binMatches && typeMatches && searchMatches;
      });

      const direction = this.sortDirection === "desc" ? -1 : 1;

      const number = (value) => Number(value) || 0;

      const text = (value) => String(value || "").toLowerCase();

      visible = visible.slice().sort((a, b) => {
        let result = 0;

        if (this.sortBy === "type") {
          result = text(a.mediaType).localeCompare(text(b.mediaType));
        } else if (this.sortBy === "duration") {
          result = number(a.duration) - number(b.duration);
        } else if (this.sortBy === "resolution") {
          result =
            number(a.mediaWidth) * number(a.mediaHeight) -
            number(b.mediaWidth) * number(b.mediaHeight);
        } else if (this.sortBy === "date") {
          result =
            number(a.importedAt || a.metadata?.lastModified) -
            number(b.importedAt || b.metadata?.lastModified);
        } else {
          result = text(a.name).localeCompare(text(b.name));
        }

        if (result === 0) {
          result = text(a.name).localeCompare(text(b.name));
        }

        return result * direction;
      });

      return visible;
    }

    _renderBins() {
      const host = this.content?.querySelector("[data-media-bin-list]");

      if (!host) return;

      host.innerHTML = "";

      const fragment = document.createDocumentFragment();

      this.bins.forEach((bin) => {
        const count =
          bin.id === "master"
            ? this.media.length
            : this.media.filter((entry) => (entry.binId || "master") === bin.id)
                .length;

        const row = document.createElement("button");

        row.type = "button";

        row.className = "sm-media-bin-row";

        row.dataset.mediaBinId = bin.id;

        row.classList.toggle("active", bin.id === this.activeBinId);

        row.innerHTML = `
                        <span class="sm-media-bin-icon">
                            ${this._svg(
                              bin.id === "master" ? "master-bin" : "folder",
                            )}
                        </span>

                        <span class="sm-media-bin-name">
                            ${this._esc(bin.name)}
                        </span>

                        <span class="sm-media-bin-count">
                            ${count}
                        </span>
                    `;

        fragment.appendChild(row);
      });

      host.appendChild(fragment);
    }

    _syncControls() {
      if (!this.content) return;

      this.content
        .querySelectorAll("[data-media-filter]")
        .forEach((button) =>
          button.classList.toggle(
            "active",
            button.dataset.mediaFilter === this.filter,
          ),
        );

      this.content
        .querySelectorAll("[data-media-view]")
        .forEach((button) =>
          button.classList.toggle(
            "active",
            button.dataset.mediaView === this.viewMode,
          ),
        );

      const search = this.content.querySelector("[data-media-search]");

      if (search && search.value !== this.query) {
        search.value = this.query;
      }

      const sort = this.content.querySelector("[data-media-sort]");

      if (sort) {
        sort.value = this.sortBy;
      }

      const sortDirection = this.content.querySelector(
        '[data-media-action="sort-direction"]',
      );

      if (sortDirection) {
        sortDirection.innerHTML = this._svg(
          this.sortDirection === "desc" ? "sort-desc" : "sort-asc",
        );
      }

      const currentBin = this.bins.find((bin) => bin.id === this.activeBinId);

      const title = this.content.querySelector("[data-media-current-bin]");

      if (title) {
        title.textContent = currentBin?.name || "Master";
      }
    }

    _updateStatus(visible) {
      if (!this.content) return;

      const summary = this.content.querySelector(
        "[data-media-browser-summary]",
      );

      if (summary) {
        const typeCounts = visible.reduce((counts, entry) => {
          counts[entry.mediaType] = (counts[entry.mediaType] || 0) + 1;

          return counts;
        }, {});

        summary.textContent = [
          `${visible.length} item${visible.length === 1 ? "" : "s"}`,
          typeCounts.video ? `${typeCounts.video} video` : "",
          typeCounts.image ? `${typeCounts.image} image` : "",
          typeCounts.audio ? `${typeCounts.audio} audio` : "",
        ]
          .filter(Boolean)
          .join(" · ");
      }

      const status = this.content.querySelector("[data-media-pool-status]");

      if (status) {
        const loading = this.media.filter(
          (entry) => entry.status === "loading",
        ).length;

        status.textContent = loading
          ? `Analyzing ${loading} media file${loading === 1 ? "" : "s"}…`
          : `${this.media.length} media item${this.media.length === 1 ? "" : "s"} · ${this.bins.length} bin${this.bins.length === 1 ? "" : "s"}`;
      }

      const selected = this.content.querySelector(
        "[data-media-selection-status]",
      );

      if (selected) {
        selected.textContent = `${this.selectedIds.size} selected`;
      }
    }

    _buildPreview(entry) {
      const preview = document.createElement("div");

      preview.className = "media-item-preview";

      if (entry.mediaType === "audio") {
        preview.classList.add("audio-preview");

        const canvas = document.createElement("canvas");

        canvas.width = 320;

        canvas.height = 180;

        canvas.className = "media-audio-waveform";

        preview.appendChild(canvas);

        requestAnimationFrame(() => this._drawAudioWaveform(canvas, entry));
      } else if (entry.thumb) {
        const image = document.createElement("img");

        image.src = entry.thumb;

        image.loading = "lazy";

        image.alt = entry.name || "";

        preview.appendChild(image);
      } else if (entry.mediaType === "image") {
        const image = document.createElement("img");

        image.src = entry.src;

        image.loading = "lazy";

        image.alt = entry.name || "";

        preview.appendChild(image);
      } else if (entry.mediaType === "video") {
        const fallback = document.createElement("div");

        fallback.className = "media-preview-fallback";

        fallback.innerHTML = this._svg("video");

        preview.appendChild(fallback);
      }

      const badges = document.createElement("div");

      badges.className = "media-preview-badges";

      const duration = entry.duration ? this._time(entry.duration) : "";

      badges.innerHTML = `
                <span class="media-preview-type">
                    ${this._typeIcon(entry.mediaType)}
                </span>

                ${
                  duration
                    ? `
                        <span class="media-preview-duration">
                            ${this._esc(duration)}
                        </span>
                    `
                    : ""
                }
            `;

      preview.appendChild(badges);

      if (entry.status === "loading") {
        const loading = document.createElement("div");

        loading.className = "media-preview-loading";

        loading.innerHTML = `
                    <span class="sm-media-spinner"></span>
                    <em>Analyzing</em>
                `;

        preview.appendChild(loading);
      }

      if (entry.persistence?.requiresRelink) {
        const offline = document.createElement("div");

        offline.className = "media-preview-offline";

        offline.innerHTML = `
                    ${this._svg("unlink")}
                    <span>RELINK</span>
                `;

        preview.appendChild(offline);
      }

      return preview;
    }

    _drawAudioWaveform(canvas, entry) {
      const context = canvas.getContext("2d");

      if (!context) return;

      const width = canvas.width;

      const height = canvas.height;

      context.clearRect(0, 0, width, height);

      const peaks = Array.isArray(entry.audioPeaks) ? entry.audioPeaks : [];

      context.fillStyle =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--secondary-dark")
          .trim() || "#3c3c3c";

      context.fillRect(0, 0, width, height);

      context.strokeStyle =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--text-secondary")
          .trim() || "#b0b0b0";

      context.globalAlpha = 0.75;

      context.lineWidth = 1;

      context.beginPath();

      const center = height / 2;

      if (!peaks.length) {
        context.moveTo(12, center);

        context.lineTo(width - 12, center);
      } else {
        const samples = Math.min(width - 24, peaks.length);

        for (let index = 0; index < samples; index++) {
          const peak =
            Number(
              peaks[
                Math.floor(
                  (index / Math.max(1, samples - 1)) * (peaks.length - 1),
                )
              ],
            ) || 0;

          const x = 12 + index;

          const amplitude = Math.max(1, peak * height * 0.38);

          context.moveTo(x, center - amplitude);

          context.lineTo(x, center + amplitude);
        }
      }

      context.stroke();
      context.globalAlpha = 1;
    }

    _buildListHeader() {
      const row = document.createElement("div");

      row.className = "sm-media-list-header";

      row.innerHTML = `
                <span>Clip Name</span>
                <span>Type</span>
                <span>Duration</span>
                <span>Resolution</span>
                <span>Size</span>
                <span></span>
            `;

      return row;
    }

    _emptyState(title, text, icon) {
      const empty = document.createElement("div");

      empty.className = "sm-media-empty";

      empty.setAttribute("data-media-empty", "");

      empty.innerHTML = `
                <span class="sm-media-empty-icon">
                    ${this._svg(icon)}
                </span>

                <strong>${this._esc(title)}</strong>
                <em>${this._esc(text)}</em>

                <button
                    type="button"
                    data-media-action="import"
                    class="sm-media-empty-import">
                    ${this._svg("import")}
                    <span>Import Media</span>
                </button>
            `;

      return empty;
    }

    setViewMode(mode) {
      if (!["grid", "list"].includes(mode)) {
        return false;
      }

      this.viewMode = mode;

      this._saveUIState();
      this.render();

      return true;
    }

    toggleSortDirection() {
      this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";

      this._saveUIState();
      this.render();

      return this.sortDirection;
    }

    selectMedia(id, options = {}) {
      const entry = this.getMedia(id);

      if (!entry) return false;

      if (options.range && this.selectedIds.size) {
        const visible = this._visibleMedia();

        const primaryId = [...this.selectedIds][this.selectedIds.size - 1];

        const from = visible.findIndex((media) => media.id === primaryId);

        const to = visible.findIndex((media) => media.id === id);

        if (from >= 0 && to >= 0) {
          if (!options.additive) {
            this.selectedIds.clear();
          }

          const start = Math.min(from, to);

          const end = Math.max(from, to);

          visible
            .slice(start, end + 1)
            .forEach((media) => this.selectedIds.add(media.id));
        }
      } else if (options.additive) {
        if (this.selectedIds.has(id)) {
          this.selectedIds.delete(id);
        } else {
          this.selectedIds.add(id);
        }
      } else {
        this.selectedIds.clear();
        this.selectedIds.add(id);
      }

      if (this.project?.state?.selection) {
        this.project.state.selection.mediaId = this.selectedIds.has(id)
          ? id
          : [...this.selectedIds][0] || null;
      }

      this.project?.touch?.(
        "selection.media",
        {
          mediaId: this.project?.state?.selection?.mediaId || null,
          mediaIds: [...this.selectedIds],
        },
        {
          dirty: false,
          autosave: false,
        },
      );

      this.render();

      try {
        global.dispatchEvent(
          new CustomEvent("videoMediaPoolSelectionChanged", {
            detail: {
              ids: [...this.selectedIds],
              primary: this.project?.state?.selection?.mediaId || null,
            },
          }),
        );
      } catch (_) {}

      return true;
    }

    selectAllVisible() {
      this.selectedIds = new Set(this._visibleMedia().map((entry) => entry.id));

      this.render();

      return [...this.selectedIds];
    }

    removeSelected() {
      const ids = [...this.selectedIds];

      if (!ids.length) {
        return false;
      }

      const accepted = global.confirm
        ? global.confirm(
            `Remove ${ids.length} selected media item${ids.length === 1 ? "" : "s"} from Media Pool?`,
          )
        : true;

      if (!accepted) {
        return false;
      }

      ids.forEach((id) => this.removeMedia(id));

      this.selectedIds.clear();

      this.render();

      return true;
    }

    renameMedia(id, name = null) {
      const entry = this.getMedia(id);

      if (!entry) {
        return false;
      }

      const nextName = String(
        name || global.prompt?.("Rename Media", entry.name) || "",
      ).trim();

      if (!nextName) {
        return false;
      }

      this._updateProjectMedia(id, {
        name: nextName,
      });

      this.project?.touch?.("media.rename", {
        id,
        name: nextName,
      });

      this.render();

      return true;
    }

    _handleAction(action, button) {
      if (action === "import") {
        this.triggerImport();
      } else if (action === "new-bin") {
        this.createBin();
      } else if (action === "clear-search") {
        this.query = "";
        this._saveUIState();
        this.render();
      } else if (action === "sort-direction") {
        this.toggleSortDirection();
      } else if (action === "select-all") {
        this.selectAllVisible();
      } else if (action === "remove-selected") {
        this.removeSelected();
      } else if (action === "item-menu") {
        const id = button.dataset.mediaId;

        const rect = button.getBoundingClientRect();

        this._openMediaContextMenu(rect.right, rect.bottom, id);
      }
    }

    _openMediaContextMenu(x, y, id) {
      const source = this.getMedia(id);

      if (!source) return;

      const ids = this.selectedIds.has(id) ? [...this.selectedIds] : [id];

      const menu = this._openContextMenu(x, y);

      const add = this._menuButton("Add to Timeline", "timeline-plus", () => {
        ids.forEach((mediaId) => this.addToCanvas(mediaId));
      });

      const rename = this._menuButton("Rename", "rename", () =>
        this.renameMedia(id),
      );

      const move = document.createElement("div");

      move.className = "sm-media-context-subgroup";

      const moveLabel = document.createElement("span");

      moveLabel.textContent = "MOVE TO BIN";

      move.appendChild(moveLabel);

      this.bins.forEach((bin) => {
        const button = this._menuButton(
          bin.name,
          bin.id === "master" ? "master-bin" : "folder",
          () => this.moveMediaToBin(ids, bin.id),
        );

        move.appendChild(button);
      });

      const remove = this._menuButton(
        ids.length > 1
          ? `Remove ${ids.length} Items`
          : "Remove from Media Pool",
        "trash",
        () => this.removeSelected(),
      );

      menu.append(
        add,
        rename,
        this._menuSeparator(),
        move,
        this._menuSeparator(),
        remove,
      );

      this._positionContextMenu(menu, x, y);
    }

    _openBinContextMenu(x, y, id) {
      const bin = this.bins.find((candidate) => candidate.id === id);

      if (!bin) return;

      const menu = this._openContextMenu(x, y);

      menu.append(
        this._menuButton("Rename Bin", "rename", () => this.renameBin(id)),

        this._menuSeparator(),

        this._menuButton("Delete Bin", "trash", () => this.removeBin(id)),
      );

      this._positionContextMenu(menu, x, y);
    }

    _openContextMenu() {
      this._closeContextMenu();

      const menu = document.createElement("div");

      menu.className = "sm-media-context-menu";

      menu.addEventListener("click", (event) => {
        if (event.target.closest("button")) {
          setTimeout(() => this._closeContextMenu(), 0);
        }
      });

      document.body.appendChild(menu);

      this._contextMenu = menu;

      setTimeout(() => {
        const close = (event) => {
          if (!menu.contains(event.target)) {
            this._closeContextMenu();
            document.removeEventListener("pointerdown", close, true);
          }
        };

        document.addEventListener("pointerdown", close, true);
      }, 0);

      return menu;
    }

    _positionContextMenu(menu, x, y) {
      requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();

        menu.style.left = `${Math.max(
          4,
          Math.min(global.innerWidth - rect.width - 4, x),
        )}px`;

        menu.style.top = `${Math.max(
          4,
          Math.min(global.innerHeight - rect.height - 4, y),
        )}px`;
      });
    }

    _closeContextMenu() {
      this._contextMenu?.remove?.();

      this._contextMenu = null;
    }

    _menuButton(label, icon, callback) {
      const button = document.createElement("button");

      button.type = "button";

      button.innerHTML = `
                <span>${this._svg(icon)}</span>
                <strong>${this._esc(label)}</strong>
            `;

      button.addEventListener("click", callback);

      return button;
    }

    _menuSeparator() {
      const separator = document.createElement("div");

      separator.className = "sm-media-context-separator";

      return separator;
    }

    _formatBytes(bytes) {
      const value = Number(bytes) || 0;

      if (!value) {
        return "—";
      }

      if (value < 1024) {
        return `${value} B`;
      }

      if (value < 1024 * 1024) {
        return `${(value / 1024).toFixed(1)} KB`;
      }

      if (value < 1024 * 1024 * 1024) {
        return `${(value / 1024 / 1024).toFixed(1)} MB`;
      }

      return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
    }

    _typeIcon(type) {
      const icon =
        type === "video"
          ? "video"
          : type === "image"
            ? "image"
            : type === "audio"
              ? "audio"
              : "file";

      return `
                <span class="media-type-icon">
                    ${this._svg(icon)}
                </span>
            `;
    }

    _esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    _svg(name) {
      const icons = {
        import:
          '<svg viewBox="0 0 24 24"><path d="M12 4v10M8 10l4 4 4-4"/><path d="M5 18h14v2H5z"/></svg>',
        folder: '<svg viewBox="0 0 24 24"><path d="M3 6h7l2 2h9v11H3z"/></svg>',
        "folder-plus":
          '<svg viewBox="0 0 24 24"><path d="M3 6h7l2 2h9v11H3z"/><path d="M15 11v5M12.5 13.5h5"/></svg>',
        "master-bin":
          '<svg viewBox="0 0 24 24"><path d="M3 6h7l2 2h9v11H3z"/><path d="M7 12h10M7 15h7"/></svg>',
        search:
          '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>',
        close:
          '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        grid: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/></svg>',
        list: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="5" cy="6" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="18" r="1"/></svg>',
        "sort-asc":
          '<svg viewBox="0 0 24 24"><path d="M8 5v14M5 8l3-3 3 3"/><path d="M14 7h6M14 12h5M14 17h4"/></svg>',
        "sort-desc":
          '<svg viewBox="0 0 24 24"><path d="M8 19V5M5 16l3 3 3-3"/><path d="M14 7h4M14 12h5M14 17h6"/></svg>',
        plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
        select:
          '<svg viewBox="0 0 24 24"><path d="M5 5h5M14 5h5v5M19 14v5h-5M10 19H5v-5"/><path d="M8 12l3 3 6-7"/></svg>',
        trash:
          '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M7 7l1 14h8l1-14"/></svg>',
        video:
          '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="12" height="12"/><path d="M16 10l4-3v10l-4-3z"/></svg>',
        image:
          '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14"/><circle cx="9" cy="10" r="2"/><path d="M5 17l5-5 3 3 2-2 4 4"/></svg>',
        audio:
          '<svg viewBox="0 0 24 24"><path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 10v4"/></svg>',
        file: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/></svg>',
        "timeline-plus":
          '<svg viewBox="0 0 24 24"><path d="M4 7h12v10H4z"/><path d="M18 10v8M14 14h8"/></svg>',
        more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
        rename:
          '<svg viewBox="0 0 24 24"><path d="M5 19l4-1 9-9-3-3-9 9z"/><path d="M13 8l3 3"/></svg>',
        unlink:
          '<svg viewBox="0 0 24 24"><path d="M9 8l-2-2a4 4 0 0 0-6 6l3 3a4 4 0 0 0 6 0l1-1"/><path d="M15 16l2 2a4 4 0 0 0 6-6l-3-3a4 4 0 0 0-6 0l-1 1"/><path d="M4 4l16 16"/></svg>',
      };

      return icons[name] || icons.file;
    }

    _time(time) {
      const fps = global.videoProject?.settings?.fps || 30;

      const minutes = Math.floor(time / 60);

      const seconds = Math.floor(time % 60);

      const frames = Math.floor((time % 1) * fps);

      return [minutes, seconds, frames]
        .map((value) => String(value).padStart(2, "0"))
        .join(":");
    }

    /* ==============================================================
           ADD SOURCE TO EDIT
           ============================================================== */

    addToCanvas(id) {
      const source = this.getMedia(id);

      if (!source) return null;

      const manager = global.ensureVideoEditingManager?.();

      if (!manager) return null;

      if (!manager.active) {
        manager.enter?.();
      }

      // VEM creates a runtime compositor item. Its sourceMediaId keeps
      // the permanent link to videoProject.media.
      const result = manager.addMedia(source);

      if (result) {
        result.sourceMediaId = source.id;
      }

      this.selectMedia(source.id);

      try {
        global.dispatchEvent(
          new CustomEvent("videoMediaPoolAddedToTimeline", {
            detail: {
              mediaId: source.id,
              item: result,
            },
          }),
        );
      } catch (_) {}

      return result;
    }

    _styles() {
      if (document.getElementById("sm-media-pool-professional-style")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "sm-media-pool-professional-style";

      style.textContent = `
                #media-pool-content.sm-media-pool-pro{
                    padding:0!important;
                    overflow:hidden!important;
                    background:var(--panel-bg,var(--primary-dark,#333333));
                    color:var(--text-primary,#ffffff);
                }

                .sm-media-pool-shell{
                    height:100%;
                    min-height:220px;
                    display:grid;
                    grid-template-rows:34px 30px minmax(0,1fr) 22px;
                    overflow:hidden;
                    background:var(--panel-bg,var(--primary-dark,#333333));
                }

                .sm-media-pool-shell *,
                .sm-media-pool-shell *::before,
                .sm-media-pool-shell *::after{
                    box-sizing:border-box;
                }

                .sm-media-pool-shell svg,
                .sm-media-context-menu svg{
                    width:100%;
                    height:100%;
                    fill:none;
                    stroke:currentColor;
                    stroke-width:1.55;
                    stroke-linecap:round;
                    stroke-linejoin:round;
                }

                .sm-media-pool-commandbar,
                .sm-media-pool-subbar{
                    display:flex;
                    align-items:center;
                    gap:5px;
                    padding:0 5px;
                    border-bottom:1px solid var(--border-color,#4d4d4d81);
                    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
                }

                .sm-media-pool-commandbar{
                    justify-content:space-between;
                }

                .sm-media-command-left,
                .sm-media-command-right,
                .sm-media-sort,
                .sm-media-browser-actions{
                    display:flex;
                    align-items:center;
                    gap:2px;
                }

                .sm-media-icon-button,
                .sm-media-bin-header button,
                .sm-media-browser-actions button,
                .media-item-actions button{
                    height:23px;
                    min-width:23px;
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    gap:5px;
                    padding:0 5px;
                    border:1px solid transparent;
                    border-radius:0;
                    background:transparent;
                    color:var(--text-secondary,#b0b0b0);
                    cursor:pointer;
                }

                .sm-media-icon-button svg,
                .sm-media-bin-header button svg,
                .sm-media-browser-actions button svg,
                .media-item-actions button svg{
                    width:13px;
                    height:13px;
                }

                .sm-media-icon-button:hover,
                .sm-media-icon-button.active,
                .sm-media-bin-header button:hover,
                .sm-media-browser-actions button:hover,
                .media-item-actions button:hover{
                    border-color:var(--border-color,#4d4d4d81);
                    background:var(--button-hover-bg,var(--accent-blue-dark,#474747));
                    color:var(--text-primary,#ffffff);
                }

                .sm-media-import-button{
                    border-color:var(--border-color,#4d4d4d81);
                    background:var(--bg-button,#363636);
                    color:var(--text-primary,#ffffff);
                    font-size:7px;
                    font-weight:600;
                }

                .sm-media-import-button span{
                    white-space:nowrap;
                }

                .sm-media-icon-button.compact{
                    min-width:21px;
                    width:21px;
                    padding:4px;
                }

                .sm-media-search{
                    min-width:90px;
                    flex:1;
                    max-width:280px;
                    height:23px;
                    display:grid;
                    grid-template-columns:22px minmax(0,1fr) 20px;
                    align-items:center;
                    border:1px solid var(--input-border,var(--border-color,#4d4d4d81));
                    background:var(--input-bg,var(--primary-dark,#333333));
                }

                .sm-media-search:focus-within{
                    border-color:var(--accent-blue,#5f5f5f);
                }

                .sm-media-search>span{
                    width:12px;
                    height:12px;
                    justify-self:center;
                    color:var(--text-secondary,#b0b0b0);
                }

                .sm-media-search input{
                    width:100%;
                    height:21px;
                    border:0;
                    outline:0;
                    background:transparent;
                    color:var(--text-primary,#ffffff);
                    font:inherit;
                    font-size:7px;
                }

                .sm-media-search button{
                    width:19px;
                    height:19px;
                    padding:5px;
                    border:0;
                    background:transparent;
                    color:var(--text-secondary,#b0b0b0);
                    cursor:pointer;
                }

                .sm-media-pool-subbar{
                    justify-content:space-between;
                    background:var(--secondary-dark,#3c3c3c);
                }

                .media-pool-filters{
                    display:flex;
                    align-items:center;
                    gap:2px;
                    min-width:0;
                    overflow-x:auto;
                    scrollbar-width:none;
                }

                .media-pool-filters::-webkit-scrollbar{
                    display:none;
                }

                #media-pool-content .panel-button-set{
                    height:21px;
                    min-width:36px;
                    padding:0 6px;
                    border:1px solid transparent;
                    border-radius:0;
                    background:transparent;
                    color:var(--text-secondary,#b0b0b0);
                    font-size:7px;
                    cursor:pointer;
                }

                #media-pool-content .panel-button-set:hover,
                #media-pool-content .panel-button-set.active{
                    border-color:var(--border-color,#4d4d4d81);
                    background:var(--accent-blue-dark,#474747);
                    color:var(--text-primary,#ffffff);
                }

                .sm-media-sort select{
                    height:21px;
                    max-width:90px;
                    border:1px solid var(--input-border,var(--border-color,#4d4d4d81));
                    border-radius:0;
                    background:var(--input-bg,var(--primary-dark,#333333));
                    color:var(--text-secondary,#b0b0b0);
                    font:inherit;
                    font-size:7px;
                }

                .sm-media-pool-workspace{
                    min-height:0;
                    display:grid;
                    grid-template-columns:96px minmax(0,1fr);
                    overflow:hidden;
                }

                .sm-media-bin-panel{
                    min-width:0;
                    display:grid;
                    grid-template-rows:27px minmax(0,1fr);
                    overflow:hidden;
                    border-right:1px solid var(--border-color,#4d4d4d81);
                    background:var(--primary-dark,#333333);
                }

                .sm-media-bin-header{
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    padding:0 4px 0 7px;
                    border-bottom:1px solid var(--border-color,#4d4d4d40);
                    color:var(--text-secondary,#b0b0b0);
                    font-size:7px;
                    font-weight:700;
                    letter-spacing:.35px;
                }

                .sm-media-bin-header button{
                    width:20px;
                    height:20px;
                    min-width:20px;
                    padding:4px;
                }

                .sm-media-bin-list{
                    min-height:0;
                    overflow:auto;
                    padding:3px;
                }

                .sm-media-bin-row{
                    width:100%;
                    min-height:25px;
                    display:grid;
                    grid-template-columns:16px minmax(0,1fr) auto;
                    align-items:center;
                    gap:4px;
                    padding:0 5px;
                    border:1px solid transparent;
                    border-radius:0;
                    background:transparent;
                    color:var(--text-secondary,#b0b0b0);
                    text-align:left;
                    cursor:pointer;
                }

                .sm-media-bin-row:hover,
                .sm-media-bin-row.active{
                    border-color:var(--border-color,#4d4d4d81);
                    background:var(--accent-blue-dark,#474747);
                    color:var(--text-primary,#ffffff);
                }

                .sm-media-bin-icon{
                    width:13px;
                    height:13px;
                }

                .sm-media-bin-name{
                    min-width:0;
                    overflow:hidden;
                    text-overflow:ellipsis;
                    white-space:nowrap;
                    font-size:7px;
                }

                .sm-media-bin-count{
                    color:var(--text-secondary,#b0b0b0);
                    font-size:6px;
                }

                .sm-media-browser{
                    min-width:0;
                    min-height:0;
                    display:grid;
                    grid-template-rows:30px minmax(0,1fr);
                    overflow:hidden;
                    background:var(--panel-bg,var(--primary-dark,#333333));
                }

                .sm-media-browser-header{
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    gap:6px;
                    padding:0 5px 0 7px;
                    border-bottom:1px solid var(--border-color,#4d4d4d40);
                    background:var(--panel-bg,#333333);
                }

                .sm-media-browser-header>div:first-child{
                    min-width:0;
                }

                .sm-media-browser-header strong,
                .sm-media-browser-header span{
                    display:block;
                    overflow:hidden;
                    text-overflow:ellipsis;
                    white-space:nowrap;
                }

                .sm-media-browser-header strong{
                    font-size:8px;
                }

                .sm-media-browser-header span{
                    margin-top:1px;
                    color:var(--text-secondary,#b0b0b0);
                    font-size:6px;
                }

                .sm-media-browser-actions button{
                    width:20px;
                    min-width:20px;
                    height:20px;
                    padding:4px;
                }

                #media-pool-grid.sm-media-grid{
                    min-width:0;
                    min-height:0;
                    overflow:auto;
                    padding:5px;
                    align-content:start;
                    background:var(--panel-bg,var(--primary-dark,#333333));
                    scrollbar-width:thin;
                    scrollbar-color:var(--accent-blue-dark,#474747) transparent;
                }

                #media-pool-grid.sm-media-grid.grid-view{
                    display:grid;
                    grid-template-columns:repeat(auto-fill,minmax(118px,1fr));
                    gap:5px;
                }

                #media-pool-grid.sm-media-grid.list-view{
                    display:block;
                    padding:0;
                }

                #media-pool-grid.drop-active{
                    outline:1px solid var(--text-secondary,#b0b0b0);
                    outline-offset:-2px;
                }

                .media-item{
                    min-width:0;
                    position:relative;
                    border:1px solid var(--border-color,#4d4d4d81);
                    background:var(--primary-dark,#333333);
                    color:var(--text-primary,#ffffff);
                    cursor:default;
                    user-select:none;
                }

                .media-item:hover{
                    background:var(--secondary-dark,#3c3c3c);
                }

                .media-item.selected{
                    outline:1px solid var(--text-primary,#ffffff);
                    outline-offset:-2px;
                    background:var(--accent-blue-dark,#474747);
                }

                .media-item.dragging{
                    opacity:.45;
                }

                .media-item-preview{
                    position:relative;
                    aspect-ratio:16/9;
                    overflow:hidden;
                    background:var(--secondary-dark,#3c3c3c);
                    border-bottom:1px solid var(--border-color,#4d4d4d40);
                }

                .media-item-preview img,
                .media-audio-waveform{
                    width:100%;
                    height:100%;
                    display:block;
                    object-fit:cover;
                }

                .media-preview-fallback{
                    width:100%;
                    height:100%;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    color:var(--text-secondary,#b0b0b0);
                }

                .media-preview-fallback svg{
                    width:28px;
                    height:28px;
                }

                .media-preview-badges{
                    position:absolute;
                    inset:auto 4px 4px 4px;
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    gap:4px;
                    pointer-events:none;
                }

                .media-preview-type,
                .media-preview-duration{
                    min-height:17px;
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    padding:0 4px;
                    background:rgba(0,0,0,.58);
                    color:#fff;
                    font-size:6px;
                }

                .media-preview-type{
                    width:18px;
                    padding:3px;
                }

                .media-preview-type svg{
                    width:11px;
                    height:11px;
                }

                .media-preview-loading,
                .media-preview-offline{
                    position:absolute;
                    inset:0;
                    display:flex;
                    flex-direction:column;
                    align-items:center;
                    justify-content:center;
                    gap:4px;
                    background:rgba(0,0,0,.56);
                    color:#fff;
                }

                .media-preview-loading em,
                .media-preview-offline span{
                    font-size:6px;
                    font-style:normal;
                    letter-spacing:.25px;
                }

                .media-preview-offline svg{
                    width:20px;
                    height:20px;
                }

                .sm-media-spinner{
                    width:14px;
                    height:14px;
                    border:1px solid rgba(255,255,255,.25);
                    border-top-color:#fff;
                    border-radius:50%;
                    animation:smMediaSpin .8s linear infinite;
                }

                @keyframes smMediaSpin{
                    to{transform:rotate(360deg)}
                }

                .media-item-info{
                    min-width:0;
                    padding:5px 6px;
                }

                .media-item-name{
                    min-width:0;
                    overflow:hidden;
                    text-overflow:ellipsis;
                    white-space:nowrap;
                    font-size:7px;
                    font-weight:600;
                }

                .media-item-meta{
                    display:flex;
                    align-items:center;
                    gap:5px;
                    margin-top:3px;
                    min-width:0;
                    overflow:hidden;
                    color:var(--text-secondary,#b0b0b0);
                    font-size:6px;
                }

                .media-item-meta>span{
                    white-space:nowrap;
                }

                .media-meta-type{
                    display:inline-flex;
                    align-items:center;
                    gap:3px;
                }

                .media-type-icon{
                    width:10px;
                    height:10px;
                    display:inline-flex;
                }

                .media-item-actions{
                    position:absolute;
                    top:3px;
                    right:3px;
                    display:flex;
                    gap:1px;
                    opacity:0;
                    transition:opacity .12s ease;
                }

                .media-item:hover .media-item-actions,
                .media-item.selected .media-item-actions{
                    opacity:1;
                }

                .media-item-actions button{
                    width:21px;
                    min-width:21px;
                    height:20px;
                    padding:4px;
                    border-color:var(--border-color,#4d4d4d81);
                    background:rgba(30,30,30,.82);
                    color:#fff;
                }

                .sm-media-list-header{
                    position:sticky;
                    top:0;
                    z-index:2;
                    min-height:24px;
                    display:grid;
                    grid-template-columns:minmax(140px,2fr) 58px 70px 82px 68px 45px;
                    align-items:center;
                    gap:6px;
                    padding:0 6px;
                    border-bottom:1px solid var(--border-color,#4d4d4d81);
                    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
                    color:var(--text-secondary,#b0b0b0);
                    font-size:6px;
                    font-weight:700;
                }

                .list-view .media-item{
                    min-height:38px;
                    display:grid;
                    grid-template-columns:minmax(140px,2fr) 58px 70px 82px 68px 45px;
                    align-items:center;
                    gap:6px;
                    border-width:0 0 1px 0;
                }

                .list-view .media-item-preview{
                    width:52px;
                    height:29px;
                    aspect-ratio:auto;
                    grid-column:1;
                    grid-row:1;
                    margin-left:5px;
                    border:1px solid var(--border-color,#4d4d4d81);
                }

                .list-view .media-item-info{
                    display:contents;
                    padding:0;
                }

                .list-view .media-item-name{
                    grid-column:1;
                    padding-left:64px;
                    font-size:7px;
                }

                .list-view .media-item-meta{
                    display:contents;
                    margin:0;
                }

                .list-view .media-meta-type{
                    grid-column:2;
                }

                .list-view .media-meta-duration{
                    grid-column:3;
                }

                .list-view .media-meta-resolution{
                    grid-column:4;
                }

                .list-view .media-meta-size{
                    grid-column:5;
                }

                .list-view .media-item-actions{
                    position:static;
                    grid-column:6;
                    opacity:1;
                    justify-content:flex-end;
                    padding-right:3px;
                }

                .list-view .media-preview-badges,
                .list-view .media-preview-loading,
                .list-view .media-preview-offline{
                    display:none;
                }

                .sm-media-empty{
                    min-height:180px;
                    grid-column:1/-1;
                    display:flex;
                    flex-direction:column;
                    align-items:center;
                    justify-content:center;
                    gap:5px;
                    padding:18px;
                    color:var(--text-secondary,#b0b0b0);
                    text-align:center;
                }

                .sm-media-empty-icon{
                    width:28px;
                    height:28px;
                    margin-bottom:3px;
                }

                .sm-media-empty strong{
                    color:var(--text-primary,#ffffff);
                    font-size:9px;
                }

                .sm-media-empty em{
                    max-width:250px;
                    font-style:normal;
                    font-size:7px;
                    line-height:1.5;
                }

                .sm-media-empty-import{
                    min-height:24px;
                    display:flex;
                    align-items:center;
                    gap:5px;
                    margin-top:4px;
                    padding:0 8px;
                    border:1px solid var(--border-color,#4d4d4d81);
                    border-radius:0;
                    background:var(--bg-button,#363636);
                    color:var(--text-primary,#ffffff);
                    font-size:7px;
                    cursor:pointer;
                }

                .sm-media-empty-import svg{
                    width:13px;
                    height:13px;
                }

                .sm-media-pool-status{
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    gap:8px;
                    padding:0 6px;
                    border-top:1px solid var(--border-color,#4d4d4d81);
                    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
                    color:var(--text-secondary,#b0b0b0);
                    font-size:6px;
                }

                .sm-media-context-menu{
                    position:fixed;
                    z-index:12000;
                    min-width:180px;
                    max-width:260px;
                    padding:3px;
                    border:1px solid var(--border-color,#4d4d4d81);
                    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
                    box-shadow:0 8px 24px rgba(0,0,0,.28);
                    color:var(--text-primary,#ffffff);
                }

                .sm-media-context-menu>button,
                .sm-media-context-subgroup>button{
                    width:100%;
                    min-height:25px;
                    display:grid;
                    grid-template-columns:18px minmax(0,1fr);
                    align-items:center;
                    gap:5px;
                    padding:0 6px;
                    border:0;
                    border-radius:0;
                    background:transparent;
                    color:var(--text-secondary,#b0b0b0);
                    text-align:left;
                    cursor:pointer;
                }

                .sm-media-context-menu>button:hover,
                .sm-media-context-subgroup>button:hover{
                    background:var(--button-hover-bg,var(--accent-blue-dark,#474747));
                    color:var(--text-primary,#ffffff);
                }

                .sm-media-context-menu button>span{
                    width:13px;
                    height:13px;
                }

                .sm-media-context-menu button>strong{
                    font-size:7px;
                    font-weight:500;
                }

                .sm-media-context-separator{
                    height:1px;
                    margin:3px 2px;
                    background:var(--border-color,#4d4d4d81);
                }

                .sm-media-context-subgroup>span{
                    display:block;
                    padding:4px 6px 3px;
                    color:var(--text-secondary,#b0b0b0);
                    font-size:6px;
                    font-weight:700;
                    letter-spacing:.35px;
                }


                /* =====================================================
                   PHASE 14 — COMPACT PROFESSIONAL LAYOUT
                   Optimized for the narrow hierarchy column.
                   ===================================================== */

                .sm-media-pool-shell{
                    grid-template-rows:31px 29px minmax(0,1fr) 20px;
                    min-height:180px;
                }

                .sm-media-pool-commandbar{
                    gap:3px;
                    padding:0 4px;
                }

                .sm-media-primary-button{
                    height:23px;
                    display:inline-flex;
                    align-items:center;
                    gap:5px;
                    padding:0 7px;
                    border:1px solid var(--border-color,#4d4d4d81);
                    border-radius:0;
                    background:var(--bg-button,var(--secondary-dark,#3c3c3c));
                    color:var(--text-primary,#fff);
                    font:inherit;
                    font-size:8px;
                    font-weight:600;
                    cursor:pointer;
                }

                .sm-media-primary-button:hover{
                    background:var(--button-hover-bg,var(--accent-blue-dark,#474747));
                }

                .sm-media-primary-button svg{
                    width:12px;
                    height:12px;
                }

                .sm-media-tool-button{
                    width:23px;
                    min-width:23px;
                    height:23px;
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    padding:4px;
                    border:1px solid transparent;
                    border-radius:0;
                    background:transparent;
                    color:var(--text-secondary,#b0b0b0);
                    cursor:pointer;
                }

                .sm-media-tool-button:hover,
                .sm-media-tool-button.active{
                    border-color:var(--border-color,#4d4d4d81);
                    background:var(--accent-blue-dark,#474747);
                    color:var(--text-primary,#fff);
                }

                .sm-media-tool-button svg{
                    width:13px;
                    height:13px;
                }

                .sm-media-search{
                    flex:1 1 110px;
                    min-width:72px;
                    max-width:none;
                    grid-template-columns:20px minmax(0,1fr) 19px;
                }

                .sm-media-search input{
                    font-size:8px;
                }

                #media-pool-content .panel-button-set{
                    min-width:auto;
                    height:21px;
                    padding:0 7px;
                    font-size:8px;
                }

                .sm-media-sort select{
                    max-width:74px;
                    height:21px;
                    font-size:7px;
                }

                .sm-media-pool-workspace{
                    grid-template-columns:76px minmax(0,1fr);
                }

                .sm-media-bin-header{
                    font-size:7px;
                    padding-left:6px;
                }

                .sm-media-bin-row{
                    min-height:25px;
                    padding:0 4px;
                    gap:3px;
                }

                .sm-media-bin-name{
                    font-size:7px;
                }

                .sm-media-browser{
                    grid-template-rows:31px minmax(0,1fr);
                }

                .sm-media-browser-header{
                    padding:0 4px 0 6px;
                }

                .sm-media-browser-title{
                    min-width:0;
                }

                .sm-media-browser-header strong{
                    font-size:8px;
                }

                .sm-media-browser-header span{
                    font-size:6.5px;
                }

                .sm-media-browser-actions{
                    flex:0 0 auto;
                }

                .sm-media-browser-actions button{
                    width:23px;
                    min-width:23px;
                    height:23px;
                    padding:5px;
                }

                #media-pool-grid.sm-media-grid{
                    padding:4px;
                }

                #media-pool-grid.sm-media-grid.grid-view{
                    grid-template-columns:repeat(auto-fill,minmax(88px,1fr));
                    gap:4px;
                }

                .media-item{
                    overflow:hidden;
                }

                .media-item-preview{
                    min-height:54px;
                }

                .media-item-info{
                    padding:5px;
                }

                .media-item-name{
                    font-size:8px;
                    line-height:1.25;
                }

                .media-item-meta{
                    gap:4px;
                    margin-top:3px;
                    font-size:6.5px;
                }

                .media-meta-resolution,
                .media-meta-size{
                    display:none;
                }

                .media-preview-duration{
                    font-size:6.5px;
                }

                .sm-media-pool-status{
                    padding:0 5px;
                    font-size:6.5px;
                }

                .sm-media-empty{
                    min-height:130px;
                    padding:12px;
                }

                .sm-media-empty strong{
                    font-size:9px;
                }

                .sm-media-empty em{
                    font-size:7.5px;
                }

                .list-view .media-meta-resolution,
                .list-view .media-meta-size{
                    display:block;
                }

                .sm-media-list-header,
                .list-view .media-item{
                    grid-template-columns:minmax(105px,2fr) 48px 58px 38px;
                }

                .sm-media-list-header span:nth-child(4),
                .sm-media-list-header span:nth-child(5),
                .list-view .media-meta-resolution,
                .list-view .media-meta-size{
                    display:none;
                }

                .list-view .media-item-actions{
                    grid-column:4;
                }

                @media (max-width:520px){
                    .sm-media-pool-workspace{
                        grid-template-columns:68px minmax(0,1fr);
                    }

                    #media-pool-grid.sm-media-grid.grid-view{
                        grid-template-columns:repeat(auto-fill,minmax(96px,1fr));
                    }

                    .sm-media-import-button span{
                        display:none;
                    }

                    .sm-media-sort select{
                        max-width:64px;
                    }

                    .sm-media-list-header,
                    .list-view .media-item{
                        grid-template-columns:minmax(120px,2fr) 52px 64px 45px;
                    }

                    .sm-media-list-header span:nth-child(4),
                    .sm-media-list-header span:nth-child(5),
                    .list-view .media-meta-resolution,
                    .list-view .media-meta-size{
                        display:none;
                    }

                    .list-view .media-item-actions{
                        grid-column:4;
                    }
                }
            `;

      document.head.appendChild(style);
    }

    destroy() {
      this._unsubProject?.();
      this._unsubProject = null;

      this._closeContextMenu();

      if (this._bound) {
        document.removeEventListener("click", this._onDocumentClick);

        document.removeEventListener("dblclick", this._onDocumentDblClick);

        document.removeEventListener("change", this._onDocumentChange);

        document.removeEventListener("input", this._onDocumentInput);

        document.removeEventListener(
          "contextmenu",
          this._onDocumentContextMenu,
        );

        document.removeEventListener("dragstart", this._onDocumentDragStart);

        document.removeEventListener("dragend", this._onDocumentDragEnd);

        document.removeEventListener("dragover", this._onDocumentDragOver);

        document.removeEventListener("dragleave", this._onDocumentDragLeave);

        document.removeEventListener("drop", this._onDocumentDrop);

        document.removeEventListener("keydown", this._onDocumentKeyDown);

        this._bound = false;
      }

      this._objectUrls.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {}
      });

      this._objectUrls.clear();
      this._runtimeFiles.clear();
      this.selectedIds.clear();

      try {
        this._audioContext?.close?.();
      } catch (_) {}

      this._audioContext = null;
    }
  }

  global.MediaPoolManager = MediaPoolManager;

  global.ensureMediaPoolManager = function ensureMediaPoolManager(project) {
    if (!global.mediaPoolManager) {
      global.mediaPoolManager = new MediaPoolManager(
        project || global.videoProject || null,
      );
    } else if (project && global.mediaPoolManager.project !== project) {
      global.mediaPoolManager.bindProject(project);
    }

    return global.mediaPoolManager;
  };

  const boot = () => {
    global.ensureMediaPoolManager();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})(window);

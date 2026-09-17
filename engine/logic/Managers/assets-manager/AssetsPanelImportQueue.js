// engine/logic/Managers/assets-manager/AssetsPanelImportQueue.js
// SM Engine - professional sequential import queue for AssetsPanel.
//
// Features:
// - Large folder/file imports stay visible instead of closing the dialog.
// - Files appear in a live queue and process ONE BY ONE.
// - Overall progress + current-file pseudo progress.
// - File type summary, current path/size/stage.
// - Pause / Resume / Cancel / Retry Failed.
// - Continue-on-error behavior.
// - Preserves webkitRelativePath folder hierarchy.
// - Supports dropped directories through webkitGetAsEntry when available.
// - Renders only a moving window of rows for large queues (thousands of files).
// - Does NOT replace AssetsPanel._addAssetFromFile(); it orchestrates it.
//
// Recommended load:
//   panels/assetsPanel.js
//   AssetManager.js
//   AssetsPanelImportQueue.js

(function (global) {
  "use strict";

  if (global.SMAssetsPanelImportQueue?.version) return;

  const CFG = Object.freeze({
    version: 1,
    visibleRows: 72,
    progressTickMs: 140,
    bindRetryMs: 250,
    maxBindRetries: 240,
  });

  const state = {
    installed: false,
    attaching: false,
    bindRetries: 0,

    active: false,
    paused: false,
    cancelled: false,
    completed: false,

    jobs: [],
    currentIndex: -1,
    batchName: "",
    folderMode: false,
    baseFolderId: null,
    startedAt: 0,
    finishedAt: 0,

    imported: 0,
    skipped: 0,
    failed: 0,
    cancelledCount: 0,

    currentPseudoProgress: 0,
    progressTimer: 0,

    originalBindInputs: null,
    originalShow: null,
    originalHide: null,
  };

  const $ = (id) => document.getElementById(id);
  const panel = () => global.AssetsPanel || null;

  function injectStyles() {
    if ($("smAssetImportQueueStyles")) return;

    const style = document.createElement("style");
    style.id = "smAssetImportQueueStyles";

    style.textContent = `
#uploadDropzone .cb-import-dialog{
    width:min(760px,calc(100vw - 44px));
    max-height:min(820px,calc(100vh - 56px));
}
#uploadDropzone .cb-import-queue-view{
    padding:0;
    min-height:440px;
    max-height:calc(100vh - 170px);
    overflow:hidden;
    flex-direction:column;
}
#uploadDropzone .cb-import-progress-head{
    padding:16px 18px 12px;
    border-bottom:1px solid rgba(255,255,255,.07);
    background:rgba(255,255,255,.018);
}
#uploadDropzone .cb-import-progress-copy{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:20px;
    margin-bottom:11px;
}
#uploadDropzone .cb-import-progress-title-row{
    display:flex;
    align-items:center;
    gap:11px;
    min-width:0;
}
#uploadDropzone .cb-import-progress-title-row>div:last-child{
    display:flex;
    flex-direction:column;
    gap:3px;
    min-width:0;
}
#uploadDropzone .cb-import-progress-title-row strong{
    color:#f0f2f5;
    font-size:13px;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
}
#uploadDropzone .cb-import-progress-title-row span{
    color:#8e949d;
    font-size:11px;
}
#uploadDropzone .cb-import-progress-stats{
    display:flex;
    align-items:center;
    gap:12px;
    color:#a9afb7;
    font-size:11px;
    white-space:nowrap;
}
#uploadDropzone #uploadPercentText{
    color:#e7ebf0;
    font-size:13px;
}
#uploadDropzone .cb-import-spinner{
    flex:0 0 auto;
    width:20px;
    height:20px;
}
#uploadDropzone .cb-progress-track{
    height:5px;
    border-radius:999px;
    overflow:hidden;
    background:#1c1f24;
    box-shadow:inset 0 0 0 1px rgba(255,255,255,.035);
}
#uploadDropzone .cb-progress-bar{
    width:0%;
    height:100%;
    border-radius:inherit;
    background:linear-gradient(90deg,#5c8fe8,#7da7f0);
    transition:width .18s ease;
}
#uploadDropzone .cb-import-summary{
    display:flex;
    gap:7px;
    flex-wrap:wrap;
    padding:10px 18px;
    border-bottom:1px solid rgba(255,255,255,.06);
}
#uploadDropzone .cb-import-summary-chip{
    display:inline-flex;
    align-items:center;
    gap:6px;
    padding:5px 8px;
    border-radius:5px;
    background:#292d33;
    border:1px solid rgba(255,255,255,.055);
    color:#8e949d;
    font-size:10px;
}
#uploadDropzone .cb-import-summary-chip b{
    color:#d8dde4;
    font-weight:650;
}
#uploadDropzone .cb-import-current-card{
    display:flex;
    gap:12px;
    margin:12px 18px 10px;
    padding:12px;
    border-radius:7px;
    border:1px solid rgba(112,155,226,.2);
    background:linear-gradient(180deg,rgba(75,105,156,.12),rgba(40,44,51,.28));
}
#uploadDropzone .cb-import-current-icon{
    width:42px;
    height:42px;
    flex:0 0 42px;
    display:grid;
    place-items:center;
    border-radius:7px;
    color:#b5c9eb;
    background:#222831;
    border:1px solid rgba(255,255,255,.07);
    font-size:17px;
}
#uploadDropzone .cb-import-current-main{
    min-width:0;
    flex:1;
}
#uploadDropzone .cb-import-current-top,
#uploadDropzone .cb-import-current-stage{
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:12px;
}
#uploadDropzone .cb-import-current-top>div{
    min-width:0;
    display:flex;
    flex-direction:column;
    gap:2px;
}
#uploadDropzone #uploadCurrentFile{
    font-size:12px;
    color:#edf0f4;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
}
#uploadDropzone #uploadCurrentPath{
    color:#747b85;
    font-size:10px;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
}
#uploadDropzone #uploadCurrentSize{
    color:#9299a3;
    font-size:10px;
    white-space:nowrap;
}
#uploadDropzone .cb-import-current-stage{
    margin:8px 0 5px;
    color:#98a0aa;
    font-size:10px;
}
#uploadDropzone #uploadCurrentStage{
    color:#a9bde0;
}
#uploadDropzone .cb-progress-track-file{
    height:4px;
}
#uploadDropzone .cb-import-queue-head{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    padding:7px 18px;
    color:#8e949d;
    font-size:10px;
    border-top:1px solid rgba(255,255,255,.035);
    border-bottom:1px solid rgba(255,255,255,.055);
}
#uploadDropzone .cb-import-queue-head strong{
    color:#cbd0d7;
    font-size:11px;
}
#uploadDropzone .cb-import-queue-list{
    flex:1;
    min-height:170px;
    max-height:310px;
    overflow:auto;
    padding:5px 7px 8px;
    scrollbar-width:thin;
}
#uploadDropzone .cb-import-row{
    min-height:35px;
    display:grid;
    grid-template-columns:24px minmax(0,1fr) auto auto;
    align-items:center;
    gap:8px;
    padding:4px 9px;
    border-radius:5px;
    color:#8f969f;
    font-size:10px;
}
#uploadDropzone .cb-import-row:nth-child(2n){
    background:rgba(255,255,255,.015);
}
#uploadDropzone .cb-import-row.is-active{
    background:rgba(76,116,181,.13);
    box-shadow:inset 2px 0 #6797e2;
}
#uploadDropzone .cb-import-row.is-done{
    color:#87958a;
}
#uploadDropzone .cb-import-row.is-failed{
    background:rgba(178,69,69,.09);
}
#uploadDropzone .cb-import-row-icon{
    width:22px;
    height:22px;
    display:grid;
    place-items:center;
    color:#7f8791;
}
#uploadDropzone .cb-import-row.is-active .cb-import-row-icon{
    color:#9dbced;
}
#uploadDropzone .cb-import-row.is-done .cb-import-row-icon{
    color:#72ac7b;
}
#uploadDropzone .cb-import-row.is-failed .cb-import-row-icon{
    color:#d97777;
}
#uploadDropzone .cb-import-row.is-skipped .cb-import-row-icon{
    color:#c1a568;
}
#uploadDropzone .cb-import-row-name{
    min-width:0;
    display:flex;
    flex-direction:column;
    gap:1px;
}
#uploadDropzone .cb-import-row-name strong{
    color:#bdc2ca;
    font-size:10px;
    font-weight:500;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
}
#uploadDropzone .cb-import-row-name span{
    color:#666e78;
    font-size:9px;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
}
#uploadDropzone .cb-import-row-status{
    min-width:58px;
    text-align:right;
    text-transform:capitalize;
}
#uploadDropzone .cb-import-row-size{
    width:62px;
    text-align:right;
    color:#6e7680;
}
#uploadDropzone .cb-import-progress-actions{
    display:flex;
    justify-content:flex-end;
    gap:7px;
    padding:10px 14px;
    border-top:1px solid rgba(255,255,255,.065);
    background:rgba(13,15,18,.3);
}
#uploadDropzone .cb-action-danger{
    color:#d99b9b;
}
#uploadDropzone .cb-import-result{
    display:flex;
    align-items:center;
    gap:11px;
    margin:7px 18px 0;
    padding:9px 11px;
    border-radius:6px;
    background:rgba(85,143,94,.1);
    border:1px solid rgba(101,168,111,.18);
}
#uploadDropzone .cb-import-result-icon{
    color:#75b47f;
    font-size:18px;
}
#uploadDropzone .cb-import-result>div:last-child{
    display:flex;
    flex-direction:column;
    gap:2px;
}
#uploadDropzone .cb-import-result strong{
    color:#dce5de;
    font-size:11px;
}
#uploadDropzone .cb-import-result span{
    color:#89968b;
    font-size:10px;
}
#uploadDropzone .cb-import-dialog.sm-import-running .cb-import-header .cb-icon-btn{
    opacity:.45;
}
`;

    document.head.appendChild(style);
  }

  function ensureProgressMarkup() {
    const progress = $("uploadProgressContent");

    if (!progress) return false;
    if ($("uploadQueueList") && $("uploadCurrentFile")) return true;

    progress.classList.add("cb-import-queue-view");

    progress.innerHTML = `
            <div class="cb-import-progress-head">
                <div class="cb-import-progress-copy">
                    <div class="cb-import-progress-title-row">
                        <div class="cb-spinner cb-import-spinner"></div>
                        <div>
                            <strong id="uploadBatchTitle">Preparing import...</strong>
                            <span id="uploadStatusText">Scanning files...</span>
                        </div>
                    </div>
                    <div class="cb-import-progress-stats">
                        <span id="uploadCountText">0 / 0 files</span>
                        <strong id="uploadPercentText">0%</strong>
                    </div>
                </div>
                <div class="cb-progress-track cb-progress-track-main">
                    <div id="uploadProgressBar" class="cb-progress-bar"></div>
                </div>
            </div>

            <div id="uploadImportSummary" class="cb-import-summary">
                <span class="cb-import-summary-chip"><i class="fas fa-cube"></i><b id="uploadSummaryModels">0</b> Models</span>
                <span class="cb-import-summary-chip"><i class="fas fa-image"></i><b id="uploadSummaryTextures">0</b> Textures</span>
                <span class="cb-import-summary-chip"><i class="fas fa-volume-up"></i><b id="uploadSummaryAudio">0</b> Audio</span>
                <span class="cb-import-summary-chip"><i class="fas fa-code"></i><b id="uploadSummaryOther">0</b> Other</span>
            </div>

            <div class="cb-import-current-card" id="uploadCurrentCard">
                <div class="cb-import-current-icon" id="uploadCurrentIcon"><i class="fas fa-file"></i></div>
                <div class="cb-import-current-main">
                    <div class="cb-import-current-top">
                        <div>
                            <strong id="uploadCurrentFile">Waiting for file...</strong>
                            <span id="uploadCurrentPath"></span>
                        </div>
                        <span id="uploadCurrentSize">0 B</span>
                    </div>
                    <div class="cb-import-current-stage">
                        <span id="uploadCurrentStage">Queued</span>
                        <span id="uploadCurrentPercent">0%</span>
                    </div>
                    <div class="cb-progress-track cb-progress-track-file">
                        <div id="uploadCurrentProgressBar" class="cb-progress-bar cb-progress-bar-file"></div>
                    </div>
                </div>
            </div>

            <div class="cb-import-queue-head">
                <strong>Import Queue</strong>
                <span id="uploadQueueHint">Files are processed one by one</span>
            </div>

            <div id="uploadQueueList" class="cb-import-queue-list" role="list"></div>

            <div id="uploadImportResult" class="cb-import-result" style="display:none;">
                <div class="cb-import-result-icon"><i class="fas fa-check-circle"></i></div>
                <div>
                    <strong id="uploadResultTitle">Import complete</strong>
                    <span id="uploadResultText"></span>
                </div>
            </div>

            <div class="cb-import-progress-actions">
                <button id="uploadPauseBtn" class="cb-action-btn" type="button">
                    <i class="fas fa-pause"></i><span>Pause</span>
                </button>
                <button id="uploadRetryFailedBtn" class="cb-action-btn" type="button" style="display:none;">
                    <i class="fas fa-redo"></i><span>Retry Failed</span>
                </button>
                <button id="uploadCancelBtn" class="cb-action-btn cb-action-danger" type="button">
                    <i class="fas fa-times"></i><span>Cancel Import</span>
                </button>
                <button id="uploadCloseResultBtn" class="cb-action-btn cb-action-primary" type="button" style="display:none;">
                    <i class="fas fa-check"></i><span>Close</span>
                </button>
            </div>
        `;

    return true;
  }

  function bytesLabel(bytes) {
    let value = Number(bytes || 0);

    if (!Number.isFinite(value) || value <= 0) return "0 B";

    const units = ["B", "KB", "MB", "GB", "TB"];
    let unit = 0;

    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }

    const decimals = value >= 100 || unit === 0 ? 0 : value >= 10 ? 1 : 2;

    return `${value.toFixed(decimals)} ${units[unit]}`;
  }

  function extension(file) {
    const match = String(file?.name || "")
      .toLowerCase()
      .match(/\.([a-z0-9_-]+)$/);

    return match?.[1] || "";
  }

  function classify(file) {
    const ext = extension(file);

    if (
      [
        "glb",
        "gltf",
        "fbx",
        "obj",
        "blend",
        "smmesh",
        "uasset",
        "umap",
      ].includes(ext)
    ) {
      return "model";
    }

    if (["uproject", "uplugin"].includes(ext)) {
      return "unreal";
    }

    if (
      [
        "png",
        "jpg",
        "jpeg",
        "webp",
        "bmp",
        "gif",
        "svg",
        "hdr",
        "exr",
        "smtexture",
      ].includes(ext)
    ) {
      return "texture";
    }

    if (["wav", "mp3", "ogg", "flac", "m4a", "aac", "smaudio"].includes(ext)) {
      return "audio";
    }

    return "other";
  }

  function iconClass(file) {
    const kind = classify(file);
    const ext = extension(file);

    if (kind === "model") return "fas fa-cube";
    if (kind === "texture")
      return ext === "hdr" || ext === "exr" ? "fas fa-sun" : "fas fa-image";
    if (kind === "audio") return "fas fa-volume-up";

    if (
      ["js", "ts", "jsx", "tsx", "json", "css", "html", "htm"].includes(ext)
    ) {
      return "fas fa-code";
    }

    if (["scene", "smscene", "smprefab", "prefab"].includes(ext)) {
      return "fas fa-project-diagram";
    }

    if (["smmaterial"].includes(ext)) return "fas fa-circle";
    return "fas fa-file";
  }

  function relativePath(file) {
    return String(
      file?.webkitRelativePath || file?.smRelativePath || file?.name || "",
    ).replace(/\\/g, "/");
  }

  function parentPath(file) {
    const path = relativePath(file);
    const parts = path.split("/");
    parts.pop();
    return parts.join("/");
  }

  function batchLabel(files, folderMode) {
    if (!files.length) return "Import Assets";

    if (folderMode) {
      const path = relativePath(files[0]);
      const root = path.split("/")[0];

      if (root && root !== files[0].name) {
        return `Importing ${root}`;
      }

      return "Importing Folder";
    }

    if (files.length === 1) return `Importing ${files[0].name}`;
    return `Importing ${files.length} files`;
  }

  function makeJobs(files) {
    return files.map((file, index) => ({
      index,
      file,
      name: file.name,
      path: relativePath(file),
      size: Number(file.size || 0),
      kind: classify(file),
      status: "queued",
      stage: "Waiting",
      progress: 0,
      error: null,
      result: null,
    }));
  }

  function summaryForJobs(jobs) {
    const summary = {
      model: 0,
      texture: 0,
      audio: 0,
      other: 0,
    };

    for (const job of jobs) {
      summary[job.kind] = (summary[job.kind] || 0) + 1;
    }

    return summary;
  }

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = String(text ?? "");
  }

  function setBar(id, value) {
    const el = $(id);

    if (!el) return;

    const clamped = Math.max(0, Math.min(100, Number(value || 0)));
    el.style.width = `${clamped}%`;
  }

  function setVisible(id, visible, display = "") {
    const el = $(id);
    if (!el) return;
    el.style.display = visible ? display : "none";
  }

  function updateSummary() {
    const summary = summaryForJobs(state.jobs);

    setText("uploadSummaryModels", summary.model);
    setText("uploadSummaryTextures", summary.texture);
    setText("uploadSummaryAudio", summary.audio);
    setText("uploadSummaryOther", summary.other);
  }

  function overallDoneCount() {
    return state.jobs.filter((job) =>
      ["done", "failed", "skipped", "cancelled"].includes(job.status),
    ).length;
  }

  function updateOverall() {
    const total = state.jobs.length;
    const done = overallDoneCount();
    const percent = total ? Math.round((done / total) * 100) : 0;

    setText("uploadCountText", `${done} / ${total} files`);
    setText("uploadPercentText", `${percent}%`);
    setBar("uploadProgressBar", percent);

    if (state.active) {
      setText(
        "uploadStatusText",
        state.paused
          ? "Import paused"
          : `Processing file ${Math.min(state.currentIndex + 1, total)} of ${total}`,
      );
    }
  }

  function updateCurrent(job) {
    if (!job) {
      setText("uploadCurrentFile", "Waiting for file...");
      setText("uploadCurrentPath", "");
      setText("uploadCurrentSize", "0 B");
      setText("uploadCurrentStage", "Queued");
      setText("uploadCurrentPercent", "0%");
      setBar("uploadCurrentProgressBar", 0);
      return;
    }

    setText("uploadCurrentFile", job.name);
    setText(
      "uploadCurrentPath",
      job.path && job.path !== job.name ? job.path : "",
    );
    setText("uploadCurrentSize", bytesLabel(job.size));
    setText("uploadCurrentStage", job.stage);
    setText("uploadCurrentPercent", `${Math.round(job.progress)}%`);
    setBar("uploadCurrentProgressBar", job.progress);

    const icon = $("uploadCurrentIcon");

    if (icon) {
      icon.innerHTML = `<i class="${iconClass(job.file)}"></i>`;
    }
  }

  function statusIcon(job) {
    if (job.status === "active") return "fas fa-spinner fa-spin";
    if (job.status === "done") return "fas fa-check";
    if (job.status === "failed") return "fas fa-exclamation-triangle";
    if (job.status === "skipped") return "fas fa-forward";
    if (job.status === "cancelled") return "fas fa-ban";
    return iconClass(job.file);
  }

  function rowStatus(job) {
    if (job.status === "active") return job.stage || "Importing";
    if (job.status === "done") return "Done";
    if (job.status === "failed") return "Failed";
    if (job.status === "skipped") return "Skipped";
    if (job.status === "cancelled") return "Cancelled";
    return "Queued";
  }

  function renderQueue() {
    const host = $("uploadQueueList");

    if (!host) return;

    if (!state.jobs.length) {
      host.innerHTML = `
                <div class="cb-import-row">
                    <div class="cb-import-row-icon"><i class="fas fa-inbox"></i></div>
                    <div class="cb-import-row-name"><strong>No files queued</strong></div>
                    <div class="cb-import-row-status"></div>
                    <div class="cb-import-row-size"></div>
                </div>
            `;
      return;
    }

    /*
     * Virtualized moving window. Large imports can contain many thousands
     * of files, so the DOM should not contain one row for every file.
     */
    const maxRows = CFG.visibleRows;
    const half = Math.floor(maxRows / 2);
    let start = Math.max(0, state.currentIndex - half);

    if (state.currentIndex < 0) start = 0;

    let end = Math.min(state.jobs.length, start + maxRows);

    start = Math.max(0, end - maxRows);

    const rows = [];

    if (start > 0) {
      rows.push(`
                <div class="cb-import-row">
                    <div class="cb-import-row-icon"><i class="fas fa-ellipsis-h"></i></div>
                    <div class="cb-import-row-name">
                        <strong>${start} earlier files</strong>
                        <span>hidden for performance</span>
                    </div>
                    <div class="cb-import-row-status"></div>
                    <div class="cb-import-row-size"></div>
                </div>
            `);
    }

    for (let i = start; i < end; i++) {
      const job = state.jobs[i];
      const classes = [
        "cb-import-row",
        job.status === "active" ? "is-active" : "",
        job.status === "done" ? "is-done" : "",
        job.status === "failed" ? "is-failed" : "",
        job.status === "skipped" ? "is-skipped" : "",
      ]
        .filter(Boolean)
        .join(" ");

      rows.push(`
                <div class="${classes}" role="listitem" data-import-index="${i}">
                    <div class="cb-import-row-icon"><i class="${statusIcon(job)}"></i></div>
                    <div class="cb-import-row-name">
                        <strong title="${escapeHTML(job.path)}">${escapeHTML(job.name)}</strong>
                        <span>${escapeHTML(job.path && job.path !== job.name ? job.path : job.kind)}</span>
                    </div>
                    <div class="cb-import-row-status">${escapeHTML(rowStatus(job))}</div>
                    <div class="cb-import-row-size">${bytesLabel(job.size)}</div>
                </div>
            `);
    }

    if (end < state.jobs.length) {
      rows.push(`
                <div class="cb-import-row">
                    <div class="cb-import-row-icon"><i class="fas fa-ellipsis-h"></i></div>
                    <div class="cb-import-row-name">
                        <strong>${state.jobs.length - end} more queued files</strong>
                        <span>will appear as import continues</span>
                    </div>
                    <div class="cb-import-row-status"></div>
                    <div class="cb-import-row-size"></div>
                </div>
            `);
    }

    host.innerHTML = rows.join("");

    const active = host.querySelector(".is-active");
    active?.scrollIntoView?.({
      block: "nearest",
      behavior: "smooth",
    });
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function resetCounters() {
    state.imported = 0;
    state.skipped = 0;
    state.failed = 0;
    state.cancelledCount = 0;
  }

  function showProgressUI() {
    ensureProgressMarkup();

    const normal = $("uploadNormalContent");
    const progress = $("uploadProgressContent");
    const dialog = progress?.closest(".cb-import-dialog");

    if (normal) normal.style.display = "none";

    if (progress) {
      progress.style.display = "flex";
    }

    dialog?.classList.add("sm-import-running");

    setVisible("uploadImportResult", false);
    setVisible("uploadCloseResultBtn", false);
    setVisible("uploadRetryFailedBtn", false);

    const pause = $("uploadPauseBtn");
    const cancel = $("uploadCancelBtn");

    if (pause) {
      pause.style.display = "";
      pause.disabled = false;
      pause.innerHTML = '<i class="fas fa-pause"></i><span>Pause</span>';
    }

    if (cancel) {
      cancel.style.display = "";
      cancel.disabled = false;
    }
  }

  function showNormalUI() {
    const normal = $("uploadNormalContent");
    const progress = $("uploadProgressContent");
    const dialog = progress?.closest(".cb-import-dialog");

    if (normal) normal.style.display = "";
    if (progress) progress.style.display = "none";

    dialog?.classList.remove("sm-import-running");
  }

  function startPseudoProgress(job) {
    stopPseudoProgress();

    state.currentPseudoProgress = 8;
    job.progress = state.currentPseudoProgress;
    updateCurrent(job);

    state.progressTimer = setInterval(() => {
      if (!state.active || state.paused || job.status !== "active") return;

      const p = state.currentPseudoProgress;

      if (p < 40) {
        state.currentPseudoProgress += Math.random() * 4.2 + 1.5;
      } else if (p < 70) {
        state.currentPseudoProgress += Math.random() * 2.1 + 0.7;
      } else if (p < 88) {
        state.currentPseudoProgress += Math.random() * 0.9 + 0.2;
      }

      state.currentPseudoProgress = Math.min(88, state.currentPseudoProgress);
      job.progress = state.currentPseudoProgress;

      if (job.progress < 22) job.stage = "Reading file...";
      else if (job.progress < 52) job.stage = "Importing asset...";
      else if (job.progress < 74) job.stage = "Building preview...";
      else job.stage = "Saving asset...";

      updateCurrent(job);

      const activeRow = $("uploadQueueList")?.querySelector(
        `[data-import-index="${job.index}"] .cb-import-row-status`,
      );

      if (activeRow) activeRow.textContent = job.stage;
    }, CFG.progressTickMs);
  }

  function stopPseudoProgress() {
    clearInterval(state.progressTimer);
    state.progressTimer = 0;
  }

  async function waitWhilePaused() {
    while (state.paused && !state.cancelled) {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  function targetFolderForJob(P, job) {
    if (!state.folderMode) {
      return state.baseFolderId;
    }

    const folderPath = parentPath(job.file);

    if (!folderPath) {
      return state.baseFolderId;
    }

    return P._ensureFolderPath(folderPath, state.baseFolderId);
  }

  async function processUnrealFile(P, job) {
    const file = job.file;

    if (!file) {
      return {
        handled: false,
        result: null,
      };
    }

    const name = String(file.name || "");

    const extMatch = name.split(/[?#]/)[0].match(/\.([a-z0-9_-]+)$/i);

    const ext = extMatch ? extMatch[1].toLowerCase() : "";

    const companionExtensions = ["uexp", "ubulk", "uptnl", "utoc", "ucas"];
    if (companionExtensions.includes(ext)) {
      return {
        handled: true,
        result: null,
      };
    }

    const unrealExtensions = ["uasset", "umap", "uproject", "uplugin"];

    if (!unrealExtensions.includes(ext)) {
      return {
        handled: false,
        result: null,
      };
    }

    const LoaderClass = window.SMUnrealAssetLoader;

    try {
      const onProgress = (percent, stage) => {
        job.progress = percent;
        job.stage = stage || job.stage;
        if (typeof P._emitImportProgress === "function") {
          try {
            P._emitImportProgress(job, percent, stage);
          } catch (_) {}
        }
      };

      onProgress(10, "Unreal Import");

      const targetFolderId = targetFolderForJob(P, job);
      let result = null;

      if (typeof P._addAssetFromFile === "function") {
        result = await P._addAssetFromFile(file, targetFolderId, {
          onProgress,
          jobId: job.id,
          source: "AssetsPanelImportQueue",
        });
      } else if (LoaderClass) {
        const loader =
          typeof LoaderClass === "function"
            ? new LoaderClass({
                THREE: window.THREE,
                registry: window.SMUnrealAssetRegistry || null,
                backend: window.SMUnrealAssetBackend || null,
                loaders: {
                  gltf: window.SM_GLTF_LOADER || null,
                  fbx: window.SM_FBX_LOADER || null,
                  obj: window.SM_OBJ_LOADER || null,
                },
              })
            : LoaderClass;

        result = await loader.load(file, {
          source: "AssetsPanelImportQueue",
          jobId: job.id,
          assetName: file.name,
          onProgress,
        });
      } else {
        return {
          handled: true,
          result: {
            ok: false,
            status: "loader-missing",
            format: ext,
            file,
            message: "SM Unreal Asset Loader is not available.",
          },
        };
      }

      onProgress(100, result?.ok === false ? "Failed" : "Ready");

      return {
        handled: true,
        result,
      };
    } catch (error) {
      return {
        handled: true,

        result: {
          ok: false,

          status: "error",

          format: ext,

          file,

          error: error && error.message ? error.message : String(error),

          message:
            error && error.message
              ? error.message
              : `Failed to import Unreal ${ext}.`,
        },
      };
    }
  }

  async function processJob(P, job) {
    await waitWhilePaused();

    if (state.cancelled) {
      job.status = "cancelled";
      job.stage = "Cancelled";
      job.progress = 0;
      state.cancelledCount++;
      return;
    }

    job.status = "active";
    job.stage = "Preparing...";
    job.progress = 4;

    renderQueue();
    updateCurrent(job);
    updateOverall();
    startPseudoProgress(job);

    try {
      const targetFolderId = targetFolderForJob(P, job);

      let result;

      const unrealResult = await processUnrealFile(P, job);

      if (unrealResult.handled) {
        result = unrealResult.result;
      } else {
        result = await P._addAssetFromFile(job.file, targetFolderId);
      }

      stopPseudoProgress();

      if (result == null) {
        job.status = "skipped";
        job.stage = "Skipped";
        job.progress = 100;
        state.skipped++;
      } else {
        job.status = "done";
        job.stage = "Done";
        job.progress = 100;
        job.result = result;
        state.imported++;
      }
    } catch (error) {
      stopPseudoProgress();

      job.status = "failed";
      job.stage = "Failed";
      job.progress = 100;
      job.error = error;
      state.failed++;

      console.error(
        `[SM Import Queue] Failed to import "${job.path || job.name}":`,
        error,
      );
    }

    updateCurrent(job);
    updateOverall();
    renderQueue();
  }

  function markRemainingCancelled(fromIndex) {
    for (let i = fromIndex; i < state.jobs.length; i++) {
      const job = state.jobs[i];

      if (job.status === "queued") {
        job.status = "cancelled";
        job.stage = "Cancelled";
        state.cancelledCount++;
      }
    }
  }

  function resultText() {
    const parts = [`${state.imported} imported`];

    if (state.skipped) parts.push(`${state.skipped} skipped`);
    if (state.failed) parts.push(`${state.failed} failed`);
    if (state.cancelledCount) parts.push(`${state.cancelledCount} cancelled`);

    const seconds = Math.max(
      0,
      Math.round((state.finishedAt - state.startedAt) / 1000),
    );

    parts.push(`${seconds}s`);

    return parts.join(" · ");
  }

  function finishBatch() {
    stopPseudoProgress();

    state.active = false;
    state.paused = false;
    state.completed = true;
    state.finishedAt = Date.now();

    updateOverall();
    renderQueue();

    const result = $("uploadImportResult");
    const resultIcon = result?.querySelector(".cb-import-result-icon");

    setVisible("uploadImportResult", true, "flex");
    setVisible("uploadPauseBtn", false);
    setVisible("uploadCancelBtn", false);
    setVisible("uploadCloseResultBtn", true);

    if (state.failed > 0) {
      setVisible("uploadRetryFailedBtn", true);
    }

    const cancelled = state.cancelled;

    setText(
      "uploadResultTitle",
      cancelled
        ? "Import cancelled"
        : state.failed
          ? "Import finished with errors"
          : "Import complete",
    );

    setText("uploadResultText", resultText());

    if (resultIcon) {
      resultIcon.innerHTML = cancelled
        ? '<i class="fas fa-ban"></i>'
        : state.failed
          ? '<i class="fas fa-exclamation-triangle"></i>'
          : '<i class="fas fa-check-circle"></i>';
    }

    const dialog = $("uploadProgressContent")?.closest(".cb-import-dialog");
    dialog?.classList.remove("sm-import-running");

    setText(
      "uploadStatusText",
      cancelled ? "Stopped by user" : "All queued files have been processed",
    );

    if (!cancelled) {
      setText("uploadPercentText", "100%");
      setBar("uploadProgressBar", 100);
    }

    try {
      panel()?.render?.();
      panel()?._buildTagCloud?.();
    } catch (_) {}

    dispatch("sm:asset-import-queue-complete", {
      imported: state.imported,
      skipped: state.skipped,
      failed: state.failed,
      cancelled: state.cancelledCount,
      jobs: state.jobs,
    });
  }

  async function runBatch() {
    const P = panel();

    if (!P) {
      throw new Error("AssetsPanel is not available.");
    }

    for (let i = 0; i < state.jobs.length; i++) {
      state.currentIndex = i;

      if (state.cancelled) {
        markRemainingCancelled(i);
        break;
      }

      await processJob(P, state.jobs[i]);
    }

    finishBatch();
  }

  async function start(files, options = {}) {
    const list = Array.from(files || []).filter(Boolean);

    if (!list.length) return false;

    if (state.active) {
      console.warn("[SM Import Queue] Import already running.");
      return false;
    }

    attach();

    state.active = true;
    state.paused = false;
    state.cancelled = false;
    state.completed = false;

    state.jobs = makeJobs(list);
    state.currentIndex = -1;
    state.folderMode = !!options.folderMode;
    state.baseFolderId = options.baseFolderId ?? panel()?.openFolderId ?? null;
    state.batchName = options.batchName || batchLabel(list, state.folderMode);
    state.startedAt = Date.now();
    state.finishedAt = 0;

    resetCounters();

    panel()?._refreshDOMCache?.();

    const zone = $("uploadDropzone");
    zone?.classList.add("visible");

    showProgressUI();
    updateSummary();

    setText("uploadBatchTitle", state.batchName);
    setText("uploadStatusText", `Scanning ${list.length} files...`);
    setText("uploadQueueHint", "Files are processed one by one");
    setText("uploadCountText", `0 / ${list.length} files`);
    setText("uploadPercentText", "0%");

    setBar("uploadProgressBar", 0);
    updateCurrent(null);
    renderQueue();

    dispatch("sm:asset-import-queue-start", {
      files: list,
      folderMode: state.folderMode,
      total: list.length,
    });

    /*
     * Give the browser one frame to paint "Scanning..." before expensive
     * import work begins.
     */
    await new Promise((resolve) => {
      if (global.requestAnimationFrame) {
        global.requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 0);
      }
    });

    setText("uploadStatusText", `Ready · ${list.length} files queued`);

    runBatch().catch((error) => {
      console.error("[SM Import Queue] Batch failure:", error);
      state.failed++;
      finishBatch();
    });

    return true;
  }

  function pause() {
    if (!state.active) return false;

    state.paused = !state.paused;

    const button = $("uploadPauseBtn");

    if (button) {
      button.innerHTML = state.paused
        ? '<i class="fas fa-play"></i><span>Resume</span>'
        : '<i class="fas fa-pause"></i><span>Pause</span>';
    }

    setText(
      "uploadStatusText",
      state.paused
        ? "Import paused · current file will finish safely"
        : `Processing file ${state.currentIndex + 1} of ${state.jobs.length}`,
    );

    return state.paused;
  }

  function cancel() {
    if (!state.active) return false;

    state.cancelled = true;
    state.paused = false;

    setText("uploadStatusText", "Cancelling after current file...");

    const button = $("uploadCancelBtn");

    if (button) {
      button.disabled = true;
      button.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i><span>Cancelling...</span>';
    }

    return true;
  }

  async function retryFailed() {
    if (state.active) return false;

    const failedFiles = state.jobs
      .filter((job) => job.status === "failed")
      .map((job) => job.file);

    if (!failedFiles.length) return false;

    return start(failedFiles, {
      folderMode: state.folderMode,
      baseFolderId: state.baseFolderId,
      batchName: `Retrying ${failedFiles.length} failed files`,
    });
  }

  function closeResult() {
    if (state.active) return false;

    showNormalUI();

    const zone = $("uploadDropzone");
    zone?.classList.remove("visible", "dragover");

    state.jobs = [];
    state.currentIndex = -1;
    state.completed = false;

    return true;
  }

  function dispatch(name, detail) {
    try {
      global.dispatchEvent?.(
        new CustomEvent(name, {
          detail,
        }),
      );
    } catch (_) {}
  }

  async function filesFromEntry(entry, prefix = "") {
    if (!entry) return [];

    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => {
        entry.file(resolve, reject);
      });

      try {
        Object.defineProperty(file, "smRelativePath", {
          configurable: true,
          value: `${prefix}${file.name}`,
        });
      } catch (_) {
        file.smRelativePath = `${prefix}${file.name}`;
      }

      return [file];
    }

    if (!entry.isDirectory) return [];

    const reader = entry.createReader();
    const children = [];

    while (true) {
      const batch = await new Promise((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });

      if (!batch.length) break;
      children.push(...batch);
    }

    const files = [];
    const nextPrefix = `${prefix}${entry.name}/`;

    for (const child of children) {
      files.push(...(await filesFromEntry(child, nextPrefix)));
    }

    return files;
  }

  async function filesFromDrop(event) {
    const items = Array.from(event.dataTransfer?.items || []);

    const entryCapable = items.some(
      (item) =>
        typeof item.webkitGetAsEntry === "function" && item.webkitGetAsEntry(),
    );

    if (!entryCapable) {
      return {
        files: Array.from(event.dataTransfer?.files || []),
        folderMode: false,
      };
    }

    const files = [];
    let folderMode = false;

    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();

      if (!entry) continue;
      if (entry.isDirectory) folderMode = true;

      files.push(...(await filesFromEntry(entry, "")));
    }

    return {
      files,
      folderMode,
    };
  }

  function bindInputs(P = panel()) {
    if (!P) return false;

    P._refreshDOMCache?.();

    const uploadInput = P.dom?.uploadInput || $("uploadInput");

    const uploadFolderInput =
      P.dom?.uploadFolderInput || $("uploadFolderInput");

    const zone = P.dom?.uploadZone || $("uploadDropzone");

    if (uploadInput) {
      uploadInput.onchange = async (event) => {
        const files = Array.from(event.target.files || []);

        event.target.value = "";

        if (files.length) {
          await start(files, {
            folderMode: false,
            baseFolderId: P.openFolderId,
          });
        }
      };
    }

    if (uploadFolderInput) {
      uploadFolderInput.onchange = async (event) => {
        const files = Array.from(event.target.files || []);

        event.target.value = "";

        if (files.length) {
          await start(files, {
            folderMode: true,
            baseFolderId: P.openFolderId,
          });
        }
      };
    }

    if (zone && zone.dataset.smImportQueueCaptureBound !== "1") {
      zone.dataset.smImportQueueCaptureBound = "1";

      zone.addEventListener(
        "dragover",
        (event) => {
          event.preventDefault();
          zone.classList.add("dragover");
        },
        true,
      );

      zone.addEventListener(
        "dragleave",
        (event) => {
          if (event.target === zone) {
            zone.classList.remove("dragover");
          }
        },
        true,
      );

      zone.addEventListener(
        "drop",
        async (event) => {
          /*
           * Capture + stopImmediatePropagation prevents the old
           * AssetsPanel anonymous drop listener from importing the
           * same files a second time.
           */
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          zone.classList.remove("dragover");

          try {
            const dropped = await filesFromDrop(event);

            if (dropped.files.length) {
              await start(dropped.files, {
                folderMode: dropped.folderMode,
                baseFolderId: P.openFolderId,
              });
            }
          } catch (error) {
            console.error("[SM Import Queue] Drop scan failed:", error);
          }
        },
        true,
      );
    }

    return true;
  }

  function bindButtons() {
    const pauseButton = $("uploadPauseBtn");
    const cancelButton = $("uploadCancelBtn");
    const retryButton = $("uploadRetryFailedBtn");
    const closeButton = $("uploadCloseResultBtn");

    if (pauseButton) pauseButton.onclick = pause;
    if (cancelButton) cancelButton.onclick = cancel;
    if (retryButton) retryButton.onclick = retryFailed;
    if (closeButton) closeButton.onclick = closeResult;
  }

  function patchAssetsPanel() {
    const P = panel();

    if (!P) return false;

    if (
      typeof P._bindCurrentImportInputs === "function" &&
      !P._bindCurrentImportInputs.__smImportQueuePatched
    ) {
      const original = P._bindCurrentImportInputs;

      const wrapped = function (...args) {
        const result = original.apply(this, args);
        bindInputs(this);
        bindButtons();
        return result;
      };

      Object.defineProperty(wrapped, "__smImportQueuePatched", {
        value: true,
      });

      state.originalBindInputs = original;
      P._bindCurrentImportInputs = wrapped;
    }

    if (
      typeof P.showUploadZone === "function" &&
      !P.showUploadZone.__smImportQueuePatched
    ) {
      const original = P.showUploadZone;

      const wrapped = function (...args) {
        const result = original.apply(this, args);

        ensureProgressMarkup();
        injectStyles();
        bindInputs(this);
        bindButtons();

        if (!state.active && !state.completed) {
          showNormalUI();
        }

        return result;
      };

      Object.defineProperty(wrapped, "__smImportQueuePatched", {
        value: true,
      });

      state.originalShow = original;
      P.showUploadZone = wrapped;
    }

    if (
      typeof P.hideUploadZone === "function" &&
      !P.hideUploadZone.__smImportQueuePatched
    ) {
      const original = P.hideUploadZone;

      const wrapped = function (...args) {
        if (state.active) {
          const shouldCancel = global.confirm?.(
            "An asset import is still running. Cancel the import?",
          );

          if (shouldCancel) {
            cancel();
          }

          return false;
        }

        state.completed = false;
        state.jobs = [];
        state.currentIndex = -1;

        return original.apply(this, args);
      };

      Object.defineProperty(wrapped, "__smImportQueuePatched", {
        value: true,
      });

      state.originalHide = original;
      P.hideUploadZone = wrapped;
    }

    return true;
  }

  function attach() {
    if (state.attaching) return state.installed;

    state.attaching = true;

    try {
      injectStyles();

      /*
       * AssetPanel UI shell may rebuild uploadDropzone. Re-resolve and
       * bind every time attach() is called.
       */
      global.AssetPanel?._ensureUploadOverlay?.();

      const P = panel();

      if (!P) {
        return false;
      }

      ensureProgressMarkup();
      patchAssetsPanel();
      bindInputs(P);
      bindButtons();

      state.installed = true;

      return true;
    } finally {
      state.attaching = false;
    }
  }

  function install() {
    state.bindRetries++;

    if (attach()) {
      console.log(
        "[SM Import Queue] Professional sequential import queue installed.",
      );

      return true;
    }

    if (state.bindRetries < CFG.maxBindRetries) {
      setTimeout(install, CFG.bindRetryMs);
    }

    return false;
  }

  global.SMAssetsPanelImportQueue = {
    version: CFG.version,

    install,
    attach,
    start,
    pause,
    resume() {
      if (state.paused) return pause();
      return false;
    },
    cancel,
    retryFailed,
    closeResult,

    status() {
      return {
        installed: state.installed,
        active: state.active,
        paused: state.paused,
        cancelled: state.cancelled,
        completed: state.completed,
        currentIndex: state.currentIndex,
        total: state.jobs.length,
        imported: state.imported,
        skipped: state.skipped,
        failed: state.failed,
        cancelledCount: state.cancelledCount,
      };
    },
  };

  install();

  if (typeof document !== "undefined" && document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => attach(), {
      once: true,
    });
  }

  global.addEventListener?.("load", () => attach(), {
    once: true,
  });
})(typeof window !== "undefined" ? window : globalThis);

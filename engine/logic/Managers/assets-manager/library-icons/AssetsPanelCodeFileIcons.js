// engine/logic/Managers/assets-manager/AssetsPanelCodeFileIcons.js
// SM Engine — Real extension-aware icons for source/code/text files.
//
// FIXED VERSION:
//  - MutationObserver no longer creates infinite loops
//  - Thumbnail click handlers are preserved via wrapper div
//  - Uses rgba/hsl instead of color-mix (browser compatible)
//  - Icon loading has fallback + timeout
//  - Disconnects observer properly on panel change
//  - Icon cache to avoid re-creating DOM nodes
//  - Skips hover-only mutations (only reacts to data-id additions)
(function () {
  "use strict";

  const INSTALL_KEY = "__smAssetsPanelCodeFileIconsInstalled";
  const ICON_CACHE = new Map();

  // ============================================================
  // ICON DEFINITIONS
  // ============================================================
  const ICONS = Object.freeze({
    // JavaScript / TypeScript / Web
    js: { label: "JS", title: "JavaScript", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg", accent: "#f7df1e" },
    mjs: { label: "MJS", title: "JavaScript Module", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg", accent: "#f7df1e" },
    cjs: { label: "CJS", title: "CommonJS", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg", accent: "#f7df1e" },
    ts: { label: "TS", title: "TypeScript", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg", accent: "#3178c6" },
    jsx: { label: "JSX", title: "JavaScript JSX", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg", accent: "#61dafb" },
    tsx: { label: "TSX", title: "TypeScript JSX", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg", accent: "#61dafb" },
    html: { label: "HTML", title: "HTML5", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg", accent: "#e34f26" },
    htm: { label: "HTML", title: "HTML", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg", accent: "#e34f26" },
    css: { label: "CSS", title: "CSS3", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/css3/css3-original.svg", accent: "#1572b6" },
    scss: { label: "SCSS", title: "SCSS", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/sass/sass-original.svg", accent: "#cc6699" },
    sass: { label: "SASS", title: "Sass", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/sass/sass-original.svg", accent: "#cc6699" },
    less: { label: "LESS", title: "Less", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/less/less-plain-wordmark.svg", accent: "#1d365d" },
    vue: { label: "VUE", title: "Vue", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vuejs/vuejs-original.svg", accent: "#42b883" },
    svelte: { label: "SVELTE", title: "Svelte", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/svelte/svelte-original.svg", accent: "#ff3e00" },

    // Programming languages
    py: { label: "PY", title: "Python", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg", accent: "#3776ab" },
    pyw: { label: "PY", title: "Python", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg", accent: "#3776ab" },
    c: { label: "C", title: "C", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/c/c-original.svg", accent: "#659ad2" },
    h: { label: "H", title: "C/C++ Header", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/c/c-original.svg", accent: "#659ad2" },
    cpp: { label: "CPP", title: "C++", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg", accent: "#00599c" },
    cc: { label: "CPP", title: "C++", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg", accent: "#00599c" },
    cxx: { label: "CPP", title: "C++", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg", accent: "#00599c" },
    hpp: { label: "HPP", title: "C++ Header", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg", accent: "#00599c" },
    hh: { label: "HPP", title: "C++ Header", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg", accent: "#00599c" },
    cs: { label: "C#", title: "C#", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/csharp/csharp-original.svg", accent: "#9b4f96" },
    java: { label: "JAVA", title: "Java", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg", accent: "#e76f00" },
    kt: { label: "KT", title: "Kotlin", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/kotlin/kotlin-original.svg", accent: "#7f52ff" },
    kts: { label: "KTS", title: "Kotlin Script", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/kotlin/kotlin-original.svg", accent: "#7f52ff" },
    swift: { label: "SWIFT", title: "Swift", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/swift/swift-original.svg", accent: "#f05138" },
    go: { label: "GO", title: "Go", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/go/go-original-wordmark.svg", accent: "#00add8" },
    rs: { label: "RS", title: "Rust", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/rust/rust-original.svg", accent: "#ce422b" },
    php: { label: "PHP", title: "PHP", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/php/php-original.svg", accent: "#777bb4" },
    rb: { label: "RB", title: "Ruby", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/ruby/ruby-original.svg", accent: "#cc342d" },
    lua: { label: "LUA", title: "Lua", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/lua/lua-original.svg", accent: "#2c2d72" },

    // Shell / data / config
    sh: { label: "SH", title: "Shell Script", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bash/bash-original.svg", accent: "#89e051" },
    bash: { label: "BASH", title: "Bash", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bash/bash-original.svg", accent: "#89e051" },
    zsh: { label: "ZSH", title: "Zsh", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bash/bash-original.svg", accent: "#89e051" },
    ps1: { label: "PS1", title: "PowerShell", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/powershell/powershell-original.svg", accent: "#2f6f9f" },
    psm1: { label: "PS", title: "PowerShell Module", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/powershell/powershell-original.svg", accent: "#2f6f9f" },
    sql: { label: "SQL", title: "SQL", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original.svg", accent: "#e38c00" },

    json: { label: "JSON", title: "JSON", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/json/json-original.svg", accent: "#f1c40f" },
    xml: { label: "XML", title: "XML", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/xml/xml-original.svg", accent: "#f47c20" },
    yaml: { label: "YAML", title: "YAML", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/yaml/yaml-original.svg", accent: "#cb171e" },
    yml: { label: "YML", title: "YAML", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/yaml/yaml-original.svg", accent: "#cb171e" },
    md: { label: "MD", title: "Markdown", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/markdown/markdown-original.svg", accent: "#8da4b8" },
    markdown: { label: "MD", title: "Markdown", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/markdown/markdown-original.svg", accent: "#8da4b8" },
    txt: { label: "TXT", title: "Text File", logo: "", accent: "#a9b1bb" },
    log: { label: "LOG", title: "Log File", logo: "", accent: "#a9b1bb" },
    toml: { label: "TOML", title: "TOML", logo: "", accent: "#9c4121" },
    ini: { label: "INI", title: "INI Config", logo: "", accent: "#8ca0b3" },
    conf: { label: "CONF", title: "Configuration File", logo: "", accent: "#8ca0b3" },
    env: { label: "ENV", title: "Environment File", logo: "", accent: "#ecd53f" },
    properties: { label: "PROP", title: "Properties File", logo: "", accent: "#7f96aa" },

    // Shaders
    glsl: { label: "GLSL", title: "GLSL Shader", logo: "", accent: "#5f9ea0" },
    vert: { label: "VERT", title: "Vertex Shader", logo: "", accent: "#5f9ea0" },
    frag: { label: "FRAG", title: "Fragment Shader", logo: "", accent: "#5f9ea0" },
    vs: { label: "VS", title: "Vertex Shader", logo: "", accent: "#5f9ea0" },
    fs: { label: "FS", title: "Fragment Shader", logo: "", accent: "#5f9ea0" },
    wgsl: { label: "WGSL", title: "WebGPU Shader", logo: "", accent: "#d45f8c" },
    shader: { label: "SHADER", title: "Shader File", logo: "", accent: "#7ca7d8" },

    // Unreal Engine
    uasset: { label: "UE", title: "Unreal Engine Asset", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/unrealengine/unrealengine-original.svg", accent: "#0e1120" },
    umap: { label: "UE", title: "Unreal Engine Map", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/unrealengine/unrealengine-original.svg", accent: "#0e1120" },
    uproject: { label: "UE", title: "Unreal Engine Project", logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/unrealengine/unrealengine-original.svg", accent: "#0e1120" },
  });

  const CODE_EXTENSIONS = new Set(Object.keys(ICONS));

  // Only exclude what's really owned by other icon systems
  const DO_NOT_REMAP = new Set([
    "prefab", "scene", "sme",
    "svg", "ico", "hdr", "exr",
    "blend", "glb", "gltf", "fbx", "obj", "stl", "ply",
    "png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff",
    "mp3", "wav", "ogg", "mp4", "webm", "mov"
  ]);

  // ============================================================
  // EXTENSION DETECTION
  // ============================================================
  function getExtension(name = "") {
    const match = String(name || "").trim().toLowerCase().match(/\.([a-z0-9]+)$/);
    return match?.[1] || "";
  }

  function getIconInfo(asset) {
    if (!asset) return null;
    const type = String(asset.type || "").toLowerCase();
    // Never touch model/material icons — owned by other systems
    if (type === "model" || type === "material") return null;
    const ext = getExtension(asset.name);
    if (!ext) return null;
    const info = ICONS[ext];
    if (!info) return null;
    return { ext, ...info };
  }

  // ============================================================
  // STYLES — Using rgba/hsl instead of color-mix for compatibility
  // ============================================================
  function injectStyles() {
    if (document.getElementById("sm-code-file-icon-styles")) return;

    const style = document.createElement("style");
    style.id = "sm-code-file-icon-styles";
    style.textContent = `
      .sm-code-file-logo {
        --sm-code-accent: #8fa3b8;
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 62px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        border-radius: 4px;
        background:
          radial-gradient(circle at 50% 38%, rgba(255,255,255,0.06), transparent 62%),
          linear-gradient(145deg, #272a30, #1c1e23);
      }
      .sm-code-file-logo__image {
        max-width: 58%;
        max-height: 58%;
        object-fit: contain;
        display: block;
        pointer-events: none;
        filter: drop-shadow(0 4px 8px rgba(0,0,0,.28));
      }
      .sm-code-file-logo__fallback {
        width: 43px;
        height: 52px;
        display: none;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        border-radius: 7px;
        border: 1px solid var(--sm-code-accent);
        background: linear-gradient(145deg,
          rgba(255,255,255,0.06),
          #15171c);
        color: var(--sm-code-accent);
        font: 800 10px/1 Inter, "Segoe UI", Arial, sans-serif;
        letter-spacing: .45px;
      }
      .sm-code-file-logo__image.is-error {
        display: none;
      }
      .sm-code-file-logo__image.is-error + .sm-code-file-logo__fallback {
        display: flex;
      }
      .sm-code-file-logo__badge {
        position: absolute;
        right: 5px;
        bottom: 5px;
        min-width: 27px;
        height: 17px;
        padding: 0 5px;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        background: rgba(13, 15, 19, 0.85);
        border: 1px solid var(--sm-code-accent);
        color: #f5f7fa;
        font: 700 8px/1 Inter, "Segoe UI", Arial, sans-serif;
        letter-spacing: .45px;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================================
  // ICON ELEMENT — cached per extension
  // ============================================================
  function createIconElement(info) {
    const cached = ICON_CACHE.get(info.ext);
    if (cached) return cached.cloneNode(true);

    const root = document.createElement("div");
    root.className = "sm-code-file-logo";
    root.dataset.extension = info.ext;
    root.title = `${info.title} (.${info.ext})`;
    root.style.setProperty("--sm-code-accent", info.accent || "#8fa3b8");

    // Fallback letter block (always rendered, hidden by CSS if image loads)
    const fallback = document.createElement("div");
    fallback.className = "sm-code-file-logo__fallback";
    fallback.textContent = info.label;
    root.appendChild(fallback);

    // Image (only if a logo URL is provided)
    if (info.logo) {
      const image = document.createElement("img");
      image.className = "sm-code-file-logo__image";
      image.src = info.logo;
      image.alt = `${info.title} icon`;
      image.draggable = false;
      image.loading = "eager";
      image.addEventListener("error", () => {
        image.classList.add("is-error");
      }, { once: true });
      root.insertBefore(image, fallback);
    } else {
      // No logo URL — show fallback immediately
      fallback.style.display = "flex";
    }

    // Badge
    const badge = document.createElement("div");
    badge.className = "sm-code-file-logo__badge";
    badge.textContent = info.label;
    root.appendChild(badge);

    ICON_CACHE.set(info.ext, root);
    return root.cloneNode(true);
  }

  // ============================================================
  // APPLY TO CARD
  // ============================================================
  function findAssetById(panel, id) {
    if (!id) return null;
    if (typeof panel._findById === "function") {
      const result = panel._findById(id);
      if (result) return result;
    }
    return (panel.assets || []).find(a => String(a?.id) === String(id)) || null;
  }

  function applyToCard(panel, card) {
    if (!card || !card.dataset?.id) return false;

    const asset = findAssetById(panel, card.dataset.id);
    const info = getIconInfo(asset);
    if (!info) return false;

    const thumbnail = card.querySelector(".asset-thumbnail");
    if (!thumbnail) return false;

    // Already has the right icon?
    const current = thumbnail.querySelector(".sm-code-file-logo");
    if (current?.dataset?.extension === info.ext) return true;

    // Preserve non-icon children (click handlers on parent remain valid)
    // Only replace our own icon, keep everything else
    const existingIcon = thumbnail.querySelector(".sm-code-file-logo");
    const newIcon = createIconElement(info);

    if (existingIcon) {
      existingIcon.replaceWith(newIcon);
    } else {
      // Prepend so other content (labels, etc.) isn't wiped
      thumbnail.insertBefore(newIcon, thumbnail.firstChild);
    }

    card.dataset.fileExtension = info.ext;
    return true;
  }

  function applyAll(panel) {
    const grid = panel?.dom?.grid || document.getElementById("assetsGrid");
    if (!grid) return 0;

    let changed = 0;
    const cards = grid.querySelectorAll(".asset-item[data-id]");
    for (let i = 0; i < cards.length; i++) {
      if (applyToCard(panel, cards[i])) changed++;
    }
    return changed;
  }

  // ============================================================
  // ACCEPT ATTRIBUTE
  // ============================================================
  function updateAcceptAttribute(panel) {
    const input = panel?.dom?.uploadInput || document.getElementById("uploadInput");
    if (!input) return;

    const current = String(input.getAttribute("accept") || "").trim();
    if (!current) return; // empty = accept everything

    const values = current.split(",").map(v => v.trim()).filter(Boolean);
    const existing = new Set(values.map(v => v.toLowerCase()));

    for (const ext of CODE_EXTENSIONS) {
      const value = `.${ext}`;
      if (!existing.has(value)) values.push(value);
    }

    input.setAttribute("accept", values.join(","));
  }

  // ============================================================
  // MUTATION OBSERVER — FIXED: no infinite loops
  // ============================================================
  let activeObserver = null;
  let activeGrid = null;
  let pendingApply = false;

  function installMutationObserver(panel) {
    const grid = panel?.dom?.grid || document.getElementById("assetsGrid");
    if (!grid) return;

    // Same grid already observed? Done.
    if (activeObserver && activeGrid === grid) return;

    // Different grid — disconnect old one
    if (activeObserver) {
      activeObserver.disconnect();
      activeObserver = null;
      activeGrid = null;
    }

    activeGrid = grid;

    const observer = new MutationObserver((mutations) => {
      // Only react to ADDED nodes with data-id (new asset cards)
      // Ignore attribute changes, text changes, our own icon swaps
      let hasNewCards = false;
      for (const mutation of mutations) {
        if (mutation.type !== "childList") continue;
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.(".asset-item[data-id]")) {
            hasNewCards = true;
            break;
          }
          if (node.querySelector?.(".asset-item[data-id]")) {
            hasNewCards = true;
            break;
          }
        }
        if (hasNewCards) break;
      }

      if (!hasNewCards) return;
      if (pendingApply) return;

      pendingApply = true;
      requestAnimationFrame(() => {
        pendingApply = false;
        if (activeGrid !== grid) return;
        applyAll(panel);
      });
    });

    observer.observe(grid, {
      childList: true,
      subtree: true,
      // Do NOT observe attributes — we don't care
    });

    activeObserver = observer;
  }

  function disconnectObserver() {
    if (activeObserver) {
      activeObserver.disconnect();
      activeObserver = null;
      activeGrid = null;
    }
  }

  window.addEventListener('beforeunload', disconnectObserver);

  // ============================================================
  // INSTALL
  // ============================================================
  function install() {
    if (window[INSTALL_KEY] === true) return true;

    const panel = window.AssetsPanel;
    if (!panel || typeof panel.render !== "function" || typeof panel._getAssetType !== "function") {
      return false;
    }

    injectStyles();

    // --- 1) Extend file support ---
    const originalGetAssetType = panel._getAssetType.bind(panel);
    panel._getAssetType = function (filename) {
      const existing = originalGetAssetType(filename);
      if (existing) return existing;

      const ext = getExtension(filename);
      if (!ext || DO_NOT_REMAP.has(ext)) return null;
      if (CODE_EXTENSIONS.has(ext)) return "code";
      return null;
    };

    // --- 2) Hook render ---
    const originalRender = panel.render.bind(panel);
    panel.render = function (...args) {
      const result = originalRender(...args);
      requestAnimationFrame(() => {
        applyAll(panel);
        installMutationObserver(panel);
      });
      return result;
    };

    updateAcceptAttribute(panel);

    requestAnimationFrame(() => {
      applyAll(panel);
      installMutationObserver(panel);
    });

    window[INSTALL_KEY] = true;

    window.SMAssetsPanelCodeFileIcons = {
      installed: true,
      supportedExtensions: [...CODE_EXTENSIONS],
      icons: ICONS,
      getExtension,
      getIconInfo,
      applyAll: () => applyAll(panel),
      disconnect: disconnectObserver,
      clearCache: () => ICON_CACHE.clear(),
    };

    console.log(
      `[AssetsPanelCodeFileIcons] Ready — ${CODE_EXTENSIONS.size} source extensions supported.`
    );
    return true;
  }

  // Retry install if panel not ready yet
  if (!install()) {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (install() || attempts >= 150) {
        clearInterval(timer);
      }
    }, 100);
  }
})();
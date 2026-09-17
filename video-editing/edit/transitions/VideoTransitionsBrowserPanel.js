/**
 * VideoTransitionsBrowserPanel.js
 * SM Engine — searchable transitions browser.
 */
(function (global) {
  "use strict";

  class VideoTransitionsBrowserPanel {
    constructor(manager) {
      this.manager = manager || global.videoTransitionsManager;

      this.host = null;
      this.search = "";
      this.category = "All";
      this._styles();
    }

    mount(host) {
      this.host = host;
      this.render();
    }

    render() {
      if (!this.host) return;

      const library = this.manager.library;

      const categories = library.categories();

      const query = this.search.trim().toLowerCase();

      const definitions = library.list(this.category).filter((definition) => {
        if (!query) {
          return true;
        }

        return `${definition.name} ${definition.category} ${definition.description || ""}`
          .toLowerCase()
          .includes(query);
      });

      const target =
        global.videoTransitionsDockManager?.targetMode || "between";

      this.host.innerHTML = `
   <div class="vetr-browser-panel">
    <div class="vetr-browser-search">
     <span>${library.icon("transitions")}</span>
     <input
      type="text"
      placeholder="Search transitions"
      value="${this._esc(this.search)}">
    </div>

    <div class="vetr-browser-target">
     <span>Apply To</span>

     <button
      type="button"
      data-target="in"
      class="${target === "in" ? "active" : ""}">
      IN
     </button>

     <button
      type="button"
      data-target="between"
      class="${target === "between" ? "active" : ""}">
      CUT
     </button>

     <button
      type="button"
      data-target="out"
      class="${target === "out" ? "active" : ""}">
      OUT
     </button>
    </div>

    <div class="vetr-browser-categories">
     ${categories
       .map(
         (category) => `
      <button
       type="button"
       data-category="${this._esc(category)}"
       class="${category === this.category ? "active" : ""}">
       ${this._esc(category)}
      </button>
     `,
       )
       .join("")}
    </div>

    <div class="vetr-browser-list">
     ${definitions
       .map(
         (definition) => `
      <button
       type="button"
       class="vetr-browser-item"
       data-transition="${definition.id}"
       title="Double click to apply">
       <span class="vetr-browser-icon">
        ${library.icon(definition.icon)}
       </span>

       <span class="vetr-browser-copy">
        <strong>${this._esc(definition.name)}</strong>
        <em>${this._esc(definition.category)}</em>
       </span>

       <span class="vetr-browser-badge ${definition.renderer === "compositor" ? "advanced" : ""}">
        ${definition.renderer === "live-opacity" ? "LIVE" : "COMP"}
       </span>
      </button>
     `,
       )
       .join("")}
    </div>
   </div>
  `;

      const input = this.host.querySelector(".vetr-browser-search input");

      input?.addEventListener("input", () => {
        this.search = input.value;

        this.render();
      });

      this.host.querySelectorAll("[data-category]").forEach((button) => {
        button.addEventListener("click", () => {
          this.category = button.dataset.category;

          this.render();
        });
      });

      this.host.querySelectorAll("[data-target]").forEach((button) => {
        button.addEventListener("click", () => {
          if (global.videoTransitionsDockManager) {
            global.videoTransitionsDockManager.targetMode =
              button.dataset.target;
          }

          this.render();
        });
      });

      this.host.querySelectorAll("[data-transition]").forEach((button) => {
        button.addEventListener("dblclick", () => {
          this._apply(button.dataset.transition);
        });
      });
    }

    _apply(id) {
      const dock = global.videoTransitionsDockManager;

      const target = dock?.targetMode || "between";

      const result = this.manager.applyToSelection(id, target, {
        duration: dock?.defaultDuration ?? this.manager.duration,
      });

      if (!result) {
        dock?._status?.(
          target === "between"
            ? "No adjacent clip on the same track."
            : "Select a clip first.",
        );

        return;
      }

      dock?.setTab?.("controls");

      global.videoTransitionInspectorPanel?.render?.();
    }

    _esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    _styles() {
      if (document.getElementById("vetr-browser-style")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "vetr-browser-style";

      style.textContent = `
   .vetr-browser-panel{
    height:100%;
    display:grid;
    grid-template-rows:34px 28px auto minmax(0,1fr);
    overflow:hidden;
    background:var(--primary-dark,#333);
    color:var(--text-primary,#fff);
   }

   .vetr-browser-search{
    display:grid;
    grid-template-columns:18px minmax(0,1fr);
    align-items:center;
    gap:6px;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .vetr-browser-search>span{
    width:16px;
    height:16px;
    color:var(--text-secondary,#b0b0b0);
   }

   .vetr-browser-search svg,
   .vetr-browser-icon svg{
    width:100%;
    height:100%;
    fill:none;
    stroke:currentColor;
    stroke-width:1.6;
    stroke-linecap:round;
    stroke-linejoin:round;
   }

   .vetr-browser-search input{
    height:21px;
    padding:0 6px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--primary-dark,#333);
    color:var(--text-primary,#fff);
    font-size:8px;
   }

   .vetr-browser-target{
    display:flex;
    align-items:center;
    gap:2px;
    padding:0 5px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--secondary-dark,#3c3c3c);
   }

   .vetr-browser-target>span{
    margin-right:4px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vetr-browser-target button,
   .vetr-browser-categories button{
    height:20px;
    padding:0 6px;
    border:1px solid transparent;
    border-radius:0;
    background:transparent;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
    white-space:nowrap;
   }

   .vetr-browser-target button:hover,
   .vetr-browser-target button.active,
   .vetr-browser-categories button:hover,
   .vetr-browser-categories button.active{
    border-color:var(--border-color,#4d4d4d81);
    background:var(--accent-blue-dark,#474747);
    color:#fff;
   }

   .vetr-browser-categories{
    display:flex;
    gap:2px;
    padding:5px;
    overflow-x:auto;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
   }

   .vetr-browser-list{
    overflow:auto;
    padding:5px;
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:4px;
    align-content:start;
   }

   .vetr-browser-item{
    min-height:47px;
    display:grid;
    grid-template-columns:22px minmax(0,1fr) auto;
    align-items:center;
    gap:6px;
    padding:5px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--panel-bg,#333);
    color:var(--text-primary,#fff);
    text-align:left;
   }

   .vetr-browser-item:hover{
    background:var(--secondary-dark,#3c3c3c);
   }

   .vetr-browser-icon{
    width:18px;
    height:18px;
    color:var(--text-secondary,#b0b0b0);
   }

   .vetr-browser-copy{
    min-width:0;
   }

   .vetr-browser-copy strong,
   .vetr-browser-copy em{
    display:block;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
   }

   .vetr-browser-copy strong{
    font-size:8px;
   }

   .vetr-browser-copy em{
    margin-top:2px;
    font-style:normal;
    font-size:6px;
    color:var(--text-secondary,#b0b0b0);
   }

   .vetr-browser-badge{
    font-size:6px;
    color:var(--text-secondary,#b0b0b0);
   }

   .vetr-browser-badge.advanced{
    opacity:.6;
   }
  `;

      document.head.appendChild(style);
    }
  }

  global.VideoTransitionsBrowserPanel = VideoTransitionsBrowserPanel;
})(window);

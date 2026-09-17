// ============================================================================
// engine/settings/addons/ui/SMAddonSettingsUI.js
//
// SM Engine — Add-ons Settings UI
//
// Responsibilities:
// - Mount into SettingsPanel page: [data-settings-page="addons"]
// - Replace the old placeholder automatically
// - Render global Add-on policy controls
// - Search / category filter
// - Enable / disable add-ons
// - Show status / metadata / errors
// - Render manifest preferences
// - Run add-on commands
//
// This file does NOT own add-on runtime logic.
// Runtime authority stays in SMAddonManager.
// Global settings stay in EngineSettings.
// ============================================================================

(function () {
  "use strict";

  class SMAddonSettingsUI {
    constructor() {
      this.page = null;
      this.root = null;

      this.searchQuery = "";
      this.category = "all";

      this._observer = null;
      this._mounted = false;
      this._eventsBound = false;
      this._settingsUnsubscribe = null;

      this._searchTimer = 0;
      this._renderRAF = 0;

      this._expandedAddons = new Set();

      this._busyAddons = new Set();
    }

    // --------------------------------------------------------------------
    // Dependencies
    // --------------------------------------------------------------------

    get manager() {
      return window.SMAddonManager || null;
    }

    get registry() {
      return window.SMAddonRegistry || null;
    }

    get settings() {
      return window.EngineSettings || null;
    }

    // --------------------------------------------------------------------
    // Mount
    // --------------------------------------------------------------------

    mountWhenReady() {
      if (this.mount()) {
        return true;
      }

      if (this._observer) {
        return false;
      }

      this._observer = new MutationObserver(() => {
        if (this.mount()) {
          this._observer?.disconnect?.();

          this._observer = null;
        }
      });

      this._observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });

      return false;
    }

    mount() {
      const page = document.querySelector('[data-settings-page="addons"]');

      if (!page) {
        return false;
      }

      this.page = page;

      /*
       * Remove the old SettingsPanel placeholder:
       *
       * <div class="settings-placeholder">
       *   ...
       * </div>
       */
      page.querySelector(".settings-placeholder")?.remove();

      let root = page.querySelector("#sm-addon-settings-root");

      if (!root) {
        root = document.createElement("div");

        root.id = "sm-addon-settings-root";

        root.className = "sm-addon-settings-root";

        page.appendChild(root);
      }

      this.root = root;

      this._injectStyles();
      this._bindGlobalEvents();
      this._bindDelegatedUI();

      this._mounted = true;

      this.render();

      return true;
    }

    // --------------------------------------------------------------------
    // Rendering
    // --------------------------------------------------------------------

    scheduleRender() {
      if (this._renderRAF) {
        return;
      }

      this._renderRAF = requestAnimationFrame(() => {
        this._renderRAF = 0;

        if (this.root?.isConnected) {
          this.render();
        }
      });
    }

    render() {
      if (!this.root) {
        return;
      }

      const manager = this.manager;

      const registry = this.registry;

      const settings = this.settings;

      if (!manager || !registry) {
        this.root.innerHTML = `
                    <div class="sm-addon-empty">
                        Add-on runtime is not ready yet.
                    </div>
                `;

        return;
      }

      const categories = registry.categories?.() || [];

      const addons = manager.list?.() || [];

      const query = this.searchQuery.trim().toLowerCase();

      const filtered = addons.filter((addon) => {
        if (this.category !== "all" && addon.category !== this.category) {
          return false;
        }

        if (!query) {
          return true;
        }

        const text = [
          addon.name,
          addon.id,
          addon.description,
          addon.category,
          addon.author,
          addon.version,
        ]
          .join(" ")
          .toLowerCase();

        return text.includes(query);
      });

      const masterEnabled = this._settingValue(
        "setting-addons-master-enabled",
        true,
      );

      const autoStart = this._settingValue("setting-addons-auto-start", true);

      const safeMode = this._settingValue("setting-addons-safe-mode", false);

      const experimental = this._settingValue(
        "setting-addons-allow-experimental",
        false,
      );

      const logLevel = String(
        this._settingValue("setting-addons-log-level", "info"),
      );

      this.root.innerHTML = `
                <div class="sm-addon-page-head">
                    <div class="sm-addon-page-title">
                        <i class="fa-solid fa-puzzle-piece"></i>

                        <div>
                            <strong>Add-ons</strong>
                            <span>
                                Manage SM Engine extensions and editor modules
                            </span>
                        </div>
                    </div>

                    <div class="sm-addon-page-count">
                        ${addons.length} registered
                    </div>
                </div>

                <div class="sm-addon-policy-grid">

                    ${this._renderBooleanPolicy(
                      "setting-addons-master-enabled",
                      "Enable Add-ons",
                      "Master switch for the complete Add-on runtime.",
                      masterEnabled,
                    )}

                    ${this._renderBooleanPolicy(
                      "setting-addons-auto-start",
                      "Auto Start",
                      "Start configured/default add-ons after engine boot.",
                      autoStart,
                    )}

                    ${this._renderBooleanPolicy(
                      "setting-addons-safe-mode",
                      "Safe Mode",
                      "Only trusted built-in add-ons are allowed to run.",
                      safeMode,
                    )}

                    ${this._renderBooleanPolicy(
                      "setting-addons-allow-experimental",
                      "Experimental Add-ons",
                      "Allow add-ons marked as experimental.",
                      experimental,
                    )}

                    <label class="sm-addon-policy-row">
                        <span class="sm-addon-policy-text">
                            <strong>Console Log Level</strong>
                            <small>
                                Minimum add-on log level forwarded to the Global Console.
                            </small>
                        </span>

                        <select
                            class="sm-addon-select"
                            data-addon-policy="setting-addons-log-level"
                        >
                            ${["debug", "info", "warn", "error", "none"]
                              .map(
                                (value) => `
                                        <option
                                            value="${value}"
                                            ${logLevel === value ? "selected" : ""}
                                        >
                                            ${value}
                                        </option>
                                    `,
                              )
                              .join("")}
                        </select>
                    </label>

                </div>

                <div class="sm-addon-toolbar">

                    <div class="sm-addon-search-wrap">
                        <i class="fa-solid fa-magnifying-glass"></i>

                        <input
                            class="sm-addon-search"
                            type="search"
                            autocomplete="off"
                            spellcheck="false"
                            placeholder="Search add-ons..."
                            value="${this._escape(this.searchQuery)}"
                        >
                    </div>

                    <select
                        class="sm-addon-category-filter"
                        aria-label="Add-on category"
                    >
                        <option value="all">
                            All Categories
                        </option>

                        ${categories
                          .map(
                            (category) => `
                                    <option
                                        value="${this._escape(category)}"
                                        ${category === this.category ? "selected" : ""}
                                    >
                                        ${this._escape(category)}
                                    </option>
                                `,
                          )
                          .join("")}
                    </select>

                    <button
                        class="sm-addon-toolbar-btn"
                        type="button"
                        data-addon-global-action="enable-defaults"
                        title="Enable default add-ons"
                    >
                        Enable Defaults
                    </button>

                    <button
                        class="sm-addon-toolbar-btn"
                        type="button"
                        data-addon-global-action="disable-all"
                        title="Disable all active add-ons"
                    >
                        Disable All
                    </button>

                    <button
                        class="sm-addon-toolbar-btn sm-addon-toolbar-icon"
                        type="button"
                        data-addon-global-action="refresh"
                        title="Refresh Add-ons list"
                    >
                        <i class="fa-solid fa-rotate-right"></i>
                    </button>

                </div>

                <div class="sm-addon-list">
                    ${
                      filtered.length
                        ? filtered
                            .map((addon) => this._renderAddonCard(addon))
                            .join("")
                        : `
                                <div class="sm-addon-empty">
                                    <i class="fa-solid fa-puzzle-piece"></i>
                                    <span>
                                        No add-ons match this filter.
                                    </span>
                                </div>
                            `
                    }
                </div>
            `;
    }

    _renderBooleanPolicy(id, label, description, value) {
      return `
                <label class="sm-addon-policy-row">
                    <span class="sm-addon-policy-text">
                        <strong>
                            ${this._escape(label)}
                        </strong>

                        <small>
                            ${this._escape(description)}
                        </small>
                    </span>

                    <input
                        class="sm-addon-policy-checkbox"
                        type="checkbox"
                        data-addon-policy="${this._escape(id)}"
                        ${value ? "checked" : ""}
                    >
                </label>
            `;
    }

    _renderAddonCard(addon) {
      const id = addon.id;

      const expanded = this._expandedAddons.has(id);

      const busy = this._busyAddons.has(id);

      const state =
        addon.status?.state || (addon.enabled ? "enabled" : "disabled");

      const registryEntry = this.registry?.get?.(id);

      const manifest = registryEntry?.manifest || addon;

      const preferences = Array.isArray(manifest.preferences)
        ? manifest.preferences
        : [];

      const values = addon.preferences || {};

      const commands = Array.isArray(manifest.commands)
        ? manifest.commands
        : [];

      const stateLabel = busy ? "working" : state;

      const stateClass = [
        "enabled",
        "error",
        "blocked",
        "starting",
        "working",
      ].includes(stateLabel)
        ? stateLabel
        : "disabled";

      return `
                <article
                    class="sm-addon-card ${expanded ? "open" : ""}"
                    data-addon-id="${this._escape(id)}"
                >

                    <div class="sm-addon-card-head">

                        <button
                            class="sm-addon-expand-btn"
                            type="button"
                            data-addon-action="expand"
                            aria-label="Toggle add-on details"
                            title="Details"
                        >
                            <i class="fa-solid fa-chevron-${expanded ? "down" : "right"}"></i>
                        </button>

                        <div class="sm-addon-icon">
                            <i class="${this._escape(
                              addon.icon || "fa-solid fa-puzzle-piece",
                            )}"></i>
                        </div>

                        <div class="sm-addon-card-main">

                            <div class="sm-addon-card-title">
                                <span>
                                    ${this._escape(addon.name)}
                                </span>

                                ${
                                  addon.experimental
                                    ? `
                                            <span class="sm-addon-tag experimental">
                                                Experimental
                                            </span>
                                        `
                                    : ""
                                }

                                ${
                                  addon.builtIn
                                    ? `
                                            <span class="sm-addon-tag">
                                                Built-in
                                            </span>
                                        `
                                    : ""
                                }
                            </div>

                            <div class="sm-addon-card-meta">
                                ${this._escape(addon.category)}

                                <span>·</span>

                                v${this._escape(addon.version)}

                                <span>·</span>

                                ${this._escape(addon.author)}

                                <span>·</span>

                                <code>
                                    ${this._escape(addon.id)}
                                </code>
                            </div>

                        </div>

                        <div class="sm-addon-card-actions">

                            <span
                                class="sm-addon-state ${stateClass}"
                                title="${this._escape(
                                  addon.status?.error || stateLabel,
                                )}"
                            >
                                ${this._escape(stateLabel)}
                            </span>

                            <label
                                class="sm-addon-switch"
                                title="${addon.enabled ? "Disable add-on" : "Enable add-on"}"
                            >
                                <input
                                    type="checkbox"
                                    data-addon-action="toggle"
                                    ${addon.enabled ? "checked" : ""}
                                    ${busy || state === "starting" ? "disabled" : ""}
                                >

                                <span></span>
                            </label>

                        </div>
                    </div>

                    <div class="sm-addon-description">
                        ${this._escape(addon.description || "No description.")}
                    </div>

                    ${
                      addon.status?.error
                        ? `
                                <div class="sm-addon-error">
                                    <i class="fa-solid fa-triangle-exclamation"></i>
                                    <span>
                                        ${this._escape(addon.status.error)}
                                    </span>
                                </div>
                            `
                        : ""
                    }

                    <div class="sm-addon-details">

                        <div class="sm-addon-detail-section">
                            <div class="sm-addon-detail-title">
                                Preferences
                            </div>

                            ${
                              preferences.length
                                ? preferences
                                    .map((preference) =>
                                      this._renderPreference(
                                        addon,
                                        preference,
                                        values[preference.id],
                                      ),
                                    )
                                    .join("")
                                : `
                                        <div class="sm-addon-muted">
                                            No add-on preferences.
                                        </div>
                                    `
                            }
                        </div>

                        ${
                          commands.length
                            ? `
                                    <div class="sm-addon-detail-section">
                                        <div class="sm-addon-detail-title">
                                            Commands
                                        </div>

                                        <div class="sm-addon-command-row">
                                            ${commands
                                              .map(
                                                (command) => `
                                                        <button
                                                            class="sm-addon-command-btn"
                                                            type="button"
                                                            data-addon-command="${this._escape(
                                                              command.id,
                                                            )}"
                                                            title="${this._escape(
                                                              command.description ||
                                                                "",
                                                            )}"
                                                            ${!addon.enabled || busy ? "disabled" : ""}
                                                        >
                                                            ${this._escape(
                                                              command.label ||
                                                                command.id,
                                                            )}
                                                        </button>
                                                    `,
                                              )
                                              .join("")}
                                        </div>
                                    </div>
                                `
                            : ""
                        }

                        <div class="sm-addon-detail-section">
                            <div class="sm-addon-detail-title">
                                Runtime
                            </div>

                            <div class="sm-addon-runtime-grid">

                                <div>
                                    <span>Status</span>
                                    <strong>
                                        ${this._escape(state)}
                                    </strong>
                                </div>

                                <div>
                                    <span>Default</span>
                                    <strong>
                                        ${addon.defaultEnabled ? "Enabled" : "Disabled"}
                                    </strong>
                                </div>

                                <div>
                                    <span>Trust</span>
                                    <strong>
                                        ${addon.builtIn ? "Built-in" : "External"}
                                    </strong>
                                </div>

                                <div>
                                    <span>Capabilities</span>
                                    <strong>
                                        ${
                                          Array.isArray(addon.capabilities)
                                            ? addon.capabilities.length
                                            : 0
                                        }
                                    </strong>
                                </div>

                            </div>
                        </div>

                    </div>

                </article>
            `;
    }

    _renderPreference(addon, preference, value) {
      const id = preference.id;

      const type = preference.type || "string";

      const effectiveValue = value !== undefined ? value : preference.default;

      let control = "";

      if (type === "boolean") {
        control = `
                    <input
                        class="sm-addon-pref-checkbox"
                        type="checkbox"
                        data-addon-pref="${this._escape(id)}"
                        ${effectiveValue ? "checked" : ""}
                    >
                `;
      } else if (type === "select") {
        const options = Array.isArray(preference.options)
          ? preference.options
          : [];

        control = `
                    <select
                        class="sm-addon-pref-control"
                        data-addon-pref="${this._escape(id)}"
                    >
                        ${options
                          .map((option) => {
                            const optionValue =
                              typeof option === "object"
                                ? option.value
                                : option;

                            const optionLabel =
                              typeof option === "object"
                                ? (option.label ?? option.value)
                                : option;

                            return `
                                        <option
                                            value="${this._escape(optionValue)}"
                                            ${
                                              String(effectiveValue) ===
                                              String(optionValue)
                                                ? "selected"
                                                : ""
                                            }
                                        >
                                            ${this._escape(optionLabel)}
                                        </option>
                                    `;
                          })
                          .join("")}
                    </select>
                `;
      } else {
        control = `
                    <input
                        class="sm-addon-pref-control"
                        type="${type === "number" ? "number" : "text"}"
                        data-addon-pref="${this._escape(id)}"
                        value="${this._escape(effectiveValue ?? "")}"
                        ${
                          preference.min !== undefined
                            ? `min="${this._escape(preference.min)}"`
                            : ""
                        }
                        ${
                          preference.max !== undefined
                            ? `max="${this._escape(preference.max)}"`
                            : ""
                        }
                        ${
                          preference.step !== undefined
                            ? `step="${this._escape(preference.step)}"`
                            : ""
                        }
                    >
                `;
      }

      return `
                <label class="sm-addon-pref-row">

                    <span class="sm-addon-pref-text">
                        <strong>
                            ${this._escape(preference.label || id)}
                        </strong>

                        ${
                          preference.description
                            ? `
                                    <small>
                                        ${this._escape(preference.description)}
                                    </small>
                                `
                            : ""
                        }
                    </span>

                    <span class="sm-addon-pref-input">
                        ${control}
                    </span>

                </label>
            `;
    }

    // --------------------------------------------------------------------
    // Event handling
    // --------------------------------------------------------------------

    _bindDelegatedUI() {
      if (this._eventsBound || !this.root) {
        return;
      }

      this._eventsBound = true;

      this.root.addEventListener("input", (event) => {
        const search = event.target.closest(".sm-addon-search");

        if (!search) {
          return;
        }

        this.searchQuery = search.value;

        clearTimeout(this._searchTimer);

        this._searchTimer = setTimeout(() => this.render(), 120);
      });

      this.root.addEventListener("change", async (event) => {
        const target = event.target;

        if (target.matches(".sm-addon-category-filter")) {
          this.category = target.value;

          this.render();

          return;
        }

        const policy = target.dataset?.addonPolicy;

        if (policy) {
          const value =
            target.type === "checkbox" ? target.checked : target.value;

          this.settings?.set?.(policy, value);

          return;
        }

        const card = target.closest(".sm-addon-card[data-addon-id]");

        if (!card) {
          return;
        }

        const addonId = card.dataset.addonId;

        if (target.matches('[data-addon-action="toggle"]')) {
          await this._setAddonEnabled(addonId, target.checked);

          return;
        }

        const preference = target.dataset?.addonPref;

        if (preference) {
          const value =
            target.type === "checkbox" ? target.checked : target.value;

          this.manager?.setPreference?.(addonId, preference, value);

          return;
        }
      });

      this.root.addEventListener("click", async (event) => {
        const globalAction = event.target.closest("[data-addon-global-action]")
          ?.dataset?.addonGlobalAction;

        if (globalAction) {
          await this._runGlobalAction(globalAction);

          return;
        }

        const card = event.target.closest(".sm-addon-card[data-addon-id]");

        if (!card) {
          return;
        }

        const addonId = card.dataset.addonId;

        if (event.target.closest('[data-addon-action="expand"]')) {
          if (this._expandedAddons.has(addonId)) {
            this._expandedAddons.delete(addonId);
          } else {
            this._expandedAddons.add(addonId);
          }

          this.render();

          return;
        }

        const commandButton = event.target.closest("[data-addon-command]");

        if (commandButton) {
          await this._runCommand(addonId, commandButton.dataset.addonCommand);
        }
      });
    }

    _bindGlobalEvents() {
      if (this._globalEventsBound) {
        return;
      }

      this._globalEventsBound = true;

      [
        "sm:addon-registered",
        "sm:addon-unregistered",
        "sm:addon-status-changed",
        "sm:addon-policy-changed",
        "sm:addon-preference-changed",
      ].forEach((eventName) => {
        window.addEventListener(eventName, () => this.scheduleRender());
      });

      if (
        !this._settingsUnsubscribe &&
        typeof this.settings?.onChange === "function"
      ) {
        this._settingsUnsubscribe = this.settings.onChange((id) => {
          if (String(id).startsWith("setting-addons-")) {
            this.scheduleRender();
          }
        });
      }
    }

    async _setAddonEnabled(addonId, enabled) {
      if (!addonId || this._busyAddons.has(addonId)) {
        return;
      }

      this._busyAddons.add(addonId);

      this.render();

      try {
        if (enabled) {
          await this.manager?.enable?.(addonId);
        } else {
          await this.manager?.disable?.(addonId);
        }
      } catch (error) {
        this._log(
          "error",
          `Could not ${enabled ? "enable" : "disable"} "${addonId}".`,
          error,
        );
      } finally {
        this._busyAddons.delete(addonId);

        this.render();
      }
    }

    async _runCommand(addonId, commandId) {
      if (!addonId || !commandId || this._busyAddons.has(addonId)) {
        return;
      }

      this._busyAddons.add(addonId);

      this.render();

      try {
        await this.manager?.runCommand?.(addonId, commandId);
      } catch (error) {
        this._log(
          "error",
          `Add-on command failed: ${addonId}.${commandId}`,
          error,
        );
      } finally {
        this._busyAddons.delete(addonId);

        this.render();
      }
    }

    async _runGlobalAction(action) {
      if (!this.manager) {
        return;
      }

      try {
        if (action === "enable-defaults") {
          await this.manager.enableDefaults?.();
        }

        if (action === "disable-all") {
          await this.manager.disableAll?.();
        }

        if (action === "refresh") {
          this.render();

          return;
        }
      } catch (error) {
        this._log("error", `Add-ons action "${action}" failed.`, error);
      }

      this.render();
    }

    // --------------------------------------------------------------------
    // Helpers
    // --------------------------------------------------------------------

    _settingValue(id, fallback) {
      const value = this.settings?.get?.(id);

      return value === null || value === undefined ? fallback : value;
    }

    _log(level, message, extra = null) {
      const args = [message];

      if (extra !== null && extra !== undefined) {
        args.push(extra);
      }

      if (window.SMConsolePanel?.push) {
        window.SMConsolePanel.push(level, args, {
          source: "AddonsUI",
        });

        return;
      }

      if (level === "error") {
        console.error(...args);
      } else if (level === "warn") {
        console.warn(...args);
      } else {
        console.info(...args);
      }
    }

    _escape(value) {
      return String(value ?? "").replace(
        /[&<>"']/g,
        (character) =>
          ({
            "&": "&amp;",

            "<": "&lt;",

            ">": "&gt;",

            '"': "&quot;",

            "'": "&#39;",
          })[character],
      );
    }

    // --------------------------------------------------------------------
    // Styles
    // --------------------------------------------------------------------

    _injectStyles() {
      if (document.getElementById("sm-addon-settings-ui-styles")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "sm-addon-settings-ui-styles";

      style.textContent = `
                #sm-addon-settings-root {
                    min-height: 100%;

                    display: flex;
                    flex-direction: column;

                    background:
                        var(--panel-bg, #333333);

                    color:
                        var(--text-primary, #ffffff);
                }

                .sm-addon-page-head {
                    min-height: 48px;

                    display: flex;
                    align-items: center;
                    justify-content: space-between;

                    gap: 12px;

                    padding: 7px 12px;

                    background:
                        var(--secondary-dark, #3c3c3c);
                }

                .sm-addon-page-title {
                    min-width: 0;

                    display: flex;
                    align-items: center;

                    gap: 9px;
                }

                .sm-addon-page-title > i {
                    color: #9b9b9b;
                    font-size: 13px;
                }

                .sm-addon-page-title > div {
                    min-width: 0;

                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .sm-addon-page-title strong {
                    color: #e6e6e6;
                    font-size: 11px;
                    font-weight: 600;
                }

                .sm-addon-page-title span {
                    color: #7d7d7d;
                    font-size: 8px;

                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .sm-addon-page-count {
                    flex: 0 0 auto;

                    color: #787878;

                    font:
                        8px
                        "Cascadia Mono",
                        Consolas,
                        monospace;
                }

                .sm-addon-policy-grid {
                    display: grid;

                    grid-template-columns:
                        repeat(
                            2,
                            minmax(230px, 1fr)
                        );

                    background:
                        var(--primary-dark, #333333);
                }

                .sm-addon-policy-row {
                    min-height: 44px;

                    display: flex;
                    align-items: center;
                    justify-content: space-between;

                    gap: 16px;

                    padding: 5px 12px;

                    cursor: default;
                }

                .sm-addon-policy-row:hover {
                    background:
                        rgba(
                            255,
                            255,
                            255,
                            0.025
                        );
                }

                .sm-addon-policy-text {
                    min-width: 0;

                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .sm-addon-policy-text strong {
                    color: #c9c9c9;

                    font-size: 9px;
                    font-weight: 500;
                }

                .sm-addon-policy-text small {
                    color: #696969;

                    font-size: 8px;

                    line-height: 1.35;
                }

                .sm-addon-policy-checkbox,
                .sm-addon-pref-checkbox {
                    width: 14px;
                    height: 14px;

                    flex: 0 0 auto;
                }

                .sm-addon-select,
                .sm-addon-category-filter,
                .sm-addon-pref-control {
                    height: 24px;

                    background:
                        #2d2d2d;

                    color:
                        #cccccc;

                    border: 0;
                    border-radius: 0;
                    outline: 0;

                    padding: 0 7px;

                    font-size: 9px;
                }

                .sm-addon-select {
                    min-width: 108px;
                }

                .sm-addon-toolbar {
                    min-height: 35px;

                    display: flex;
                    align-items: center;

                    gap: 4px;

                    padding: 5px 10px;

                    background:
                        var(
                            --secondary-dark,
                            #3c3c3c
                        );
                }

                .sm-addon-search-wrap {
                    min-width: 180px;
                    flex: 1 1 auto;

                    height: 24px;

                    display: flex;
                    align-items: center;

                    gap: 6px;

                    padding: 0 7px;

                    background:
                        #303030;
                }

                .sm-addon-search-wrap i {
                    color: #666666;
                    font-size: 9px;
                }

                .sm-addon-search {
                    min-width: 0;
                    width: 100%;
                    height: 22px;

                    background:
                        transparent;

                    color: #dddddd;

                    border: 0;
                    outline: 0;

                    font-size: 9px;
                }

                .sm-addon-search::placeholder {
                    color: #626262;
                }

                .sm-addon-category-filter {
                    min-width: 125px;
                }

                .sm-addon-toolbar-btn {
                    height: 24px;

                    background:
                        transparent;

                    color: #9a9a9a;

                    border: 0;
                    border-radius: 0;

                    padding: 0 8px;

                    font-size: 8px;

                    white-space: nowrap;

                    cursor: pointer;
                }

                .sm-addon-toolbar-btn:hover {
                    background:
                        rgba(
                            255,
                            255,
                            255,
                            0.055
                        );

                    color: #ffffff;
                }

                .sm-addon-toolbar-icon {
                    width: 27px;
                    padding: 0;
                }

                .sm-addon-list {
                    min-height: 0;

                    display: flex;
                    flex-direction: column;

                    gap: 2px;

                    padding: 5px 10px 12px;
                }

                .sm-addon-card {
                    background:
                        #303030;

                    border: 0;
                    border-radius: 0;

                    overflow: hidden;
                }

                .sm-addon-card:hover {
                    background:
                        #323232;
                }

                .sm-addon-card-head {
                    min-height: 45px;

                    display: grid;

                    grid-template-columns:
                        20px
                        28px
                        minmax(0, 1fr)
                        auto;

                    align-items: center;

                    gap: 5px;

                    padding: 4px 8px 3px 5px;
                }

                .sm-addon-expand-btn {
                    width: 20px;
                    height: 24px;

                    display: grid;
                    place-items: center;

                    padding: 0;

                    background:
                        transparent;

                    color: #707070;

                    border: 0;
                    border-radius: 0;

                    cursor: pointer;
                }

                .sm-addon-expand-btn:hover {
                    color: #c7c7c7;
                }

                .sm-addon-expand-btn i {
                    font-size: 8px;
                }

                .sm-addon-icon {
                    width: 26px;
                    height: 26px;

                    display: grid;
                    place-items: center;

                    color: #929292;

                    font-size: 12px;
                }

                .sm-addon-card-main {
                    min-width: 0;
                }

                .sm-addon-card-title {
                    min-width: 0;

                    display: flex;
                    align-items: center;

                    gap: 5px;

                    color: #dddddd;

                    font-size: 10px;
                    font-weight: 600;
                }

                .sm-addon-card-title > span:first-child {
                    min-width: 0;

                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .sm-addon-tag {
                    flex: 0 0 auto;

                    padding: 1px 4px;

                    background:
                        rgba(
                            255,
                            255,
                            255,
                            0.045
                        );

                    color: #777777;

                    font:
                        7px
                        "Cascadia Mono",
                        Consolas,
                        monospace;

                    text-transform: uppercase;
                }

                .sm-addon-tag.experimental {
                    color: #a894b5;
                }

                .sm-addon-card-meta {
                    margin-top: 3px;

                    display: flex;
                    align-items: center;

                    gap: 4px;

                    color: #676767;

                    font-size: 8px;

                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .sm-addon-card-meta code {
                    color: #747474;

                    font:
                        8px
                        "Cascadia Mono",
                        Consolas,
                        monospace;
                }

                .sm-addon-card-actions {
                    display: flex;
                    align-items: center;

                    gap: 8px;
                }

                .sm-addon-state {
                    min-width: 52px;

                    color: #717171;

                    font:
                        7px
                        "Cascadia Mono",
                        Consolas,
                        monospace;

                    text-align: right;
                    text-transform: uppercase;
                }

                .sm-addon-state.enabled {
                    color: #86ad90;
                }

                .sm-addon-state.error {
                    color: #cc8585;
                }

                .sm-addon-state.blocked {
                    color: #b89b72;
                }

                .sm-addon-state.starting,
                .sm-addon-state.working {
                    color: #9b9b9b;
                }

                .sm-addon-switch {
                    width: 28px;
                    height: 14px;

                    position: relative;

                    display: inline-block;

                    flex: 0 0 auto;

                    cursor: pointer;
                }

                .sm-addon-switch input {
                    position: absolute;
                    opacity: 0;
                    pointer-events: none;
                }

                .sm-addon-switch span {
                    position: absolute;
                    inset: 0;

                    background:
                        #454545;
                }

                .sm-addon-switch span::after {
                    content: "";

                    width: 10px;
                    height: 10px;

                    position: absolute;

                    left: 2px;
                    top: 2px;

                    background:
                        #8a8a8a;

                    transition:
                        transform
                        100ms
                        ease;
                }

                .sm-addon-switch input:checked + span {
                    background:
                        #566c5d;
                }

                .sm-addon-switch input:checked + span::after {
                    transform:
                        translateX(14px);

                    background:
                        #d4d4d4;
                }

                .sm-addon-switch input:disabled + span {
                    opacity: 0.45;
                }

                .sm-addon-description {
                    padding:
                        0
                        42px
                        7px
                        58px;

                    color: #858585;

                    font-size: 8px;

                    line-height: 1.45;
                }

                .sm-addon-error {
                    display: flex;
                    align-items: flex-start;

                    gap: 6px;

                    margin:
                        0
                        8px
                        7px
                        58px;

                    padding: 6px 8px;

                    background:
                        rgba(
                            140,
                            50,
                            50,
                            0.12
                        );

                    color: #be8585;

                    font-size: 8px;

                    line-height: 1.4;
                }

                .sm-addon-error i {
                    margin-top: 1px;
                }

                .sm-addon-details {
                    display: none;

                    background:
                        #2d2d2d;
                }

                .sm-addon-card.open
                .sm-addon-details {
                    display: block;
                }

                .sm-addon-detail-section {
                    padding:
                        8px
                        12px
                        9px
                        58px;
                }

                .sm-addon-detail-section +
                .sm-addon-detail-section {
                    padding-top: 4px;
                }

                .sm-addon-detail-title {
                    margin-bottom: 5px;

                    color: #747474;

                    font:
                        7px
                        "Cascadia Mono",
                        Consolas,
                        monospace;

                    text-transform: uppercase;
                    letter-spacing: 0.4px;
                }

                .sm-addon-pref-row {
                    min-height: 32px;

                    display: grid;

                    grid-template-columns:
                        minmax(
                            150px,
                            220px
                        )
                        minmax(
                            110px,
                            1fr
                        );

                    align-items: center;

                    gap: 12px;
                }

                .sm-addon-pref-row:hover {
                    background:
                        rgba(
                            255,
                            255,
                            255,
                            0.018
                        );
                }

                .sm-addon-pref-text {
                    min-width: 0;

                    display: flex;
                    flex-direction: column;
                    gap: 1px;
                }

                .sm-addon-pref-text strong {
                    color: #a9a9a9;

                    font-size: 8px;
                    font-weight: 500;
                }

                .sm-addon-pref-text small {
                    color: #626262;

                    font-size: 7px;

                    line-height: 1.35;
                }

                .sm-addon-pref-input {
                    min-width: 0;

                    display: flex;
                    justify-content: flex-end;
                }

                .sm-addon-pref-control {
                    width: min(
                        190px,
                        100%
                    );
                }

                .sm-addon-command-row {
                    display: flex;
                    flex-wrap: wrap;

                    gap: 4px;
                }

                .sm-addon-command-btn {
                    min-height: 24px;

                    padding: 0 9px;

                    background:
                        #383838;

                    color: #a9a9a9;

                    border: 0;
                    border-radius: 0;

                    font-size: 8px;

                    cursor: pointer;
                }

                .sm-addon-command-btn:hover:not(:disabled) {
                    background:
                        #414141;

                    color: #ffffff;
                }

                .sm-addon-command-btn:disabled {
                    opacity: 0.38;
                    cursor: default;
                }

                .sm-addon-runtime-grid {
                    display: grid;

                    grid-template-columns:
                        repeat(
                            4,
                            minmax(
                                80px,
                                1fr
                            )
                        );

                    gap: 4px;
                }

                .sm-addon-runtime-grid > div {
                    min-height: 35px;

                    display: flex;
                    flex-direction: column;
                    justify-content: center;

                    gap: 2px;

                    padding: 4px 7px;

                    background:
                        #303030;
                }

                .sm-addon-runtime-grid span {
                    color: #626262;

                    font-size: 7px;
                }

                .sm-addon-runtime-grid strong {
                    color: #9d9d9d;

                    font:
                        8px
                        "Cascadia Mono",
                        Consolas,
                        monospace;

                    font-weight: 400;
                }

                .sm-addon-muted {
                    padding: 5px 0;

                    color: #666666;

                    font-size: 8px;
                }

                .sm-addon-empty {
                    min-height: 120px;

                    display: flex;
                    align-items: center;
                    justify-content: center;

                    gap: 7px;

                    color: #646464;

                    font-size: 9px;
                }

                .sm-addon-empty i {
                    font-size: 11px;
                }

                @media (
                    max-width: 900px
                ) {
                    .sm-addon-policy-grid {
                        grid-template-columns:
                            1fr;
                    }

                    .sm-addon-toolbar {
                        flex-wrap: wrap;
                    }

                    .sm-addon-search-wrap {
                        flex-basis: 100%;
                    }

                    .sm-addon-pref-row {
                        grid-template-columns:
                            1fr;
                    }

                    .sm-addon-pref-input {
                        justify-content:
                            flex-start;
                    }

                    .sm-addon-runtime-grid {
                        grid-template-columns:
                            repeat(
                                2,
                                minmax(
                                    80px,
                                    1fr
                                )
                            );
                    }

                    .sm-addon-description,
                    .sm-addon-detail-section {
                        padding-left:
                            12px;
                    }

                    .sm-addon-error {
                        margin-left:
                            12px;
                    }
                }
            `;

      document.head.appendChild(style);
    }

    // --------------------------------------------------------------------
    // Debug
    // --------------------------------------------------------------------

    debug() {
      console.table({
        Mounted: this._mounted,

        "Root connected": !!this.root?.isConnected,

        "Registered add-ons": this.registry?.list?.()?.length || 0,

        "Visible add-ons": this.manager?.list?.()?.length || 0,

        Search: this.searchQuery,

        Category: this.category,

        Expanded: this._expandedAddons.size,

        Busy: this._busyAddons.size,
      });
    }
  }

  const ui = new SMAddonSettingsUI();

  window.SMAddonSettingsUI = ui;

  window.smAddonSettingsUI = ui;

  ui.mountWhenReady();
})();

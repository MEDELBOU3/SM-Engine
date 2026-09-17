/**
 * GAME-UI/binding/UIEventBindingSystem.js
 * ------------------------------------------------------------
 * High-level event/action binding system.
 *
 * Keeps UI actions separated from UI widgets.
 *
 * Example:
 * button.events.click = {
 *     action: 'invoke',
 *     target: 'game',
 *     method: 'startGame',
 *     args: []
 * };
 */
(function () {
  "use strict";

  class UIEventBindingSystem {
    constructor(options = {}) {
      this.targets = new Map();
      this.actions = new Map();

      this.enabled = options.enabled ?? true;

      this.registerDefaultActions();
    }

    setEnabled(state) {
      this.enabled = Boolean(state);
      return this;
    }

    registerTarget(name, target) {
      if (!name) {
        throw new TypeError(
          "UIEventBindingSystem.registerTarget(name, target): name is required.",
        );
      }

      this.targets.set(String(name), target);
      return this;
    }

    unregisterTarget(name) {
      return this.targets.delete(String(name));
    }

    getTarget(name) {
      const target = this.targets.get(String(name));

      if (typeof target === "function" && target.__uiTargetProvider === true) {
        try {
          return target();
        } catch (error) {
          console.error(
            `[UIEventBindingSystem] Target provider "${name}" failed.`,
            error,
          );

          return null;
        }
      }

      return target ?? null;
    }

    registerTargetProvider(name, provider) {
      if (typeof provider !== "function") {
        throw new TypeError(
          "UIEventBindingSystem.registerTargetProvider(): provider must be a function.",
        );
      }

      provider.__uiTargetProvider = true;
      this.targets.set(String(name), provider);

      return this;
    }

    registerAction(name, handler) {
      if (!name || typeof handler !== "function") {
        throw new TypeError(
          "UIEventBindingSystem.registerAction(name, handler): invalid arguments.",
        );
      }

      this.actions.set(String(name), handler);
      return this;
    }

    unregisterAction(name) {
      return this.actions.delete(String(name));
    }

    registerDefaultActions() {
      this.registerAction("invoke", (descriptor, context) => {
        const target = this.resolveTarget(descriptor.target);

        if (!target) return false;

        const method = descriptor.method;

        if (!method || typeof target[method] !== "function") {
          console.warn(
            `[UIEventBindingSystem] Method "${method}" not found on target "${descriptor.target}".`,
          );

          return false;
        }

        target[method](
          ...(Array.isArray(descriptor.args) ? descriptor.args : []),
          context,
        );

        return true;
      });

      this.registerAction("set", (descriptor) => {
        const target = this.resolveTarget(descriptor.target);

        if (!target || !descriptor.path) return false;

        return this.setPath(target, descriptor.path, descriptor.value);
      });

      this.registerAction("toggle", (descriptor) => {
        const target = this.resolveTarget(descriptor.target);

        if (!target || !descriptor.path) return false;

        const current = this.getPath(target, descriptor.path);

        return this.setPath(target, descriptor.path, !current);
      });

      this.registerAction("emit", (descriptor, context) => {
        const eventName = descriptor.event || descriptor.name;

        if (!eventName) return false;

        window.dispatchEvent(
          new CustomEvent(eventName, {
            detail: {
              descriptor,
              context,
              data: descriptor.data,
            },
          }),
        );

        return true;
      });

      this.registerAction("dispatch-gameui", (descriptor, context) => {
        const eventName = descriptor.event || descriptor.name;

        if (!eventName) return false;

        window.dispatchEvent(
          new CustomEvent(`gameui:${eventName}`, {
            detail: {
              descriptor,
              context,
              data: descriptor.data,
            },
          }),
        );

        return true;
      });

      this.registerAction("show-widget", (descriptor, context) => {
        const document = context.document;
        const widget = document?.getWidget?.(descriptor.widgetId);

        if (!widget) return false;

        widget.setVisible?.(true);
        widget.visible = true;

        return true;
      });

      this.registerAction("hide-widget", (descriptor, context) => {
        const document = context.document;
        const widget = document?.getWidget?.(descriptor.widgetId);

        if (!widget) return false;

        widget.setVisible?.(false);
        widget.visible = false;

        return true;
      });

      this.registerAction("toggle-widget", (descriptor, context) => {
        const document = context.document;
        const widget = document?.getWidget?.(descriptor.widgetId);

        if (!widget) return false;

        const visible = widget.visible === false;
        widget.setVisible?.(visible);
        widget.visible = visible;

        return true;
      });

      return this;
    }

    execute(descriptor, context = {}) {
      if (!this.enabled || !descriptor) return false;

      if (Array.isArray(descriptor)) {
        let success = true;

        for (const action of descriptor) {
          if (!this.execute(action, context)) {
            success = false;
          }
        }

        return success;
      }

      if (typeof descriptor === "function") {
        try {
          descriptor(context);
          return true;
        } catch (error) {
          console.error(
            "[UIEventBindingSystem] Function action failed.",
            error,
          );
          return false;
        }
      }

      if (typeof descriptor === "string") {
        descriptor = {
          action: "invoke-global",
          path: descriptor,
        };
      }

      if (typeof descriptor !== "object") return false;

      if (descriptor.enabled === false) return false;

      if (!this._conditionsPass(descriptor, context)) {
        return false;
      }

      if (descriptor.action === "invoke-global") {
        return this._invokeGlobal(descriptor, context);
      }

      const handler = this.actions.get(descriptor.action);

      if (!handler) {
        console.warn(
          `[UIEventBindingSystem] Unknown action "${descriptor.action}".`,
          descriptor,
        );

        return false;
      }

      try {
        return handler(descriptor, context) !== false;
      } catch (error) {
        console.error(
          `[UIEventBindingSystem] Action "${descriptor.action}" failed.`,
          error,
        );

        return false;
      }
    }

    executeWidgetEvent(widget, eventName, payload = {}) {
      const descriptor = widget?.events?.[eventName];

      if (!descriptor) return false;

      return this.execute(descriptor, {
        widget,
        widgetId: widget.id,
        eventName,
        payload,
        document:
          payload.document || window.gameUIManager?.activeDocument || null,
        eventBindingSystem: this,
      });
    }

    resolveTarget(name) {
      if (!name) return null;

      if (name === "window" || name === "global") {
        return window;
      }

      if (this.targets.has(String(name))) {
        return this.getTarget(name);
      }

      return this.getPath(window, name);
    }

    getPath(object, path) {
      if (!object || !path) return object;

      const parts = this._parsePath(path);
      let current = object;

      for (const part of parts) {
        if (current == null) return undefined;
        current = current[part];
      }

      return current;
    }

    setPath(object, path, value) {
      if (!object || !path) return false;

      const parts = this._parsePath(path);

      if (!parts.length) return false;

      let current = object;

      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];

        if (current[key] == null || typeof current[key] !== "object") {
          current[key] = {};
        }

        current = current[key];
      }

      current[parts[parts.length - 1]] = value;

      return true;
    }

    _conditionsPass(descriptor, context) {
      const conditions = descriptor.conditions;

      if (!conditions) return true;

      const list = Array.isArray(conditions) ? conditions : [conditions];

      for (const condition of list) {
        if (!this._evaluateCondition(condition, context)) {
          return false;
        }
      }

      return true;
    }

    _evaluateCondition(condition, context) {
      if (typeof condition === "function") {
        return Boolean(condition(context));
      }

      if (!condition || typeof condition !== "object") {
        return Boolean(condition);
      }

      let source;

      if (condition.target) {
        source = this.resolveTarget(condition.target);
      } else {
        source = context;
      }

      const value = condition.path
        ? this.getPath(source, condition.path)
        : source;

      switch (condition.operator) {
        case "!=":
        case "not-equal":
          return value != condition.value;

        case "!==":
        case "strict-not-equal":
          return value !== condition.value;

        case ">":
          return value > condition.value;

        case ">=":
          return value >= condition.value;

        case "<":
          return value < condition.value;

        case "<=":
          return value <= condition.value;

        case "truthy":
          return Boolean(value);

        case "falsy":
          return !value;

        case "===":
        case "strict-equal":
          return value === condition.value;

        case "==":
        case "equal":
        default:
          return value == condition.value;
      }
    }

    _invokeGlobal(descriptor, context) {
      const fn = this.getPath(window, descriptor.path);

      if (typeof fn !== "function") {
        console.warn(
          `[UIEventBindingSystem] Global function "${descriptor.path}" was not found.`,
        );

        return false;
      }

      fn(...(Array.isArray(descriptor.args) ? descriptor.args : []), context);

      return true;
    }

    _parsePath(path) {
      return String(path)
        .replace(/\[(\w+)\]/g, ".$1")
        .replace(/^\./, "")
        .split(".")
        .filter(Boolean);
    }
  }

  window.UIEventBindingSystem = UIEventBindingSystem;

  if (!window.uiEventBindingSystem) {
    window.uiEventBindingSystem = new UIEventBindingSystem();
  }
})();

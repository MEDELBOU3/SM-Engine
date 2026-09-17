/**
 * GAME-UI/widgets/UIWidget.js
 * Base class for all Game UI widgets.
 */
(function () {
    'use strict';

    function createId(prefix = 'widget') {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return `${prefix}-${crypto.randomUUID()}`;
        }
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function clonePlain(value) {
        if (value === undefined) return undefined;
        if (value === null) return null;
        if (typeof structuredClone === 'function') {
            try { return structuredClone(value); } catch (_) {}
        }
        try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
    }

    class UIWidget {
        constructor(options = {}) {
            this.id = options.id || createId('widget');
            this.type = options.type || 'widget';
            this.name = options.name || this.type;

            this.x = Number(options.x ?? 0);
            this.y = Number(options.y ?? 0);
            this.width = Math.max(0, Number(options.width ?? 100));
            this.height = Math.max(0, Number(options.height ?? 40));

            this.rotation = Number(options.rotation ?? 0);
            this.scaleX = Number(options.scaleX ?? 1);
            this.scaleY = Number(options.scaleY ?? 1);

            this.visible = options.visible ?? true;
            this.enabled = options.enabled ?? true;
            this.interactable = options.interactable ?? false;
            this.opacity = Math.max(0, Math.min(1, Number(options.opacity ?? 1)));
            this.zIndex = Number(options.zIndex ?? 0);

            this.anchor = {
                minX: options.anchor?.minX ?? 0,
                minY: options.anchor?.minY ?? 0,
                maxX: options.anchor?.maxX ?? 0,
                maxY: options.anchor?.maxY ?? 0
            };

            this.pivot = {
                x: options.pivot?.x ?? 0.5,
                y: options.pivot?.y ?? 0.5
            };

            this.margin = {
                left: options.margin?.left ?? 0,
                top: options.margin?.top ?? 0,
                right: options.margin?.right ?? 0,
                bottom: options.margin?.bottom ?? 0
            };

            this.style = {
                pointerEvents: options.style?.pointerEvents ?? 'auto',
                cursor: options.style?.cursor ?? 'default',
                ...clonePlain(options.style)
            };

            this.bindings = clonePlain(options.bindings) || {};
            this.events = clonePlain(options.events) || {};
            this.customData = clonePlain(options.customData) || {};

            this.parent = null;
            this.parentId = options.parentId || null;
            this.children = [];

            this._element = null;
            this._dirty = true;

            if (Array.isArray(options.children)) {
                for (const child of options.children) {
                    this.addChild(child);
                }
            }
        }

        addChild(widget, index = null) {
            if (!widget || widget === this) return false;
            if (this.contains(widget)) return false;
            if (typeof widget.contains === 'function' && widget.contains(this)) return false;

            if (widget.parent && widget.parent !== this) {
                widget.parent.removeChild(widget);
            }

            widget.parent = this;
            widget.parentId = this.id;

            const targetIndex = Number.isInteger(index)
                ? Math.max(0, Math.min(index, this.children.length))
                : this.children.length;

            this.children.splice(targetIndex, 0, widget);
            this.markDirty();
            return true;
        }

        removeChild(widgetOrId) {
            const index = this.children.findIndex((child) =>
                child === widgetOrId || child.id === widgetOrId
            );

            if (index === -1) return null;

            const [child] = this.children.splice(index, 1);
            child.parent = null;
            child.parentId = null;

            this.markDirty();
            return child;
        }

        contains(widget) {
            if (!widget) return false;
            if (widget === this) return true;

            for (const child of this.children) {
                if (child === widget) return true;
                if (typeof child.contains === 'function' && child.contains(widget)) return true;
            }

            return false;
        }

        setPosition(x, y) {
            this.x = Number(x) || 0;
            this.y = Number(y) || 0;
            this.markDirty();
            return this;
        }

        setSize(width, height) {
            this.width = Math.max(0, Number(width) || 0);
            this.height = Math.max(0, Number(height) || 0);
            this.markDirty();
            return this;
        }

        setRotation(rotation) {
            this.rotation = Number(rotation) || 0;
            this.markDirty();
            return this;
        }

        setScale(x, y = x) {
            this.scaleX = Number(x) || 1;
            this.scaleY = Number(y) || 1;
            this.markDirty();
            return this;
        }

        setVisible(state) {
            this.visible = Boolean(state);
            this.markDirty();
            return this;
        }

        setEnabled(state) {
            this.enabled = Boolean(state);
            this.markDirty();
            return this;
        }

        setOpacity(value) {
            this.opacity = Math.max(0, Math.min(1, Number(value) || 0));
            this.markDirty();
            return this;
        }

        setStyle(patch = {}) {
            Object.assign(this.style, patch);
            this.markDirty();
            return this;
        }

        setBinding(property, binding) {
            if (!property) return this;

            if (binding == null) {
                delete this.bindings[property];
            } else {
                this.bindings[property] = clonePlain(binding);
            }

            return this;
        }

        setEvent(eventName, handlerDescriptor) {
            if (!eventName) return this;

            if (handlerDescriptor == null) {
                delete this.events[eventName];
            } else {
                this.events[eventName] = clonePlain(handlerDescriptor);
            }

            return this;
        }

        markDirty() {
            this._dirty = true;
            if (this.parent?.markDirty) this.parent.markDirty();
            return this;
        }

        clearDirty() {
            this._dirty = false;
            return this;
        }

        getBounds() {
            return {
                x: this.x,
                y: this.y,
                width: this.width,
                height: this.height,
                right: this.x + this.width,
                bottom: this.y + this.height
            };
        }

        clone(options = {}) {
            const data = this.serialize();

            const regenerateIds = (node) => {
                if (!node || typeof node !== 'object') return;
                node.id = createId('widget');
                node.parentId = null;

                if (Array.isArray(node.children)) {
                    node.children.forEach(regenerateIds);
                }
            };

            if (!options.preserveIds) regenerateIds(data);

            return new this.constructor(data);
        }

        createElement() {
            const element = document.createElement('div');
            element.className = 'game-ui-widget';
            return element;
        }

        applyElementState(element = this._element) {
            if (!element) return null;

            element.dataset.widgetId = this.id;
            element.dataset.widgetType = this.type;
            element.style.position = 'absolute';
            element.style.left = `${this.x}px`;
            element.style.top = `${this.y}px`;
            element.style.width = `${this.width}px`;
            element.style.height = `${this.height}px`;
            element.style.opacity = `${this.opacity}`;
            element.style.display = this.visible ? '' : 'none';
            element.style.pointerEvents = this.enabled ? (this.style.pointerEvents || 'auto') : 'none';
            element.style.cursor = this.style.cursor || 'default';
            element.style.zIndex = `${this.zIndex}`;
            element.style.transformOrigin = `${this.pivot.x * 100}% ${this.pivot.y * 100}%`;
            element.style.transform = `rotate(${this.rotation}deg) scale(${this.scaleX}, ${this.scaleY})`;

            for (const [key, value] of Object.entries(this.style)) {
                if (key === 'pointerEvents' || key === 'cursor') continue;
                try {
                    element.style[key] = value;
                } catch (_) {}
            }

            this._dirty = false;
            return element;
        }

        mount(parentElement) {
            if (!parentElement) return null;

            if (!this._element) {
                this._element = this.createElement();
            }

            this.applyElementState(this._element);

            if (this._element.parentElement !== parentElement) {
                parentElement.appendChild(this._element);
            }

            for (const child of this.children) {
                if (typeof child.mount === 'function') {
                    child.mount(this._element);
                }
            }

            return this._element;
        }

        unmount() {
            if (this._element?.parentElement) {
                this._element.parentElement.removeChild(this._element);
            }

            for (const child of this.children) {
                child.unmount?.();
            }

            this._element = null;
        }

        serialize() {
            return {
                id: this.id,
                type: this.type,
                name: this.name,
                x: this.x,
                y: this.y,
                width: this.width,
                height: this.height,
                rotation: this.rotation,
                scaleX: this.scaleX,
                scaleY: this.scaleY,
                visible: this.visible,
                enabled: this.enabled,
                interactable: this.interactable,
                opacity: this.opacity,
                zIndex: this.zIndex,
                anchor: clonePlain(this.anchor),
                pivot: clonePlain(this.pivot),
                margin: clonePlain(this.margin),
                style: clonePlain(this.style),
                bindings: clonePlain(this.bindings),
                events: clonePlain(this.events),
                customData: clonePlain(this.customData),
                parentId: this.parentId,
                children: this.children.map((child) =>
                    typeof child.serialize === 'function' ? child.serialize() : clonePlain(child)
                )
            };
        }
    }

    window.UIWidget = UIWidget;
})();
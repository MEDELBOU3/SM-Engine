// SM Engine - PlayerAnimationParameters
(function () {
    class PlayerAnimationParameters {
        constructor(initial = {}) {
            this.values = new Map();
            this.types = new Map();
            this.defineFloat('Speed', 0);
            this.defineFloat('Direction', 0);
            this.defineFloat('VerticalSpeed', 0);
            this.defineBool('IsGrounded', true);
            this.defineBool('IsRunning', false);
            this.defineBool('IsMoving', false);
            Object.entries(initial || {}).forEach(([name, value]) => this.set(name, value));
        }
        defineFloat(name, defaultValue = 0) {
            this.types.set(name, 'float');
            this.values.set(name, Number.isFinite(Number(defaultValue)) ? Number(defaultValue) : 0);
            return this;
        }
        defineBool(name, defaultValue = false) {
            this.types.set(name, 'bool');
            this.values.set(name, !!defaultValue);
            return this;
        }
        defineInt(name, defaultValue = 0) {
            this.types.set(name, 'int');
            this.values.set(name, Math.trunc(Number(defaultValue) || 0));
            return this;
        }
        has(name) { return this.values.has(name); }
        getType(name) { return this.types.get(name) || null; }
        get(name, fallback = 0) { return this.values.has(name) ? this.values.get(name) : fallback; }
        getFloat(name, fallback = 0) {
            const value = Number(this.get(name, fallback));
            return Number.isFinite(value) ? value : Number(fallback) || 0;
        }
        getBool(name, fallback = false) { return !!this.get(name, fallback); }
        setFloat(name, value) {
            if (!this.types.has(name)) this.types.set(name, 'float');
            this.values.set(name, Number.isFinite(Number(value)) ? Number(value) : 0);
            return this;
        }
        setBool(name, value) {
            if (!this.types.has(name)) this.types.set(name, 'bool');
            this.values.set(name, !!value);
            return this;
        }
        setInt(name, value) {
            if (!this.types.has(name)) this.types.set(name, 'int');
            this.values.set(name, Math.trunc(Number(value) || 0));
            return this;
        }
        set(name, value) {
            const type = this.types.get(name);
            if (type === 'bool') return this.setBool(name, value);
            if (type === 'int') return this.setInt(name, value);
            if (type === 'float') return this.setFloat(name, value);
            if (typeof value === 'boolean') return this.setBool(name, value);
            if (typeof value === 'number') return this.setFloat(name, value);
            this.values.set(name, value);
            if (!this.types.has(name)) this.types.set(name, typeof value);
            return this;
        }
        merge(values = {}) {
            Object.entries(values || {}).forEach(([name, value]) => this.set(name, value));
            return this;
        }
        snapshot() {
            const result = {};
            this.values.forEach((value, name) => result[name] = value);
            return result;
        }
        toJSON() {
            const result = {};
            this.values.forEach((value, name) => result[name] = { type: this.types.get(name) || typeof value, value });
            return result;
        }
    }
    window.PlayerAnimationParameters = PlayerAnimationParameters;
})();
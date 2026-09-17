(function () {
    'use strict';
    class SMBuildValidator {
        constructor(options = {}) {
            this.rules = [];
            this.registerDefaultRules();
            for (const rule of options.rules || []) this.addRule(rule.id, rule.run || rule, rule);
        }
        addRule(id, run, options = {}) {
            if (typeof run !== 'function') throw new TypeError('SMBuildValidator.addRule(id, run) expects a function.');
            const key = String(id);
            this.rules = this.rules.filter(rule => rule.id !== key);
            this.rules.push({ id: key, run, priority: Number(options.priority || 0), enabled: options.enabled !== false, description: String(options.description || '') });
            this.rules.sort((a, b) => b.priority - a.priority);
            return key;
        }
        removeRule(id) {
            const before = this.rules.length;
            this.rules = this.rules.filter(rule => rule.id !== String(id));
            return before !== this.rules.length;
        }
        async validate(context = {}) {
            const result = { ok: true, errors: [], warnings: [], info: [], rules: [], startedAt: Date.now(), finishedAt: null };
            for (const rule of this.rules) {
                if (!rule.enabled) continue;
                try {
                    const output = await rule.run(context, result);
                    this._merge(result, output, rule.id);
                    result.rules.push({ id: rule.id, ok: !(output?.errors?.length), output: output || null });
                } catch (error) {
                    result.errors.push({ rule: rule.id, message: error?.message || String(error), error });
                    result.rules.push({ id: rule.id, ok: false, error: error?.message || String(error) });
                }
            }
            result.ok = result.errors.length === 0;
            result.finishedAt = Date.now();
            return result;
        }
        registerDefaultRules() {
            this.addRule('config-basic', context => {
                const config = context.config instanceof window.SMBuildConfig ? context.config : new window.SMBuildConfig(context.config || {});
                const check = config.validateBasic();
                return { errors: check.errors, warnings: check.warnings };
            }, { priority: 100 });
            this.addRule('runtime-core', () => {
                const required = ['SMRuntime', 'SMLevelRegistry', 'SMPrefabRegistry'];
                const missing = required.filter(name => !window[name]);
                return missing.length ? { errors: [`Missing Runtime globals: ${missing.join(', ')}`] } : { info: ['Runtime core is available.'] };
            }, { priority: 90 });
            this.addRule('start-level', context => {
                const id = context.config?.startLevel;
                if (!id) return { warnings: ['Build has no explicit start level.'] };
                const registry = context.levelRegistry || window.SMLevelRegistry;
                const level = registry?.get?.(id);
                return level ? { info: [`Start level "${id}" resolved.`] } : { errors: [`Start level "${id}" was not found in SMLevelRegistry.`] };
            }, { priority: 80 });
            this.addRule('dependency-cycles', context => {
                const cycles = context.graph?.findCycles?.() || [];
                return cycles.length ? { warnings: cycles.map(cycle => `Dependency cycle: ${cycle.join(' -> ')}`) } : {};
            }, { priority: 70 });
            this.addRule('asset-references', context => {
                const references = context.scanResult?.references || [];
                const external = references.filter(ref => ref.external);
                const warnings = [];
                if (external.length && context.config?.assets?.includeExternal === false) warnings.push(`${external.length} external asset reference(s) will be excluded.`);
                return { info: [`${references.length} asset reference(s) discovered.`], warnings };
            }, { priority: 60 });
            this.addRule('editor-exclusion', context => {
                if (context.config?.runtime?.includeEditor === true) return { warnings: ['Editor code is enabled in this build. Production builds should normally exclude editor systems.'] };
                return { info: ['Editor-only systems are excluded by build configuration.'] };
            }, { priority: 50 });
        }
        _merge(result, output, ruleId) {
            if (!output) return;
            for (const message of output.errors || []) result.errors.push(this._record(message, ruleId));
            for (const message of output.warnings || []) result.warnings.push(this._record(message, ruleId));
            for (const message of output.info || []) result.info.push(this._record(message, ruleId));
        }
        _record(message, rule) {
            if (message && typeof message === 'object') return { rule, ...message };
            return { rule, message: String(message) };
        }
        debug() {
            const state = { rules: this.rules.map(rule => ({ id: rule.id, priority: rule.priority, enabled: rule.enabled })) };
            console.log('[SMBuildValidator]', state);
            return state;
        }
    }
    window.SMBuildValidator = SMBuildValidator;
    window.SMBuildValidatorClass = SMBuildValidator;
})();
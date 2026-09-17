(function () {
    'use strict';

    const LEVELS = Object.freeze({
        READ: 'read',
        MUTATE: 'mutate',
        DESTRUCTIVE: 'destructive',
        EXTERNAL: 'external'
    });
    const DIRECT_BUILD_KEY = 'sm-ai-direct-build';

    class SMAIPermissionPolicy {
        constructor(options = {}) {
            const storedDirectBuild = localStorage.getItem(DIRECT_BUILD_KEY);
            this.autoApproveMutations = options.autoApproveMutations !== undefined
                ? options.autoApproveMutations === true
                : storedDirectBuild !== 'false';
            this.allowDestructive = options.allowDestructive !== false;
        }

        setAutoApproveMutations(value) {
            this.autoApproveMutations = value === true;
            localStorage.setItem(DIRECT_BUILD_KEY, String(this.autoApproveMutations));
            return this.autoApproveMutations;
        }

        async authorize(tool, args = {}, requestPermission = null) {
            const level = tool?.permission || LEVELS.READ;
            if (level === LEVELS.READ) return { allowed: true, level };
            if (level === LEVELS.DESTRUCTIVE && !this.allowDestructive) {
                return { allowed: false, level, reason: 'Destructive AI tools are disabled.' };
            }
            if (level === LEVELS.MUTATE && this.autoApproveMutations) {
                return { allowed: true, level };
            }

            const ask = typeof requestPermission === 'function'
                ? requestPermission
                : async ({ message }) => window.confirm(message);
            const label = tool?.label || tool?.name || 'AI tool';
            const message = level === LEVELS.DESTRUCTIVE
                ? `Gemini wants to run a destructive action: ${label}. Continue?`
                : `Gemini wants to change the scene using: ${label}. Continue?`;
            const allowed = await ask({ tool, args, level, message });
            return {
                allowed: allowed === true,
                level,
                reason: allowed === true ? null : 'User denied permission.'
            };
        }
    }

    window.SMAIPermissionLevels = LEVELS;
    window.SMAIPermissionPolicy = SMAIPermissionPolicy;
    window.smAIPermissionPolicy = window.smAIPermissionPolicy || new SMAIPermissionPolicy();
}());

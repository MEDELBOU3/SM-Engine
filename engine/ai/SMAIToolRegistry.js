(function () {
    'use strict';

    class SMAIToolRegistry {
        constructor() {
            this.tools = new Map();
        }

        register(definition) {
            if (!definition?.name || typeof definition.execute !== 'function') {
                throw new TypeError('AI tools require a name and execute function.');
            }
            const name = String(definition.name).trim();
            if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
                throw new Error(`Invalid AI tool name: ${name}`);
            }
            const tool = {
                permission: 'read',
                parameters: { type: 'object', properties: {} },
                ...definition,
                name
            };
            this.tools.set(name, tool);
            return tool;
        }

        registerMany(definitions = []) {
            return definitions.map((definition) => this.register(definition));
        }

        get(name) { return this.tools.get(String(name || '')) || null; }
        list() { return [...this.tools.values()]; }

        getGeminiDeclarations() {
            return this.list().map((tool) => ({
                name: tool.name,
                description: tool.description || tool.label || tool.name,
                parameters: tool.parameters
            }));
        }
    }

    window.SMAIToolRegistry = SMAIToolRegistry;
    window.smAIToolRegistry = window.smAIToolRegistry || new SMAIToolRegistry();
}());

(function () {
    'use strict';

    class SMCustomComponent extends window.SMComponent {
        constructor(options = {}) {
            super({ ...options, type: 'SMCustomComponent' });
            this.customType = String(options.customType || options.name || 'Custom');
            this.properties = { ...(options.properties || options.value || {}) };
        }

        get(key, fallback = null) {
            return Object.prototype.hasOwnProperty.call(this.properties, key) ? this.properties[key] : fallback;
        }

        set(key, value) {
            this.properties[String(key)] = value;
            this.emit('custom-property-changed', { key: String(key), value });
            return value;
        }

        serializeState() {
            return { customType: this.customType, properties: { ...this.properties } };
        }

        deserializeState(data = {}) {
            if (data.customType !== undefined) this.customType = String(data.customType);
            if (data.properties && typeof data.properties === 'object') this.properties = { ...data.properties };
            return this;
        }
    }

    window.SMCustomComponent = SMCustomComponent;
    window.SMComponentRegistry?.register?.('SMCustomComponent', SMCustomComponent, {
        displayName: 'Custom Properties',
        category: 'Custom',
        description: 'Serializable user-defined data attached to an entity.',
        allowMultiple: true,
        aliases: ['custom-properties'],
        override: true
    });
})();

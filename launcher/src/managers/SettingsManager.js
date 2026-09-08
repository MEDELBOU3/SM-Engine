// src/managers/SettingsManager.js
// Small JSON settings store for the Launcher.

'use strict';

const path = require('path');
const fs = require('fs');


class SettingsManager {
    constructor(options = {}) {
        this.app =
            options.app;

        this.defaults = {
            ...(options.defaults || {})
        };

        this.data = {
            ...this.defaults
        };

        this.filePath =
            path.join(
                this.app.getPath(
                    'userData'
                ),
                'launcher-settings.json'
            );

        this.load();
    }


    load() {
        if (
            !fs.existsSync(
                this.filePath
            )
        ) {
            this.save();
            return this.data;
        }

        try {
            const parsed =
                JSON.parse(
                    fs.readFileSync(
                        this.filePath,
                        'utf8'
                    )
                );

            this.data = {
                ...this.defaults,
                ...parsed
            };
        } catch (error) {
            console.warn(
                '[SM Launcher] Settings file is invalid. Defaults restored.',
                error
            );

            this.data = {
                ...this.defaults
            };

            this.save();
        }

        return this.data;
    }


    save() {
        const directory =
            path.dirname(
                this.filePath
            );

        fs.mkdirSync(
            directory,
            {
                recursive: true
            }
        );

        fs.writeFileSync(
            this.filePath,
            JSON.stringify(
                this.data,
                null,
                2
            ),
            'utf8'
        );

        return true;
    }


    get(key) {
        return this.data[key];
    }


    set(
        key,
        value
    ) {
        this.data[key] =
            value;

        this.save();

        return value;
    }


    getAll() {
        return {
            ...this.data
        };
    }


    replace(next = {}) {
        this.data = {
            ...this.defaults,
            ...next
        };

        this.save();

        return this.getAll();
    }


    reset() {
        this.data = {
            ...this.defaults
        };

        this.save();

        return this.getAll();
    }
}


module.exports = {
    SettingsManager
};
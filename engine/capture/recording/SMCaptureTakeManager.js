(function () {
    'use strict';

    class SMCaptureTakeManager {
        constructor(options = {}) {
            this.options = {
                prefix: 'Take',
                autoDownload: false,
                maxInMemoryTakes: 50,
                ...options
            };

            this.takes = [];
            this.sequence = 1;

            this.listeners = new Map();
        }

        on(event, callback) {
            if (typeof callback !== 'function') return () => {};

            if (!this.listeners.has(event)) {
                this.listeners.set(event, new Set());
            }

            this.listeners
                .get(event)
                .add(callback);

            return () => {
                this.listeners
                    .get(event)
                    ?.delete(callback);
            };
        }

        emit(event, detail = {}) {
            const callbacks =
                this.listeners.get(event);

            if (!callbacks) return;

            for (const callback of callbacks) {
                try {
                    callback(detail);
                } catch (error) {
                    console.error(
                        '[SMCaptureTakeManager]',
                        error
                    );
                }
            }
        }

        _nextName(customName = '') {
            if (
                customName &&
                String(customName).trim()
            ) {
                return String(
                    customName
                ).trim();
            }

            const number =
                String(
                    this.sequence
                ).padStart(3, '0');

            this.sequence++;

            return `${this.options.prefix}_${number}`;
        }

        _extensionForMimeType(mimeType = '') {
            const type =
                String(mimeType)
                    .toLowerCase();

            if (
                type.includes('mp4')
            ) {
                return 'mp4';
            }

            if (
                type.includes('ogg')
            ) {
                return 'ogv';
            }

            if (
                type.includes('audio')
            ) {
                return 'webm';
            }

            return 'webm';
        }

        addTake(result, options = {}) {
            if (!result?.blob) {
                throw new Error(
                    'SMCaptureTakeManager.addTake requires a recording result with a Blob.'
                );
            }

            const name =
                this._nextName(
                    options.name
                );

            const mimeType =
                result.mimeType ||
                result.blob.type ||
                'video/webm';

            const extension =
                this._extensionForMimeType(
                    mimeType
                );

            const take = {
                id:
                    `sm_take_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                name,
                filename:
                    `${name}.${extension}`,
                blob:
                    result.blob,
                mimeType,
                size:
                    result.size ??
                    result.blob.size,
                duration:
                    result.duration ??
                    0,
                createdAt:
                    Date.now(),
                sourceType:
                    options.sourceType ||
                    'unknown',
                metadata: {
                    ...options.metadata
                }
            };

            this.takes.push(take);

            const max =
                Math.max(
                    1,
                    Number(
                        this.options
                            .maxInMemoryTakes
                    ) || 50
                );

            while (
                this.takes.length >
                max
            ) {
                this.takes.shift();
            }

            this.emit('takeadded', {
                take
            });

            if (
                options.autoDownload === true ||
                this.options.autoDownload === true
            ) {
                this.downloadTake(
                    take.id
                );
            }

            return take;
        }

        getTake(id) {
            return this.takes.find(
                take =>
                    take.id === id
            ) || null;
        }

        getTakes() {
            return this.takes.slice();
        }

        getLatestTake() {
            return (
                this.takes[
                    this.takes.length - 1
                ] ||
                null
            );
        }

        renameTake(id, name) {
            const take =
                this.getTake(id);

            if (!take) return false;

            const clean =
                String(name || '')
                    .trim();

            if (!clean) return false;

            take.name = clean;

            const extension =
                this._extensionForMimeType(
                    take.mimeType
                );

            take.filename =
                `${clean}.${extension}`;

            this.emit('takerenamed', {
                take
            });

            return true;
        }

        removeTake(id) {
            const index =
                this.takes.findIndex(
                    take =>
                        take.id === id
                );

            if (index < 0) {
                return false;
            }

            const [take] =
                this.takes.splice(
                    index,
                    1
                );

            this.emit('takeremoved', {
                take
            });

            return true;
        }

        clear() {
            const removed =
                this.takes.slice();

            this.takes.length = 0;

            this.emit('clear', {
                removed
            });
        }

        downloadTake(id) {
            const take =
                this.getTake(id);

            if (!take) {
                return false;
            }

            const url =
                URL.createObjectURL(
                    take.blob
                );

            const anchor =
                document.createElement('a');

            anchor.href = url;
            anchor.download =
                take.filename;

            document.body.appendChild(
                anchor
            );

            anchor.click();
            anchor.remove();

            setTimeout(() => {
                URL.revokeObjectURL(
                    url
                );
            }, 1000);

            this.emit('takedownloaded', {
                take
            });

            return true;
        }

        formatDuration(seconds = 0) {
            const total =
                Math.max(
                    0,
                    Number(seconds) || 0
                );

            const minutes =
                Math.floor(total / 60);

            const secs =
                Math.floor(total % 60);

            const millis =
                Math.floor(
                    (total % 1) * 1000
                );

            return (
                `${String(minutes).padStart(2, '0')}:` +
                `${String(secs).padStart(2, '0')}.` +
                `${String(millis).padStart(3, '0')}`
            );
        }

        destroy() {
            this.clear();
            this.listeners.clear();
        }
    }

    window.SMCaptureTakeManager =
        SMCaptureTakeManager;
})();
// src/firebase/presenceService.js
// Real-time Presence & Activity Tracking for SM Engine Launcher
// Broadcasts and manages user status (online, away, busy, in-engine, offline)

import { authService } from './authService.js';

class PresenceService {
    constructor() {
        this._listeners = new Set();
        this._currentStatus = 'online';
        this._currentActivity = 'Browsing Hub';
        this._autoDetectEngine = true;

        this._initPresenceListener();
    }

    _initPresenceListener() {
        // Sync with active auth user status if set
        authService.onAuthStateChanged((user) => {
            if (user && user.status) {
                this._currentStatus = user.status;
            }
        });

        // Listen for launcher analytics / engine launch updates to auto-switch presence
        if (window.launcherAPI?.onAnalyticsUpdated) {
            window.launcherAPI.onAnalyticsUpdated(() => {
                // If engine process is active or stopped, update activity
            });
        }
    }

    /**
     * Subscribe to presence changes
     */
    onPresenceChanged(callback) {
        if (typeof callback !== 'function') return () => {};
        this._listeners.add(callback);
        callback({
            status: this._currentStatus,
            activity: this._currentActivity
        });
        return () => this._listeners.delete(callback);
    }

    _notify() {
        const payload = {
            status: this._currentStatus,
            activity: this._currentActivity
        };

        for (const cb of this._listeners) {
            try {
                cb(payload);
            } catch (err) {
                console.error('[presenceService] Presence listener error:', err);
            }
        }

        // Also update auth user profile status
        const current = authService.getCurrentUser();
        if (current && current.status !== this._currentStatus) {
            authService.updateProfile({ status: this._currentStatus });
        }
    }

    /**
     * Update user status ('online' | 'away' | 'busy' | 'in-engine' | 'offline')
     */
    setStatus(status = 'online', activity = null) {
        const validStatuses = ['online', 'away', 'busy', 'in-engine', 'offline'];
        if (!validStatuses.includes(status)) {
            status = 'online';
        }

        this._currentStatus = status;
        if (activity !== null) {
            this._currentActivity = activity;
        } else if (status === 'in-engine') {
            this._currentActivity = 'Creating in SM Engine';
        } else if (status === 'away') {
            this._currentActivity = 'Away';
        } else if (status === 'busy') {
            this._currentActivity = 'Do Not Disturb';
        } else if (status === 'offline') {
            this._currentActivity = 'Offline';
        } else {
            this._currentActivity = 'Studio Hub Active';
        }

        this._notify();
        return { ok: true, status: this._currentStatus, activity: this._currentActivity };
    }

    getStatus() {
        return {
            status: this._currentStatus,
            activity: this._currentActivity
        };
    }

    /**
     * Hook called by Engine launcher when an engine process starts
     */
    onEngineStarted(projectName = null, version = '1.0.1') {
        const activity = projectName
            ? `Editing "${projectName}"`
            : `Running SM Engine ${version}`;
        this.setStatus('in-engine', activity);
    }

    /**
     * Hook called by Engine launcher when engine process terminates
     */
    onEngineStopped() {
        this.setStatus('online', 'Studio Hub Active');
    }
}

export const presenceService = new PresenceService();

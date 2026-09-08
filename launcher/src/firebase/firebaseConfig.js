// src/firebase/firebaseConfig.js
// Firebase Project Configuration for SM Engine Launcher
// Official SM Engine Firebase Project: sm-engine-luncher

const STORAGE_KEY = 'sm_firebase_config_override';

export const firebaseConfig = {
    apiKey: "AIzaSyDYEoVNB7SRhtI-Zm9KHbw2OYy12fm9_sc",
    authDomain: "sm-engine-luncher.firebaseapp.com",
    projectId: "sm-engine-luncher",
    storageBucket: "sm-engine-luncher.firebasestorage.app",
    messagingSenderId: "773310061005",
    appId: "1:773310061005:web:05373fba5b3fb5a72bcc84",
    measurementId: "G-ER9174LZQ6"
};

/**
 * Get active Firebase configuration (stored overrides or default)
 */
export function getFirebaseConfig() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return { ...firebaseConfig, ...parsed };
        }
    } catch (e) {
        console.warn('[firebaseConfig] Failed to parse stored config:', e);
    }
    return { ...firebaseConfig };
}

/**
 * Save custom Firebase configuration
 */
export function updateFirebaseConfig(newConfig = {}) {
    try {
        const current = getFirebaseConfig();
        const updated = { ...current, ...newConfig };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return { ok: true, config: updated };
    } catch (e) {
        console.error('[firebaseConfig] Failed to update config:', e);
        return { ok: false, error: e.message };
    }
}

/**
 * Reset Firebase configuration to defaults
 */
export function resetFirebaseConfig() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        return { ok: true, config: { ...firebaseConfig } };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

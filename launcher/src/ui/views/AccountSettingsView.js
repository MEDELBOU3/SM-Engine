// src/ui/views/AccountSettingsView.js
// Account Settings & Firebase Cloud Configuration View for SM Engine Launcher

import { authService } from '../../firebase/authService.js';
import { userService } from '../../firebase/userService.js';
import { getFirebaseConfig, updateFirebaseConfig, resetFirebaseConfig } from '../../firebase/firebaseConfig.js';
import { UserAvatar } from '../components/UserAvatar.js';

export class AccountSettingsView {
    constructor(app) {
        this.app = app;
        this.activeTab = 'profile'; // 'profile' | 'firebase' | 'security'
    }

    render() {
        const user = authService.getCurrentUser() || {
            displayName: 'Studio Developer',
            handle: 'sm.developer',
            email: 'dev@sm-engine.io',
            role: 'Game Developer',
            bio: 'Creator of high-performance real-time interactive worlds in SM Engine.',
            status: 'online'
        };

        const config = getFirebaseConfig();

        return `
            <div class="sm-page sm-settings-page sm-account-settings-page">
                <!-- Header -->
                <header class="sm-settings-header">
                    <div>
                        <h1 class="sm-settings-title">Account & Studio Settings</h1>
                        <p class="sm-settings-subtitle">Manage your personal developer profile, Firebase backend configuration, and cloud preferences.</p>
                    </div>
                    <button class="sm-btn sm-btn-ghost" data-route="profile" type="button">
                        ← Back to Profile
                    </button>
                </header>

                <div class="sm-account-settings-layout">
                    <!-- Tab Navigation Sidebar -->
                    <aside class="sm-settings-nav-card">
                        <button class="sm-settings-nav-btn ${this.activeTab === 'profile' ? 'is-active' : ''}" data-tab="profile" type="button">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            <span>Profile Info</span>
                        </button>
                        <button class="sm-settings-nav-btn ${this.activeTab === 'firebase' ? 'is-active' : ''}" data-tab="firebase" type="button">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                            <span>Firebase & Cloud</span>
                        </button>
                        <button class="sm-settings-nav-btn ${this.activeTab === 'security' ? 'is-active' : ''}" data-tab="security" type="button">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            <span>Security & Privacy</span>
                        </button>
                    </aside>

                    <!-- Content Panels -->
                    <main class="sm-settings-content-card">
                        <!-- 1. PROFILE TAB -->
                        <section id="tab-profile" class="sm-tab-panel ${this.activeTab === 'profile' ? '' : 'sm-hidden'}">
                            <h2 class="sm-panel-title">Developer Profile Information</h2>
                            <p class="sm-panel-desc">Customize how your identity appears across SM Studio Hub and SM Vault.</p>

                            <form id="sm-profile-form" class="sm-settings-form">
                                <div class="sm-avatar-edit-row">
                                    <div id="sm-settings-avatar-preview">
                                        ${UserAvatar.render(user, { size: 'md' })}
                                    </div>
                                    <div class="sm-avatar-edit-info">
                                        <label class="sm-form-label" for="set-avatar-url">Avatar Image URL (Optional)</label>
                                        <input id="set-avatar-url" class="sm-input" type="url" placeholder="https://..." value="${user.photoURL || ''}" />
                                        <span class="sm-input-hint">Enter a direct image link (Gravatar, GitHub, Discord, Unsplash) or leave empty for gradient initials.</span>
                                    </div>
                                </div>

                                <div class="sm-form-row">
                                    <div class="sm-form-group">
                                        <label class="sm-form-label" for="set-display-name">Display Name</label>
                                        <input id="set-display-name" class="sm-input" type="text" value="${user.displayName || ''}" required />
                                    </div>
                                    <div class="sm-form-group">
                                        <label class="sm-form-label" for="set-handle">Handle / Studio Tag</label>
                                        <div class="sm-input-prefix-wrap">
                                            <span class="sm-prefix">@</span>
                                            <input id="set-handle" class="sm-input" type="text" value="${user.handle || ''}" required />
                                        </div>
                                    </div>
                                </div>

                                <div class="sm-form-group">
                                    <label class="sm-form-label" for="set-role">Primary Specialization</label>
                                    <select id="set-role" class="sm-input sm-select">
                                        <option value="Game Developer" ${user.role === 'Game Developer' ? 'selected' : ''}>Game Developer</option>
                                        <option value="Technical Artist" ${user.role === 'Technical Artist' ? 'selected' : ''}>Technical Artist</option>
                                        <option value="Virtual Production" ${user.role === 'Virtual Production' ? 'selected' : ''}>Virtual Production / Filmmaker</option>
                                        <option value="Tool Creator" ${user.role === 'Tool Creator' ? 'selected' : ''}>Engine & Tool Creator</option>
                                        <option value="Indie Studio Lead" ${user.role === 'Indie Studio Lead' ? 'selected' : ''}>Indie Studio Lead</option>
                                    </select>
                                </div>

                                <div class="sm-form-group">
                                    <label class="sm-form-label" for="set-bio">Studio Biography</label>
                                    <textarea id="set-bio" class="sm-input sm-textarea" rows="3" placeholder="Tell the community about what you are building...">${user.bio || ''}</textarea>
                                </div>

                                <div class="sm-form-actions">
                                    <button class="sm-btn sm-btn-primary" type="submit">
                                        Save Profile Changes
                                    </button>
                                </div>
                            </form>
                        </section>

                        <!-- 2. FIREBASE & CLOUD TAB -->
                        <section id="tab-firebase" class="sm-tab-panel ${this.activeTab === 'firebase' ? '' : 'sm-hidden'}">
                            <h2 class="sm-panel-title">Firebase Cloud Configuration</h2>
                            <p class="sm-panel-desc">Configure your personal or studio Firebase backend credentials for realtime sync, cloud authentication, and telemetry storage.</p>

                            <form id="sm-firebase-form" class="sm-settings-form">
                                <div class="sm-form-group">
                                    <label class="sm-form-label" for="fb-api-key">Firebase Web API Key</label>
                                    <input id="fb-api-key" class="sm-input" type="text" value="${config.apiKey || ''}" placeholder="AIzaSy..." />
                                    <span class="sm-input-hint">Found in Firebase Console → Project Settings → General → Web API Key.</span>
                                </div>

                                <div class="sm-form-row">
                                    <div class="sm-form-group">
                                        <label class="sm-form-label" for="fb-project-id">Project ID</label>
                                        <input id="fb-project-id" class="sm-input" type="text" value="${config.projectId || ''}" placeholder="my-sm-engine-project" />
                                    </div>
                                    <div class="sm-form-group">
                                        <label class="sm-form-label" for="fb-auth-domain">Auth Domain</label>
                                        <input id="fb-auth-domain" class="sm-input" type="text" value="${config.authDomain || ''}" placeholder="my-sm-engine-project.firebaseapp.com" />
                                    </div>
                                </div>

                                <div class="sm-form-group">
                                    <label class="sm-form-label" for="fb-storage-bucket">Storage Bucket (Optional)</label>
                                    <input id="fb-storage-bucket" class="sm-input" type="text" value="${config.storageBucket || ''}" placeholder="my-sm-engine-project.appspot.com" />
                                </div>

                                <div class="sm-form-actions">
                                    <button class="sm-btn sm-btn-primary" type="submit">
                                        Save Cloud Configuration
                                    </button>
                                    <button id="sm-reset-fb-btn" class="sm-btn sm-btn-ghost" type="button">
                                        Reset to Default
                                    </button>
                                </div>
                            </form>
                        </section>

                        <!-- 3. SECURITY TAB -->
                        <section id="tab-security" class="sm-tab-panel ${this.activeTab === 'security' ? '' : 'sm-hidden'}">
                            <h2 class="sm-panel-title">Security & Device Sessions</h2>
                            <p class="sm-panel-desc">Manage authentication security, presence broadcasting, and active workstation sessions.</p>

                            <div class="sm-settings-form">
                                <div class="sm-security-card">
                                    <div class="sm-sec-meta">
                                        <strong>Email Address</strong>
                                        <span>${user.email || 'developer@sm-engine.io'}</span>
                                    </div>
                                    <button id="sm-reset-pw-settings-btn" class="sm-btn sm-btn-secondary sm-btn-sm" type="button">
                                        Reset Password
                                    </button>
                                </div>

                                <div class="sm-security-card">
                                    <div class="sm-sec-meta">
                                        <strong>Engine Presence Broadcasting</strong>
                                        <span>Show your active project and engine version to team members when launching SM Engine.</span>
                                    </div>
                                    <label class="sm-switch">
                                        <input type="checkbox" checked />
                                        <span class="sm-slider"></span>
                                    </label>
                                </div>

                                <!-- Danger Zone -->
                                <div class="sm-danger-zone">
                                    <h3 class="sm-danger-heading">Session Management</h3>
                                    <p class="sm-danger-desc">Sign out of this launcher instance. Local projects and installed engine versions will remain safely intact.</p>
                                    <button id="sm-settings-signout" class="sm-btn sm-btn-danger" type="button">
                                        Sign Out of Workstation
                                    </button>
                                </div>
                            </div>
                        </section>
                    </main>
                </div>
            </div>
        `;
    }

    bind() {
        const root = document.getElementById('view-root');
        if (!root) return;

        // Tab Switching
        const navBtns = root.querySelectorAll('.sm-settings-nav-btn');
        const panels = root.querySelectorAll('.sm-tab-panel');

        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.getAttribute('data-tab');
                this.activeTab = tab;

                navBtns.forEach(b => b.classList.remove('is-active'));
                btn.classList.add('is-active');

                panels.forEach(p => {
                    p.classList.add('sm-hidden');
                    if (p.id === `tab-${tab}`) {
                        p.classList.remove('sm-hidden');
                    }
                });
            });
        });

        // Profile Form Submit
        const profileForm = root.querySelector('#sm-profile-form');
        if (profileForm) {
            profileForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const displayName = root.querySelector('#set-display-name')?.value?.trim();
                const handle = root.querySelector('#set-handle')?.value?.trim();
                const role = root.querySelector('#set-role')?.value;
                const bio = root.querySelector('#set-bio')?.value?.trim();
                const photoURL = root.querySelector('#set-avatar-url')?.value?.trim() || null;

                const result = await userService.updateUserProfile(null, {
                    displayName,
                    handle,
                    role,
                    bio,
                    photoURL
                });

                if (result.ok) {
                    this.app.mountShell();
                    this.app.notify?.('Profile Updated', 'Your profile details have been saved.');
                }
            });
        }

        // Firebase Form Submit
        const fbForm = root.querySelector('#sm-firebase-form');
        if (fbForm) {
            fbForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const apiKey = root.querySelector('#fb-api-key')?.value?.trim();
                const projectId = root.querySelector('#fb-project-id')?.value?.trim();
                const authDomain = root.querySelector('#fb-auth-domain')?.value?.trim();
                const storageBucket = root.querySelector('#fb-storage-bucket')?.value?.trim();

                const res = updateFirebaseConfig({ apiKey, projectId, authDomain, storageBucket });
                if (res.ok) {
                    this.app.notify?.('Firebase Config Saved', 'Cloud configuration has been updated.');
                }
            });
        }

        // Reset Firebase to default
        const resetFbBtn = root.querySelector('#sm-reset-fb-btn');
        if (resetFbBtn) {
            resetFbBtn.addEventListener('click', () => {
                resetFirebaseConfig();
                const conf = getFirebaseConfig();
                const keyInput = root.querySelector('#fb-api-key');
                const idInput = root.querySelector('#fb-project-id');
                const domInput = root.querySelector('#fb-auth-domain');
                const bucketInput = root.querySelector('#fb-storage-bucket');

                if (keyInput) keyInput.value = conf.apiKey;
                if (idInput) idInput.value = conf.projectId;
                if (domInput) domInput.value = conf.authDomain;
                if (bucketInput) bucketInput.value = conf.storageBucket;

                this.app.notify?.('Config Reset', 'Firebase credentials restored to defaults.');
            });
        }

        // Reset password action
        const resetPwBtn = root.querySelector('#sm-reset-pw-settings-btn');
        if (resetPwBtn) {
            resetPwBtn.addEventListener('click', async () => {
                const user = authService.getCurrentUser();
                if (user?.email) {
                    try {
                        await authService.sendPasswordReset(user.email);
                        this.app.notify?.('Reset Email Sent', `Password reset instructions sent to ${user.email}.`);
                    } catch (err) {
                        this.app.notify?.('Error', err.message);
                    }
                }
            });
        }

        // Sign out button
        const signOutBtn = root.querySelector('#sm-settings-signout');
        if (signOutBtn) {
            signOutBtn.addEventListener('click', async () => {
                await authService.signOut();
                this.app.mountShell();
                this.app.router.go('login');
                this.app.notify?.('Signed Out', 'You have been signed out.');
            });
        }
    }
}

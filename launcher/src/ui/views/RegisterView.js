// src/ui/views/RegisterView.js
// Registration & Studio Onboarding View for SM Engine Launcher

import { authService } from '../../firebase/authService.js';

export class RegisterView {
    constructor(app) {
        this.app = app;
        this.selectedRole = 'Game Developer';
        this.isLoading = false;
        this.errorMessage = '';
    }

    render() {
        return `
            <div class="sm-page sm-auth-page">
                <div class="sm-auth-container sm-register-container">
                    <!-- Brand Header -->
                    <div class="sm-auth-header">
                        <div class="sm-auth-logo-badge">
                            <img src="./assets/icons/logo.png" alt="SM Engine Logo" class="sm-auth-logo" />
                        </div>
                        <h1 class="sm-auth-title">Create SM Studio Account</h1>
                        <p class="sm-auth-subtitle">Join thousands of game developers, technical artists, and 3D creators.</p>
                    </div>

                    <!-- Register Card -->
                    <div class="sm-auth-card">
                        <!-- Error Box -->
                        <div id="sm-reg-error" class="sm-auth-alert ${this.errorMessage ? '' : 'sm-hidden'}">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            <span id="sm-reg-error-text">${this.errorMessage}</span>
                        </div>

                        <!-- Registration Form -->
                        <form id="sm-register-form" class="sm-auth-form" novalidate>
                            <div class="sm-form-group">
                                <label class="sm-form-label" for="reg-name">Display Name</label>
                                <div class="sm-input-wrap">
                                    <span class="sm-input-icon">
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                    </span>
                                    <input
                                        id="reg-name"
                                        class="sm-input sm-auth-input"
                                        type="text"
                                        placeholder="Alex Mercer"
                                        required
                                        autocomplete="name"
                                    />
                                </div>
                            </div>

                            <div class="sm-form-group">
                                <label class="sm-form-label" for="reg-email">Email Address</label>
                                <div class="sm-input-wrap">
                                    <span class="sm-input-icon">
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                    </span>
                                    <input
                                        id="reg-email"
                                        class="sm-input sm-auth-input"
                                        type="email"
                                        placeholder="alex@studio.com"
                                        required
                                        autocomplete="email"
                                    />
                                </div>
                            </div>

                            <!-- Role Selector -->
                            <div class="sm-form-group">
                                <label class="sm-form-label">Primary Studio Role</label>
                                <div class="sm-role-grid" role="group">
                                    <button class="sm-role-card is-selected" data-role="Game Developer" type="button">
                                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                                        <span>Game Dev</span>
                                    </button>
                                    <button class="sm-role-card" data-role="Technical Artist" type="button">
                                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>
                                        <span>Tech Artist</span>
                                    </button>
                                    <button class="sm-role-card" data-role="Virtual Production" type="button">
                                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
                                        <span>Cinematics</span>
                                    </button>
                                    <button class="sm-role-card" data-role="Tool Creator" type="button">
                                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                                        <span>Tool Creator</span>
                                    </button>
                                </div>
                            </div>

                            <div class="sm-form-group">
                                <label class="sm-form-label" for="reg-password">Password (min 6 chars)</label>
                                <div class="sm-input-wrap">
                                    <span class="sm-input-icon">
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                    </span>
                                    <input
                                        id="reg-password"
                                        class="sm-input sm-auth-input"
                                        type="password"
                                        placeholder="••••••••"
                                        required
                                        minlength="6"
                                        autocomplete="new-password"
                                    />
                                </div>
                            </div>

                            <div class="sm-form-group">
                                <label class="sm-form-label" for="reg-confirm">Confirm Password</label>
                                <div class="sm-input-wrap">
                                    <span class="sm-input-icon">
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                                    </span>
                                    <input
                                        id="reg-confirm"
                                        class="sm-input sm-auth-input"
                                        type="password"
                                        placeholder="••••••••"
                                        required
                                        minlength="6"
                                        autocomplete="new-password"
                                    />
                                </div>
                            </div>

                            <button id="sm-register-submit" class="sm-btn sm-btn-primary sm-btn-block sm-btn-lg" type="submit">
                                <span>Create SM Studio Account</span>
                            </button>
                        </form>

                        <div class="sm-auth-divider">
                            <span>OR SIGN UP WITH</span>
                        </div>

                        <div class="sm-auth-social-row">
                            <button id="sm-google-register-btn" class="sm-btn sm-btn-secondary sm-btn-block sm-google-btn" type="button">
                                <svg viewBox="0 0 24 24" width="18" height="18">
                                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z"/>
                                    <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                                </svg>
                                <span>Sign Up with Google</span>
                            </button>
                        </div>
                    </div>

                    <!-- Footer Link -->
                    <div class="sm-auth-footer">
                        <span>Already have an account?</span>
                        <button class="sm-link-action" data-route="login" type="button">Sign In</button>
                    </div>
                </div>
            </div>
        `;
    }

    bind() {
        const root = document.getElementById('view-root');
        if (!root) return;

        const form = root.querySelector('#sm-register-form');
        const nameInput = root.querySelector('#reg-name');
        const emailInput = root.querySelector('#reg-email');
        const pwInput = root.querySelector('#reg-password');
        const confirmInput = root.querySelector('#reg-confirm');
        const errorBox = root.querySelector('#sm-reg-error');
        const errorText = root.querySelector('#sm-reg-error-text');
        const submitBtn = root.querySelector('#sm-register-submit');
        const roleCards = root.querySelectorAll('.sm-role-card');

        // Role card selection
        roleCards.forEach(card => {
            card.addEventListener('click', () => {
                roleCards.forEach(c => c.classList.remove('is-selected'));
                card.classList.add('is-selected');
                this.selectedRole = card.getAttribute('data-role') || 'Game Developer';
            });
        });

        // Submit registration
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = nameInput?.value?.trim();
                const email = emailInput?.value?.trim();
                const password = pwInput?.value;
                const confirm = confirmInput?.value;

                if (!name || !email || !password || !confirm) {
                    this._showError(errorBox, errorText, 'All fields are required.');
                    return;
                }

                if (password.length < 6) {
                    this._showError(errorBox, errorText, 'Password must be at least 6 characters long.');
                    return;
                }

                if (password !== confirm) {
                    this._showError(errorBox, errorText, 'Passwords do not match.');
                    return;
                }

                this._setLoading(submitBtn, true);
                this._hideError(errorBox);

                try {
                    const result = await authService.signUp(email, password, name, this.selectedRole);
                    if (result.ok) {
                        this.app.mountShell();
                        this.app.notify?.('Account Created!', `Welcome to SM Studio, ${result.user.displayName}!`);
                        this.app.router.go('profile');
                    }
                } catch (err) {
                    this._showError(errorBox, errorText, err.message || 'Failed to create account.');
                } finally {
                    this._setLoading(submitBtn, false);
                }
            });
        }

        // Google Sign-Up
        const googleRegBtn = root.querySelector('#sm-google-register-btn');
        if (googleRegBtn) {
            googleRegBtn.addEventListener('click', async () => {
                try {
                    const result = await authService.signInWithGoogle();
                    if (result.ok) {
                        this.app.mountShell();
                        this.app.notify?.('Google Account Connected', `Welcome to SM Studio, ${result.user.displayName}!`);
                        this.app.router.go('profile');
                    }
                } catch (err) {
                    this._showError(errorBox, errorText, err.message || 'Google sign-up failed.');
                }
            });
        }
    }

    _showError(box, textEl, msg) {
        if (!box || !textEl) return;
        textEl.textContent = msg;
        box.classList.remove('sm-hidden');
    }

    _hideError(box) {
        if (box) box.classList.add('sm-hidden');
    }

    _setLoading(btn, loading) {
        if (!btn) return;
        if (loading) {
            btn.disabled = true;
            btn.innerHTML = `<span>Creating account...</span>`;
        } else {
            btn.disabled = false;
            btn.innerHTML = `<span>Create SM Studio Account</span>`;
        }
    }
}

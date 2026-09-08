// src/ui/views/LoginView.js
// Modern Native Windows 11 / Epic Games Style Login View for SM Engine Launcher

import { authService } from '../../firebase/authService.js';

export class LoginView {
    constructor(app) {
        this.app = app;
        this.isLoading = false;
        this.errorMessage = '';
    }

    render() {
        return `
            <div class="sm-page sm-auth-page">
                <div class="sm-auth-container">
                    <!-- Brand Header -->
                    <div class="sm-auth-header">
                        <div class="sm-auth-logo-badge">
                            <img src="./assets/icons/logo.png" alt="SM Engine Logo" class="sm-auth-logo" />
                        </div>
                        <h1 class="sm-auth-title">Welcome to SM Studio</h1>
                        <p class="sm-auth-subtitle">Sign in to access your cloud projects, SM Vault, and developer profile.</p>
                    </div>

                    <!-- Auth Card -->
                    <div class="sm-auth-card">
                        <!-- Error Box -->
                        <div id="sm-auth-error" class="sm-auth-alert ${this.errorMessage ? '' : 'sm-hidden'}">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            <span id="sm-auth-error-text">${this.errorMessage}</span>
                        </div>

                        <!-- Login Form -->
                        <form id="sm-login-form" class="sm-auth-form" novalidate>
                            <div class="sm-form-group">
                                <label class="sm-form-label" for="login-email">Email Address</label>
                                <div class="sm-input-wrap">
                                    <span class="sm-input-icon">
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                    </span>
                                    <input
                                        id="login-email"
                                        class="sm-input sm-auth-input"
                                        type="email"
                                        placeholder="name@studio.com"
                                        required
                                        autocomplete="username"
                                    />
                                </div>
                            </div>

                            <div class="sm-form-group">
                                <div class="sm-form-label-row">
                                    <label class="sm-form-label" for="login-password">Password</label>
                                    <button id="sm-forgot-password-btn" class="sm-link-btn" type="button">Forgot password?</button>
                                </div>
                                <div class="sm-input-wrap">
                                    <span class="sm-input-icon">
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                    </span>
                                    <input
                                        id="login-password"
                                        class="sm-input sm-auth-input"
                                        type="password"
                                        placeholder="••••••••"
                                        required
                                        autocomplete="current-password"
                                    />
                                    <button id="sm-toggle-pw" class="sm-input-action-btn" type="button" title="Show/Hide password">
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    </button>
                                </div>
                            </div>

                            <div class="sm-form-options">
                                <label class="sm-checkbox-label">
                                    <input id="login-remember" type="checkbox" checked />
                                    <span>Remember this device</span>
                                </label>
                            </div>

                            <button id="sm-login-submit" class="sm-btn sm-btn-primary sm-btn-block sm-btn-lg" type="submit">
                                <span>Sign In to SM Studio</span>
                            </button>
                        </form>

                        <div class="sm-auth-divider">
                            <span>OR CONTINUE WITH</span>
                        </div>

                        <div class="sm-auth-social-row">
                            <!-- Continue with Google -->
                            <button id="sm-google-login-btn" class="sm-btn sm-btn-secondary sm-btn-block sm-google-btn" type="button">
                                <svg viewBox="0 0 24 24" width="18" height="18">
                                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z"/>
                                    <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                                </svg>
                                <span>Continue with Google</span>
                            </button>

                            <!-- One-Click Local Dev Mode -->
                            <button id="sm-guest-login-btn" class="sm-btn sm-btn-ghost sm-btn-block" type="button">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f59e0b" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                                <span>Continue as Local Studio Dev</span>
                            </button>
                        </div>
                    </div>

                    <!-- Footer Link -->
                    <div class="sm-auth-footer">
                        <span>Don't have an SM Studio account?</span>
                        <button class="sm-link-action" data-route="register" type="button">Create an account</button>
                    </div>
                </div>
            </div>
        `;
    }

    bind() {
        const root = document.getElementById('view-root');
        if (!root) return;

        const form = root.querySelector('#sm-login-form');
        const emailInput = root.querySelector('#login-email');
        const pwInput = root.querySelector('#login-password');
        const togglePwBtn = root.querySelector('#sm-toggle-pw');
        const forgotBtn = root.querySelector('#sm-forgot-password-btn');
        const guestBtn = root.querySelector('#sm-guest-login-btn');
        const errorBox = root.querySelector('#sm-auth-error');
        const errorText = root.querySelector('#sm-auth-error-text');
        const submitBtn = root.querySelector('#sm-login-submit');

        // Toggle password visibility
        if (togglePwBtn && pwInput) {
            togglePwBtn.addEventListener('click', () => {
                const isPassword = pwInput.type === 'password';
                pwInput.type = isPassword ? 'text' : 'password';
            });
        }

        // Handle standard login submit
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = emailInput?.value?.trim();
                const password = pwInput?.value;

                if (!email || !password) {
                    this._showError(errorBox, errorText, 'Please provide both email and password.');
                    return;
                }

                this._setLoading(submitBtn, true);
                this._hideError(errorBox);

                try {
                    const result = await authService.signIn(email, password);
                    if (result.ok) {
                        this.app.mountShell();
                        this.app.notify?.('Welcome back!', `Signed in as ${result.user.displayName || email}.`);
                        this.app.router.go('home');
                    }
                } catch (err) {
                    this._showError(errorBox, errorText, err.message || 'Login failed. Please check your credentials.');
                } finally {
                    this._setLoading(submitBtn, false);
                }
            });
        }

        const googleBtn = root.querySelector('#sm-google-login-btn');

        // Handle Google Sign In
        if (googleBtn) {
            googleBtn.addEventListener('click', async () => {
                try {
                    const result = await authService.signInWithGoogle();
                    if (result.ok) {
                        this.app.mountShell();
                        this.app.notify?.('Google Account Connected', `Signed in as ${result.user.displayName}.`);
                        this.app.router.go('home');
                    }
                } catch (err) {
                    this._showError(errorBox, errorText, err.message || 'Google sign-in failed.');
                }
            });
        }

        // Handle Guest / Local Dev login
        if (guestBtn) {
            guestBtn.addEventListener('click', () => {
                const result = authService.signInGuest('SM Studio Lead', 'Game Developer');
                if (result.ok) {
                    this.app.mountShell();
                    this.app.notify?.('Local Studio Dev Mode', 'Signed in with local developer profile.');
                    this.app.router.go('home');
                }
            });
        }

        // Forgot password click
        if (forgotBtn) {
            forgotBtn.addEventListener('click', async () => {
                const email = emailInput?.value?.trim();
                if (!email) {
                    this._showError(errorBox, errorText, 'Please enter your email above to receive password reset instructions.');
                    emailInput?.focus();
                    return;
                }

                try {
                    await authService.sendPasswordReset(email);
                    this.app.notify?.('Reset Email Sent', `Password reset instructions sent to ${email}.`);
                } catch (err) {
                    this._showError(errorBox, errorText, err.message);
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
            btn.innerHTML = `<span>Signing in...</span>`;
        } else {
            btn.disabled = false;
            btn.innerHTML = `<span>Sign In to SM Studio</span>`;
        }
    }
}

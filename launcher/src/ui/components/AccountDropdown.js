// src/ui/components/AccountDropdown.js
// Modern Windows 11 Dark Acrylic Flyout Menu for User Account & Status Management

import { UserAvatar } from './UserAvatar.js';
import { authService } from '../../firebase/authService.js';
import { presenceService } from '../../firebase/presenceService.js';

export class AccountDropdown {
    /**
     * Render the dropdown HTML
     */
    static render(user = null, currentStatus = 'online') {
        const isAuthenticated = Boolean(user && user.uid);
        const displayName = user?.displayName || user?.email?.split('@')[0] || 'SM Creator';
        const email = user?.email || 'developer@sm-engine.io';
        const role = user?.role || 'Game Developer';
        const status = currentStatus || user?.status || 'online';

        return `
            <div id="sm-account-dropdown" class="sm-account-dropdown sm-hidden" role="menu" aria-label="User Account Menu">
                <div class="sm-dropdown-card">
                    ${isAuthenticated ? `
                        <!-- User Header Profile Card -->
                        <div class="sm-dropdown-header">
                            <div class="sm-dropdown-avatar-wrap">
                                ${UserAvatar.render(user, { size: 'md', customStatus: status })}
                            </div>
                            <div class="sm-dropdown-user-info">
                                <strong class="sm-dropdown-name">${displayName}</strong>
                                <span class="sm-dropdown-email">${email}</span>
                                <div class="sm-dropdown-role-badge">
                                    <span class="sm-role-pill">${role}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Status Picker -->
                        <div class="sm-dropdown-section">
                            <span class="sm-dropdown-section-title">PRESENCE STATUS</span>
                            <div class="sm-status-selector-row">
                                <button class="sm-status-btn ${status === 'online' ? 'is-active' : ''}" data-status="online" title="Online" type="button">
                                    <span class="sm-status-dot online"></span>
                                    <span>Online</span>
                                </button>
                                <button class="sm-status-btn ${status === 'away' ? 'is-active' : ''}" data-status="away" title="Away" type="button">
                                    <span class="sm-status-dot away"></span>
                                    <span>Away</span>
                                </button>
                                <button class="sm-status-btn ${status === 'busy' ? 'is-active' : ''}" data-status="busy" title="Busy" type="button">
                                    <span class="sm-status-dot busy"></span>
                                    <span>Busy</span>
                                </button>
                                <button class="sm-status-btn ${status === 'in-engine' ? 'is-active' : ''}" data-status="in-engine" title="In Engine" type="button">
                                    <span class="sm-status-dot in-engine"></span>
                                    <span>Engine</span>
                                </button>
                            </div>
                        </div>

                        <!-- Navigation Items -->
                        <div class="sm-dropdown-section sm-dropdown-menu-list">
                            <button class="sm-dropdown-item" data-route="profile" type="button">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                <span>My Profile</span>
                            </button>

                            <button class="sm-dropdown-item" data-route="account-settings" type="button">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.16.35.4.66.7.9.3.24.68.37 1.06.37H21v4h-.1A1.7 1.7 0 0 0 19.4 15z"/></svg>
                                <span>Account Settings</span>
                            </button>

                            <button class="sm-dropdown-item" data-route="analytics" type="button">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                                <span>Studio Analytics</span>
                            </button>
                        </div>

                        <!-- Footer / Sign Out -->
                        <div class="sm-dropdown-footer">
                            <button class="sm-dropdown-item is-danger" data-action="sign-out" type="button">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                                <span>Sign Out</span>
                            </button>
                        </div>
                    ` : `
                        <!-- Signed Out State -->
                        <div class="sm-dropdown-header is-signed-out">
                            <strong class="sm-dropdown-name">SM Studio Account</strong>
                            <p class="sm-dropdown-desc">Sign in to sync projects, access SM Vault, and publish games.</p>
                        </div>
                        <div class="sm-dropdown-footer is-vertical">
                            <button class="sm-btn sm-btn-primary" data-route="login" type="button">
                                Sign In
                            </button>
                            <button class="sm-btn sm-btn-ghost" data-route="register" type="button">
                                Create Account
                            </button>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    /**
     * Bind event listeners for dropdown actions
     */
    static bind(container, app) {
        if (!container) return;

        // Status change button clicks
        container.querySelectorAll('[data-status]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const newStatus = btn.getAttribute('data-status');
                presenceService.setStatus(newStatus);
                app.mountShell?.();
                app.notify?.('Status Updated', `Your presence is now set to ${newStatus}.`);
            });
        });

        // Sign Out action
        container.querySelectorAll('[data-action="sign-out"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await authService.signOut();
                app.mountShell?.();
                app.router?.go('login');
                app.notify?.('Signed Out', 'You have been signed out of your SM Studio account.');
            });
        });
    }
}

// src/ui/components/UserProfileMenu.js
// Interactive User Profile Button & Dropdown Trigger for Sidebar and TopBar

import { UserAvatar } from './UserAvatar.js';
import { AccountDropdown } from './AccountDropdown.js';
import { presenceService } from '../../firebase/presenceService.js';

export class UserProfileMenu {
    /**
     * Render the profile button markup with embedded dropdown
     */
    static render(user = null, options = {}) {
        const isCompact = options.compact === true;
        const presence = presenceService.getStatus();
        const status = presence.status || user?.status || 'online';
        const activity = presence.activity || 'Studio Hub Active';

        const isAuthenticated = Boolean(user && user.uid);
        const displayName = user?.displayName || user?.email?.split('@')[0] || 'SM Studio';

        return `
            <div class="sm-user-profile-menu-container">
                <button
                    id="sm-user-menu-trigger"
                    class="sm-epic-user-profile ${isCompact ? 'is-compact' : ''}"
                    data-action="toggle-user-menu"
                    title="${isAuthenticated ? `${displayName} (${status})` : 'Sign in to SM Studio'}"
                    type="button"
                >
                    ${UserAvatar.render(user, { size: 'sm', customStatus: status })}

                    ${!isCompact ? `
                        <div class="sm-user-meta">
                            <span class="sm-user-name">${displayName}</span>
                            <span class="sm-user-status status-${status}">${activity}</span>
                        </div>
                        <span class="sm-user-caret">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg>
                        </span>
                    ` : ''}
                </button>

                ${AccountDropdown.render(user, status)}
            </div>
        `;
    }

    /**
     * Bind toggle and outside-click events
     */
    static bind(root, app) {
        if (!root) return;

        const trigger = root.querySelector('[data-action="toggle-user-menu"]');
        const dropdown = root.querySelector('#sm-account-dropdown');

        if (trigger && dropdown) {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = dropdown.classList.contains('sm-hidden');
                // Close any other open dropdowns first
                document.querySelectorAll('.sm-account-dropdown').forEach(d => d.classList.add('sm-hidden'));
                if (isHidden) {
                    dropdown.classList.remove('sm-hidden');
                } else {
                    dropdown.classList.add('sm-hidden');
                }
            });

            // Bind dropdown item clicks
            AccountDropdown.bind(dropdown, app);
        }

        // Global outside click handler to close dropdown
        if (!window._smUserDropdownListenerAdded) {
            window._smUserDropdownListenerAdded = true;
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.sm-user-profile-menu-container')) {
                    document.querySelectorAll('.sm-account-dropdown').forEach(d => d.classList.add('sm-hidden'));
                }
            });
        }
    }
}

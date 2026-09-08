// src/ui/components/UserAvatar.js
// High-fidelity User Avatar Component with live presence badge & initials generator

export class UserAvatar {
    /**
     * Render user avatar HTML
     * @param {Object} user - Auth user object
     * @param {Object} options - { size: 'sm' | 'md' | 'lg', showBadge: boolean, customStatus: string }
     */
    static render(user = null, options = {}) {
        const size = options.size || 'sm'; // 'sm' (28px), 'md' (40px), 'lg' (84px)
        const showBadge = options.showBadge !== false;
        const status = options.customStatus || user?.status || 'online';

        const displayName = user?.displayName || user?.email?.split('@')[0] || 'Studio Dev';
        const photoURL = user?.photoURL || null;

        // Generate initials
        const initials = this._getInitials(displayName);

        const avatarContent = photoURL
            ? `<img class="sm-avatar-img" src="${photoURL}" alt="${displayName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" /><span class="sm-avatar-initials" style="display:none;">${initials}</span>`
            : `<span class="sm-avatar-initials">${initials}</span>`;

        const badgeHtml = showBadge
            ? `<span class="sm-avatar-badge status-${status}" title="Status: ${this._formatStatus(status)}"></span>`
            : '';

        return `
            <div class="sm-user-avatar sm-avatar-${size}" data-user-uid="${user?.uid || 'guest'}">
                <div class="sm-avatar-frame">
                    ${avatarContent}
                </div>
                ${badgeHtml}
            </div>
        `;
    }

    static _getInitials(name) {
        if (!name) return 'SM';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    }

    static _formatStatus(status) {
        switch (status) {
            case 'online': return 'Online';
            case 'away': return 'Away';
            case 'busy': return 'Busy / Do Not Disturb';
            case 'in-engine': return 'In SM Engine';
            case 'offline': return 'Offline';
            default: return 'Online';
        }
    }
}

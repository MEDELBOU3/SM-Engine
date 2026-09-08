// src/ui/views/UserProfileView.js
// Dedicated Developer Profile & Studio Dashboard View for SM Engine Launcher

import { authService } from '../../firebase/authService.js';
import { userService } from '../../firebase/userService.js';
import { presenceService } from '../../firebase/presenceService.js';
import { UserAvatar } from '../components/UserAvatar.js';

export class UserProfileView {
    constructor(app) {
        this.app = app;
        this.stats = {
            projectsCount: 4,
            devHours: '48h',
            sessionsCount: 30,
            engineVersion: 'SM Engine 1.0.1'
        };
    }

    render() {
        const user = authService.getCurrentUser() || {
            displayName: 'Studio Developer',
            handle: 'sm.developer',
            email: 'dev@sm-engine.io',
            role: 'Game Developer',
            bio: 'Creator of high-performance real-time interactive worlds in SM Engine.',
            status: 'online',
            createdAt: '2026-01-15T00:00:00.000Z'
        };

        const presence = presenceService.getStatus();
        const status = presence.status || user.status || 'online';
        const joinedDate = user.createdAt
            ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
            : 'January 2026';

        const projects = this.app.state?.projects || [];

        return `
            <div class="sm-page sm-profile-page">
                <!-- 1. HERO PROFILE BANNER -->
                <header class="sm-profile-hero">
                    <div class="sm-profile-hero-banner"></div>
                    <div class="sm-profile-hero-content">
                        <div class="sm-profile-avatar-wrap">
                            ${UserAvatar.render(user, { size: 'lg', customStatus: status })}
                        </div>

                        <div class="sm-profile-main-meta">
                            <div class="sm-profile-name-row">
                                <h1 class="sm-profile-display-name">${user.displayName || 'SM Creator'}</h1>
                                <span class="sm-profile-handle">@${user.handle || 'developer'}</span>
                                <span class="sm-profile-badge-role">${user.role || 'Game Developer'}</span>
                            </div>
                            <p class="sm-profile-bio">${user.bio || 'Building games and interactive worlds with SM Engine.'}</p>
                            <div class="sm-profile-sub-meta">
                                <span class="sm-profile-meta-item">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                    ${user.email || 'developer@sm-engine.io'}
                                </span>
                                <span class="sm-profile-meta-item">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                    Member since ${joinedDate}
                                </span>
                                <span class="sm-profile-meta-item status-pill status-${status}">
                                    <span class="sm-status-dot ${status}"></span>
                                    ${presence.activity || 'Studio Hub Active'}
                                </span>
                            </div>
                        </div>

                        <div class="sm-profile-actions">
                            <button class="sm-btn sm-btn-secondary" data-route="account-settings" type="button">
                                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                <span>Edit Profile</span>
                            </button>
                            <button class="sm-btn sm-btn-ghost" data-route="analytics" type="button" title="View Detailed Analytics">
                                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                                <span>My Telemetry</span>
                            </button>
                        </div>
                    </div>
                </header>

                <!-- 2. STUDIO STATS KPI ROW -->
                <section class="sm-profile-stats-grid">
                    <article class="sm-profile-stat-card">
                        <div class="sm-stat-icon">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#f59e0b" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h10M7 12h10M7 17h6"/></svg>
                        </div>
                        <div class="sm-stat-copy">
                            <strong class="sm-stat-value" id="prof-projects-count">${this.stats.projectsCount}</strong>
                            <span class="sm-stat-label">Active Projects</span>
                        </div>
                    </article>

                    <article class="sm-profile-stat-card">
                        <div class="sm-stat-icon">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </div>
                        <div class="sm-stat-copy">
                            <strong class="sm-stat-value" id="prof-hours-count">${this.stats.devHours}</strong>
                            <span class="sm-stat-label">Total Engine Hours</span>
                        </div>
                    </article>

                    <article class="sm-profile-stat-card">
                        <div class="sm-stat-icon">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#f59e0b" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                        </div>
                        <div class="sm-stat-copy">
                            <strong class="sm-stat-value" id="prof-sessions-count">${this.stats.sessionsCount}</strong>
                            <span class="sm-stat-label">Engine Sessions</span>
                        </div>
                    </article>

                    <article class="sm-profile-stat-card">
                        <div class="sm-stat-icon">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        </div>
                        <div class="sm-stat-copy">
                            <strong class="sm-stat-value">SM Studio Pro</strong>
                            <span class="sm-stat-label">Developer Tier</span>
                        </div>
                    </article>
                </section>

                <!-- 3. STUDIO PROJECTS SHOWCASE -->
                <section class="sm-profile-section">
                    <div class="sm-section-head-row">
                        <div>
                            <h2 class="sm-section-heading">My Studio Projects</h2>
                            <p class="sm-section-sub">Projects authored on this workstation and linked to your developer profile.</p>
                        </div>
                        <button class="sm-btn sm-btn-primary sm-btn-sm" data-action="new-project" type="button">
                            + New Project
                        </button>
                    </div>

                    ${projects.length > 0 ? `
                        <div class="sm-profile-projects-grid">
                            ${projects.slice(0, 6).map(p => `
                                <div class="sm-profile-project-card">
                                    <div class="sm-project-card-thumb">
                                        <img src="./assets/modes-images/game_dev.png" alt="${p.name}" />
                                        <span class="sm-project-ver-badge">${p.engineVersion || 'SM 1.0.1'}</span>
                                    </div>
                                    <div class="sm-project-card-body">
                                        <strong class="sm-project-card-name">${p.name}</strong>
                                        <span class="sm-project-card-template">${p.template || 'Game Mode'}</span>
                                        <div class="sm-project-card-actions">
                                            <button class="sm-btn sm-btn-secondary sm-btn-sm" data-action="launch-project" data-project-id="${p.id}" type="button">
                                                ▶ Open Project
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="sm-profile-empty-projects">
                            <p>No projects created yet. Start your first masterpiece!</p>
                            <button class="sm-btn sm-btn-primary" data-action="new-project" type="button">Create First Project</button>
                        </div>
                    `}
                </section>
            </div>
        `;
    }

    async bind() {
        const root = document.getElementById('view-root');
        if (!root) return;

        // Fetch live stats from userService / analytics
        const user = authService.getCurrentUser();
        if (user) {
            const stats = await userService.getUserStats(user.uid);
            this.stats = stats;
            const projEl = root.querySelector('#prof-projects-count');
            const hoursEl = root.querySelector('#prof-hours-count');
            const sessEl = root.querySelector('#prof-sessions-count');
            if (projEl) projEl.textContent = stats.projectsCount;
            if (hoursEl) hoursEl.textContent = stats.devHours;
            if (sessEl) sessEl.textContent = stats.sessionsCount;
        }

        // Project launch buttons
        root.querySelectorAll('[data-action="launch-project"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const projectId = btn.getAttribute('data-project-id');
                if (projectId && window.launcherAPI?.launchProject) {
                    btn.disabled = true;
                    btn.textContent = 'Launching...';
                    await window.launcherAPI.launchProject({ projectId });
                    setTimeout(() => {
                        btn.disabled = false;
                        btn.textContent = '▶ Open Project';
                    }, 2000);
                }
            });
        });

        // New Project modal trigger
        root.querySelectorAll('[data-action="new-project"]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.app.newProjectModal?.show();
            });
        });
    }
}

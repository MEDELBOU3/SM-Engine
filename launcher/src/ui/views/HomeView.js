import { ProjectCard } from "../components/ProjectCard.js";

export class HomeView {
    constructor(app) {
        this.app = app;
    }

    render() {
        const engine = this.app?.state?.engine || {};
        const projects = this.app?.state?.projects || [];

        return `
            <div class="sm-page">
                <section class="sm-home-layout">
                    <article class="sm-hero">
                        <div class="sm-hero-kicker">
                            SM Engine ${engine.version || "1.0.1"} · ${engine.channel || "Development"}
                        </div>

                        <h1 class="sm-hero-title">
                            Your workspace for SM Engine projects.
                        </h1>

                        <p class="sm-hero-copy">
                            Launch the editor, create projects, manage engine builds
                            and keep your development environment in one place.
                        </p>

                        <div class="sm-hero-actions">
                            <button class="sm-btn sm-btn-primary" data-action="launch-engine" type="button">
                                Launch SM Engine
                            </button>

                            <button class="sm-btn" data-action="new-project" type="button">
                                New Project
                            </button>

                            <button class="sm-btn" data-action="launch-safe" type="button">
                                Safe Mode
                            </button>
                        </div>
                    </article>

                    <aside class="sm-surface sm-quick-panel">
                        <h3>Quick Actions</h3>
                        ${this.quick("Launch Engine","Open current build","launch-engine")}
                        ${this.quick("New Project","Create from template","new-project")}
                        ${this.quick("Open Existing","Locate a project","open-project")}
                        ${this.quick("Check Updates","Look for newer builds","check-updates")}
                    </aside>
                </section>

                <section class="sm-section">
                    <div class="sm-grid sm-grid-4">
                        ${this.metric("Engine Version",engine.version || "1.0.1",engine.channel || "Development")}
                        ${this.metric("Projects",projects.length,"Known projects")}
                        ${this.metric("GPU Mode",engine.gpuMode || "Automatic","Launch preference")}
                        ${this.metric("Status",engine.status || "Ready","Launcher frontend")}
                    </div>
                </section>

                <section class="sm-section">
                    <div class="sm-section-head">
                        <div>
                            <h2 class="sm-section-title">Recent Projects</h2>
                            <div class="sm-section-note">Continue where you left off</div>
                        </div>

                        <button class="sm-btn sm-btn-ghost" data-route="projects" type="button">
                            View all
                        </button>
                    </div>

                    ${
                        projects.length
                            ? `<div class="sm-grid sm-grid-2">${projects.slice(0,2).map(ProjectCard.render).join("")}</div>`
                            : `
                                <div class="sm-surface sm-quick-panel">
                                    <div class="sm-section-note">No projects yet. Create your first SM Engine project.</div>
                                </div>
                              `
                    }
                </section>

                <section class="sm-section">
                    <div class="sm-section-head">
                        <div>
                            <h2 class="sm-section-title">System Status</h2>
                            <div class="sm-section-note">Launcher runtime overview</div>
                        </div>
                    </div>

                    <div class="sm-surface sm-quick-panel">
                        <div class="sm-system-list">
                            ${this.system("Platform",navigator.platform || "Unknown")}
                            ${this.system("Runtime","Electron / Chromium")}
                            ${this.system("Graphics","Detection ready")}
                            ${this.system("Engine",`SM Engine ${engine.version || "1.0.1"}`)}
                        </div>
                    </div>
                </section>
            </div>
        `;
    }

    quick(title, description, action) {
        return `
            <button class="sm-quick-action" data-action="${action}" type="button">
                <span class="sm-quick-icon">+</span>
                <span class="sm-quick-copy">
                    <strong>${title}</strong>
                    <span>${description}</span>
                </span>
                <span class="sm-quick-arrow">›</span>
            </button>
        `;
    }

    metric(label, value, detail) {
        return `
            <article class="sm-surface sm-metric">
                <div class="sm-metric-label">${label}</div>
                <div class="sm-metric-value">${value}</div>
                <div class="sm-metric-detail">${detail}</div>
            </article>
        `;
    }

    system(label, value) {
        return `
            <div class="sm-system-row">
                <span>${label}</span>
                <strong>${value}</strong>
                <span class="sm-system-ready">READY</span>
            </div>
        `;
    }
}
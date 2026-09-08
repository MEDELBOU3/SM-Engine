import { EngineCard } from "../components/EngineCard.js";
import { ProjectCard } from "../components/ProjectCard.js";

export class EngineVersionsView {
    constructor(app) {
        this.app = app;
        this.searchQuery = "";
    }

    render() {
        const engines = this.app?.state?.engines || [];
        const projects = this.app?.state?.projects || [];
        const filteredProjects = this.searchQuery
            ? projects.filter(p => (p.name || "").toLowerCase().includes(this.searchQuery.toLowerCase()))
            : projects;

        return `
            <div class="sm-epic-library-view">
                <!-- ENGINE-VERSIONEN SECTION -->
                <section class="sm-epic-section">
                    <div class="sm-epic-section-header">
                        <div class="sm-epic-section-title-group">
                            <h2 class="sm-epic-section-title">ENGINE-VERSIONEN</h2>
                            <button class="sm-epic-info-btn" title="About SM Engine Versions" type="button">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                            </button>
                            <button class="sm-epic-add-btn" data-action="add-engine-version" title="Add Engine Version / Link Custom Build" type="button">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            </button>
                        </div>

                        <div class="sm-epic-section-divider"></div>

                        <div class="sm-epic-header-links">
                            <a class="sm-epic-link" href="#" data-action="open-url" data-url="https://github.com/MEDELBOU3/SM-Engine">GITHUB SOURCE</a>
                            <a class="sm-epic-link" href="#" data-action="open-url" data-url="https://github.com/MEDELBOU3/SM-Engine/releases">RELEASE-NOTES</a>
                            <span class="sm-epic-stat">
                                <svg class="sm-cloud-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>
                                0,0 B
                            </span>
                        </div>
                    </div>

                    <div class="sm-epic-engine-grid">
                        ${engines.length > 0
                            ? engines.map(EngineCard.render).join("")
                            : `<div class="sm-empty-text">No engine versions available. Click [+] to add or download.</div>`
                        }
                    </div>
                </section>

                <!-- MEINE PROJEKTE SECTION -->
                <section class="sm-epic-section">
                    <div class="sm-epic-section-header">
                        <div class="sm-epic-section-title-group">
                            <h2 class="sm-epic-section-title">MEINE PROJEKTE</h2>
                        </div>

                        <div class="sm-epic-section-divider"></div>

                        <div class="sm-epic-project-tools">
                            <div class="sm-epic-search-box">
                                <svg class="sm-search-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                <input
                                    type="text"
                                    class="sm-epic-search-input"
                                    placeholder="Projekte durchsuchen"
                                    value="${this.searchQuery}"
                                    data-action="search-projects"
                                />
                            </div>

                            <button class="sm-btn sm-btn-primary" data-action="new-project" type="button">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                New Project
                            </button>
                        </div>
                    </div>

                    <div class="sm-epic-projects-container">
                        ${filteredProjects.length > 0 ? `
                            <div class="sm-grid sm-grid-3">
                                ${filteredProjects.map(ProjectCard.render).join("")}
                            </div>
                        ` : `
                            <div class="sm-epic-empty-projects">
                                <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#475569" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                                <span class="sm-empty-label">Keine Benutzerprojekte gefunden</span>
                                <button class="sm-btn sm-btn-sm" data-action="new-project" type="button">Create First Project</button>
                            </div>
                        `}
                    </div>
                </section>

                <!-- SM VAULT & CONTENT LIBRARY SECTION -->
                <section class="sm-epic-section">
                    <div class="sm-epic-section-header">
                        <div class="sm-epic-section-title-group">
                            <h2 class="sm-epic-section-title">SM Vault & Content Library</h2>
                            <button class="sm-epic-refresh-btn" data-action="refresh" title="Refresh SM Vault" type="button">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                            </button>
                        </div>

                        <div class="sm-epic-section-divider"></div>
                    </div>

                    <div class="sm-epic-fab-grid">
                        <div class="sm-epic-fab-item">
                            <div class="sm-fab-thumb-wrap">
                                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 22 22 22 12 2"/><polygon points="12 11 6 22 18 22 12 11"/></svg>
                            </div>
                            <div class="sm-fab-info">
                                <strong>Terrain & Nature Asset Pack</strong>
                                <span>SM Vault · High-Resolution Procedural Foliage</span>
                            </div>
                        </div>

                        <div class="sm-epic-fab-item">
                            <div class="sm-fab-thumb-wrap">
                                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4M8 16h.01M16 16h.01"/></svg>
                            </div>
                            <div class="sm-fab-info">
                                <strong>Physics & Ragdoll Starter Kit</strong>
                                <span>SM Vault · Rapier3D / Ammo Simulation</span>
                            </div>
                        </div>

                        <div class="sm-epic-fab-item">
                            <div class="sm-fab-thumb-wrap">
                                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/></svg>
                            </div>
                            <div class="sm-fab-info">
                                <strong>PBR Material & Shader Library</strong>
                                <span>SM Vault · WebGL 2.0 & GLSL Node Shaders</span>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        `;
    }
}
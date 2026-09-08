import { ProjectCard } from "../components/ProjectCard.js";

export class ProjectsView {
    constructor(app) {
        this.app = app;
    }

    render() {
        const projects = this.app?.state?.projects || [];

        return `
            <div class="sm-page">
                <div class="sm-page-head">
                    <div>
                        <h1 class="sm-page-title">Projects</h1>
                        <p class="sm-page-subtitle">
                            Create, open and manage SM Engine projects.
                        </p>
                    </div>

                    <button class="sm-btn sm-btn-primary" data-action="new-project" type="button">
                        New Project
                    </button>
                </div>

                <div class="sm-toolbar">
                    <input
                        id="project-search"
                        class="sm-field"
                        placeholder="Search projects…"
                    />

                    <button class="sm-btn" data-action="open-project" type="button">
                        Add Existing
                    </button>

                    <span class="sm-toolbar-spacer"></span>
                    <span class="sm-status">${projects.length} projects</span>
                </div>

                <div id="project-grid" class="sm-grid sm-grid-3">
                    ${projects.map(ProjectCard.render).join("")}
                </div>
            </div>
        `;
    }

    bind() {
        const input = document.getElementById("project-search");

        input?.addEventListener("input", () => {
            const query = input.value.trim().toLowerCase();

            document
                .querySelectorAll("#project-grid .sm-project-card")
                .forEach(card => {
                    card.hidden =
                        query &&
                        !card.textContent.toLowerCase().includes(query);
                });
        });
    }
}
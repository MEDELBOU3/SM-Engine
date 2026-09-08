export class TemplatesView {
    constructor(app) {
        this.app = app;
    }

    // Maps template id/category to a modes-image when no explicit image is set
    static modeImage(template = {}) {
        if (template.image) return template.image;
        const id = (template.id || "").toLowerCase();
        const cat = (template.category || "").toLowerCase();
        if (id === "film" || cat === "film") return "./assets/modes-images/film_content.png";
        if (id === "fps" || id === "gameplay") return "./assets/modes-images/gameplay_sample.png";
        if (id === "third-person" || cat === "game") return "./assets/modes-images/game_dev.png";
        return "./assets/modes-images/terrain_sculpting.png";
    }

    render() {
        const templates = this.app?.state?.templates || [];

        return `
            <div class="sm-page">
                <div class="sm-page-head">
                    <div>
                        <h1 class="sm-page-title">Templates</h1>
                        <p class="sm-page-subtitle">
                            Start from a prepared SM Engine project configuration.
                        </p>
                    </div>
                </div>

                <div class="sm-grid sm-grid-3">
                    ${templates.map(template => this.card(template)).join("")}
                </div>
            </div>
        `;
    }

    card(template = {}) {
        const imgSrc = TemplatesView.modeImage(template);

        return `
            <article class="sm-card sm-card-hover sm-template-card">
                <div class="sm-project-preview sm-has-mode-img">
                    <img
                        class="sm-mode-preview-img"
                        src="${imgSrc}"
                        alt="${template.name || "Template"} preview"
                        loading="lazy"
                        onerror="this.style.display='none'"
                    />
                    <div class="sm-mode-overlay"></div>
                    <span class="sm-project-type">${template.category || "General"}</span>
                </div>

                <div class="sm-card-title-row">
                    <div>
                        <h3 class="sm-card-title">${template.name || "Template"}</h3>
                        <div class="sm-card-meta">${template.description || ""}</div>
                    </div>
                </div>

                <div class="sm-card-actions">
                    <button
                        class="sm-btn sm-btn-primary"
                        data-action="create-template-project"
                        data-template-id="${template.id || "empty"}"
                        type="button"
                    >
                        Use Template
                    </button>
                </div>
            </article>
        `;
    }
}
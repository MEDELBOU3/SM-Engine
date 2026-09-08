export class ProjectCard {
    static render(project = {}) {
        const lastOpened = project.lastOpenedAt
            ? ProjectCard.relativeTime(project.lastOpenedAt)
            : (project.lastOpened || "Never opened");

        const imgSrc = ProjectCard.modeImage(project);

        return `
            <article class="sm-card sm-card-hover sm-project-card">
                <div class="sm-project-preview sm-has-mode-img">
                    <img
                        class="sm-mode-preview-img"
                        src="${imgSrc}"
                        alt="${project.name || "Project"} preview"
                        loading="lazy"
                        onerror="this.style.display='none'"
                    />
                    <div class="sm-mode-overlay"></div>
                    <span class="sm-project-type">${project.type || "Project"}</span>
                </div>

                <div class="sm-card-title-row">
                    <div>
                        <h3 class="sm-card-title">${project.name || "Untitled Project"}</h3>
                        <div class="sm-card-meta">
                            SM Engine ${project.engineVersion || "1.0.1"} · ${lastOpened}
                        </div>
                    </div>
                </div>

                <div class="sm-card-path" title="${project.path || ""}">
                    ${project.path || "No path"}
                </div>

                <div class="sm-card-actions">
                    <button
                        class="sm-btn sm-btn-primary"
                        data-action="${project.id ? "launch-project" : "launch-engine"}"
                        ${project.id ? `data-project-id="${project.id}"` : ""}
                        type="button"
                    >
                        Open
                    </button>

                    ${project.id ? `
                        <button
                            class="sm-btn"
                            data-action="remove-project"
                            data-project-id="${project.id}"
                            type="button"
                        >
                            Remove
                        </button>
                    ` : `
                        <button class="sm-btn" type="button">Details</button>
                    `}
                </div>
            </article>
        `;
    }

    /**
     * Pick a mode preview image based on the project's type / template id.
     * Falls back to terrain_sculpting if nothing matches.
     */
    static modeImage(project = {}) {
        // If the project already stores an image path (future-proof), use it
        if (project.image) return project.image;

        const type      = (project.type     || "").toLowerCase();
        const template  = (project.template || "").toLowerCase();

        if (type.includes("film") || template.includes("film"))
            return "./assets/modes-images/film_content.png";

        if (type.includes("fps") || type.includes("first") || template.includes("fps") || template.includes("gameplay"))
            return "./assets/modes-images/gameplay_sample.png";

        if (type.includes("third") || type.includes("game") || template.includes("third") || template.includes("game"))
            return "./assets/modes-images/game_dev.png";

        // General / empty / terrain fall-back
        return "./assets/modes-images/terrain_sculpting.png";
    }

    static relativeTime(timestamp) {
        const delta   = Math.max(0, Date.now() - Number(timestamp));
        const minutes = Math.floor(delta / 60000);

        if (minutes < 1)  return "Just now";
        if (minutes < 60) return `${minutes}m ago`;

        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;

        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }
}
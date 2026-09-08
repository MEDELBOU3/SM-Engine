// src/ui/modals/NewProjectModal.js

export class NewProjectModal {
    constructor(app) {
        this.app = app;
        this.root = null;
    }


    open(options = {}) {
        this.close();

        const template =
            options.template ||
            'empty';

        this.root =
            document.createElement(
                'div'
            );

        this.root.className =
            'sm-modal-backdrop';

        this.root.innerHTML = `
            <section
                class="sm-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="new-project-title"
            >
                <header class="sm-modal-head">
                    <div>
                        <h2 id="new-project-title">
                            Create Project
                        </h2>

                        <p>
                            Create a new SM Engine project
                            from a prepared template.
                        </p>
                    </div>

                    <button
                        class="sm-modal-close"
                        type="button"
                        data-modal-close
                        aria-label="Close"
                    >
                        ×
                    </button>
                </header>

                <div class="sm-modal-body">
                    <label class="sm-form-group">
                        <span>Project Name</span>

                        <input
                            id="sm-project-name"
                            class="sm-field"
                            value="My Project"
                            autocomplete="off"
                        />
                    </label>

                    <div class="sm-form-group">
                        <span>Template</span>

                        <!-- Hidden real value sent to backend -->
                        <input type="hidden" id="sm-project-template" value="${template}" />

                        <!-- Visual mode image picker -->
                        <div class="sm-template-picker">
                            ${this.templateOptions(template)}
                        </div>
                    </div>

                    <div class="sm-form-group">
                        <span>Location</span>

                        <div class="sm-path-picker">
                            <input
                                id="sm-project-location"
                                class="sm-field"
                                value="C:\\Users\\PC\\Documents\\SM Engine Projects"
                            />

                            <button
                                id="sm-project-browse"
                                class="sm-btn"
                                type="button"
                            >
                                Browse
                            </button>
                        </div>
                    </div>

                    <div class="sm-project-preview-box">
                        <span>Project will be created at</span>

                        <code id="sm-project-preview-path"></code>
                    </div>

                    <div
                        id="sm-project-error"
                        class="sm-form-error"
                        hidden
                    ></div>
                </div>

                <footer class="sm-modal-foot">
                    <button
                        class="sm-btn"
                        type="button"
                        data-modal-close
                    >
                        Cancel
                    </button>

                    <button
                        id="sm-project-create"
                        class="sm-btn sm-btn-primary"
                        type="button"
                    >
                        Create Project
                    </button>
                </footer>
            </section>
        `;

        document.body.appendChild(
            this.root
        );

        this.bind();
        this.updatePreview();

        requestAnimationFrame(
            () => {
                this.root
                    ?.querySelector(
                        '#sm-project-name'
                    )
                    ?.select();
            }
        );
    }


    close() {
        this.root?.remove();
        this.root = null;
    }


    bind() {
        if (!this.root) return;

        this.root
            .querySelectorAll(
                '[data-modal-close]'
            )
            .forEach(
                button =>
                    button.addEventListener(
                        'click',
                        () => this.close()
                    )
            );

        this.root.addEventListener(
            'click',
            event => {
                if (
                    event.target ===
                    this.root
                ) {
                    this.close();
                }
            }
        );

        this.root
            .querySelector(
                '#sm-project-name'
            )
            ?.addEventListener(
                'input',
                () =>
                    this.updatePreview()
            );

        this.root
            .querySelector(
                '#sm-project-location'
            )
            ?.addEventListener(
                'input',
                () =>
                    this.updatePreview()
            );

        this.root
            .querySelector(
                '#sm-project-browse'
            )
            ?.addEventListener(
                'click',
                () =>
                    this.browse()
            );

        this.root
            .querySelector(
                '#sm-project-create'
            )
            ?.addEventListener(
                'click',
                () =>
                    this.create()
            );

        this.root.addEventListener(
            'keydown',
            event => {
                if (
                    event.key ===
                    'Escape'
                ) {
                    this.close();
                }
            }
        );

        // Template image tile selection
        this.root
            .querySelectorAll('.sm-tpl-tile')
            .forEach(tile => {
                tile.addEventListener('click', () => {
                    // Update hidden input value
                    const hidden = this.root.querySelector('#sm-project-template');
                    if (hidden) hidden.value = tile.dataset.tplId;

                    // Toggle selected class
                    this.root.querySelectorAll('.sm-tpl-tile').forEach(t => t.classList.remove('is-selected'));
                    tile.classList.add('is-selected');
                });
            });
    }


    async browse() {
        if (
            !window.launcherAPI
                ?.selectDirectory
        ) {
            this.showError(
                'Directory picker API is not available.'
            );

            return;
        }

        const input =
            this.root?.querySelector(
                '#sm-project-location'
            );

        const result =
            await window.launcherAPI
                .selectDirectory({
                    title:
                        'Choose project location',

                    defaultPath:
                        input?.value ||
                        undefined
                });

        if (
            !result ||
            result.canceled
        ) {
            return;
        }

        input.value =
            result.path;

        this.updatePreview();
    }


    async create() {
        const name =
            this.root
                ?.querySelector(
                    '#sm-project-name'
                )
                ?.value
                ?.trim();

        const template =
            this.root
                ?.querySelector(
                    '#sm-project-template'
                )
                ?.value;

        const parentDirectory =
            this.root
                ?.querySelector(
                    '#sm-project-location'
                )
                ?.value
                ?.trim();

        if (
            !name ||
            !parentDirectory
        ) {
            this.showError(
                'Project name and location are required.'
            );

            return;
        }

        if (
            !window.launcherAPI
                ?.createProject
        ) {
            this.showError(
                'Project creation API is not available.'
            );

            return;
        }

        const button =
            this.root?.querySelector(
                '#sm-project-create'
            );

        button.disabled = true;
        button.textContent =
            'Creating…';

        this.hideError();

        try {
            const result =
                await window.launcherAPI
                    .createProject({
                        name,
                        parentDirectory,
                        template
                    });

            if (!result?.ok) {
                throw new Error(
                    result?.error ||
                    'Could not create project.'
                );
            }

            this.close();

            await this.app
                .reloadProjects();

            this.app.notify(
                'Project created',
                `${result.project.name} is ready.`
            );

            this.app.router.go(
                'projects'
            );
        } catch (error) {
            this.showError(
                error?.message ||
                String(error)
            );

            button.disabled = false;
            button.textContent =
                'Create Project';
        }
    }


    updatePreview() {
        if (!this.root) return;

        const name =
            this.root
                .querySelector(
                    '#sm-project-name'
                )
                ?.value
                ?.trim() ||
            'My Project';

        const location =
            this.root
                .querySelector(
                    '#sm-project-location'
                )
                ?.value
                ?.trim() ||
            '';

        const cleanName =
            name.replace(
                /[<>:"/\\|?*]/g,
                '-'
            );

        const preview =
            this.root.querySelector(
                '#sm-project-preview-path'
            );

        if (preview) {
            preview.textContent =
                location
                    ? `${location}\\${cleanName}`
                    : cleanName;
        }
    }


    showError(message) {
        const node =
            this.root?.querySelector(
                '#sm-project-error'
            );

        if (!node) return;

        node.hidden = false;
        node.textContent =
            message;
    }


    hideError() {
        const node =
            this.root?.querySelector(
                '#sm-project-error'
            );

        if (node) {
            node.hidden = true;
        }
    }


    templateOptions(selected) {
        const MODES = [
            {
                id: 'empty',
                label: 'Empty',
                category: 'General',
                image: './assets/modes-images/terrain_sculpting.png'
            },
            {
                id: 'fps',
                label: 'First Person',
                category: 'Game',
                image: './assets/modes-images/gameplay_sample.png'
            },
            {
                id: 'third-person',
                label: 'Third Person',
                category: 'Game',
                image: './assets/modes-images/game_dev.png'
            },
            {
                id: 'film',
                label: 'Film / Cinematic',
                category: 'Film',
                image: './assets/modes-images/film_content.png'
            }
        ];

        return MODES.map(m => `
            <button
                type="button"
                class="sm-tpl-tile ${m.id === selected ? 'is-selected' : ''}"
                data-tpl-id="${m.id}"
                title="${m.label}"
            >
                <img
                    class="sm-tpl-tile-img"
                    src="${m.image}"
                    alt="${m.label}"
                    onerror="this.style.opacity='0'"
                />
                <div class="sm-tpl-tile-overlay"></div>
                <span class="sm-tpl-tile-label">
                    <span class="sm-tpl-cat">${m.category}</span>
                    ${m.label}
                </span>
            </button>
        `).join('');
    }
}
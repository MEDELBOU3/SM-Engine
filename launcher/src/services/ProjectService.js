// src/services/ProjectService.js
// SM Engine Launcher — canonical project-folder service.
//
// V2 aligns physical Launcher projects with the EXISTING SM Engine
// project format used by SMProjectStorage:
//
//   format: "SM_PROJECT"
//   version: 1
//   startupScene: "Maps/Main.smscene"
//   workspace: "FILM" | "GAME_DEV" | "GAMEPLAY_SAMPLE" | "TERRAIN"
//
// Old Launcher projects using:
//   schema: "smproject"
//   startupLevel: "Levels/Main.scene.json"
// are still accepted by inspectProject() for compatibility.

'use strict';

const fs = require('fs');
const path = require('path');


const CANONICAL_FOLDERS = Object.freeze([
    'Maps',
    'Terrain',
    'Materials',
    'Textures',
    'Models',
    'Foliage',
    'Water',
    'Audio',
    'Scripts',
    'UI',
    'Config'
]);


const SUPPORT_FOLDERS = Object.freeze([
    'Saved',
    'Saved/Autosaves',
    'Saved/Logs',
    'Intermediate'
]);


class ProjectService {
    constructor(options = {}) {
        this.engineVersion =
            options.engineVersion ||
            '1.0.1';
    }


    sanitizeProjectName(value) {
        const name =
            String(value || '')
                .trim();

        if (!name) {
            throw new Error(
                'Project name is required.'
            );
        }

        const folderName =
            name
                .replace(
                    /[<>:"/\\|?*\x00-\x1F]/g,
                    '-'
                )
                .replace(/\.+$/g, '')
                .replace(/\s+/g, ' ')
                .trim();

        if (!folderName) {
            throw new Error(
                'Project name contains no valid characters.'
            );
        }

        return {
            displayName: name,
            folderName
        };
    }


    createProject(options = {}) {
        const {
            displayName,
            folderName
        } =
            this.sanitizeProjectName(
                options.name
            );


        const parentDirectory =
            path.resolve(
                String(
                    options.parentDirectory ||
                    ''
                )
            );


        if (!parentDirectory) {
            throw new Error(
                'Project directory is required.'
            );
        }


        fs.mkdirSync(
            parentDirectory,
            {
                recursive: true
            }
        );


        const projectPath =
            path.join(
                parentDirectory,
                folderName
            );


        if (
            fs.existsSync(
                projectPath
            )
        ) {
            const entries =
                fs.readdirSync(
                    projectPath
                );

            if (
                entries.length >
                0
            ) {
                throw new Error(
                    `Project folder already exists and is not empty: ${projectPath}`
                );
            }
        }


        fs.mkdirSync(
            projectPath,
            {
                recursive: true
            }
        );


        for (
            const relative
            of [
                ...CANONICAL_FOLDERS,
                ...SUPPORT_FOLDERS
            ]
        ) {
            fs.mkdirSync(
                path.join(
                    projectPath,
                    relative
                ),
                {
                    recursive: true
                }
            );
        }


        const template =
            String(
                options.template ||
                'empty'
            )
                .trim()
                .toLowerCase();


        const workspace =
            this.templateToWorkspace(
                template
            );


        const type =
            this.templateToType(
                template
            );


        const now =
            new Date()
                .toISOString();


        const projectId =
            this.makeProjectId();


        /*
         * Keep this close to the canonical project record produced by
         * SMProjectStorage.createProject().
         *
         * Extra fields such as engineVersion/template/type are Launcher
         * metadata and are intentionally additive.
         */
        const projectManifest = {
            id:
                projectId,

            projectId,

            name:
                displayName,

            format:
                'SM_PROJECT',

            version:
                1,

            engineVersion:
                options.engineVersion ||
                this.engineVersion,

            startupScene:
                'Maps/Main.smscene',

            workspace,

            template,

            type,

            createdAt:
                now,

            modifiedAt:
                now,

            lastOpenedAt:
                now,

            metadata: {
                launcher: {
                    createdBy:
                        'SM Engine Launcher',

                    template,

                    type
                }
            }
        };


        const projectConfig = {
            project: {
                id:
                    projectId,

                name:
                    displayName,

                workspace,

                startupScene:
                    projectManifest
                        .startupScene
            },

            engine: {
                version:
                    projectManifest
                        .engineVersion
            },

            renderer: {
                backend:
                    'automatic'
            }
        };


        this.writeJson(
            path.join(
                projectPath,
                'project.smproject'
            ),
            projectManifest
        );


        this.writeJson(
            path.join(
                projectPath,
                'Config',
                'project.json'
            ),
            projectConfig
        );


        /*
         * DO NOT invent Maps/Main.smscene here.
         *
         * SM Engine already owns the canonical scene serializer.
         * On first Launcher open, SMLauncherProjectBridge activates the
         * project and SMProjectSerializer creates the correct
         * Maps/Main.smscene representation.
         *
         * The upcoming SMProjectFilesystemSync step will mirror that
         * canonical scene into this physical project folder.
         */


        fs.writeFileSync(
            path.join(
                projectPath,
                '.smengine'
            ),
            [
                'SM Engine Project',
                `ProjectId=${projectId}`,
                `EngineVersion=${projectManifest.engineVersion}`,
                ''
            ].join('\n'),
            'utf8'
        );


        return {
            ...projectManifest,

            path:
                projectPath
        };
    }


    inspectProject(projectPath) {
        const absolute =
            path.resolve(
                String(
                    projectPath ||
                    ''
                )
            );


        const manifestPath =
            path.join(
                absolute,
                'project.smproject'
            );


        if (
            !fs.existsSync(
                manifestPath
            )
        ) {
            throw new Error(
                'This folder does not contain project.smproject.'
            );
        }


        let manifest;


        try {
            manifest =
                JSON.parse(
                    fs.readFileSync(
                        manifestPath,
                        'utf8'
                    )
                );
        }
        catch {
            throw new Error(
                'project.smproject is not valid JSON.'
            );
        }


        const isCanonical =
            manifest?.format ===
            'SM_PROJECT';


        const isLegacyLauncher =
            manifest?.schema ===
            'smproject';


        if (
            !isCanonical &&
            !isLegacyLauncher
        ) {
            throw new Error(
                'Unsupported SM Engine project format.'
            );
        }


        /*
         * Normalize old Launcher projects into the fields expected by
         * ProjectManager without rewriting their files automatically.
         */
        return {
            ...manifest,

            id:
                manifest.id ||
                manifest.projectId ||
                null,

            projectId:
                manifest.projectId ||
                manifest.id ||
                null,

            name:
                manifest.name ||
                path.basename(
                    absolute
                ),

            format:
                manifest.format ||
                'SM_PROJECT',

            version:
                Number(
                    manifest.version ||
                    manifest.schemaVersion ||
                    1
                ),

            engineVersion:
                manifest.engineVersion ||
                this.engineVersion,

            workspace:
                manifest.workspace ||
                this.templateToWorkspace(
                    manifest.template ||
                    'empty'
                ),

            startupScene:
                manifest.startupScene ||
                manifest.startupLevel ||
                'Maps/Main.smscene',

            template:
                manifest.template ||
                'empty',

            type:
                manifest.type ||
                this.templateToType(
                    manifest.template ||
                    'empty'
                ),

            legacy:
                isLegacyLauncher,

            path:
                absolute
        };
    }


    templateToWorkspace(template) {
        switch (
            String(template || '')
                .trim()
                .toLowerCase()
        ) {
            case 'fps':
            case 'first-person':
            case 'third-person':
            case 'game':
                return 'GAME_DEV';

            case 'gameplay-sample':
                return 'GAMEPLAY_SAMPLE';

            case 'terrain':
                return 'TERRAIN';

            case 'film':
            case 'cinematic':
            case '2d':
            case 'animation-2d':
            case 'empty':
            default:
                return 'FILM';
        }
    }


    templateToType(template) {
        switch (
            String(template || '')
                .trim()
                .toLowerCase()
        ) {
            case 'film':
            case 'cinematic':
                return 'Film';

            case '2d':
            case 'animation-2d':
                return '2D';

            case 'terrain':
                return 'Terrain';

            case 'empty':
                return 'General';

            default:
                return 'Game';
        }
    }


    writeJson(
        filePath,
        value
    ) {
        fs.writeFileSync(
            filePath,
            JSON.stringify(
                value,
                null,
                2
            ),
            'utf8'
        );
    }


    makeProjectId() {
        if (
            globalThis.crypto
                ?.randomUUID
        ) {
            return (
                'project_' +
                globalThis.crypto
                    .randomUUID()
            );
        }

        return (
            'project_' +
            Date.now()
                .toString(36) +
            '_' +
            Math.random()
                .toString(36)
                .slice(2, 10)
        );
    }
}


module.exports = {
    ProjectService,
    CANONICAL_FOLDERS,
    SUPPORT_FOLDERS
};
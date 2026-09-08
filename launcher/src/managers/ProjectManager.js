// src/managers/ProjectManager.js
// Persistent project registry for SM Engine Launcher.

'use strict';

const fs = require('fs');
const path = require('path');


class ProjectManager {
    constructor(options = {}) {
        this.app = options.app;
        this.projectService = options.projectService;

        this.filePath = path.join(
            this.app.getPath('userData'),
            'projects.json'
        );

        this.projects = [];

        this.load();
    }


    load() {
        if (!fs.existsSync(this.filePath)) {
            this.save();
            return this.projects;
        }

        try {
            const data = JSON.parse(
                fs.readFileSync(
                    this.filePath,
                    'utf8'
                )
            );

            this.projects =
                Array.isArray(data)
                    ? data
                    : [];
        } catch (error) {
            console.warn(
                '[SM Launcher] Could not load projects registry:',
                error
            );

            this.projects = [];
        }

        this.cleanupMissingProjects();

        return this.projects;
    }


    save() {
        fs.mkdirSync(
            path.dirname(this.filePath),
            { recursive: true }
        );

        fs.writeFileSync(
            this.filePath,
            JSON.stringify(
                this.projects,
                null,
                2
            ),
            'utf8'
        );
    }


    list() {
        return [...this.projects]
            .sort(
                (a, b) =>
                    Number(b.lastOpenedAt || 0) -
                    Number(a.lastOpenedAt || 0)
            );
    }


    findByPath(projectPath) {
        const normalized =
            path.resolve(projectPath)
                .toLowerCase();

        return this.projects.find(
            project =>
                path.resolve(project.path)
                    .toLowerCase() ===
                normalized
        ) || null;
    }


    add(project) {
        const existing =
            this.findByPath(project.path);

        if (existing) {
            Object.assign(
                existing,
                project,
                {
                    updatedAt:
                        Date.now()
                }
            );

            this.save();

            return existing;
        }

        const record = {
            id:
                project.id ||
                this.makeId(),

            name:
                project.name ||
                path.basename(
                    project.path
                ),

            type:
                project.type ||
                'Game',

            template:
                project.template ||
                'empty',

            engineVersion:
                project.engineVersion ||
                '1.0.1',

            path:
                path.resolve(
                    project.path
                ),

            createdAt:
                project.createdAt ||
                Date.now(),

            updatedAt:
                Date.now(),

            lastOpenedAt:
                project.lastOpenedAt ||
                0
        };

        this.projects.push(record);

        this.save();

        return record;
    }


    remove(projectId) {
        const index =
            this.projects.findIndex(
                project =>
                    project.id ===
                    projectId
            );

        if (index < 0) {
            return false;
        }

        this.projects.splice(
            index,
            1
        );

        this.save();

        return true;
    }


    touch(projectId) {
        const project =
            this.projects.find(
                item =>
                    item.id ===
                    projectId
            );

        if (!project) {
            return null;
        }

        project.lastOpenedAt =
            Date.now();

        project.updatedAt =
            Date.now();

        this.save();

        return project;
    }


    cleanupMissingProjects() {
        const before =
            this.projects.length;

        this.projects =
            this.projects.filter(
                project =>
                    fs.existsSync(
                        project.path
                    )
            );

        if (
            before !==
            this.projects.length
        ) {
            this.save();
        }
    }


    makeId() {
        return (
            'project-' +
            Date.now().toString(36) +
            '-' +
            Math.random()
                .toString(36)
                .slice(2, 8)
        );
    }
}


module.exports = {
    ProjectManager
};
/**
 * RenderQueueManager.js
 * SM Engine Video Editing — persistent batch render queue.
 */
(function (global) {
  "use strict";

  class RenderQueueManager {
    constructor(exporter = null, project = null) {
      this.exporter = exporter || global.videoExportManager;

      this.project = project || global.videoProject || null;

      this.jobs = [];
      this.running = false;
      this.currentJobId = null;
      this.stopAfterCurrent = false;
      this.listeners = new Set();

      this._load();
    }

    subscribe(callback) {
      if (typeof callback !== "function") {
        return () => {};
      }

      this.listeners.add(callback);

      return () => {
        this.listeners.delete(callback);
      };
    }

    _emit(type, detail = {}) {
      const event = {
        type,
        detail,
        queue: this,
      };

      this.listeners.forEach((callback) => {
        try {
          callback(event);
        } catch (error) {
          console.error("[RenderQueueManager]", error);
        }
      });

      try {
        global.dispatchEvent(
          new CustomEvent("videoRenderQueueChanged", {
            detail: event,
          }),
        );
      } catch (_) {}
    }

    addJob(settings = {}, options = {}) {
      const resolved = this.exporter.resolveSettings(settings);

      const job = {
        id: `render-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,

        name: options.name || this._displayName(resolved),

        settings: resolved,

        status: "queued",
        progress: 0,
        createdAt: new Date().toISOString(),

        startedAt: null,
        completedAt: null,
        error: null,
        outputName: null,
        outputBytes: 0,
      };

      this.jobs.push(job);

      this._save();

      this._emit("add", {
        job,
      });

      return job;
    }

    addIndividualClips(settings = {}) {
      const clips = global.videoProject?.timeline?.clips || [];

      const added = [];

      clips.forEach((clip, index) => {
        const resolved = this.exporter.resolveSettings({
          ...settings,

          range: "custom",

          rangeStart: Number(clip.start || 0),

          rangeEnd: Number(clip.start || 0) + Number(clip.duration || 0),

          filename: settings.filename || "{project}_{clip}_{index}",

          clip: clip.name || clip.id,

          index: index + 1,
        });

        added.push(
          this.addJob(resolved, {
            name: `Clip ${index + 1} · ${clip.name || clip.id}`,
          }),
        );
      });

      return added;
    }

    duplicate(id) {
      const source = this.get(id);

      if (!source) {
        return null;
      }

      return this.addJob(
        {
          ...source.settings,
        },
        {
          name: `${source.name} Copy`,
        },
      );
    }

    remove(id) {
      if (id === this.currentJobId) {
        return false;
      }

      const before = this.jobs.length;

      this.jobs = this.jobs.filter((job) => job.id !== id);

      const changed = before !== this.jobs.length;

      if (changed) {
        this._save();

        this._emit("remove", {
          id,
        });
      }

      return changed;
    }

    move(id, toIndex) {
      const index = this.jobs.findIndex((job) => job.id === id);

      if (index < 0) {
        return false;
      }

      const target = Math.max(
        0,
        Math.min(this.jobs.length - 1, Number(toIndex)),
      );

      if (index === target) {
        return true;
      }

      const [job] = this.jobs.splice(index, 1);

      this.jobs.splice(target, 0, job);

      this._save();

      this._emit("move", {
        id,
        from: index,
        to: target,
      });

      return true;
    }

    get(id) {
      return this.jobs.find((job) => job.id === id) || null;
    }

    counts() {
      const result = {
        queued: 0,
        rendering: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
      };

      this.jobs.forEach((job) => {
        if (Object.prototype.hasOwnProperty.call(result, job.status)) {
          result[job.status]++;
        }
      });

      return result;
    }

    clearCompleted() {
      if (this.running) {
        this.jobs = this.jobs.filter(
          (job) => job.status !== "completed" || job.id === this.currentJobId,
        );
      } else {
        this.jobs = this.jobs.filter((job) => job.status !== "completed");
      }

      this._save();
      this._emit("clear-completed");
    }

    retry(id) {
      const job = this.get(id);

      if (!job) {
        return false;
      }

      job.status = "queued";
      job.progress = 0;
      job.error = null;
      job.startedAt = null;
      job.completedAt = null;
      job.outputName = null;
      job.outputBytes = 0;

      this._save();

      this._emit("retry", {
        id,
      });

      return true;
    }

    cancelCurrent() {
      if (!this.currentJobId) {
        return false;
      }

      const job = this.get(this.currentJobId);

      if (job) {
        job.status = "cancelled";
      }

      this.exporter.cancel?.();

      this._save();

      this._emit("cancel-current", {
        id: this.currentJobId,
      });

      return true;
    }

    requestStopAfterCurrent(value = true) {
      this.stopAfterCurrent = !!value;

      this._emit("stop-after-current", {
        enabled: this.stopAfterCurrent,
      });
    }

    async start() {
      if (this.running) {
        return false;
      }

      this.running = true;
      this.stopAfterCurrent = false;

      this._emit("start-queue");

      try {
        while (this.running) {
          const job = this.jobs.find(
            (candidate) => candidate.status === "queued",
          );

          if (!job) {
            break;
          }

          await this._runJob(job);

          if (this.stopAfterCurrent) {
            break;
          }
        }
      } finally {
        this.running = false;
        this.currentJobId = null;

        this._save();

        this._emit("queue-idle");
      }

      return true;
    }

    async startJob(id) {
      if (this.running) {
        return false;
      }

      const job = this.get(id);

      if (!job) {
        return false;
      }

      if (!["queued", "failed", "cancelled"].includes(job.status)) {
        return false;
      }

      if (job.status !== "queued") {
        this.retry(job.id);
      }

      this.running = true;
      this.currentJobId = job.id;

      try {
        await this._runJob(job);
      } finally {
        this.running = false;
        this.currentJobId = null;
        this._save();
        this._emit("queue-idle");
      }

      return true;
    }

    async _runJob(job) {
      this.currentJobId = job.id;

      job.status = "rendering";
      job.progress = 0;
      job.startedAt = new Date().toISOString();

      this._save();

      this._emit("job-start", {
        job,
      });

      try {
        const result = await this.exporter.renderJob(job, {
          onProgress: (progress) => {
            job.progress = Math.max(0, Math.min(1, Number(progress) || 0));

            this._emit("job-progress", {
              id: job.id,
              progress: job.progress,
            });
          },
        });

        if (result?.cancelled) {
          job.status = "cancelled";
          job.progress = 0;
        } else {
          job.status = "completed";
          job.progress = 1;
          job.completedAt = new Date().toISOString();

          job.outputName = result?.name || null;

          job.outputBytes = Number(result?.blob?.size || 0);
        }

        this._save();

        this._emit("job-complete", {
          job,
          result,
        });

        return result;
      } catch (error) {
        job.status = "failed";
        job.error = error?.message || String(error);

        job.completedAt = new Date().toISOString();

        this._save();

        this._emit("job-failed", {
          job,
          error,
        });

        return null;
      } finally {
        this.currentJobId = null;
      }
    }

    _displayName(settings) {
      const format = this.exporter.capabilities.get(settings.formatId);

      return `${settings.width}×${settings.height} · ${format?.codec?.toUpperCase() || settings.formatId}`;
    }

    _save() {
      const project = global.videoProject || this.project;

      if (!project?.state) {
        return;
      }

      project.state.export = project.state.export || {};

      /*
       * Blobs are never persisted in the project. Queue metadata/settings only.
       */
      project.state.export.renderQueue = this.jobs.map((job) => ({
        ...job,
      }));

      project.touch?.("export.renderQueue", {
        count: this.jobs.length,
      });
    }

    _load() {
      const project = global.videoProject || this.project;

      const stored = project?.state?.export?.renderQueue;

      if (Array.isArray(stored)) {
        this.jobs = stored.map((job) => ({
          ...job,

          status: job.status === "rendering" ? "queued" : job.status,

          progress: job.status === "rendering" ? 0 : Number(job.progress || 0),
        }));
      }
    }
  }

  global.RenderQueueManager = RenderQueueManager;

  global.renderQueueManager =
    global.renderQueueManager ||
    new RenderQueueManager(global.videoExportManager, global.videoProject);
})(window);

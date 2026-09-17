// engine/project/SMProjectStorage.js
// SM Engine Project Persistence Layer
// IndexedDB-backed virtual project filesystem.
// Load BEFORE all project serializers/loaders/managers.

(() => {
  "use strict";

  const DB_NAME = "SMEngineProjectsDB";
  const DB_VERSION = 1;

  const STORES = Object.freeze({
    PROJECTS: "projects",
    FILES: "files",
    BLOBS: "blobs",
    AUTOSAVES: "autosaves",
  });

  const DEFAULT_PROJECT_FOLDERS = Object.freeze([
    "Maps",
    "Terrain",
    "Materials",
    "Textures",
    "Models",
    "Foliage",
    "Water",
    "Audio",
    "Scripts",
    "UI",
    "Config",
  ]);

  function nowISO() {
    return new Date().toISOString();
  }

  function randomId(prefix = "id") {
    if (globalThis.crypto?.randomUUID) {
      return `${prefix}_${crypto.randomUUID()}`;
    }

    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeProjectId(projectId) {
    const value = String(projectId || "").trim();

    if (!value) {
      throw new Error("[SMProjectStorage] projectId is required.");
    }

    return value;
  }

  function normalizePath(path = "") {
    let value = String(path || "")
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/")
      .trim();

    value = value.replace(/^\/+/, "");

    const parts = value.split("/").filter(Boolean);

    const safe = [];

    for (const part of parts) {
      if (part === ".") continue;

      if (part === "..") {
        safe.pop();
        continue;
      }

      safe.push(part);
    }

    return safe.join("/");
  }

  function dirname(path = "") {
    const normalized = normalizePath(path);

    if (!normalized.includes("/")) {
      return "";
    }

    return normalized.split("/").slice(0, -1).join("/");
  }

  function basename(path = "") {
    const normalized = normalizePath(path);

    if (!normalized) {
      return "";
    }

    return normalized.split("/").pop();
  }

  function extension(path = "") {
    const name = basename(path);
    const index = name.lastIndexOf(".");

    if (index <= 0 || index === name.length - 1) {
      return "";
    }

    return name.slice(index + 1).toLowerCase();
  }

  function cloneJSON(value) {
    if (value == null) {
      return value;
    }

    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch (_) {}
    }

    return JSON.parse(JSON.stringify(value));
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);

      request.onerror = () =>
        reject(
          request.error ||
            new Error("[SMProjectStorage] IndexedDB request failed."),
        );
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();

      transaction.onabort = () =>
        reject(
          transaction.error ||
            new Error("[SMProjectStorage] IndexedDB transaction aborted."),
        );

      transaction.onerror = () =>
        reject(
          transaction.error ||
            new Error("[SMProjectStorage] IndexedDB transaction failed."),
        );
    });
  }

  function ensureBlob(data, mimeType = "application/octet-stream") {
    if (data instanceof Blob) {
      return data;
    }

    if (data instanceof ArrayBuffer) {
      return new Blob([data], {
        type: mimeType,
      });
    }

    if (ArrayBuffer.isView(data)) {
      const copy = data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength,
      );

      return new Blob([copy], {
        type: mimeType,
      });
    }

    if (typeof data === "string") {
      return new Blob([data], {
        type: mimeType,
      });
    }

    throw new TypeError("[SMProjectStorage] Unsupported binary payload.");
  }

  class SMProjectStorage {
    constructor() {
      this.db = null;
      this.openPromise = null;
      this.ready = false;

      this.dbName = DB_NAME;
      this.dbVersion = DB_VERSION;

      this.events = new EventTarget();
    }

    on(type, handler, options) {
      this.events.addEventListener(type, handler, options);

      return () => this.events.removeEventListener(type, handler, options);
    }

    _emit(type, detail = {}) {
      const event = new CustomEvent(type, {
        detail,
      });

      this.events.dispatchEvent(event);

      window.dispatchEvent(
        new CustomEvent(`sm:project-storage:${type}`, {
          detail,
        }),
      );
    }

    async init() {
      if (this.db) {
        this.ready = true;
        return this;
      }

      if (this.openPromise) {
        await this.openPromise;
        return this;
      }

      this.openPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.dbVersion);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;

          this._upgradeDatabase(db, event.oldVersion, event.newVersion);
        };

        request.onsuccess = () => {
          this.db = request.result;

          this.db.onversionchange = () => {
            this.db?.close?.();

            this.db = null;
            this.ready = false;
          };

          this.ready = true;
          resolve(this);
        };

        request.onerror = () => {
          this.ready = false;

          reject(
            request.error ||
              new Error("[SMProjectStorage] Failed to open IndexedDB."),
          );
        };

        request.onblocked = () => {
          console.warn(
            "[SMProjectStorage] Database upgrade is blocked by another open tab.",
          );
        };
      });

      try {
        await this.openPromise;
      } finally {
        this.openPromise = null;
      }

      return this;
    }

    _upgradeDatabase(db, oldVersion, newVersion) {
      if (!db.objectStoreNames.contains(STORES.PROJECTS)) {
        const projects = db.createObjectStore(STORES.PROJECTS, {
          keyPath: "id",
        });

        projects.createIndex("byName", "name", {
          unique: false,
        });

        projects.createIndex("byModifiedAt", "modifiedAt", {
          unique: false,
        });
      }

      if (!db.objectStoreNames.contains(STORES.FILES)) {
        const files = db.createObjectStore(STORES.FILES, {
          keyPath: "id",
        });

        files.createIndex("byProject", "projectId", {
          unique: false,
        });

        files.createIndex("byProjectPath", ["projectId", "path"], {
          unique: true,
        });

        files.createIndex("byProjectParent", ["projectId", "parentPath"], {
          unique: false,
        });

        files.createIndex("byProjectKind", ["projectId", "kind"], {
          unique: false,
        });
      }

      if (!db.objectStoreNames.contains(STORES.BLOBS)) {
        const blobs = db.createObjectStore(STORES.BLOBS, {
          keyPath: "id",
        });

        blobs.createIndex("byProject", "projectId", {
          unique: false,
        });

        blobs.createIndex("byProjectPath", ["projectId", "path"], {
          unique: true,
        });
      }

      if (!db.objectStoreNames.contains(STORES.AUTOSAVES)) {
        const autosaves = db.createObjectStore(STORES.AUTOSAVES, {
          keyPath: "id",
        });

        autosaves.createIndex("byProject", "projectId", {
          unique: false,
        });

        autosaves.createIndex(
          "byProjectCreatedAt",
          ["projectId", "createdAt"],
          {
            unique: false,
          },
        );
      }

      console.log(
        `[SMProjectStorage] IndexedDB upgrade ${oldVersion} → ${newVersion}`,
      );
    }

    async _ensureReady() {
      if (!this.db) {
        await this.init();
      }

      return this.db;
    }

    _transaction(storeNames, mode = "readonly") {
      if (!this.db) {
        throw new Error("[SMProjectStorage] Database is not initialized.");
      }

      return this.db.transaction(
        Array.isArray(storeNames) ? storeNames : [storeNames],
        mode,
      );
    }

    async createProject({
      id = null,
      name = "Untitled Project",
      startupScene = "Maps/Main.smscene",
      workspace = "FILM",
      metadata = {},
      createDefaultFolders = true,
    } = {}) {
      await this._ensureReady();

      const projectId = id || randomId("project");

      const createdAt = nowISO();

      const project = {
        id: projectId,
        name: String(name || "Untitled Project").trim() || "Untitled Project",
        format: "SM_PROJECT",
        version: 1,
        startupScene: normalizePath(startupScene) || "Maps/Main.smscene",
        workspace: String(workspace || "FILM").toUpperCase(),
        createdAt,
        modifiedAt: createdAt,
        lastOpenedAt: createdAt,
        metadata: cloneJSON(metadata) || {},
      };

      const exists = await this.getProject(projectId);

      if (exists) {
        throw new Error(
          `[SMProjectStorage] Project already exists: ${projectId}`,
        );
      }

      const tx = this._transaction(
        [STORES.PROJECTS, STORES.FILES],
        "readwrite",
      );

      tx.objectStore(STORES.PROJECTS).put(project);

      if (createDefaultFolders) {
        const files = tx.objectStore(STORES.FILES);

        for (const folderName of DEFAULT_PROJECT_FOLDERS) {
          const path = normalizePath(folderName);

          files.put({
            id: `${projectId}:${path}`,
            projectId,
            path,
            parentPath: dirname(path),
            name: basename(path),
            kind: "folder",
            mimeType: "application/x-sm-folder",
            size: 0,
            content: null,
            createdAt,
            modifiedAt: createdAt,
            metadata: {},
          });
        }
      }

      await transactionDone(tx);

      await this.writeJSON(projectId, "project.smproject", project, {
        mimeType: "application/x-sm-project+json",
        touchProject: false,
      });

      this._emit("project-created", {
        project: cloneJSON(project),
      });

      return cloneJSON(project);
    }

    async getProject(projectId) {
      await this._ensureReady();

      const id = normalizeProjectId(projectId);

      const tx = this._transaction(STORES.PROJECTS);

      return (
        (await requestToPromise(tx.objectStore(STORES.PROJECTS).get(id))) ||
        null
      );
    }

    async listProjects({ sort = "modifiedAt", descending = true } = {}) {
      await this._ensureReady();

      const tx = this._transaction(STORES.PROJECTS);

      const rows = await requestToPromise(
        tx.objectStore(STORES.PROJECTS).getAll(),
      );

      rows.sort((a, b) => {
        const av = a?.[sort] ?? "";
        const bv = b?.[sort] ?? "";

        if (av === bv) {
          return 0;
        }

        const order = av < bv ? -1 : 1;

        return descending ? -order : order;
      });

      return rows.map(cloneJSON);
    }

    async updateProject(projectId, patch = {}) {
      await this._ensureReady();

      const id = normalizeProjectId(projectId);

      const current = await this.getProject(id);

      if (!current) {
        throw new Error(`[SMProjectStorage] Project not found: ${id}`);
      }

      const next = {
        ...current,
        ...cloneJSON(patch),
        id,
        modifiedAt: nowISO(),
      };

      if (patch.metadata) {
        next.metadata = {
          ...(current.metadata || {}),
          ...cloneJSON(patch.metadata),
        };
      }

      const tx = this._transaction(STORES.PROJECTS, "readwrite");

      tx.objectStore(STORES.PROJECTS).put(next);

      await transactionDone(tx);

      await this.writeJSON(id, "project.smproject", next, {
        mimeType: "application/x-sm-project+json",
        touchProject: false,
      });

      this._emit("project-updated", {
        project: cloneJSON(next),
      });

      return cloneJSON(next);
    }

    async touchProject(projectId, patch = {}) {
      const current = await this.getProject(projectId);

      if (!current) {
        return null;
      }

      const next = {
        ...current,
        ...cloneJSON(patch),
        id: current.id,
        modifiedAt: nowISO(),
      };

      const tx = this._transaction(STORES.PROJECTS, "readwrite");

      tx.objectStore(STORES.PROJECTS).put(next);

      await transactionDone(tx);

      return cloneJSON(next);
    }

    async markProjectOpened(projectId) {
      return this.touchProject(projectId, {
        lastOpenedAt: nowISO(),
      });
    }

    async createFolder(
      projectId,
      path,
      { metadata = {}, touchProject = true } = {},
    ) {
      await this._ensureReady();

      const pid = normalizeProjectId(projectId);

      const normalized = normalizePath(path);

      if (!normalized) {
        return null;
      }

      const now = nowISO();

      const record = {
        id: `${pid}:${normalized}`,
        projectId: pid,
        path: normalized,
        parentPath: dirname(normalized),
        name: basename(normalized),
        kind: "folder",
        mimeType: "application/x-sm-folder",
        size: 0,
        content: null,
        createdAt: now,
        modifiedAt: now,
        metadata: cloneJSON(metadata) || {},
      };

      const existing = await this.getEntry(pid, normalized);

      if (existing) {
        if (existing.kind !== "folder") {
          throw new Error(
            `[SMProjectStorage] Path is already a file: ${normalized}`,
          );
        }

        return existing;
      }

      const parent = dirname(normalized);

      if (parent) {
        await this.createFolder(pid, parent, {
          touchProject: false,
        });
      }

      const tx = this._transaction(STORES.FILES, "readwrite");

      tx.objectStore(STORES.FILES).put(record);

      await transactionDone(tx);

      if (touchProject) {
        await this.touchProject(pid);
      }

      this._emit("entry-created", {
        entry: cloneJSON(record),
      });

      return cloneJSON(record);
    }

    async getEntry(projectId, path) {
      await this._ensureReady();

      const pid = normalizeProjectId(projectId);

      const normalized = normalizePath(path);

      if (!normalized) {
        return null;
      }

      const tx = this._transaction(STORES.FILES);

      const index = tx.objectStore(STORES.FILES).index("byProjectPath");

      return (await requestToPromise(index.get([pid, normalized]))) || null;
    }

    async exists(projectId, path) {
      return !!(await this.getEntry(projectId, path));
    }

    async writeFile(
      projectId,
      path,
      content,
      { mimeType = "text/plain", metadata = {}, touchProject = true } = {},
    ) {
      await this._ensureReady();

      const pid = normalizeProjectId(projectId);

      const normalized = normalizePath(path);

      if (!normalized) {
        throw new Error("[SMProjectStorage] File path is required.");
      }

      const parent = dirname(normalized);

      if (parent) {
        await this.createFolder(pid, parent, {
          touchProject: false,
        });
      }

      const existing = await this.getEntry(pid, normalized);

      if (existing?.kind === "folder") {
        throw new Error(
          `[SMProjectStorage] Cannot overwrite folder with file: ${normalized}`,
        );
      }

      const now = nowISO();

      const text =
        typeof content === "string" ? content : String(content ?? "");

      const record = {
        id: `${pid}:${normalized}`,
        projectId: pid,
        path: normalized,
        parentPath: parent,
        name: basename(normalized),
        kind: "file",
        mimeType,
        size: new Blob([text]).size,
        content: text,
        createdAt: existing?.createdAt || now,
        modifiedAt: now,
        metadata: {
          ...(existing?.metadata || {}),
          ...(cloneJSON(metadata) || {}),
        },
      };

      const tx = this._transaction(STORES.FILES, "readwrite");

      tx.objectStore(STORES.FILES).put(record);

      await transactionDone(tx);

      if (touchProject) {
        await this.touchProject(pid);
      }

      this._emit(existing ? "entry-updated" : "entry-created", {
        entry: cloneJSON(record),
      });

      return cloneJSON(record);
    }

    async writeJSON(
      projectId,
      path,
      value,
      {
        mimeType = "application/json",
        pretty = true,
        metadata = {},
        touchProject = true,
      } = {},
    ) {
      const text = JSON.stringify(value, null, pretty ? 2 : 0);

      return this.writeFile(projectId, path, text, {
        mimeType,
        metadata,
        touchProject,
      });
    }

    async readFile(projectId, path) {
      const entry = await this.getEntry(projectId, path);

      if (!entry || entry.kind !== "file") {
        return null;
      }

      return {
        ...entry,
        metadata: cloneJSON(entry.metadata || {}),
      };
    }

    async readText(projectId, path) {
      const entry = await this.readFile(projectId, path);

      return entry ? entry.content : null;
    }

    async readJSON(projectId, path, fallback = null) {
      const text = await this.readText(projectId, path);

      if (text == null) {
        return fallback;
      }

      try {
        return JSON.parse(text);
      } catch (error) {
        console.error(`[SMProjectStorage] Invalid JSON: ${path}`, error);

        return fallback;
      }
    }

    async writeBlob(
      projectId,
      path,
      data,
      {
        mimeType = "application/octet-stream",
        metadata = {},
        touchProject = true,
      } = {},
    ) {
      await this._ensureReady();

      const pid = normalizeProjectId(projectId);

      const normalized = normalizePath(path);

      if (!normalized) {
        throw new Error("[SMProjectStorage] Blob path is required.");
      }

      const parent = dirname(normalized);

      if (parent) {
        await this.createFolder(pid, parent, {
          touchProject: false,
        });
      }

      const blob = ensureBlob(data, mimeType);

      const now = nowISO();

      const tx = this._transaction([STORES.BLOBS, STORES.FILES], "readwrite");

      const blobs = tx.objectStore(STORES.BLOBS);

      const files = tx.objectStore(STORES.FILES);

      const blobId = `${pid}:${normalized}`;

      const existing = await requestToPromise(
        files.index("byProjectPath").get([pid, normalized]),
      );

      blobs.put({
        id: blobId,
        projectId: pid,
        path: normalized,
        blob,
        size: blob.size,
        mimeType: blob.type || mimeType,
        createdAt: existing?.createdAt || now,
        modifiedAt: now,
        metadata: cloneJSON(metadata) || {},
      });

      files.put({
        id: blobId,
        projectId: pid,
        path: normalized,
        parentPath: parent,
        name: basename(normalized),
        kind: "binary",
        mimeType: blob.type || mimeType,
        size: blob.size,
        content: null,
        createdAt: existing?.createdAt || now,
        modifiedAt: now,
        metadata: cloneJSON(metadata) || {},
      });

      await transactionDone(tx);

      if (touchProject) {
        await this.touchProject(pid);
      }

      this._emit(existing ? "entry-updated" : "entry-created", {
        entry: {
          projectId: pid,
          path: normalized,
          kind: "binary",
          mimeType: blob.type || mimeType,
          size: blob.size,
        },
      });

      return {
        projectId: pid,
        path: normalized,
        kind: "binary",
        mimeType: blob.type || mimeType,
        size: blob.size,
      };
    }

    async readBlob(projectId, path) {
      await this._ensureReady();

      const pid = normalizeProjectId(projectId);

      const normalized = normalizePath(path);

      const tx = this._transaction(STORES.BLOBS);

      const index = tx.objectStore(STORES.BLOBS).index("byProjectPath");

      return (await requestToPromise(index.get([pid, normalized]))) || null;
    }

    async writeArrayBuffer(projectId, path, arrayBuffer, options = {}) {
      return this.writeBlob(projectId, path, arrayBuffer, options);
    }

    async readArrayBuffer(projectId, path) {
      const record = await this.readBlob(projectId, path);

      if (!record?.blob) {
        return null;
      }

      return record.blob.arrayBuffer();
    }

    async writeFloat32Array(projectId, path, values, options = {}) {
      if (!(values instanceof Float32Array)) {
        values = new Float32Array(values || []);
      }

      const copy = values.buffer.slice(
        values.byteOffset,
        values.byteOffset + values.byteLength,
      );

      return this.writeBlob(projectId, path, copy, {
        mimeType: "application/x-sm-float32",
        ...options,
        metadata: {
          ...(options.metadata || {}),
          typedArray: "Float32Array",
          length: values.length,
        },
      });
    }

    async readFloat32Array(projectId, path) {
      const buffer = await this.readArrayBuffer(projectId, path);

      if (!buffer) {
        return null;
      }

      return new Float32Array(buffer);
    }

    async listEntries(
      projectId,
      {
        parentPath = null,
        recursive = true,
        includeFolders = true,
        includeFiles = true,
      } = {},
    ) {
      await this._ensureReady();

      const pid = normalizeProjectId(projectId);

      const normalizedParent =
        parentPath == null ? null : normalizePath(parentPath);

      const tx = this._transaction(STORES.FILES);

      const store = tx.objectStore(STORES.FILES);

      const rows = await requestToPromise(store.index("byProject").getAll(pid));

      let result = rows.filter((entry) => {
        if (!includeFolders && entry.kind === "folder") {
          return false;
        }

        if (!includeFiles && entry.kind !== "folder") {
          return false;
        }

        if (normalizedParent == null) {
          return true;
        }

        if (!recursive) {
          return entry.parentPath === normalizedParent;
        }

        if (!normalizedParent) {
          return true;
        }

        return (
          entry.path === normalizedParent ||
          entry.path.startsWith(`${normalizedParent}/`)
        );
      });

      result.sort((a, b) => {
        if (a.kind === "folder" && b.kind !== "folder") {
          return -1;
        }

        if (a.kind !== "folder" && b.kind === "folder") {
          return 1;
        }

        return a.path.localeCompare(b.path);
      });

      return result.map((entry) => ({
        ...entry,
        metadata: cloneJSON(entry.metadata || {}),
      }));
    }

    async listFolder(projectId, path = "") {
      return this.listEntries(projectId, {
        parentPath: path,
        recursive: false,
      });
    }

    async deleteEntry(
      projectId,
      path,
      { recursive = true, touchProject = true } = {},
    ) {
      await this._ensureReady();

      const pid = normalizeProjectId(projectId);

      const normalized = normalizePath(path);

      const entry = await this.getEntry(pid, normalized);

      if (!entry) {
        return false;
      }

      let targets = [entry];

      if (entry.kind === "folder" && recursive) {
        targets = await this.listEntries(pid, {
          parentPath: normalized,
          recursive: true,
        });
      }

      const tx = this._transaction([STORES.FILES, STORES.BLOBS], "readwrite");

      const files = tx.objectStore(STORES.FILES);

      const blobs = tx.objectStore(STORES.BLOBS);

      for (const target of targets) {
        files.delete(target.id);

        if (target.kind === "binary") {
          blobs.delete(target.id);
        }
      }

      await transactionDone(tx);

      if (touchProject) {
        await this.touchProject(pid);
      }

      this._emit("entry-deleted", {
        projectId: pid,
        path: normalized,
      });

      return true;
    }

    async deleteProject(projectId) {
      await this._ensureReady();

      const pid = normalizeProjectId(projectId);

      const [files, blobs, autosaves] = await Promise.all([
        this.listEntries(pid),
        this._getAllByIndex(STORES.BLOBS, "byProject", pid),
        this._getAllByIndex(STORES.AUTOSAVES, "byProject", pid),
      ]);

      const tx = this._transaction(
        [STORES.PROJECTS, STORES.FILES, STORES.BLOBS, STORES.AUTOSAVES],
        "readwrite",
      );

      tx.objectStore(STORES.PROJECTS).delete(pid);

      const fileStore = tx.objectStore(STORES.FILES);

      const blobStore = tx.objectStore(STORES.BLOBS);

      const autosaveStore = tx.objectStore(STORES.AUTOSAVES);

      for (const file of files) {
        fileStore.delete(file.id);
      }

      for (const blob of blobs) {
        blobStore.delete(blob.id);
      }

      for (const autosave of autosaves) {
        autosaveStore.delete(autosave.id);
      }

      await transactionDone(tx);

      this._emit("project-deleted", {
        projectId: pid,
      });

      return true;
    }

    async _getAllByIndex(storeName, indexName, key) {
      await this._ensureReady();

      const tx = this._transaction(storeName);

      return requestToPromise(
        tx.objectStore(storeName).index(indexName).getAll(key),
      );
    }

    async saveAutosave(
      projectId,
      snapshot,
      { id = null, label = "Autosave", metadata = {} } = {},
    ) {
      await this._ensureReady();

      const pid = normalizeProjectId(projectId);

      const createdAt = nowISO();

      const record = {
        id: id || randomId(`autosave_${pid}`),
        projectId: pid,
        label: String(label || "Autosave"),
        createdAt,
        snapshot: cloneJSON(snapshot),
        metadata: cloneJSON(metadata) || {},
      };

      const tx = this._transaction(STORES.AUTOSAVES, "readwrite");

      tx.objectStore(STORES.AUTOSAVES).put(record);

      await transactionDone(tx);

      this._emit("autosave-created", {
        autosave: cloneJSON(record),
      });

      return cloneJSON(record);
    }

    async listAutosaves(projectId, { limit = 20, newestFirst = true } = {}) {
      const pid = normalizeProjectId(projectId);

      const rows = await this._getAllByIndex(
        STORES.AUTOSAVES,
        "byProject",
        pid,
      );

      rows.sort((a, b) =>
        newestFirst
          ? String(b.createdAt).localeCompare(String(a.createdAt))
          : String(a.createdAt).localeCompare(String(b.createdAt)),
      );

      return rows.slice(0, Math.max(0, Number(limit) || 0)).map(cloneJSON);
    }

    async deleteAutosave(autosaveId) {
      await this._ensureReady();

      const id = String(autosaveId || "").trim();

      if (!id) {
        return false;
      }

      const tx = this._transaction(STORES.AUTOSAVES, "readwrite");

      tx.objectStore(STORES.AUTOSAVES).delete(id);

      await transactionDone(tx);

      return true;
    }

    async pruneAutosaves(projectId, keep = 10) {
      const pid = normalizeProjectId(projectId);

      const rows = await this.listAutosaves(pid, {
        limit: Number.MAX_SAFE_INTEGER,
        newestFirst: true,
      });

      const remove = rows.slice(Math.max(0, Number(keep) || 0));

      for (const row of remove) {
        await this.deleteAutosave(row.id);
      }

      return remove.length;
    }

    async exportProjectSnapshot(projectId) {
      const pid = normalizeProjectId(projectId);

      const project = await this.getProject(pid);

      if (!project) {
        throw new Error(`[SMProjectStorage] Project not found: ${pid}`);
      }

      const entries = await this.listEntries(pid);

      const files = {};
      const binaries = {};

      for (const entry of entries) {
        if (entry.kind === "folder") {
          continue;
        }

        if (entry.kind === "binary") {
          const blobRecord = await this.readBlob(pid, entry.path);

          if (blobRecord?.blob) {
            binaries[entry.path] = {
              blob: blobRecord.blob,
              mimeType: blobRecord.mimeType,
              metadata: cloneJSON(blobRecord.metadata || {}),
            };
          }

          continue;
        }

        files[entry.path] = {
          content: entry.content,
          mimeType: entry.mimeType,
          metadata: cloneJSON(entry.metadata || {}),
        };
      }

      return {
        format: "SM_PROJECT_SNAPSHOT",
        version: 1,
        project: cloneJSON(project),
        entries: entries.map((entry) => ({
          path: entry.path,
          kind: entry.kind,
          mimeType: entry.mimeType,
          size: entry.size,
          metadata: cloneJSON(entry.metadata || {}),
        })),
        files,
        binaries,
        exportedAt: nowISO(),
      };
    }

    async getDebugInfo() {
      await this._ensureReady();

      const projects = await this.listProjects();

      let fileCount = 0;
      let binaryCount = 0;

      for (const project of projects) {
        const entries = await this.listEntries(project.id);

        fileCount += entries.length;

        binaryCount += entries.filter(
          (entry) => entry.kind === "binary",
        ).length;
      }

      return {
        dbName: this.dbName,
        dbVersion: this.dbVersion,
        ready: this.ready,
        projectCount: projects.length,
        entryCount: fileCount,
        binaryCount,
        projects: projects.map((project) => ({
          id: project.id,
          name: project.name,
          modifiedAt: project.modifiedAt,
        })),
      };
    }

    close() {
      this.db?.close?.();

      this.db = null;
      this.ready = false;
    }
  }

  SMProjectStorage.DB_NAME = DB_NAME;

  SMProjectStorage.DB_VERSION = DB_VERSION;

  SMProjectStorage.STORES = STORES;

  SMProjectStorage.DEFAULT_PROJECT_FOLDERS = DEFAULT_PROJECT_FOLDERS;

  SMProjectStorage.normalizePath = normalizePath;

  SMProjectStorage.dirname = dirname;

  SMProjectStorage.basename = basename;

  SMProjectStorage.extension = extension;

  window.SMProjectStorage = SMProjectStorage;

  /*
   * Shared singleton used by the rest of the project system.
   *
   * Usage:
   *   await window.smProjectStorage.init();
   */
  window.smProjectStorage = window.smProjectStorage || new SMProjectStorage();

  window.smProjectStorage
    .init()
    .then(() => {
      console.log("✅ SM Project Storage ready");

      window.dispatchEvent(
        new CustomEvent("sm:project-storage-ready", {
          detail: {
            storage: window.smProjectStorage,
          },
        }),
      );
    })
    .catch((error) => {
      console.error("❌ SM Project Storage failed to initialize", error);
    });
})();

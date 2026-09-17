/**
 * VideoNodeGraph.js
 * SM Engine — Fusion/Video Node Graph state.
 *
 * Phase 11:
 * - persistent per-clip graphs
 * - cycle-safe connections
 * - helpers for upstream/downstream traversal
 * - output-node discovery
 * - history-safe restore
 */
(function (global) {
  "use strict";

  class VideoNodeGraph {
    constructor(project = null, graphData = null) {
      this.project =
        project ||
        global.videoProject ||
        global.ensureVideoProjectState?.() ||
        null;

      this.data = graphData || this._createGraphData();

      this.listeners = new Set();

      this._normalize();
    }

    _createGraphData(options = {}) {
      const id =
        options.id ||
        this.project?.makeId?.("graph") ||
        `graph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      return {
        id,

        name: options.name || "Fusion Composition",

        clipId: options.clipId || null,

        nodes: [],
        links: [],

        viewport: {
          x: 0,
          y: 0,
          zoom: 1,
        },

        version: 2,

        createdAt: new Date().toISOString(),

        modifiedAt: new Date().toISOString(),
      };
    }

    _normalize() {
      this.data.nodes = Array.isArray(this.data.nodes) ? this.data.nodes : [];

      this.data.links = Array.isArray(this.data.links) ? this.data.links : [];

      this.data.viewport =
        this.data.viewport && typeof this.data.viewport === "object"
          ? this.data.viewport
          : {
              x: 0,
              y: 0,
              zoom: 1,
            };

      this.data.viewport.x = Number(this.data.viewport.x || 0);

      this.data.viewport.y = Number(this.data.viewport.y || 0);

      this.data.viewport.zoom = Math.max(
        0.2,
        Math.min(3, Number(this.data.viewport.zoom || 1)),
      );

      this.data.version = Number(this.data.version || 2);

      this.data.nodes.forEach((node) => {
        node.x = Number(node.x || 0);

        node.y = Number(node.y || 0);

        node.width = Math.max(120, Number(node.width || 172));

        node.inputs = Array.isArray(node.inputs) ? node.inputs : [];

        node.outputs = Array.isArray(node.outputs) ? node.outputs : [];

        node.params =
          node.params && typeof node.params === "object" ? node.params : {};

        node.metadata =
          node.metadata && typeof node.metadata === "object"
            ? node.metadata
            : {};

        node.selected = !!node.selected;

        node.enabled = node.enabled !== false;

        node.collapsed = !!node.collapsed;
      });

      /*
       * Remove links whose endpoints no longer exist.
       */
      const ids = new Set(this.data.nodes.map((node) => node.id));

      this.data.links = this.data.links.filter(
        (link) => ids.has(link.fromNode) && ids.has(link.toNode),
      );
    }

    get id() {
      return this.data.id;
    }

    get nodes() {
      return this.data.nodes;
    }

    get links() {
      return this.data.links;
    }

    get viewport() {
      return this.data.viewport;
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
      this.data.modifiedAt = new Date().toISOString();

      const event = {
        type,
        graph: this,
        detail,
      };

      this.listeners.forEach((callback) => {
        try {
          callback(event);
        } catch (error) {
          console.error("[VideoNodeGraph] listener error:", error);
        }
      });

      try {
        global.dispatchEvent(
          new CustomEvent("videoFusionGraphChanged", {
            detail: event,
          }),
        );
      } catch (_) {}

      this._touchProject(type, detail);
    }

    _touchProject(type, detail) {
      if (!this.project?.state) {
        return;
      }

      this.project.state.fusion = this.project.state.fusion || {
        graphs: {},
        activeGraphId: null,
      };

      this.project.state.fusion.graphs = this.project.state.fusion.graphs || {};

      this.project.state.fusion.graphs[this.data.id] = this.data;

      this.project.state.fusion.activeGraphId = this.data.id;

      this.project.touch?.("fusion.graph.updated", {
        id: this.data.id,

        clipId: this.data.clipId,

        type,
        detail,
      });
    }

    addNode(definition) {
      if (!definition) {
        return null;
      }

      const node = {
        id:
          definition.id ||
          this.project?.makeId?.("node") ||
          `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,

        type: definition.type || "Unknown",

        title: definition.title || definition.type || "Node",

        category: definition.category || "Utility",

        x: Number(definition.x || 0),

        y: Number(definition.y || 0),

        width: Math.max(120, Number(definition.width || 172)),

        enabled: definition.enabled !== false,

        collapsed: !!definition.collapsed,

        selected: false,

        inputs: this._clone(definition.inputs || []),

        outputs: this._clone(definition.outputs || []),

        params: this._clone(definition.params || {}),

        color: definition.color || null,

        metadata: this._clone(definition.metadata || {}),
      };

      this.data.nodes.push(node);

      this._emit("node:add", {
        nodeId: node.id,
        nodeType: node.type,
      });

      return node;
    }

    removeNode(id) {
      const index = this.data.nodes.findIndex((node) => node.id === id);

      if (index < 0) {
        return null;
      }

      const [removed] = this.data.nodes.splice(index, 1);

      this.data.links = this.data.links.filter(
        (link) => link.fromNode !== id && link.toNode !== id,
      );

      this._emit("node:remove", {
        nodeId: id,
      });

      return removed;
    }

    duplicateNode(id) {
      const source = this.getNode(id);

      if (!source) {
        return null;
      }

      const copy = this._clone(source);

      delete copy.id;

      copy.x += 30;
      copy.y += 30;
      copy.selected = false;

      return this.addNode(copy);
    }

    moveNode(id, x, y, options = {}) {
      const node = this.getNode(id);

      if (!node) {
        return false;
      }

      node.x = Number(x || 0);

      node.y = Number(y || 0);

      if (options.silent !== true) {
        this._emit("node:move", {
          nodeId: id,
          x: node.x,
          y: node.y,
        });
      }

      return true;
    }

    setNodeEnabled(id, value) {
      const node = this.getNode(id);

      if (!node) {
        return false;
      }

      node.enabled = !!value;

      this._emit("node:enabled", {
        nodeId: id,
        enabled: node.enabled,
      });

      return true;
    }

    setNodeCollapsed(id, value) {
      const node = this.getNode(id);

      if (!node) {
        return false;
      }

      node.collapsed = !!value;

      this._emit("node:collapsed", {
        nodeId: id,
        collapsed: node.collapsed,
      });

      return true;
    }

    setNodeParam(id, key, value) {
      const node = this.getNode(id);

      if (!node) {
        return false;
      }

      node.params[key] = value;

      this._emit("node:param", {
        nodeId: id,
        key,
        value,
      });

      return true;
    }

    getNode(id) {
      return this.data.nodes.find((node) => node.id === id) || null;
    }

    getLink(id) {
      return this.data.links.find((link) => link.id === id) || null;
    }

    getOutputNode() {
      return (
        this.data.nodes.find(
          (node) => node.type === "MediaOut" && node.enabled !== false,
        ) ||
        this.data.nodes.find((node) => node.type === "MediaOut") ||
        null
      );
    }

    incomingLinks(nodeId) {
      return this.data.links.filter((link) => link.toNode === nodeId);
    }

    outgoingLinks(nodeId) {
      return this.data.links.filter((link) => link.fromNode === nodeId);
    }

    inputLink(nodeId, socketName) {
      return (
        this.data.links.find(
          (link) => link.toNode === nodeId && link.toSocket === socketName,
        ) || null
      );
    }

    outputLinks(nodeId, socketName = null) {
      return this.data.links.filter(
        (link) =>
          link.fromNode === nodeId &&
          (socketName == null || link.fromSocket === socketName),
      );
    }

    selectNode(id, add = false) {
      if (!add) {
        this.data.nodes.forEach((node) => {
          node.selected = false;
        });
      }

      const node = this.getNode(id);

      if (node) {
        node.selected = add ? !node.selected : true;
      }

      this._emit("selection", {
        selectedIds: this.getSelectedNodes().map((selected) => selected.id),
      });
    }

    clearSelection(options = {}) {
      let changed = false;

      this.data.nodes.forEach((node) => {
        if (node.selected) {
          node.selected = false;
          changed = true;
        }
      });

      if (changed && options.silent !== true) {
        this._emit("selection", {
          selectedIds: [],
        });
      }
    }

    getSelectedNodes() {
      return this.data.nodes.filter((node) => node.selected);
    }

    connect(fromNode, fromSocket, toNode, toSocket, options = {}) {
      if (!this.getNode(fromNode) || !this.getNode(toNode)) {
        return null;
      }

      if (fromNode === toNode && options.allowSelf !== true) {
        return null;
      }

      if (
        options.allowCycle !== true &&
        this.wouldCreateCycle(fromNode, toNode)
      ) {
        try {
          global.dispatchEvent(
            new CustomEvent("videoFusionConnectionRejected", {
              detail: {
                graph: this,
                reason: "cycle",
                fromNode,
                toNode,
              },
            }),
          );
        } catch (_) {}

        return null;
      }

      const duplicate = this.data.links.find(
        (link) =>
          link.fromNode === fromNode &&
          link.fromSocket === fromSocket &&
          link.toNode === toNode &&
          link.toSocket === toSocket,
      );

      if (duplicate) {
        return duplicate;
      }

      if (options.replaceInput !== false) {
        this.data.links = this.data.links.filter(
          (link) => !(link.toNode === toNode && link.toSocket === toSocket),
        );
      }

      const link = {
        id:
          this.project?.makeId?.("link") ||
          `link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,

        fromNode,
        fromSocket,
        toNode,
        toSocket,
      };

      this.data.links.push(link);

      this._emit("link:add", {
        linkId: link.id,
      });

      return link;
    }

    wouldCreateCycle(fromNode, toNode) {
      if (fromNode === toNode) {
        return true;
      }

      /*
       * A new from -> to connection creates a cycle if FROM is already reachable
       * from TO through existing downstream links.
       */
      const visited = new Set();

      const stack = [toNode];

      while (stack.length) {
        const current = stack.pop();

        if (current === fromNode) {
          return true;
        }

        if (visited.has(current)) {
          continue;
        }

        visited.add(current);

        this.outgoingLinks(current).forEach((link) => {
          stack.push(link.toNode);
        });
      }

      return false;
    }

    disconnect(id) {
      const index = this.data.links.findIndex((link) => link.id === id);

      if (index < 0) {
        return null;
      }

      const [removed] = this.data.links.splice(index, 1);

      this._emit("link:remove", {
        linkId: id,
      });

      return removed;
    }

    disconnectInput(nodeId, socketName) {
      const removed = this.data.links.filter(
        (link) => link.toNode === nodeId && link.toSocket === socketName,
      );

      if (!removed.length) {
        return [];
      }

      const ids = new Set(removed.map((link) => link.id));

      this.data.links = this.data.links.filter((link) => !ids.has(link.id));

      this._emit("link:remove-input", {
        nodeId,
        socketName,
        linkIds: [...ids],
      });

      return removed;
    }

    setViewport(patch = {}, options = {}) {
      if (Number.isFinite(Number(patch.x))) {
        this.data.viewport.x = Number(patch.x);
      }

      if (Number.isFinite(Number(patch.y))) {
        this.data.viewport.y = Number(patch.y);
      }

      if (Number.isFinite(Number(patch.zoom))) {
        this.data.viewport.zoom = Math.max(
          0.2,
          Math.min(3, Number(patch.zoom)),
        );
      }

      if (options.silent !== true) {
        this._emit("viewport", this._clone(this.data.viewport));
      }
    }

    restore(snapshot, options = {}) {
      if (!snapshot) {
        return false;
      }

      const keepId = this.data.id;

      const keepClip = this.data.clipId;

      const restored = this._clone(snapshot);

      restored.id = restored.id || keepId;

      if (restored.clipId == null) {
        restored.clipId = keepClip;
      }

      this.data = restored;

      this._normalize();

      if (options.silent !== true) {
        this._emit("graph:restore", {
          reason: options.reason || "restore",
        });
      } else {
        this._touchProject("graph:restore", {
          reason: options.reason || "restore",
        });
      }

      return true;
    }

    serialize() {
      return this._clone(this.data);
    }

    _clone(value) {
      if (global.structuredClone) {
        try {
          return global.structuredClone(value);
        } catch (_) {}
      }

      return JSON.parse(JSON.stringify(value));
    }
  }

  global.VideoNodeGraph = VideoNodeGraph;
})(window);

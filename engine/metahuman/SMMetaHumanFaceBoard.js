// engine/metahuman/SMMetaHumanFaceBoard.js
class SMMetaHumanFaceBoard {
  constructor(options = {}) {
    this.url = options.url || "engine/assets/metahuman/faceboard.json";
    this.data = null;
    this.loaded = false;
  }

  async load(url = this.url) {
    this.url = url;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.data = await response.json();
      this.loaded = !!this.data;
      return this.data;
    } catch (error) {
      this.data = null;
      this.loaded = false;
      console.warn("[MetaHuman] FaceBoard load failed:", error);
      return null;
    }
  }

  setData(data) {
    this.data = typeof data === "string" ? JSON.parse(data) : data;
    this.loaded = !!this.data;
    return this.data;
  }

  getData() {
    return this.data;
  }

  getRigDefinition() {
    return this.data?.rig_def || null;
  }

  getControls() {
    return this.data?.gui?.controls || [];
  }

  getControl(name) {
    return this.getControls().find(control => control?.name === name) || null;
  }

  getControlNames() {
    return this.getControls()
      .map(control => control?.name)
      .filter(Boolean);
  }

  getRegions() {
    return [...new Set(
      this.getControls()
        .map(control => control?.region)
        .filter(Boolean)
    )];
  }

  getDestinations(controlName) {
    const control = this.getControl(controlName);
    if (!control) return [];
    const result = [];
    for (const axis of control.axes || []) {
      for (const destination of axis.destinations || []) {
        result.push({
          axis: axis.axis,
          target: destination.target,
          min: destination.dst_min,
          max: destination.dst_max
        });
      }
    }
    return result;
  }

  getShapeNames() {
    const names = new Set();
    for (const control of this.getControls()) {
      if (control?.shape) names.add(control.shape);
    }
    return [...names];
  }

  dispose() {
    this.data = null;
    this.loaded = false;
  }
}

window.SMMetaHumanFaceBoard = SMMetaHumanFaceBoard;
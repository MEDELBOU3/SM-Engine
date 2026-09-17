// engine/metahuman/SMMetaHumanBodyRig.js
// Lightweight body parameter bridge for the assembled character.
// It preserves the character's original scale and applies non-destructive
// proportions to the MetaHuman root.

class SMMetaHumanBodyRig {
  constructor(options = {}) {
    this.character = options.character || window.smMetaHumanCharacter || null;
    this.root = null;
    this.baseScale = null;
    this.values = { height: 1, weight: 1 };
  }

  setCharacter(character) {
    this.character = character || null;
    return this.character;
  }

  setRoot(root) {
    this.root = root || null;
    if (this.root && !this.baseScale && this.root.scale) {
      this.baseScale = this.root.scale.clone();
    }
    return this.root;
  }

  setHeight(value) {
    const height = Math.max(0.5, Math.min(1.5, Number(value) || 1));
    this.values.height = height;
    this._apply();
    this.character?.updateData?.("body.height", height);
    return height;
  }

  setWeight(value) {
    const weight = Math.max(0.5, Math.min(1.5, Number(value) || 1));
    this.values.weight = weight;
    this._apply();
    this.character?.updateData?.("body.weight", weight);
    return weight;
  }

  set(values = {}) {
    if ("height" in values) this.setHeight(values.height);
    if ("weight" in values) this.setWeight(values.weight);
    return { ...this.values };
  }

  get() {
    return { ...this.values };
  }

  reset() {
    this.values = { height: 1, weight: 1 };
    this._apply();
    return this.get();
  }

  _apply() {
    if (!this.root?.scale) return;

    const base = this.baseScale || this.root.scale.clone();
    const height = this.values.height;
    const weight = this.values.weight;

    this.root.scale.set(
      base.x * weight,
      base.y * height,
      base.z * weight
    );
  }

  dispose() {
    this.root = null;
    this.baseScale = null;
    this.character = null;
  }
}

window.SMMetaHumanBodyRig = SMMetaHumanBodyRig;
if (!window.smMetaHumanBodyRig) {
  window.smMetaHumanBodyRig = new SMMetaHumanBodyRig();
}

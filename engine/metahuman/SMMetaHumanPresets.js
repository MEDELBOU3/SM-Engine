// engine/metahuman/SMMetaHumanPresets.js
class SMMetaHumanPresets {
  constructor(character) {
    this.character = character;
    this.presets = new Map();
  }

  register(name, data = {}) {
    this.presets.set(String(name), data);
    return true;
  }

  get(name) {
    return this.presets.get(String(name)) || null;
  }

  has(name) {
    return this.presets.has(String(name));
  }

  remove(name) {
    return this.presets.delete(String(name));
  }

  list() {
    return [...this.presets.keys()];
  }

  apply(name) {
    const preset = this.get(name);
    if (!preset || !this.character) return false;

    if (preset.face?.morphs) {
      this.character.morphs?.apply(preset.face.morphs);
    }

    if (preset.body) {
      Object.entries(preset.body).forEach(([key, value]) =>
        this.character.updateData(`body.${key}`, value)
      );
    }

    return true;
  }
}

window.SMMetaHumanPresets = SMMetaHumanPresets;

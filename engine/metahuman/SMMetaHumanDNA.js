// engine/metahuman/SMMetaHumanDNA.js
class SMMetaHumanDNA {
  constructor(options = {}) {
    this.url = options.url || "engine/assets/metahuman/Sample.dna";
    this.buffer = null;
    this.loaded = false;
  }

  async load(url = this.url) {
    this.url = url;

    try {
      const response = await fetch(this.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      this.buffer = await response.arrayBuffer();
      this.loaded = true;
      return this.buffer;
    } catch (error) {
      this.buffer = null;
      this.loaded = false;
      console.warn("[MetaHuman] DNA load failed:", error);
      return null;
    }
  }

  getBuffer() {
    return this.buffer;
  }

  isLoaded() {
    return this.loaded;
  }

  getByteLength() {
    return this.buffer?.byteLength || 0;
  }

  dispose() {
    this.buffer = null;
    this.loaded = false;
  }
}

window.SMMetaHumanDNA = SMMetaHumanDNA;

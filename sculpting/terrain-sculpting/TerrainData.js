// sculpting/terrain-sculpting/TerrainData.js

(() => {
  const NS = window.TerrainSculpting;

  if (!NS) {
    throw new Error("TerrainState.js must load before TerrainData.js");
  }

  class TerrainData {
    constructor(options = {}) {
      this.sectionSize = this._int(options.sectionSize, 63, 1);

      this.sectionsPerComponent = this._int(options.sectionsPerComponent, 1, 1);

      this.componentsX = this._int(options.componentsX, 4, 1);

      this.componentsZ = this._int(options.componentsZ, 4, 1);

      this.quadSize = this._num(options.quadSize, 1, 0.001);

      this.heightScale = this._num(options.heightScale, 1, 0.0001);

      this.quadsPerComponent = this.sectionSize * this.sectionsPerComponent;

      this.quadsX = this.quadsPerComponent * this.componentsX;

      this.quadsZ = this.quadsPerComponent * this.componentsZ;

      this.resolutionX = this.quadsX + 1;

      this.resolutionZ = this.quadsZ + 1;

      this.width = this.quadsX * this.quadSize;

      this.length = this.quadsZ * this.quadSize;

      this.heights = new Float32Array(this.resolutionX * this.resolutionZ);

      this.version = 0;
    }

    _num(value, fallback, min = -Infinity) {
      const n = Number(value);

      return Math.max(min, Number.isFinite(n) ? n : fallback);
    }

    _int(value, fallback, min = 0) {
      return Math.max(min, Math.floor(this._num(value, fallback, min)));
    }

    isValid(x, z) {
      return x >= 0 && z >= 0 && x < this.resolutionX && z < this.resolutionZ;
    }

    index(x, z) {
      return z * this.resolutionX + x;
    }

    coords(index) {
      return {
        x: index % this.resolutionX,

        z: Math.floor(index / this.resolutionX),
      };
    }

    getHeight(x, z) {
      if (!this.isValid(x, z)) {
        return 0;
      }

      return this.heights[this.index(x, z)];
    }

    setHeight(x, z, value) {
      if (!this.isValid(x, z)) {
        return false;
      }

      this.heights[this.index(x, z)] = Number.isFinite(value) ? value : 0;

      this.version++;

      return true;
    }

    getHeightByIndex(index) {
      return this.heights[index] ?? 0;
    }

    setHeightByIndex(index, value) {
      if (index < 0 || index >= this.heights.length) {
        return false;
      }

      this.heights[index] = Number.isFinite(value) ? value : 0;

      this.version++;

      return true;
    }

    localX(gridX) {
      return -this.width * 0.5 + gridX * this.quadSize;
    }

    localZ(gridZ) {
      return -this.length * 0.5 + gridZ * this.quadSize;
    }

    localToGrid(localX, localZ) {
      return {
        x: (localX + this.width * 0.5) / this.quadSize,

        z: (localZ + this.length * 0.5) / this.quadSize,
      };
    }

    clampGridX(x) {
      return Math.max(0, Math.min(this.resolutionX - 1, x));
    }

    clampGridZ(z) {
      return Math.max(0, Math.min(this.resolutionZ - 1, z));
    }

    fill(value = 0) {
      this.heights.fill(value);

      this.version++;
    }

    cloneHeights() {
      return new Float32Array(this.heights);
    }

    restoreHeights(snapshot) {
      if (
        !(snapshot instanceof Float32Array) ||
        snapshot.length !== this.heights.length
      ) {
        return false;
      }

      this.heights.set(snapshot);

      this.version++;

      return true;
    }

    getInfo() {
      return {
        sectionSize: this.sectionSize,

        sectionsPerComponent: this.sectionsPerComponent,

        componentsX: this.componentsX,

        componentsZ: this.componentsZ,

        quadsPerComponent: this.quadsPerComponent,

        resolutionX: this.resolutionX,

        resolutionZ: this.resolutionZ,

        width: this.width,

        length: this.length,

        vertexCount: this.heights.length,
      };
    }
  }

  NS.TerrainData = TerrainData;

  window.TerrainData = TerrainData;
})();

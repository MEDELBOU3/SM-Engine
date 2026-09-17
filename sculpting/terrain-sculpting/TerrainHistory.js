// sculpting/terrain-sculpting/TerrainHistory.js

(() => {
  const NS = window.TerrainSculpting;

  const history = {
    undoStack: [],

    redoStack: [],

    maxSteps: 30,

    capture(label = "Terrain Edit") {
      const landscape = NS.getLandscape?.();

      const data = landscape?.userData?.terrainData;

      if (!data) {
        return false;
      }

      this.undoStack.push({
        label,

        heights: data.cloneHeights(),
      });

      if (this.undoStack.length > this.maxSteps) {
        this.undoStack.shift();
      }

      this.redoStack.length = 0;

      return true;
    },

    undo() {
      const landscape = NS.getLandscape?.();

      const data = landscape?.userData?.terrainData;

      const manager = landscape?.userData?.componentManager;

      if (!data || !manager || this.undoStack.length === 0) {
        return false;
      }

      this.redoStack.push({
        heights: data.cloneHeights(),
      });

      const step = this.undoStack.pop();

      data.restoreHeights(step.heights);

      manager.syncAll();

      window.dispatchEvent(
        new CustomEvent("sm:terrain-changed", {
          detail: {
            landscape,
          },
        }),
      );

      return true;
    },

    redo() {
      const landscape = NS.getLandscape?.();

      const data = landscape?.userData?.terrainData;

      const manager = landscape?.userData?.componentManager;

      if (!data || !manager || this.redoStack.length === 0) {
        return false;
      }

      this.undoStack.push({
        heights: data.cloneHeights(),
      });

      const step = this.redoStack.pop();

      data.restoreHeights(step.heights);

      manager.syncAll();

      return true;
    },

    clear() {
      this.undoStack.length = 0;

      this.redoStack.length = 0;
    },
  };

  NS.history = history;

  window.TerrainHistory = history;
})();

// engine/ui/metahuman/metahuman-face-panel.js
class MetaHumanFacePanel {
  constructor(options = {}) {
    this.container = options.container || null;
    this.character = options.character || null;
  }

  mount() {
    if (!this.container) return false;
    this.render();
    return true;
  }

  render() {
    this.container.innerHTML = `
      <div class="sm-metahuman-face-panel">
        <strong>Face</strong>
        <div data-morphs></div>
      </div>
    `;

    const host = this.container.querySelector("[data-morphs]");
    const values = this.character?.morphs?.getValues?.() || {};
    const targets = this.character?.morphs?.targets || new Map();
    const names = [...new Set([...Object.keys(values), ...targets.keys()])];

    if (!names.length) {
      host.innerHTML = "<small>No registered face morph targets.</small>";
      return;
    }

    host.innerHTML = names.map(name => `
      <label>
        ${name}
        <input type="range" min="0" max="1" step="0.01"
               value="${values[name] ?? 0}" data-morph="${name}">
      </label>
    `).join("");

    host.querySelectorAll("[data-morph]").forEach(input => {
      input.addEventListener("input", event => {
        const name = event.currentTarget.dataset.morph;
        this.character?.setMorph(name, Number(event.currentTarget.value));
      });
    });
  }
}

window.MetaHumanFacePanel = MetaHumanFacePanel;
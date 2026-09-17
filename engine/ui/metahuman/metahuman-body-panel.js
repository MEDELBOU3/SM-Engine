// engine/ui/metahuman/metahuman-body-panel.js
class MetaHumanBodyPanel {
  constructor(options = {}) {
    this.container = options.container || null;
    this.character = options.character || null;
  }

  mount() {
    if (!this.container) return false;

    this.container.innerHTML = `
      <div class="sm-metahuman-body-panel">
        <strong>Body</strong>
        <label>Height
          <input type="range" min="0" max="1" step="0.01"
                 value="${this.character?.getData("body.height") ?? 0.5}"
                 data-body="height">
        </label>
        <label>Weight
          <input type="range" min="0" max="1" step="0.01"
                 value="${this.character?.getData("body.weight") ?? 0.5}"
                 data-body="weight">
        </label>
      </div>
    `;

    this.container.querySelectorAll("[data-body]").forEach(input => {
      input.addEventListener("input", event => {
        const key = event.currentTarget.dataset.body;
        const value = Number(event.currentTarget.value);
        this.character?.updateData(`body.${key}`, value);
      });
    });

    return true;
  }
}

window.MetaHumanBodyPanel = MetaHumanBodyPanel;

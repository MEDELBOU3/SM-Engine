// engine/ui/metahuman/metahuman-panel.js
class MetaHumanPanel {
  constructor(options = {}) {
    this.container = options.container || null;
    this.character = options.character ||
      window.smMetaHumanCharacter || null;
  }

  mount(container = this.container) {
    this.container = container;
    if (!this.container) return false;
    this.render();
    return true;
  }

  render() {
    const system = window.smMetaHumanSystem;
    this.character ||= window.smMetaHumanCharacter || null;

    this.container.innerHTML = `
      <div class="sm-metahuman-panel">
        <div class="sm-metahuman-camera-modes">
          <button data-mode="FULL_BODY">Full Body</button>
          <button data-mode="HEAD">Head</button>
          <button data-mode="FACE">Face</button>
          <button data-mode="EYES">Eyes</button>
          <button data-mode="HAIR">Hair</button>
          <button data-mode="CLOTHING">Clothing</button>
        </div>
        <div data-body></div>
        <div data-face></div>
      </div>
    `;

    this.container.querySelectorAll("[data-mode]").forEach(button => {
      button.addEventListener("click", () =>
        window.smMetaHumanSystem?.setCameraMode(button.dataset.mode)
      );
    });

    const body = this.container.querySelector("[data-body]");
    const face = this.container.querySelector("[data-face]");

    if (body && window.MetaHumanBodyPanel) {
      new window.MetaHumanBodyPanel({
        container: body,
        character: this.character
      }).mount();
    }

    if (face && window.MetaHumanFacePanel) {
      new window.MetaHumanFacePanel({
        container: face,
        character: this.character
      }).mount();
    }

    if (system && !system.initialized) {
      system.initialize().then(() => {
        this.character = system.character;
        this.render();
      });
    }
  }

  destroy() {
    this.container?.replaceChildren();
  }
}

window.MetaHumanPanel = MetaHumanPanel;
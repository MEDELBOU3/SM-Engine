// runtime/loadGame.js
import { createMeshFromData } from "./meshFactory.js"; // example

export function loadGame(engine, data) {

  // Camera
  if (data.camera?.position) {
    engine.camera.position.fromArray(data.camera.position);
  }

  //Objects
  data.objects?.forEach(obj => {
    const mesh = createMeshFromData(obj);
    if (mesh) engine.scene.add(mesh);
  });

  // Animations
  data.animations?.forEach(anim => {
    engine.animator?.load(anim);
  });
}

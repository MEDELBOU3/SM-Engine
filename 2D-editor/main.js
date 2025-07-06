
let is2DMode = false;
let canvas2D = null;
let ctx2D = null;

let brushColor = '#ffffff';
let drawing = false;
let strokes = [];  // Array to keep stroke paths for undo
let currentStroke = [];


function clearCanvas() {
    ctx2D.fillStyle = "#2c3e50";  // Same as background color
    ctx2D.fillRect(0, 0, canvas2D.width, canvas2D.height);
}

document.getElementById('toggle-2d-mode').addEventListener('click', () => {
    is2DMode = true;

    // 1. Hide 3D tools and controls
    document.getElementById('3D-Controls').style.display = 'none';


    // 3. Remove the Three.js canvas
    const rendererContainer = document.getElementById('renderer-container');
    rendererContainer.innerHTML = ''; // Clear WebGL canvas

    // 4. Add the 2D canvas
    canvas2D = document.createElement('canvas');
    canvas2D.id = 'canvas-2d';
    canvas2D.style.width = '100%';
    canvas2D.style.height = '100%';
    canvas2D.width = rendererContainer.clientWidth;
    canvas2D.height = rendererContainer.clientHeight;
    rendererContainer.appendChild(canvas2D);

    // 5. Setup 2D context
    ctx2D = canvas2D.getContext('2d');
    ctx2D.fillStyle = "#ffffff";
    ctx2D.fillRect(0, 0, canvas2D.width, canvas2D.height);

    // Optional: Init basic draw interaction
    init2DDrawing(canvas2D, ctx2D);
});

document.getElementById('toggle-3d-mode').addEventListener('click', () => {
    is2DMode = false;

    // 1. Show 3D controls
    document.getElementById('3D-Controls').style.display = 'flex';

    // 2. Hide 2D controls
    document.getElementById('2D-Controls').style.display = 'none';

    // 3. Clear 2D canvas
    const rendererContainer = document.getElementById('renderer-container');
    rendererContainer.innerHTML = '';

    // 4. Re-add the Three.js renderer
    renderer.setSize(window.innerWidth, window.innerHeight);
    rendererContainer.appendChild(renderer.domElement);

    // Optionally re-render
    animate();
});

function init2DDrawing(canvas, ctx) {
    clearCanvas();

    canvas.onmousedown = (e) => {
        drawing = true;
        currentStroke = [{x: e.offsetX, y: e.offsetY}];
        ctx.beginPath();
        ctx.moveTo(e.offsetX, e.offsetY);
    };

    canvas.onmousemove = (e) => {
        if (!drawing) return;
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.strokeStyle = brushColor;
        ctx.lineWidth = brushSize;
        ctx.lineCap = "round";
        ctx.stroke();
        currentStroke.push({x: e.offsetX, y: e.offsetY});
    };

    canvas.onmouseup = () => {
        if (!drawing) return;
        drawing = false;
        strokes.push({color: brushColor, size: brushSize, points: currentStroke});
    };

    canvas.onmouseleave = () => {
        if (drawing) {
            drawing = false;
            strokes.push({color: brushColor, size: brushSize, points: currentStroke});
        }
    };

    // Controls event listeners
    document.getElementById('brushColor').addEventListener('input', (e) => {
        brushColor = e.target.value;
    });

    document.getElementById('brushSize').addEventListener('input', (e) => {
        brushSize = e.target.value;
    });

    document.getElementById('clearCanvasBtn').addEventListener('click', () => {
        strokes = [];
        clearCanvas();
    });

    document.getElementById('undoBtn').addEventListener('click', () => {
        strokes.pop();
        redrawStrokes();
    });
}

function redrawStrokes() {
    clearCanvas();
    for (const stroke of strokes) {
        ctx2D.strokeStyle = stroke.color;
        ctx2D.lineWidth = stroke.size;
        ctx2D.lineCap = "round";
        ctx2D.beginPath();
        const pts = stroke.points;
        ctx2D.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            ctx2D.lineTo(pts[i].x, pts[i].y);
        }
        ctx2D.stroke();
    }
}


const btn2D = document.getElementById('toggle-2d-mode');
const btn3D = document.getElementById('toggle-3d-mode');
const controls2D = document.getElementById('2D-Controls');
const controls3D = document.getElementById('3D-Controls');
const rendererContainerCTN = document.getElementById('renderer-container');

let currentMode = '3D';  // start in 3D mode

btn2D.addEventListener('click', () => {
  if (currentMode === '2D') return; // already in 2D

  currentMode = '2D';

  // Show 2D controls, hide 3D controls
  controls2D.style.display = 'block';
  controls3D.style.display = 'none';

  // Clear existing renderer
  rendererContainerCTN.innerHTML = '';

  // Create 2D canvas
  const canvas2D = document.createElement('canvas');
  canvas2D.id = 'canvas-2d';
  canvas2D.width = rendererContainerCTN.clientWidth;
  canvas2D.height = rendererContainerCTN.clientHeight;
  rendererContainerCTN.appendChild(canvas2D);

  // Init 2D context and drawing here
  const ctx2D = canvas2D.getContext('2d');
  
  // Fill background color
  ctx2D.fillStyle = '#2c3e50';
  ctx2D.fillRect(0, 0, canvas2D.width, canvas2D.height);

  // Call your 2D drawing init function here, pass canvas and ctx2D
  init2DDrawing(canvas2D, ctx2D);
});

btn3D.addEventListener('click', () => {
  if (currentMode === '3D') return; // already in 3D

  currentMode = '3D';

  // Show 3D controls, hide 2D controls
  controls3D.style.display = 'block';
  controls2D.style.display = 'none';

  // Clear renderer container (remove 2D canvas)
  rendererContainer.innerHTML = '';

  // Recreate your Three.js renderer and append its canvas
  renderer.setSize(rendererContainerCTN.clientWidth, rendererContainerCTN.clientHeight);
  rendererContainerCTN.appendChild(renderer.domElement);

  // Start or resume 3D animation loop if needed
  animate();
});



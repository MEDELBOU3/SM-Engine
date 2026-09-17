let currentWindowPreset = null;

function applyWindowPreset(preset) {
    currentWindowPreset = preset;
    console.log("Window preset selected:", preset);

    const doorWidthInput = document.getElementById('windowWidthInput');
    const doorHeightInput = document.getElementById('windowHeightInput');
    const doorDepthInput = document.getElementById('windowDepthInput');
    const sillHeightInput = document.getElementById('windowSillHeightInput');

    if (doorWidthInput) doorWidthInput.value = preset.width;
    if (doorHeightInput) doorHeightInput.value = preset.height;
    if (doorDepthInput) doorDepthInput.value = preset.depth;
    if (sillHeightInput) sillHeightInput.value = preset.sill;

    alert(`Preset selected: ${preset.width}x${preset.height}. Activate Window tool to place.`);
    document.getElementById('window-presets-panel').style.display = 'none';
}

/*function initSettingsPanel(ground, obstaclesGroup) {
  const panel = document.getElementById("settingsPanel");
  const toggleBtn = document.getElementById("settingsToggle"); // main toggle
  const settingsBtn = document.getElementById("settingsBtn"); // optional extra btn

  // --- Panel toggle ---
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      panel.classList.toggle("hidden");
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      panel.classList.toggle("show");
    });
  }

  // --- Dropdown open/close ---
  document.querySelectorAll(".dropdown-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const content = btn.nextElementSibling;
      content.style.display = (content.style.display === "block") ? "none" : "block";
    });
  });

  // --- Floor controls ---
  const floorColorInput = document.getElementById("floorColor");
  if (floorColorInput) {
    floorColorInput.addEventListener("input", (e) => {
      const color = new THREE.Color(e.target.value);
      ground.material.color.copy(color);
      ground.material.needsUpdate = true;
    });
  }

  const floorSizeInput = document.getElementById("floorSize");
  if (floorSizeInput) {
    floorSizeInput.addEventListener("change", (e) => {
      const newSize = parseInt(e.target.value);
      if (!isNaN(newSize) && newSize > 0) {
        ground.geometry.dispose();
        ground.geometry = new THREE.PlaneGeometry(newSize, newSize);
      }
    });
  }

  // --- Obstacle controls ---
  const wallColorInput = document.getElementById("wallColor");
  if (wallColorInput) {
    wallColorInput.addEventListener("input", (e) => {
      const color = new THREE.Color(e.target.value);
      obstaclesGroup.children.forEach(mesh => {
        if (mesh.name.includes("Wall")) {
          mesh.material.color.copy(color);
          mesh.material.needsUpdate = true;
        }
      });
    });
  }

  const boxScaleInput = document.getElementById("boxScale");
  if (boxScaleInput) {
    boxScaleInput.addEventListener("input", (e) => {
      const scale = parseFloat(e.target.value);
      obstaclesGroup.children.forEach(mesh => {
        if (mesh.name.includes("ClimbBox")) {
          mesh.scale.set(scale, scale, scale);
        }
      });
    });
  }

  const platformSizeInput = document.getElementById("platformSize");
  if (platformSizeInput) {
    platformSizeInput.addEventListener("input", (e) => {
      const size = parseFloat(e.target.value);
      obstaclesGroup.children.forEach(mesh => {
        if (mesh.name.includes("Platform")) {
          mesh.scale.set(size / 4, 1, size / 4); // Keep proportions
        }
      });
    });
  }

  console.log("✅ Settings panel initialized with live controls.");
}*/

function initAdvancedColorPicker(ground, obstaclesGroup) {
    // Store recent colors (up to 5 per picker)
    const recentColors = {
        floorColor: [],
        wallColor: []
    };

    // Convert HEX to RGB
    function hexToRgb(hex) {
        hex = hex.replace("#", "");
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return { r, g, b };
    }

    // Convert RGB to HEX
    function rgbToHex(r, g, b) {
        return "#" + [r, g, b]
            .map(x => Math.round(x).toString(16).padStart(2, "0"))
            .join("");
    }

    // Convert RGB to HSL
    function rgbToHsl(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0; // achromatic
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return {
            h: Math.round(h * 360),
            s: Math.round(s * 100),
            l: Math.round(l * 100)
        };
    }

    // Convert HSL to RGB
    function hslToRgb(h, s, l) {
        h /= 360;
        s /= 100;
        l /= 100;
        let r, g, b;
        if (s === 0) {
            r = g = b = l; // achromatic
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }

    // Create color picker HTML structure
    function createColorPicker(pickerElement) {
        const target = pickerElement.dataset.target;
        const initialColor = pickerElement.dataset.initialColor || "#ffffff";
        const rgb = hexToRgb(initialColor);
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

        pickerElement.innerHTML = `
            <div class="color-picker-preview" style="background: ${initialColor};"></div>
            <div class="color-picker-sliders">
                <label>Red <input type="range" class="rgb-slider" data-type="r" min="0" max="255" value="${rgb.r}"></label>
                <label>Green <input type="range" class="rgb-slider" data-type="g" min="0" max="255" value="${rgb.g}"></label>
                <label>Blue <input type="range" class="rgb-slider" data-type="b" min="0" max="255" value="${rgb.b}"></label>
                <label>Hue <input type="range" class="hsl-slider" data-type="h" min="0" max="360" value="${hsl.h}"></label>
                <label>Saturation <input type="range" class="hsl-slider" data-type="s" min="0" max="100" value="${hsl.s}"></label>
                <label>Lightness <input type="range" class="hsl-slider" data-type="l" min="0" max="100" value="${hsl.l}"></label>
            </div>
            <div class="color-picker-hex">
                <label>HEX <input type="text" class="hex-input" value="${initialColor}"></label>
            </div>
            <div class="color-picker-recent"></div>
        `;

        return { target, rgb, hsl };
    }

    // Update Three.js material
    function updateMaterial(target, color) {
        if (target === "floorColor") {
            ground.material.color.set(color);
            ground.material.needsUpdate = true;
        } else if (target === "wallColor") {
            obstaclesGroup.children.forEach(mesh => {
                if (mesh.name.includes("Wall")) {
                    mesh.material.color.set(color);
                    mesh.material.needsUpdate = true;
                }
            });
        }
    }

    // Update recent colors
    function updateRecentColors(pickerElement, color) {
        const target = pickerElement.dataset.target;
        const recentContainer = pickerElement.querySelector(".color-picker-recent");
        if (!recentColors[target].includes(color)) {
            recentColors[target].unshift(color);
            if (recentColors[target].length > 5) recentColors[target].pop();
        }
        recentContainer.innerHTML = recentColors[target]
            .map(c => `<div style="background: ${c};" data-color="${c}"></div>`)
            .join("");
    }

    // Initialize all color pickers
    document.querySelectorAll(".advanced-color-picker").forEach(pickerElement => {
        const { target, rgb, hsl } = createColorPicker(pickerElement);
        updateRecentColors(pickerElement, rgbToHex(rgb.r, rgb.g, rgb.b));

        // Update preview and material
        const updatePreviewAndMaterial = (r, g, b) => {
            const hex = rgbToHex(r, g, b);
            pickerElement.querySelector(".color-picker-preview").style.background = hex;
            pickerElement.querySelector(".hex-input").value = hex;
            updateMaterial(target, hex);
            updateRecentColors(pickerElement, hex);
        };

        // RGB sliders
        pickerElement.querySelectorAll(".rgb-slider").forEach(slider => {
            slider.addEventListener("input", () => {
                rgb[slider.dataset.type] = parseInt(slider.value);
                const hslNew = rgbToHsl(rgb.r, rgb.g, rgb.b);
                hsl.h = hslNew.h;
                hsl.s = hslNew.s;
                hsl.l = hslNew.l;
                pickerElement.querySelector(".hsl-slider[data-type='h']").value = hsl.h;
                pickerElement.querySelector(".hsl-slider[data-type='s']").value = hsl.s;
                pickerElement.querySelector(".hsl-slider[data-type='l']").value = hsl.l;
                updatePreviewAndMaterial(rgb.r, rgb.g, rgb.b);
            });
        });

        // HSL sliders
        pickerElement.querySelectorAll(".hsl-slider").forEach(slider => {
            slider.addEventListener("input", () => {
                hsl[slider.dataset.type] = parseInt(slider.value);
                const rgbNew = hslToRgb(hsl.h, hsl.s, hsl.l);
                rgb.r = rgbNew.r;
                rgb.g = rgbNew.g;
                rgb.b = rgbNew.b;
                pickerElement.querySelector(".rgb-slider[data-type='r']").value = rgb.r;
                pickerElement.querySelector(".rgb-slider[data-type='g']").value = rgb.g;
                pickerElement.querySelector(".rgb-slider[data-type='b']").value = rgb.b;
                updatePreviewAndMaterial(rgb.r, rgb.g, rgb.b);
            });
        });

        // HEX input
        pickerElement.querySelector(".hex-input").addEventListener("input", (e) => {
            let hex = e.target.value;
            if (!hex.startsWith("#")) hex = "#" + hex;
            if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                const newRgb = hexToRgb(hex);
                rgb.r = newRgb.r;
                rgb.g = newRgb.g;
                rgb.b = newRgb.b;
                const hslNew = rgbToHsl(rgb.r, rgb.g, rgb.b);
                hsl.h = hslNew.h;
                hsl.s = hslNew.s;
                hsl.l = hslNew.l;
                pickerElement.querySelector(".rgb-slider[data-type='r']").value = rgb.r;
                pickerElement.querySelector(".rgb-slider[data-type='g']").value = rgb.g;
                pickerElement.querySelector(".rgb-slider[data-type='b']").value = rgb.b;
                pickerElement.querySelector(".hsl-slider[data-type='h']").value = hsl.h;
                pickerElement.querySelector(".hsl-slider[data-type='s']").value = hsl.s;
                pickerElement.querySelector(".hsl-slider[data-type='l']").value = hsl.l;
                updatePreviewAndMaterial(rgb.r, rgb.g, rgb.b);
            }
        });

        // Recent colors
        pickerElement.querySelector(".color-picker-recent").addEventListener("click", (e) => {
            const color = e.target.dataset.color;
            if (color) {
                const newRgb = hexToRgb(color);
                rgb.r = newRgb.r;
                rgb.g = newRgb.g;
                rgb.b = newRgb.b;
                const hslNew = rgbToHsl(rgb.r, rgb.g, rgb.b);
                hsl.h = hslNew.h;
                hsl.s = hslNew.s;
                hsl.l = hslNew.l;
                pickerElement.querySelector(".rgb-slider[data-type='r']").value = rgb.r;
                pickerElement.querySelector(".rgb-slider[data-type='g']").value = rgb.g;
                pickerElement.querySelector(".rgb-slider[data-type='b']").value = rgb.b;
                pickerElement.querySelector(".hsl-slider[data-type='h']").value = hsl.h;
                pickerElement.querySelector(".hsl-slider[data-type='s']").value = hsl.s;
                pickerElement.querySelector(".hsl-slider[data-type='l']").value = hsl.l;
                updatePreviewAndMaterial(rgb.r, rgb.g, rgb.b);
            }
        });
    });
}

// Updated initSettingsPanel to include advanced color picker
function initSettingsPanel(ground, obstaclesGroup) {
    const panel = document.getElementById("settingsPanel");
    const toggleBtn = document.getElementById("settingsToggle");

    // Initialize advanced color pickers
    initAdvancedColorPicker(ground, obstaclesGroup);

    // Panel toggle
    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            panel.classList.toggle("visible");
            panel.classList.toggle("hidden");

            if (panel.classList.contains("visible")) {
                const buttonRect = toggleBtn.getBoundingClientRect();
                const panelRect = panel.getBoundingClientRect();
                const viewportWidth = window.innerWidth;

                if (buttonRect.left + panelRect.width > viewportWidth) {
                    panel.style.left = `-${panelRect.width - buttonRect.width}px`;
                } else {
                    panel.style.left = "0";
                }
            }
        });

        document.addEventListener("click", (e) => {
            if (!panel.contains(e.target) && !toggleBtn.contains(e.target)) {
                panel.classList.remove("visible");
                panel.classList.add("hidden");
            }
        });
    }

    // Dropdown open/close
    document.querySelectorAll(".dropdown-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const content = btn.nextElementSibling;
            const isExpanded = content.classList.toggle("show");
            btn.setAttribute("aria-expanded", isExpanded);
            content.style.display = isExpanded ? "block" : "none";
        });
    });

    // Floor size control
    const floorSizeInput = document.getElementById("floorSize");
    if (floorSizeInput) {
        floorSizeInput.addEventListener("change", (e) => {
            const newSize = parseInt(e.target.value);
            if (!isNaN(newSize) && newSize > 0) {
                ground.geometry.dispose();
                ground.geometry = new THREE.PlaneGeometry(newSize, newSize);
            }
        });
    }

    // Obstacle controls
    const boxScaleInput = document.getElementById("boxScale");
    if (boxScaleInput) {
        boxScaleInput.addEventListener("input", (e) => {
            const scale = parseFloat(e.target.value);
            obstaclesGroup.children.forEach(mesh => {
                if (mesh.name.includes("ClimbBox")) {
                    mesh.scale.set(scale, scale, scale);
                }
            });
        });
    }

    const platformSizeInput = document.getElementById("platformSize");
    if (platformSizeInput) {
        platformSizeInput.addEventListener("input", (e) => {
            const size = parseFloat(e.target.value);
            obstaclesGroup.children.forEach(mesh => {
                if (mesh.name.includes("Platform")) {
                    mesh.scale.set(size / 4, 1, size / 4);
                }
            });
        });
    }

    console.log("✅ Settings panel initialized with advanced color pickers.");
}

  document.addEventListener('DOMContentLoaded', function() {
            const searchInput = document.getElementById('search-input');
            const searchResultsBar = document.getElementById('search-results-bar');
            
            // Define searchable content with their container IDs and display names
            const searchableContent = [
                { id: 'transformContainer', name: 'Transform', keywords: ['position', 'rotation', 'scale', 'transform', 'pos', 'rot', 'scl'] },
                { id: 'physics-controls', name: 'Physics', keywords: ['physics', 'mass', 'friction', 'bounce', 'simulation', 'atom'] },
                { id: 'material-editor', name: 'Material Editor', keywords: ['material', 'color', 'metalness', 'roughness', 'shader', 'texture'] }
            ];
            
            // Function to perform search
            function performSearch(searchTerm) {
                searchTerm = searchTerm.toLowerCase().trim();
                
                // Clear previous results
                searchResultsBar.innerHTML = '';
                
                if (searchTerm === '') {
                    searchResultsBar.style.display = 'none';
                    return;
                }
                
                // Filter matching content
                const matches = searchableContent.filter(item => {
                    return item.name.toLowerCase().includes(searchTerm) || 
                           item.keywords.some(keyword => keyword.includes(searchTerm));
                });
                
                if (matches.length > 0) {
                    // Display results
                    searchResultsBar.style.display = 'block';
                    
                    matches.forEach(match => {
                        const resultItem = document.createElement('div');
                        resultItem.className = 'search-result-item';
                        resultItem.textContent = match.name;
                        resultItem.addEventListener('click', () => {
                            // Scroll to the matching section
                            const element = document.getElementById(match.id);
                            if (element) {
                                element.scrollIntoView({ behavior: 'smooth' });
                                element.classList.add('highlight');
                                setTimeout(() => {
                                    element.classList.remove('highlight');
                                }, 2000);
                            }
                            
                            // Clear search
                            searchInput.value = '';
                            searchResultsBar.style.display = 'none';
                        });
                        
                        searchResultsBar.appendChild(resultItem);
                    });
                } else {
                    searchResultsBar.style.display = 'block';
                    searchResultsBar.innerHTML = '<div class="search-result-item">No results found</div>';
                }
            }
            
            // Add event listener for search input
            searchInput.addEventListener('input', function() {
                performSearch(this.value);
            });
            
            // Close search results when clicking outside
            document.addEventListener('click', function(event) {
                if (!searchInput.contains(event.target) && !searchResultsBar.contains(event.target)) {
                    searchResultsBar.style.display = 'none';
                }
            });
            
            // Keep search results visible when clicking inside the search bar
            searchInput.addEventListener('click', function(event) {
                if (this.value.trim() !== '') {
                    performSearch(this.value);
                }
                event.stopPropagation();
            });
        });
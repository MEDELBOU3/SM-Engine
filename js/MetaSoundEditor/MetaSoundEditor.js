const SoundGraph = (function() {
    // --- System State ---
    let audioCtx = null;
    let isPlaying = false;
    let nodes = [];       // UI Node Data
    let connections = []; // UI Connection Data
    
    // Audio Engine Map (Maps UI Node ID -> Active WebAudio Node)
    let audioNodeMap = new Map(); 
    let activeSourceNodes = []; // Keep track to stop them later
    
    let soundAssets = {}; // { "kick.mp3": AudioBuffer }
    
    // --- Interaction State ---
    let draggedNode = null;
    let activeWire = null;
    let selectedNodeId = null;
    let dragOffset = { x: 0, y: 0 };
    
    // --- DOM Cache ---
    const canvas = document.getElementById('ms-canvas-container');
    const nodesArea = document.getElementById('ms-nodes-area');
    const svgLayer = document.getElementById('ms-connections');
    const propPanel = document.getElementById('ms-properties');
    const ctxMenu = document.getElementById('ms-context-menu');
    const statusLabel = document.getElementById('ms-status');

    // ==========================================
    // 1. CORE AUDIO ENGINE
    // ==========================================
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            setupVisualizer();
        }
    }

    // The Master Compiler: Turns UI Nodes into Hearing Sound
    function buildAndPlayGraph() {
        initAudio();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        // Stop any existing sounds
        stopPlayback();
        
        audioNodeMap.clear();
        activeSourceNodes = [];

        // 1. Instantiate Audio Nodes for all UI Nodes
        nodes.forEach(uiNode => {
            const audioObj = createWebAudioInstance(uiNode.type, uiNode.data);
            if (audioObj) {
                audioNodeMap.set(uiNode.id, audioObj);
            }
        });

        // 2. Connect them based on UI wires
        connections.forEach(conn => {
            const sourceObj = audioNodeMap.get(conn.from);
            const destObj = audioNodeMap.get(conn.to);

            if (sourceObj && destObj) {
                // Determine output point (usually the main node, but could be specific)
                let output = sourceObj.output || sourceObj.node;
                
                // Determine input point (Handling specific params like Frequency)
                let input = destObj.input || destObj.node;

                // Special Case: Modulating Frequency with another node
                if (conn.toSocket.includes('freq') && destObj.node.frequency) {
                    input = destObj.node.frequency;
                }
                // Special Case: Modulating Gain
                if (conn.toSocket.includes('gain') && destObj.node.gain) {
                    input = destObj.node.gain;
                }

                try {
                    output.connect(input);
                } catch (e) { console.warn("Connection Error:", e); }
            }
            
            // Highlight Wire
            conn.svg.classList.add('active-audio');
        });

        // 3. Connect Output Node to Speakers
        const outputNode = audioNodeMap.get('ms-node-output');
        if (outputNode) {
            outputNode.node.connect(audioCtx.destination);
            outputNode.node.connect(masterAnalyser); // For Visualizer
        }

        // 4. Start all Source Nodes (Oscillators, Players)
        activeSourceNodes.forEach(source => {
            try { source.start(audioCtx.currentTime); } 
            catch(e) { console.log(e); }
        });

        isPlaying = true;
        statusLabel.innerText = "PLAYING";
        statusLabel.style.color = "#2ecc71";
        document.getElementById('sound-graph-wrapper').classList.add('playing-state');
    }

    function stopPlayback() {
        activeSourceNodes.forEach(n => {
            try { n.stop(); } catch(e){}
        });
        activeSourceNodes = [];
        isPlaying = false;
        
        statusLabel.innerText = "STOPPED";
        statusLabel.style.color = "#555";
        document.getElementById('sound-graph-wrapper').classList.remove('playing-state');
        
        // Reset wires look
        document.querySelectorAll('.ms-connection-line').forEach(l => l.classList.remove('active-audio'));
    }

    function createWebAudioInstance(type, data) {
        // This function runs EVERY time we hit Play
        const obj = {};
        
        switch (type) {
            case 'oscillator':
                obj.node = audioCtx.createOscillator();
                obj.node.type = data.type || 'sine';
                obj.node.frequency.value = data.frequency || 440;
                obj.output = obj.node;
                activeSourceNodes.push(obj.node);
                break;
                
            case 'wavePlayer':
                obj.node = audioCtx.createBufferSource();
                if (data.assetName && soundAssets[data.assetName]) {
                    obj.node.buffer = soundAssets[data.assetName];
                    obj.node.loop = data.loop || false;
                }
                obj.output = obj.node;
                activeSourceNodes.push(obj.node);
                break;
                
            case 'gain':
                obj.node = audioCtx.createGain();
                obj.node.gain.value = (data.gain !== undefined) ? data.gain : 1.0;
                obj.input = obj.node;
                obj.output = obj.node;
                break;
                
            case 'delay':
                obj.node = audioCtx.createDelay(5.0);
                obj.node.delayTime.value = data.delayTime || 0.5;
                obj.input = obj.node;
                obj.output = obj.node;
                break;

            case 'filter':
                obj.node = audioCtx.createBiquadFilter();
                obj.node.type = 'lowpass';
                obj.node.frequency.value = data.frequency || 1000;
                obj.input = obj.node;
                obj.output = obj.node;
                break;
                
            case 'output':
                obj.node = audioCtx.createGain(); // Master Gain
                obj.input = obj.node;
                break;
        }
        return obj;
    }

    // ==========================================
    // 2. UI MANAGEMENT
    // ==========================================
    
    function addNode(type) {
        const id = 'ms_node_' + Date.now();
        const defaultData = {
            frequency: 440,
            gain: 1.0,
            type: 'sine',
            delayTime: 0.3,
            loop: true
        };
        
        // Create Data Object
        const nodeObj = { id, type, x: 150, y: 150, data: defaultData };
        nodes.push(nodeObj);
        
        renderNodeHTML(nodeObj);
    }

    function renderNodeHTML(node) {
        const el = document.createElement('div');
        el.className = 'ms-node';
        el.id = node.id;
        el.style.left = node.x + 'px';
        el.style.top = node.y + 'px';
        
        let body = '';
        let color = '#444';

        // Professional Node Templates
        if(node.type === 'oscillator') {
            color = 'linear-gradient(90deg, #2980b9, #1c5980)';
            body = `
                <div class="row">Freq <div class="ms-socket-input" data-id="${node.id}-freq"></div></div>
                <div class="row" style="text-align:right">Audio Out <div class="ms-socket-output" data-id="${node.id}-out"></div></div>
            `;
        } else if (node.type === 'wavePlayer') {
            color = 'linear-gradient(90deg, #d35400, #a04000)';
            body = `
                <div class="row" style="text-align:right">Audio Out <div class="ms-socket-output" data-id="${node.id}-out"></div></div>
                <div style="font-size:9px; color:#aaa; margin-top:5px;">Select Sound in Details</div>
            `;
        } else if (node.type === 'gain') {
            color = 'linear-gradient(90deg, #27ae60, #1e8449)';
            body = `
                <div class="row"><div class="ms-socket-input" data-id="${node.id}-in"></div> In</div>
                <div class="row"><div class="ms-socket-input" data-id="${node.id}-gain"></div> Gain Mod</div>
                <div class="row" style="text-align:right">Out <div class="ms-socket-output" data-id="${node.id}-out"></div></div>
            `;
        } else if (node.type === 'delay') {
            color = 'linear-gradient(90deg, #8e44ad, #6c3483)';
            body = `
                <div class="row"><div class="ms-socket-input" data-id="${node.id}-in"></div> In</div>
                <div class="row" style="text-align:right">Out <div class="ms-socket-output" data-id="${node.id}-out"></div></div>
            `;
        }

        el.innerHTML = `
            <div class="ms-node-header" style="background:${color}">
                ${node.type}
            </div>
            <div class="ms-node-body">${body}</div>
        `;

        // Event Listeners
        el.addEventListener('mousedown', (e) => startDragNode(e, el));
        el.addEventListener('contextmenu', (e) => showContextMenu(e, node.id));
        el.addEventListener('click', () => selectNode(node));

        // Socket Listeners
        el.querySelectorAll('.ms-socket-output').forEach(s => 
            s.addEventListener('mousedown', (e) => startWire(e, node.id, s.dataset.id))
        );
        el.querySelectorAll('.ms-socket-input').forEach(s => 
            s.addEventListener('mouseup', (e) => completeWire(e, node.id, s.dataset.id))
        );

        nodesArea.appendChild(el);
    }

    // --- Wire / Connection Logic ---
    function startWire(e, nodeId, socketId) {
        e.stopPropagation();
        const rect = canvas.getBoundingClientRect();
        activeWire = { 
            startNode: nodeId, 
            startSocket: socketId, 
            line: document.createElementNS("http://www.w3.org/2000/svg", "path") 
        };
        activeWire.line.classList.add('ms-connection-line');
        svgLayer.appendChild(activeWire.line);
        
        document.addEventListener('mousemove', dragWire);
        document.addEventListener('mouseup', stopWire);
    }

    function dragWire(e) {
        if(!activeWire) return;
        const rect = canvas.getBoundingClientRect();
        
        // Find Start Position
        const startEl = document.querySelector(`[data-id="${activeWire.startSocket}"]`);
        if(!startEl) return;
        const r1 = startEl.getBoundingClientRect();
        const x1 = r1.left + r1.width/2 - rect.left;
        const y1 = r1.top + r1.height/2 - rect.top;
        
        // Mouse Position
        const x2 = e.clientX - rect.left;
        const y2 = e.clientY - rect.top;

        // Draw Bezier
        updateBezier(activeWire.line, x1, y1, x2, y2);
    }

    function completeWire(e, nodeId, socketId) {
        if(!activeWire) return;
        e.stopPropagation();

        // Prevent self connection
        if(activeWire.startNode === nodeId) { stopWire(); return; }

        connections.push({
            from: activeWire.startNode,
            fromSocket: activeWire.startSocket,
            to: nodeId,
            toSocket: socketId,
            svg: activeWire.line
        });

        activeWire = null;
        document.removeEventListener('mousemove', dragWire);
        document.removeEventListener('mouseup', stopWire);
        
        // If playing, restart graph to apply new connections
        if(isPlaying) buildAndPlayGraph();
    }

    function stopWire() {
        if(activeWire) {
            activeWire.line.remove();
            activeWire = null;
        }
        document.removeEventListener('mousemove', dragWire);
        document.removeEventListener('mouseup', stopWire);
    }

    function updateBezier(path, x1, y1, x2, y2) {
        // Professional "Hanging Cable" Logic
        const cp1x = x1 + Math.abs(x2 - x1) * 0.5;
        const cp1y = y1;
        const cp2x = x2 - Math.abs(x2 - x1) * 0.5;
        const cp2y = y2;
        path.setAttribute("d", `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`);
    }

    function redrawConnections() {
        const rect = canvas.getBoundingClientRect();
        connections.forEach(conn => {
            const s1 = document.querySelector(`[data-id="${conn.fromSocket}"]`);
            const s2 = document.querySelector(`[data-id="${conn.toSocket}"]`);
            if(s1 && s2) {
                const r1 = s1.getBoundingClientRect();
                const r2 = s2.getBoundingClientRect();
                
                // If container is hidden, these might be 0, so check:
                if (r1.width > 0 && r2.width > 0) {
                    const x1 = r1.left + r1.width/2 - rect.left;
                    const y1 = r1.top + r1.height/2 - rect.top;
                    const x2 = r2.left + r2.width/2 - rect.left;
                    const y2 = r2.top + r2.height/2 - rect.top;
                    updateBezier(conn.svg, x1, y1, x2, y2);
                }
            }
        });
    }

    // --- Dragging Nodes ---
    function startDragNode(e, el) {
        if(e.target.classList.contains('ms-socket-input') || e.target.classList.contains('ms-socket-output')) return;
        draggedNode = el;
        const rect = el.getBoundingClientRect();
        dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        document.addEventListener('mousemove', moveNode);
        document.addEventListener('mouseup', endDragNode);
        selectNode(nodes.find(n => n.id === el.id));
    }

    function moveNode(e) {
        if(!draggedNode) return;
        const containerRect = canvas.getBoundingClientRect();
        const x = e.clientX - containerRect.left - dragOffset.x;
        const y = e.clientY - containerRect.top - dragOffset.y;
        
        draggedNode.style.left = x + 'px';
        draggedNode.style.top = y + 'px';
        
        // Update Data
        const n = nodes.find(n => n.id === draggedNode.id);
        if(n) { n.x = x; n.y = y; }
        
        redrawConnections();
    }

    function endDragNode() {
        draggedNode = null;
        document.removeEventListener('mousemove', moveNode);
        document.removeEventListener('mouseup', endDragNode);
    }

    // --- Properties Panel ---
    function selectNode(node) {
        selectedNodeId = node.id;
        document.querySelectorAll('.ms-node').forEach(n => n.classList.remove('selected'));
        document.getElementById(node.id).classList.add('selected');
        
        let html = `<h5>${node.type} Properties</h5>`;
        
        // Dynamic Form Generation based on Node Type
        if(node.type === 'oscillator') {
            html += generateInput('Freq', 'number', node.data.frequency, 'updateData', 'frequency');
            html += generateInput('Type', 'select', node.data.type, 'updateData', 'type', ['sine','square','sawtooth','triangle']);
        }
        else if(node.type === 'gain') {
            html += generateInput('Gain (0-2)', 'range', node.data.gain, 'updateData', 'gain', null, 0, 2, 0.1);
        }
        else if(node.type === 'delay') {
            html += generateInput('Time (sec)', 'range', node.data.delayTime, 'updateData', 'delayTime', null, 0, 5, 0.1);
        }
        else if(node.type === 'wavePlayer') {
            let opts = Object.keys(soundAssets);
            if(opts.length === 0) opts = ['No Files'];
            html += generateInput('Sound', 'select', node.data.assetName, 'updateData', 'assetName', opts);
            html += generateInput('Loop', 'checkbox', node.data.loop, 'updateData', 'loop');
        }
        
        propPanel.innerHTML = html;
    }

    function generateInput(label, type, value, func, key, options=null, min=0, max=100, step=1) {
        let input = '';
        if(type === 'select') {
            input = `<select onchange="SoundGraph.${func}('${key}', this.value)">`;
            options.forEach(o => input += `<option value="${o}" ${o==value?'selected':''}>${o}</option>`);
            input += `</select>`;
        } else if (type === 'checkbox') {
             input = `<input type="checkbox" ${value?'checked':''} onchange="SoundGraph.${func}('${key}', this.checked)">`;
        } else {
            input = `<input type="${type}" value="${value}" min="${min}" max="${max}" step="${step}" oninput="SoundGraph.${func}('${key}', this.type=='number'?this.value:this.value)">`;
        }
        
        return `<div class="ms-prop-row"><label>${label}</label>${input}</div>`;
    }

    // --- Visualizer ---
    let masterAnalyser;
    function setupVisualizer() {
        masterAnalyser = audioCtx.createAnalyser();
        masterAnalyser.fftSize = 64;
        const bufferLength = masterAnalyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const vizCanvas = document.getElementById('audio-visualizer');
        const ctx = vizCanvas.getContext('2d');
        
        function draw() {
            requestAnimationFrame(draw);
            masterAnalyser.getByteFrequencyData(dataArray);
            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, vizCanvas.width, vizCanvas.height);
            
            const barWidth = (vizCanvas.width / bufferLength) * 2.5;
            let x = 0;
            for(let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * vizCanvas.height;
                // Green to Yellow gradient
                ctx.fillStyle = `rgb(${dataArray[i]}, 200, 50)`; 
                ctx.fillRect(x, vizCanvas.height - barHeight, barWidth, barHeight);
                x += barWidth + 1;
            }
        }
        draw();
    }

    // --- File Handling ---
    document.getElementById('sound-file-upload').addEventListener('change', function(e) {
        initAudio();
        Array.from(e.target.files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                audioCtx.decodeAudioData(ev.target.result, (buffer) => {
                    soundAssets[file.name] = buffer;
                    const el = document.createElement('div');
                    el.className = 'sound-asset-item';
                    el.innerHTML = `<i class="fas fa-music"></i> ${file.name}`;
                    document.getElementById('sound-asset-list').appendChild(el);
                    // Refresh Panel if selecting WavePlayer
                    if(selectedNodeId) selectNode(nodes.find(n=>n.id === selectedNodeId));
                });
            };
            reader.readAsArrayBuffer(file);
        });
    });

    // --- Initialization ---
    // Register Default Output Node
    setTimeout(() => {
        nodes.push({ id: 'ms-node-output', type: 'output', x: 800, y: 300, data: {} });
    }, 100);

    // --- Public API ---
    return {
        addNode: addNode,
        playGraph: buildAndPlayGraph,
        stopGraph: stopPlayback,
        redraw: redrawConnections,
        
        updateData: (key, value) => {
            if(!selectedNodeId) return;
            const node = nodes.find(n => n.id === selectedNodeId);
            node.data[key] = value;
            
            // Realtime Update (if simple parameter)
            if(isPlaying) {
                const audioNode = audioNodeMap.get(selectedNodeId);
                if(audioNode && audioNode.node) {
                    if(key === 'frequency' && audioNode.node.frequency) 
                        audioNode.node.frequency.value = value;
                    if(key === 'gain' && audioNode.node.gain)
                        audioNode.node.gain.value = value;
                    if(key === 'delayTime' && audioNode.node.delayTime)
                        audioNode.node.delayTime.value = value;
                    
                    // Complex Types (wave asset change) require restart
                    if(key === 'assetName' || key === 'type') {
                        buildAndPlayGraph(); 
                    }
                }
            }
        },
        exportCue: () => {
            console.log(JSON.stringify({ nodes, connections }));
            alert("MetaSound Graph Exported to Console");
        }
    };
})();

// Close Context Menu on click
document.addEventListener('click', () => {
    document.getElementById('ms-context-menu').style.display = 'none';
});
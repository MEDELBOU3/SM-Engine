// engine/materials/material-painting/SMMaterialPaintPanel.js
// Material Paint v4.1 - AssetsPanel is the ONLY material source.
(function(global){
"use strict";
if(global.SMMaterialPaintPanel)return;
const ID="sm-material-paint-dock";
const STYLE_ID="sm-material-paint-dock-style";
const painter=()=>global.SMUniversalMaterialPainter;
const bridge=()=>global.SMMaterialAssetBridge;
let panel=null;
function ensureStyle(){
if(document.getElementById(STYLE_ID))return;
const style=document.createElement("style");
style.id=STYLE_ID;
style.textContent=`#${ID}{position:absolute;top:0;left:0;bottom:0;width:320px;z-index:55;display:none;flex-direction:column;background:#1b1d21;border-right:1px solid #30333a;box-shadow:10px 0 28px rgba(0,0,0,.28);color:#d7dbe2;font:10px/1.35 Inter,Segoe UI,Arial,sans-serif;pointer-events:auto}#${ID}.is-open{display:flex}#${ID} *{box-sizing:border-box}#${ID} button,#${ID} input{font:inherit}#${ID} .smp-head{height:42px;display:flex;align-items:center;gap:8px;padding:0 10px;border-bottom:1px solid #30333a;background:#202329}#${ID} .smp-title{min-width:0;flex:1;display:flex;align-items:center;gap:8px}#${ID} .smp-title i{color:#69aafc}#${ID} .smp-title strong{font-size:11px;color:#f2f4f7}#${ID} .smp-title span{display:block;color:#7f8793;font-size:8px}#${ID} .smp-status{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 7px;border:1px solid #3a3e46;border-radius:999px;background:#191b1f;color:#818a96;font-size:8px;font-weight:700}#${ID} .smp-status:before{content:"";width:6px;height:6px;border-radius:50%;background:#646d79}#${ID} .smp-status.is-on{border-color:rgba(78,155,255,.5);color:#9bc8ff}#${ID} .smp-status.is-on:before{background:#4e9bff}#${ID} .smp-icon-btn{width:27px;height:27px;border:1px solid #3a3e46;border-radius:5px;background:#292c32;color:#aeb5c0;cursor:pointer}#${ID} .smp-body{min-height:0;flex:1;overflow-y:auto;padding:8px}#${ID} .smp-section{margin-bottom:8px;border:1px solid rgba(255,255,255,.07);border-radius:6px;background:#202329;overflow:hidden}#${ID} .smp-section-title{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.06);color:#aeb5c0;text-transform:uppercase;font-size:8px;font-weight:700;letter-spacing:.06em}#${ID} .smp-target{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;padding:8px}#${ID} .smp-target-info{min-width:0;padding:6px 7px;border:1px solid #343841;border-radius:5px;background:#191b1f}#${ID} .smp-target-info strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e5e8ec;font-size:10px}#${ID} .smp-target-info span{color:#747d89;font-size:8px}#${ID} .smp-btn{min-height:28px;padding:5px 8px;border:1px solid #3b3f47;border-radius:5px;background:#292c32;color:#c7cdd6;cursor:pointer}#${ID} .smp-btn:hover{background:#353941;color:#fff}#${ID} .smp-btn.primary{border-color:rgba(78,155,255,.5);background:rgba(78,155,255,.13);color:#96c5ff}#${ID} .smp-btn.danger{border-color:rgba(235,87,87,.42);background:rgba(235,87,87,.1);color:#f0a0a0}#${ID} .smp-btn:disabled{opacity:.42;cursor:not-allowed}#${ID} .smp-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 8px 8px}#${ID} .smp-layer-grid{display:grid;grid-template-columns:1fr;gap:6px;padding:8px}#${ID} .smp-layer{display:grid;grid-template-columns:24px 42px minmax(0,1fr);gap:7px;align-items:center;min-height:52px;padding:6px;border:1px solid rgba(255,255,255,.07);border-radius:6px;background:#24272d;color:#cfd4dc;cursor:pointer;text-align:left}#${ID} .smp-layer.is-active{border-color:#4e9bff;box-shadow:inset 3px 0 0 #4e9bff;background:#252c36}#${ID} .smp-channel{display:grid;place-items:center;width:22px;height:22px;border-radius:4px;background:#17191d;color:#7faee8;font:700 9px monospace}#${ID} .smp-thumb{width:42px;height:36px;display:block;object-fit:cover;border-radius:4px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(135deg,#4e535d,#25282d)}#${ID} .smp-layer-copy{min-width:0}#${ID} .smp-layer-copy strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e6e9ed;font-size:9px}#${ID} .smp-layer-copy span{display:block;margin-top:2px;color:#757e8a;font-size:8px}#${ID} .smp-layer-drop{outline:1px dashed #4e9bff;outline-offset:-3px}#${ID} .smp-source-note{display:flex;gap:8px;align-items:flex-start;padding:9px;border:1px solid rgba(78,155,255,.18);border-radius:6px;background:rgba(78,155,255,.06);color:#8d98a6}#${ID} .smp-source-note i{margin-top:1px;color:#79b4fb}#${ID} .smp-source-note strong{display:block;color:#cfd8e4;font-size:9px}#${ID} .smp-source-note span{display:block;margin-top:3px;font-size:8px;line-height:1.45}#${ID} .smp-brush-master{display:grid;grid-template-columns:1fr auto;gap:6px;padding:8px}#${ID} .smp-modebar{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:0 8px 8px}#${ID} .smp-mode{min-height:28px;border:1px solid #393d45;border-radius:5px;background:#292c32;color:#9fa7b2;cursor:pointer}#${ID} .smp-mode.is-active{border-color:#4e9bff;background:rgba(78,155,255,.12);color:#9bc8ff}#${ID} .smp-controls{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px}#${ID} .smp-control{display:flex;flex-direction:column;gap:4px}#${ID} .smp-control label{display:flex;justify-content:space-between;color:#818a96;font-size:8px;text-transform:uppercase}#${ID} .smp-control label b{color:#c9ced6;font-weight:500}#${ID} input[type=range]{width:100%;accent-color:#4e9bff}#${ID} .smp-foot{padding:7px 8px;border-top:1px solid #30333a;background:#1e2025;color:#737c88;font-size:8px}#${ID} .smp-body::-webkit-scrollbar{width:7px}#${ID} .smp-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.13);border-radius:8px}body.sm-material-paint-open #${ID}{display:flex}`;
document.head.appendChild(style);
}
function host(){return document.getElementById("editor-scene")||document.getElementById("viewport-container")||document.body;}
function control(label,key,min,max,step,value){return`<div class="smp-control"><label><span>${label}</span><b data-smp-value="${key}">${value}</b></label><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-smp-control="${key}"></div>`;}
function html(){
return`<header class="smp-head"><div class="smp-title"><i class="fas fa-paint-roller"></i><div><strong>Material Paint</strong><span>AssetsPanel Driven PBR Painter</span></div></div><span class="smp-status" data-smp-status>BRUSH OFF</span><button class="smp-icon-btn" data-smp-action="close" title="Close"><i class="fas fa-times"></i></button></header><div class="smp-body"><div class="smp-source-note"><i class="fas fa-box-open"></i><div><strong>Materials come from AssetsPanel</strong><span>Select R/G/B/A layer, then drag a material from AssetsPanel directly onto the viewport object. You can also drop it on the layer slot. The Material Paint panel does not maintain a second material library.</span></div></div><section class="smp-section"><div class="smp-section-title"><span>Target</span><span data-smp-backend>—</span></div><div class="smp-target"><div class="smp-target-info"><strong data-smp-target-name>No target</strong><span data-smp-target-meta>Select any mesh, terrain or model</span></div><button class="smp-btn primary" data-smp-action="use-selection">Use Selection</button></div><div class="smp-actions"><button class="smp-btn" data-smp-action="restore">Restore Original</button><button class="smp-btn" data-smp-action="clear">Reset Blend</button></div></section><section class="smp-section"><div class="smp-section-title"><span>Material Layers</span><span>RGBA</span></div><div class="smp-layer-grid" data-smp-layers></div><div class="smp-actions"><button class="smp-btn" data-smp-action="fill">Fill Active Layer</button><button class="smp-btn" data-smp-action="diagnostics">Diagnostics</button></div></section><section class="smp-section"><div class="smp-section-title"><span>Brush Lifecycle</span><span>ESC = STOP</span></div><div class="smp-brush-master"><button class="smp-btn primary" data-smp-action="activate">Enable Brush</button><button class="smp-btn danger" data-smp-action="stop">STOP</button></div><div class="smp-modebar"><button class="smp-mode is-active" data-smp-mode="paint">Paint</button><button class="smp-mode" data-smp-mode="erase">Erase</button></div><div class="smp-controls">${control("Radius","radius",.05,25,.05,1.5)}${control("Strength","strength",.01,1,.01,.5)}${control("Flow","flow",.01,1,.01,.55)}${control("Falloff","falloff",0,1,.01,.55)}</div></section></div><footer class="smp-foot">Workflow: choose layer → drag material from AssetsPanel onto object → Enable Brush → paint → STOP.</footer>`;
}
function ensure(){
if(panel?.isConnected)return panel;
ensureStyle();
panel=document.createElement("aside");
panel.id=ID;
panel.innerHTML=html();
host().appendChild(panel);
bind(panel);
renderLayers();
refresh();
return panel;
}
function materialName(asset){return bridge()?.materialLabel?.(asset)||asset?.definition?.displayName||asset?.name||"Material";}
function placeholder(){
const element=document.createElement("span");
element.className="smp-thumb";
return element;
}
function thumb(asset){
const url=bridge()?.thumbnailUrl?.(asset);
if(!url)return placeholder();
const image=document.createElement("img");
image.className="smp-thumb";
image.alt="";
image.src=url;
image.addEventListener("error",()=>image.replaceWith(placeholder()),{once:true});
return image;
}
function renderLayers(){
const p=painter();
const root=panel||ensure();
const list=root.querySelector("[data-smp-layers]");
if(!list||!p)return;
list.innerHTML="";
for(let i=0;i<4;i++){
const assetId=p.state.layerAssetIds[i];
const asset=bridge()?.getAsset?.(assetId)||global.AssetsPanel?._findById?.(assetId);
const button=document.createElement("button");
button.type="button";
button.className=`smp-layer ${p.state.activeLayer===i?"is-active":""}`;
const channel=document.createElement("span");
channel.className="smp-channel";
channel.textContent=p.CHANNELS[i];
const copy=document.createElement("span");
copy.className="smp-layer-copy";
const name=document.createElement("strong");
name.textContent=asset?materialName(asset):`Layer ${i+1}`;
const meta=document.createElement("span");
meta.textContent=asset?(asset.definition?.provider||"AssetsPanel Material"):"Select layer, then drag from AssetsPanel";
copy.append(name,meta);
button.append(channel,thumb(asset),copy);
button.addEventListener("click",()=>{p.setActiveLayer(i);renderLayers();refresh();});
button.addEventListener("dragover",event=>{event.preventDefault();button.classList.add("smp-layer-drop");});
button.addEventListener("dragleave",()=>button.classList.remove("smp-layer-drop"));
button.addEventListener("drop",async event=>{
event.preventDefault();
button.classList.remove("smp-layer-drop");
const payload=p.decodeAssetPayload(event);
if(payload?.assetType!=="material")return;
if(!p.target){
const selected=p.selectedObject?.();
if(selected)await p.setTarget(selected);
}
if(!p.target){
console.warn("[Material Paint] Select an object before dropping a material onto a layer.");
return;
}
await p.setLayerAsset(i,payload.assetId,p.target);
renderLayers();
refresh();
});
list.appendChild(button);
}
}
function refresh(){
if(!panel?.isConnected)return;
const p=painter();
if(!p)return;
const target=p.state.target;
const meshes=p.meshList(target);
const backends=new Set(meshes.map(mesh=>p.ensurePaintData(mesh)?.backend).filter(Boolean));
panel.querySelector("[data-smp-target-name]").textContent=target?.name||target?.uuid||"No target";
panel.querySelector("[data-smp-target-meta]").textContent=target?`${meshes.length} mesh${meshes.length===1?"":"es"}`:"Select any mesh, terrain or model";
panel.querySelector("[data-smp-backend]").textContent=target?([...backends].join(" + ")||"—").toUpperCase():"—";
const status=panel.querySelector("[data-smp-status]");
status.textContent=p.active?"BRUSH ON":"BRUSH OFF";
status.classList.toggle("is-on",p.active);
panel.querySelectorAll("[data-smp-mode]").forEach(button=>button.classList.toggle("is-active",button.dataset.smpMode===p.state.operation));
const activate=panel.querySelector('[data-smp-action="activate"]');
if(activate){
activate.disabled=p.active||!p.target||!p.hasMaterialLayer();
activate.textContent=p.active?"Brush Enabled":"Enable Brush";
}
const stop=panel.querySelector('[data-smp-action="stop"]');
if(stop)stop.disabled=!p.active&&!p.state.painting;
for(const key of["radius","strength","flow","falloff"]){
const input=panel.querySelector(`[data-smp-control="${key}"]`);
const value=panel.querySelector(`[data-smp-value="${key}"]`);
const stateKey=key==="radius"?"brushRadius":key;
if(input)input.value=String(p.state[stateKey]);
if(value)value.textContent=Number(p.state[stateKey]).toFixed(2);
}
renderLayers();
}
function bind(root){
root.querySelector('[data-smp-action="close"]').addEventListener("click",close);
root.querySelector('[data-smp-action="use-selection"]').addEventListener("click",async()=>{
const object=painter()?.selectedObject?.();
if(object)await painter()?.setTarget?.(object);
else console.warn("[Material Paint] Select an object first.");
refresh();
});
root.querySelector('[data-smp-action="restore"]').addEventListener("click",()=>{painter()?.restoreOriginalMaterials?.();refresh();});
root.querySelector('[data-smp-action="clear"]').addEventListener("click",()=>{painter()?.clearWeights?.();refresh();});
root.querySelector('[data-smp-action="fill"]').addEventListener("click",()=>{painter()?.fillLayer?.();refresh();});
root.querySelector('[data-smp-action="activate"]').addEventListener("click",()=>{painter()?.activate?.();refresh();});
root.querySelector('[data-smp-action="stop"]').addEventListener("click",()=>{painter()?.emergencyStop?.("panel-stop");refresh();});
root.querySelector('[data-smp-action="diagnostics"]').addEventListener("click",()=>console.log("[Material Paint Diagnostics]",painter()?.diagnostics?.()));
root.querySelectorAll("[data-smp-mode]").forEach(button=>button.addEventListener("click",()=>{painter()?.setOperation?.(button.dataset.smpMode);refresh();}));
root.querySelectorAll("[data-smp-control]").forEach(input=>input.addEventListener("input",()=>{
const key=input.dataset.smpControl;
const options={};
options[key==="radius"?"radius":key]=Number(input.value);
painter()?.setBrush?.(options);
refresh();
}));
}
function open(){
ensure();
document.body.classList.add("sm-material-paint-open");
panel.classList.add("is-open");
painter()?.emergencyStop?.("panel-open");
refresh();
return true;
}
function close(){
painter()?.emergencyStop?.("panel-close");
document.body.classList.remove("sm-material-paint-open");
panel?.classList.remove("is-open");
return true;
}
function toggle(){return document.body.classList.contains("sm-material-paint-open")?close():open();}
function boot(){
ensureStyle();
global.addEventListener("sm:material-painter-state",()=>refresh());
global.addEventListener("sm:material-paint-layer-changed",()=>refresh());
global.addEventListener("sm:assets-material-routed-to-painter",()=>refresh());
global.addEventListener("sm:material-library-changed",()=>refresh());
}
global.SMMaterialPaintPanel={open,close,toggle,ensure,refresh,renderLayers,get panel(){return panel;}};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
else boot();
console.log("[SMMaterialPaintPanel] v4.1 ready - AssetsPanel is the single material source.");
})(window);

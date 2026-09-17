// ============================================================================
// nodes/core/NodeRegistry.js
// Central registry, categories and UI metadata for terrain nodes.
// ============================================================================
(function (global) {
    'use strict';
    const NS = global.SMTerrainNodes = global.SMTerrainNodes || {};
    if (NS.NodeRegistry) return;

    const CATEGORY_META = {
        source:    {label:'Sources',            icon:'fa-database',           color:'#a78bfa', order:10},
        generator: {label:'Generators',         icon:'fa-mountain-sun',       color:'#4e9bff', order:20},
        geology:   {label:'Erosion & Geology',  icon:'fa-water',              color:'#38bdf8', order:30},
        filter:    {label:'Filters',             icon:'fa-sliders-h',          color:'#43c58a', order:40},
        mask:      {label:'Masks',               icon:'fa-circle-half-stroke', color:'#a78bfa', order:50},
        combine:   {label:'Combiners',           icon:'fa-code-branch',        color:'#e5a84b', order:60},
        output:    {label:'Output',              icon:'fa-bullseye',           color:'#f472b6', order:70}
    };

    class NodeRegistry {
        constructor(){this._entries=new Map(); this.categories={...CATEGORY_META};}
        register(type,NodeClass,meta={}){
            if(!type||typeof NodeClass!=='function') throw new Error('[Terrain Node Registry] Invalid registration.');
            const category=meta.category||NodeClass.category||'filter';
            const entry={type,NodeClass,label:meta.label||NodeClass.label||type,category,icon:meta.icon||'fa-circle-nodes',
                color:meta.color||this.categories[category]?.color||'#43c58a',role:meta.role||'Terrain Operator',cost:meta.cost||'MED',keywords:meta.keywords||[]};
            NodeClass.type=type; NodeClass.category=category; NodeClass.label=entry.label; this._entries.set(type,entry); return entry;
        }
        has(type){return this._entries.has(type);}
        get(type){return this._entries.get(type)||null;}
        create(type,params={},options={}){
            const e=this.get(type); if(!e) throw new Error(`[Terrain Node Registry] Unknown node type "${type}".`);
            const n=new e.NodeClass(params,options); n.type=type; n.category=e.category; n.name=options.name||n.name||e.label; return n;
        }
        list(category=null){
            return [...this._entries.values()].filter(e=>!category||e.category===category).sort((a,b)=>{
                const ca=this.categories[a.category]?.order??999, cb=this.categories[b.category]?.order??999;
                return ca!==cb?ca-cb:a.label.localeCompare(b.label);
            });
        }
        search(query=''){
            const q=String(query).trim().toLowerCase(); if(!q)return this.list();
            return this.list().filter(e=>[e.type,e.label,e.category,e.role,...e.keywords].join(' ').toLowerCase().includes(q));
        }
        getCategories(){return Object.entries(this.categories).map(([id,m])=>({id,...m})).sort((a,b)=>a.order-b.order);}
    }
    const registry=global.SMTerrainNodeRegistry instanceof NodeRegistry?global.SMTerrainNodeRegistry:new NodeRegistry();
    NS.NodeRegistry=NodeRegistry; NS.registry=registry; global.SMTerrainNodeRegistry=registry;
})(window);

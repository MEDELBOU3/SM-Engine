(function(global){
    'use strict';

    class ColliderEditorPanel{
        constructor(){
            this.root=null;
            this.object=null;
            this.visible=false;
            this.physicsContent=null;
            this.physicsWorkspace=null;
            this._styles();
        }

        // =====================================================================
        // HOST / PHYSICS PANEL INTEGRATION
        // =====================================================================

        _getPhysicsContent(){
            return document.querySelector(
                '#physics-controls .physics-content'
            );
        }

        _getPhysicsWorkspace(){
            const content=this._getPhysicsContent();
            return content?.querySelector('.ph-workspace')||null;
        }

        _selected(){
            return global.selectedObject||
                global.physicsSystem?.selectedObject||
                null;
        }

        _authoring(){
            return global.smColliderAuthoring||null;
        }

        /**
         * Opens Collider Editor INSIDE the Physics panel.
         * It does not create a floating window and does not create a document tab.
         */
        open(object=null){
            const content=this._getPhysicsContent();

            if(!content){
                console.error(
                    '[ColliderEditor] #physics-controls .physics-content not found.'
                );
                return this;
            }

            this.physicsContent=content;
            this.physicsWorkspace=this._getPhysicsWorkspace();

            if(object){
                this.object=object;
            }else if(!this.object){
                this.object=this._selected();
            }

            if(!this.root){
                this._build();
            }

            if(this.root.parentElement!==content){
                content.appendChild(this.root);
            }

            if(this.physicsWorkspace){
                this.physicsWorkspace.style.display='none';
            }

            this.root.style.display='flex';
            this.root.setAttribute('aria-hidden','false');
            this.visible=true;

            this.refresh();

            return this;
        }

        /**
         * Returns to the normal Physics UI.
         */
        close(){
            if(this.root){
                this.root.style.display='none';
                this.root.setAttribute('aria-hidden','true');
            }

            if(this.physicsWorkspace){
                this.physicsWorkspace.style.display='';
            }else{
                const workspace=this._getPhysicsWorkspace();
                if(workspace)workspace.style.display='';
            }

            this.visible=false;
            this._authoring()?.stopEditing?.(true);

            return this;
        }

        setObject(object){
            this.object=object||null;

            if(this.visible){
                this.refresh();
            }

            return this;
        }

        useSelected(){
            const selected=this._selected();

            if(!selected){
                this._status(
                    'Select an object first.',
                    'warn'
                );
                return;
            }

            this.object=selected;
            this.refresh();
        }

        // =====================================================================
        // STYLES
        // =====================================================================

        _styles(){
            if(
                document.getElementById(
                    'sm-inline-collider-editor-style'
                )
            ){
                return;
            }

            const style=document.createElement('style');
            style.id='sm-inline-collider-editor-style';

            style.textContent=`
#sm-collider-editor{
    display:none;
    flex-direction:column;
    width:100%;
    min-width:0;
    min-height:0;
    background:#333333;
    color:#ffffff;
    font:11px/1.35 "Segoe UI",system-ui,sans-serif;
}

#sm-collider-editor *{
    box-sizing:border-box;
}

#sm-collider-editor .ce-inline-header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:6px;
    min-height:32px;
    padding:0 4px 6px;
    border-bottom:1px solid #444444;
}

#sm-collider-editor .ce-inline-header-left{
    display:flex;
    align-items:center;
    min-width:0;
    gap:6px;
}

#sm-collider-editor .ce-back{
    min-width:26px;
    width:26px;
    padding:0;
    font-size:14px;
}

#sm-collider-editor .ce-title-wrap{
    display:flex;
    flex-direction:column;
    min-width:0;
}

#sm-collider-editor .ce-title{
    color:#ffffff;
    font-size:10px;
    font-weight:700;
    letter-spacing:.04em;
    text-transform:uppercase;
}

#sm-collider-editor .ce-subtitle{
    max-width:180px;
    overflow:hidden;
    color:#9d9d9d;
    font-size:9px;
    text-overflow:ellipsis;
    white-space:nowrap;
}

#sm-collider-editor .ce-body{
    display:flex;
    flex-direction:column;
    width:100%;
    min-width:0;
    padding-top:6px;
}

#sm-collider-editor .ce-section{
    padding:7px 0;
    border-top:1px solid #444444;
}

#sm-collider-editor .ce-section:first-child{
    padding-top:0;
    border-top:0;
}

#sm-collider-editor .ce-section-title{
    margin:2px 0 7px;
    color:#ffffff;
    font-size:10px;
    font-weight:700;
    letter-spacing:.04em;
    text-transform:uppercase;
}

#sm-collider-editor .ce-label{
    display:grid;
    grid-template-columns:88px minmax(0,1fr);
    align-items:center;
    gap:6px;
    min-height:25px;
    margin-bottom:4px;
    color:#cccccc;
}

#sm-collider-editor .ce-label > span{
    overflow:visible;
    color:#cccccc;
    font-size:9px;
    font-weight:600;
    text-transform:uppercase;
    white-space:nowrap;
}

#sm-collider-editor .ce-target-value{
    overflow:hidden;
    color:#ffffff;
    font-size:10px;
    text-overflow:ellipsis;
    white-space:nowrap;
}

#sm-collider-editor input,
#sm-collider-editor select{
    width:100%;
    min-width:0;
    height:23px;
    padding:2px 6px;
    border:0;
    border-radius:0;
    outline:none;
    background:#3d3d3d;
    color:#ffffff;
    font:10px "Segoe UI",system-ui,sans-serif;
}

#sm-collider-editor input:hover,
#sm-collider-editor select:hover{
    background:#454545;
}

#sm-collider-editor input:focus,
#sm-collider-editor select:focus{
    background:#4a4a4a;
}

#sm-collider-editor input[type=checkbox]{
    width:auto;
    height:auto;
    justify-self:start;
    accent-color:#00bcd4;
}

#sm-collider-editor button{
    display:inline-flex;
    align-items:center;
    justify-content:center;
    min-height:24px;
    padding:4px 7px;
    border:0;
    border-radius:0;
    background:#4a4a4a;
    color:#f5f5f5;
    font:10px "Segoe UI",system-ui,sans-serif;
    cursor:pointer;
}

#sm-collider-editor button:hover{
    background:#5a5a5a;
}

#sm-collider-editor button:active{
    background:#666666;
}

#sm-collider-editor button:disabled{
    background:#3a3a3a;
    color:#777777;
    cursor:default;
}

#sm-collider-editor .ce-actions{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:4px;
    margin-top:6px;
}

#sm-collider-editor .ce-actions.one{
    grid-template-columns:1fr;
}

#sm-collider-editor .ce-primary{
    background:#5a5a5a;
    color:#ffffff;
}

#sm-collider-editor .ce-warning{
    margin:5px 0;
    padding:6px;
    background:#292929;
    color:#d0b879;
    font-size:9px;
}

#sm-collider-editor .ce-info{
    margin:5px 0;
    padding:6px;
    background:#2b2b2b;
    color:#a8a8a8;
    font-size:9px;
}

#sm-collider-editor .ce-parts{
    display:flex;
    flex-direction:column;
    gap:3px;
    max-height:160px;
    margin-top:5px;
    overflow:auto;
}

#sm-collider-editor .ce-part{
    display:grid;
    grid-template-columns:minmax(0,1fr) auto auto;
    align-items:center;
    gap:3px;
    min-height:27px;
    padding:3px 4px;
    background:#3b3b3b;
}

#sm-collider-editor .ce-part span{
    overflow:hidden;
    color:#cccccc;
    font-size:9px;
    text-overflow:ellipsis;
    white-space:nowrap;
}

#sm-collider-editor .ce-part button{
    min-height:21px;
    padding:0 5px;
}

#sm-collider-editor .ce-empty{
    padding:7px;
    background:#2b2b2b;
    color:#888888;
    font-size:9px;
    text-align:center;
}

#sm-collider-editor .ce-status{
    min-height:18px;
    padding:5px 0 0;
    color:#999999;
    font-size:9px;
}

#sm-collider-editor .ce-status.ok{
    color:#7fc97f;
}

#sm-collider-editor .ce-status.warn{
    color:#d0b879;
}

#sm-collider-editor .ce-status.error{
    color:#df8585;
}
`;

            document.head.appendChild(style);
        }

        // =====================================================================
        // BUILD UI
        // =====================================================================

        _build(){
            const root=document.createElement('div');

            root.id='sm-collider-editor';
            root.className='sm-inline-collider-editor';
            root.setAttribute('aria-hidden','true');

            root.innerHTML=`
<div class="ce-inline-header">
    <div class="ce-inline-header-left">
        <button
            type="button"
            class="ce-back"
            data-act="back"
            title="Back to Physics"
        >←</button>

        <div class="ce-title-wrap">
            <span class="ce-title">Collider Editor</span>
            <span
                class="ce-subtitle"
                id="ce-target-head"
            >No selection</span>
        </div>
    </div>

    <button
        type="button"
        data-act="use-selected"
    >Use Selection</button>
</div>

<div class="ce-body">

    <div class="ce-section">
        <div class="ce-section-title">
            Target
        </div>

        <div class="ce-label">
            <span>Object</span>
            <strong
                class="ce-target-value"
                id="ce-target"
            >No selection</strong>
        </div>

        <div
            id="ce-authoring-warning"
            class="ce-warning"
            style="display:none"
        >
            Collider authoring system is not available.
        </div>
    </div>

    <div class="ce-section">
        <div class="ce-section-title">
            Collision Geometry
        </div>

        <label class="ce-label">
            <span>Mode</span>
            <select id="ce-mode">
                <option value="exact">
                    Exact Triangle Mesh
                </option>
                <option value="convex">
                    Convex Hull
                </option>
                <option value="decomposition">
                    Convex Decomposition
                </option>
                <option value="compound">
                    Compound Collider
                </option>
                <option value="custom">
                    Custom Collider Mesh
                </option>
            </select>
        </label>

        <div
            id="ce-dynamic-warning"
            class="ce-warning"
            style="display:none"
        >
            Exact triangle collision is intended for
            Static/Kinematic bodies. Dynamic bodies should use
            convex or decomposition collision.
        </div>

        <label class="ce-label">
            <span>Margin</span>
            <input
                id="ce-margin"
                type="number"
                min="0.001"
                max="0.1"
                step="0.001"
            >
        </label>

        <label class="ce-label">
            <span>Weld</span>
            <input
                id="ce-weld"
                type="checkbox"
            >
        </label>

        <label class="ce-label">
            <span>Max Tris</span>
            <input
                id="ce-maxtri"
                type="number"
                min="100"
                max="1000000"
                step="100"
            >
        </label>

        <label
            class="ce-label"
            id="ce-hulls-row"
        >
            <span>Max Hulls</span>
            <input
                id="ce-hulls"
                type="number"
                min="1"
                max="32"
                step="1"
            >
        </label>

        <label
            class="ce-label"
            id="ce-cluster-row"
        >
            <span>Tris / Hull</span>
            <input
                id="ce-cluster"
                type="number"
                min="16"
                max="4096"
                step="16"
            >
        </label>

        <div class="ce-actions">
            <button
                type="button"
                class="ce-primary"
                data-act="generate"
            >
                Generate / Rebuild
            </button>

            <button
                type="button"
                data-act="debug"
            >
                Debug
            </button>

            <button
                type="button"
                data-act="preview"
            >
                Show Collision
            </button>

            <button
                type="button"
                data-act="hide"
            >
                Hide Collision
            </button>
        </div>
    </div>

    <div
        class="ce-section"
        id="ce-compound"
    >
        <div class="ce-section-title">
            Compound Parts
        </div>

        <div class="ce-info">
            Add lightweight primitive colliders and edit each
            part directly in the viewport.
        </div>

        <div class="ce-actions">
            <button type="button" data-add="box">
                + Box
            </button>

            <button type="button" data-add="sphere">
                + Sphere
            </button>

            <button type="button" data-add="capsule">
                + Capsule
            </button>

            <button type="button" data-add="cylinder">
                + Cylinder
            </button>
        </div>

        <div
            id="ce-parts"
            class="ce-parts"
        ></div>
    </div>

    <div class="ce-section">
        <div
            class="ce-status"
            id="ce-status"
        >
            Ready
        </div>
    </div>

</div>
`;

            root.addEventListener(
                'click',
                event=>this._click(event)
            );

            root.addEventListener(
                'change',
                event=>{
                    if(
                        event.target.matches(
                            'input,select'
                        )
                    ){
                        this._saveForm();
                    }
                }
            );

            root.addEventListener(
                'input',
                event=>{
                    if(
                        event.target.matches(
                            'input[type=number]'
                        )
                    ){
                        this._saveForm();
                    }
                }
            );

            this.root=root;
        }

        // =====================================================================
        // CONFIG / AUTHORING
        // =====================================================================

        _config(){
            const system=this._authoring();

            if(
                !this.object ||
                !system?.getConfig
            ){
                return null;
            }

            return system.getConfig(
                this.object,
                true
            );
        }

        _saveForm(){
            const system=this._authoring();
            const config=this._config();

            if(
                !config ||
                !system ||
                !this.root
            ){
                return;
            }

            config.mode=
                this.root.querySelector(
                    '#ce-mode'
                ).value;

            config.margin=Math.max(
                0.001,
                Number(
                    this.root.querySelector(
                        '#ce-margin'
                    ).value
                ) || 0.015
            );

            config.weld=
                this.root.querySelector(
                    '#ce-weld'
                ).checked;

            config.maxTriangles=Math.max(
                100,
                Number(
                    this.root.querySelector(
                        '#ce-maxtri'
                    ).value
                ) || 250000
            );

            config.maxHulls=Math.max(
                1,
                Number(
                    this.root.querySelector(
                        '#ce-hulls'
                    ).value
                ) || 8
            );

            config.targetTrianglesPerHull=Math.max(
                16,
                Number(
                    this.root.querySelector(
                        '#ce-cluster'
                    ).value
                ) || 128
            );

            system.saveConfig?.(
                this.object,
                config
            );

            this.refresh(false);
        }

        // =====================================================================
        // EVENTS
        // =====================================================================

        _click(event){
            const button=
                event.target.closest('button');

            if(!button){
                return;
            }

            const action=
                button.dataset.act;

            if(action==='back'){
                this.close();
                return;
            }

            if(action==='use-selected'){
                this.useSelected();
                return;
            }

            if(!this.object){
                this._status(
                    'Select an object first.',
                    'warn'
                );
                return;
            }

            const system=
                this._authoring();

            if(!system){
                this._status(
                    'Collider authoring system is unavailable.',
                    'error'
                );
                return;
            }

            if(action==='generate'){
                this._saveForm();

                const body=
                    system.rebuild?.(
                        this.object
                    );

                this._status(
                    body
                        ? 'Collider generated.'
                        : 'Collider rebuild requested.',
                    'ok'
                );

                this.refresh();

                return;
            }

            if(action==='preview'){
                this._saveForm();

                system.show?.(
                    this.object
                );

                this._status(
                    'Collision preview enabled.',
                    'ok'
                );

                return;
            }

            if(action==='hide'){
                system.hide?.(
                    this.object
                );

                this._status(
                    'Collision preview hidden.',
                    'ok'
                );

                return;
            }

            if(action==='debug'){
                system.debug?.(
                    this.object
                );

                this._status(
                    'Collider debug requested.',
                    'ok'
                );

                return;
            }

            const add=
                button.dataset.add;

            if(add){
                system.addPrimitive?.(
                    this.object,
                    add
                );

                this._status(
                    `${add} collider part added.`,
                    'ok'
                );

                this.refresh();

                return;
            }

            const edit=
                button.dataset.edit;

            if(edit!==undefined){
                system.editPart?.(
                    this.object,
                    Number(edit),
                    'translate'
                );

                this._status(
                    `Editing collider part ${Number(edit)+1}.`,
                    'ok'
                );

                return;
            }

            const remove=
                button.dataset.remove;

            if(remove!==undefined){
                system.removePart?.(
                    this.object,
                    Number(remove)
                );

                this._status(
                    `Collider part ${Number(remove)+1} removed.`,
                    'ok'
                );

                this.refresh();
            }
        }

        // =====================================================================
        // UI STATE
        // =====================================================================

        _status(text,type=''){
            const el=
                this.root?.querySelector(
                    '#ce-status'
                );

            if(!el){
                return;
            }

            el.textContent=text;

            el.className=
                'ce-status' +
                (
                    type
                        ? ` ${type}`
                        : ''
                );
        }

        _setControlsEnabled(enabled){
            if(!this.root){
                return;
            }

            this.root.querySelectorAll(
                '.ce-body input,'+
                '.ce-body select,'+
                '.ce-body button'
            ).forEach(el=>{
                el.disabled=!enabled;
            });
        }

        refresh(rebuildParts=true){
            if(!this.root){
                return;
            }

            if(
                !this.object ||
                (
                    !this.object.parent &&
                    this.object!==global.scene
                )
            ){
                this.object=
                    this._selected();
            }

            const system=
                this._authoring();

            const targetName=
                this.object?.name||
                'No selection';

            const target=
                this.root.querySelector(
                    '#ce-target'
                );

            const targetHead=
                this.root.querySelector(
                    '#ce-target-head'
                );

            if(target){
                target.textContent=
                    targetName;
            }

            if(targetHead){
                targetHead.textContent=
                    targetName;
            }

            const authoringWarning=
                this.root.querySelector(
                    '#ce-authoring-warning'
                );

            if(authoringWarning){
                authoringWarning.style.display=
                    system
                        ? 'none'
                        : 'block';
            }

            const config=
                this._config();

            if(!config){
                this._setControlsEnabled(false);

                const parts=
                    this.root.querySelector(
                        '#ce-parts'
                    );

                if(parts){
                    parts.innerHTML=
                        '<div class="ce-empty">No collider data</div>';
                }

                this._status(
                    this.object
                        ? 'Collider authoring system is not ready.'
                        : 'Select an object first.',
                    this.object
                        ? 'error'
                        : 'warn'
                );

                return;
            }

            this._setControlsEnabled(true);

            this.root.querySelector(
                '#ce-mode'
            ).value=
                config.mode||
                'exact';

            this.root.querySelector(
                '#ce-margin'
            ).value=
                config.margin??
                0.015;

            this.root.querySelector(
                '#ce-weld'
            ).checked=
                config.weld!==false;

            this.root.querySelector(
                '#ce-maxtri'
            ).value=
                config.maxTriangles??
                250000;

            this.root.querySelector(
                '#ce-hulls'
            ).value=
                config.maxHulls??
                8;

            this.root.querySelector(
                '#ce-cluster'
            ).value=
                config.targetTrianglesPerHull??
                128;

            const props=
                this.object?.userData?.physics||
                {};

            const dynamic=
                Number(props.mass)>0 &&
                !props.isKinematic;

            this.root.querySelector(
                '#ce-dynamic-warning'
            ).style.display=
                dynamic &&
                config.mode==='exact'
                    ? 'block'
                    : 'none';

            const decomposition=
                config.mode==='decomposition';

            this.root.querySelector(
                '#ce-hulls-row'
            ).style.display=
                decomposition
                    ? 'grid'
                    : 'none';

            this.root.querySelector(
                '#ce-cluster-row'
            ).style.display=
                decomposition
                    ? 'grid'
                    : 'none';

            const compound=
                config.mode==='compound';

            this.root.querySelector(
                '#ce-compound'
            ).style.display=
                compound
                    ? 'block'
                    : 'none';

            if(rebuildParts){
                const list=
                    this.root.querySelector(
                        '#ce-parts'
                    );

                list.innerHTML='';

                const parts=
                    config.parts||
                    [];

                if(!parts.length){
                    list.innerHTML=
                        '<div class="ce-empty">No compound parts yet</div>';
                }else{
                    parts.forEach(
                        (part,index)=>{
                            const row=
                                document.createElement(
                                    'div'
                                );

                            row.className=
                                'ce-part';

                            const label=
                                part.name||
                                part.type||
                                'Collider';

                            row.innerHTML=`
<span title="${label}">
    ${index+1}. ${label}
</span>

<button
    type="button"
    data-edit="${index}"
>
    Edit
</button>

<button
    type="button"
    data-remove="${index}"
    title="Remove"
>
    ×
</button>
`;

                            list.appendChild(
                                row
                            );
                        }
                    );
                }
            }

            this._status(
                `Mode: ${config.mode||'exact'} | Parts: ${(config.parts||[]).length}`,
                'ok'
            );
        }
    }

    // =====================================================================
    // GLOBAL API
    // =====================================================================

    global.ColliderEditorPanel=
        ColliderEditorPanel;

    global.colliderEditorPanel=
        global.colliderEditorPanel||
        new ColliderEditorPanel();

    global.openColliderEditorPanel=
        (object=null)=>
            global.colliderEditorPanel.open(
                object
            );

    global.closeColliderEditorPanel=
        ()=>
            global.colliderEditorPanel.close();

})(window);
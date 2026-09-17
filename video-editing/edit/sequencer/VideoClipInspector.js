/**
 * VideoClipInspector.js
 * Professional SM Engine video clip inspector with AE-style transform animation.
 * Uses SequencerManager's keyframe API and the existing roots.css theme tokens.
 */
(function () {
    const TYPE_LABEL = { video:'Video', image:'Image', gif:'GIF', audio:'Audio', text:'Text', solid:'Solid' };
    const BLEND_MODES = [
        ['source-over','Normal'],['multiply','Multiply'],['screen','Screen'],['overlay','Overlay'],
        ['darken','Darken'],['lighten','Lighten'],['color-dodge','Color Dodge'],['color-burn','Color Burn'],
        ['hard-light','Hard Light'],['soft-light','Soft Light']
    ];

    class VideoClipInspector {
        constructor(manager) {
            this.manager = manager;
            this.clip = null;
            this._ensureStyles();
        }
        host() { return document.getElementById('inspector-main-content'); }
        _ensureStyles() {
            if (document.getElementById('sq-video-kf-inspector-style')) return;
            const style = document.createElement('style');
            style.id = 'sq-video-kf-inspector-style';
            style.textContent = `
            /* =========================================================
               VIDEO CLIP INSPECTOR — ROOTS.CSS GRAY THEME
               ---------------------------------------------------------
               IMPORTANT:
               - no z-index is used anywhere in this inspector
               - no transform / filter / isolation stacking context
               - card/body overflow stays visible
               - native SELECT and COLOR controls keep native popup UI
               ========================================================= */

            .sequencer-inspector{
                display:flex;
                flex-direction:column;
                gap:5px;
                width:100%;
                min-width:0;
                box-sizing:border-box;
                padding:5px 5px 16px;
                background:transparent;
                color:var(--text-primary,#fff);
                font-size:10px;

                overflow:visible!important;
                contain:none!important;
                isolation:auto!important;
                transform:none!important;
                filter:none!important;
                perspective:none!important;
                z-index:auto!important;
            }

            .sequencer-inspector .inspector-card{
                width:100%;
                min-width:0;
                box-sizing:border-box;

                background:var(--panel-bg,var(--primary-dark,#333333));
                border:1px solid var(--border-color,#4d4d4d81);
                border-radius:0;
                box-shadow:none;

                overflow:visible!important;
                contain:none!important;
                isolation:auto!important;
                transform:none!important;
                filter:none!important;
                z-index:auto!important;
            }

            .sequencer-inspector .inspector-card-header{
                min-height:25px;
                box-sizing:border-box;

                display:flex;
                align-items:center;
                justify-content:space-between;

                padding:0 7px;

                background:var(--header-bg,var(--secondary-dark,#3c3c3c));
                border-bottom:1px solid var(--border-color,#4d4d4d81);

                color:var(--text-secondary,#b0b0b0);
                font-size:9px;
                font-weight:700;
                letter-spacing:.45px;

                overflow:visible!important;
                z-index:auto!important;
            }

            .sequencer-inspector .inspector-card-body{
                display:flex;
                flex-direction:column;
                gap:3px;

                min-width:0;
                padding:5px 6px;

                background:var(--panel-bg,var(--primary-dark,#333333));

                overflow:visible!important;
                contain:none!important;
                isolation:auto!important;
                transform:none!important;
                filter:none!important;
                z-index:auto!important;
            }

            .sequencer-inspector .sq-field-row{
                display:grid;
                grid-template-columns:minmax(64px,82px) 24px 20px minmax(0,1fr);
                align-items:center;
                gap:3px;

                min-width:0;
                min-height:24px;

                padding:1px 0;

                background:transparent;

                overflow:visible!important;
                z-index:auto!important;
            }

            .sequencer-inspector .sq-field-row.sq-static-row{
                grid-template-columns:minmax(64px,82px) minmax(0,1fr);
            }

            .sequencer-inspector .sq-field-label{
                min-width:0;

                overflow:hidden;
                text-overflow:ellipsis;
                white-space:nowrap;

                color:var(--text-secondary,#b0b0b0);
                font-size:9px;
            }

            /* =========================================================
               INPUTS
               ========================================================= */

            .sequencer-inspector input,
            .sequencer-inspector select,
            .sequencer-inspector textarea{
                min-width:0;
                width:100%;
                box-sizing:border-box;

                background:var(--input-bg,var(--secondary-dark,#3c3c3c));
                color:var(--text-primary,#fff);

                border:1px solid var(--input-border,var(--border-color,#4d4d4d81));
                border-radius:0;

                font:inherit;
                outline:none;

                box-shadow:none!important;
                filter:none!important;
                transform:none!important;
                isolation:auto!important;
                z-index:auto!important;
            }

            .sequencer-inspector input,
            .sequencer-inspector select{
                height:21px;
                padding:0 5px;
            }

            .sequencer-inspector textarea{
                padding:5px;
                resize:vertical;
            }

            .sequencer-inspector input:hover,
            .sequencer-inspector select:hover,
            .sequencer-inspector textarea:hover{
                background:var(--bg-button,var(--secondary-dark,#3c3c3c));
                border-color:var(--border-color,#4d4d4d81);
            }

            .sequencer-inspector input:focus,
            .sequencer-inspector select:focus,
            .sequencer-inspector textarea:focus{
                background:var(--input-bg,var(--secondary-dark,#3c3c3c));
                border-color:var(--accent-blue,#5f5f5f);
                box-shadow:none!important;
            }

            /* Keep Electron / Chromium native popup controls native.
               This is especially important for Blend Mode dropdown and
               <input type="color"> system color picker. */
            .sequencer-inspector select{
                appearance:auto!important;
                -webkit-appearance:auto!important;
                cursor:default;
                overflow:visible!important;
            }

            .sequencer-inspector select option,
            .sequencer-inspector select optgroup{
                background:var(--secondary-dark,#3c3c3c);
                color:var(--text-primary,#fff);
            }

            .sequencer-inspector input[type="color"]{
                appearance:auto!important;
                -webkit-appearance:auto!important;

                min-width:0;
                height:22px;

                padding:1px 2px;

                background:var(--input-bg,var(--secondary-dark,#3c3c3c));
                border:1px solid var(--input-border,var(--border-color,#4d4d4d81));

                cursor:pointer;

                overflow:visible!important;
            }

            .sequencer-inspector input[type="color"]::-webkit-color-swatch-wrapper{
                padding:1px;
            }

            .sequencer-inspector input[type="color"]::-webkit-color-swatch{
                border:0;
                border-radius:0;
            }

            /* =========================================================
               KEYFRAMES
               ========================================================= */

            .sq-kf-stopwatch,
            .sq-kf-diamond{
                width:20px;
                height:20px;

                display:inline-flex;
                align-items:center;
                justify-content:center;

                padding:0;

                border:0;
                border-radius:0;

                background:transparent;
                color:var(--text-secondary,#b0b0b0);

                cursor:pointer;

                box-shadow:none;
                z-index:auto!important;
            }

            .sq-kf-stopwatch:hover,
            .sq-kf-diamond:hover{
                background:var(--bg-button,var(--secondary-dark,#3c3c3c));
                color:var(--text-primary,#fff);
            }

            .sq-kf-stopwatch.active{
                color:var(--text-primary,#fff);
                background:var(--accent-blue-dark,#474747);
            }

            .sq-kf-diamond::before{
                content:'';

                width:7px;
                height:7px;

                box-sizing:border-box;

                border:1px solid var(--text-secondary,#b0b0b0);
                background:transparent;

                transform:rotate(45deg);
            }

            .sq-kf-diamond.has-key::before{
                background:var(--accent-blue,#5f5f5f);
                border-color:var(--text-primary,#fff);
            }

            .sq-kf-diamond.disabled{
                opacity:.25;
                pointer-events:none;
            }

            /* =========================================================
               BADGE / TRANSFORM
               ========================================================= */

            .sq-inspector-badge{
                padding:2px 5px;

                border:1px solid var(--border-color,#4d4d4d81);
                border-radius:0;

                background:var(--primary-dark,#333333);
                color:var(--text-secondary,#b0b0b0);

                font-size:8px;
                z-index:auto!important;
            }

            .sq-transform-toolbar{
                display:flex;
                justify-content:flex-end;
                gap:4px;

                padding-bottom:3px;
                margin-bottom:2px;

                border-bottom:1px solid var(--border-color,#4d4d4d81);

                overflow:visible!important;
                z-index:auto!important;
            }

            .sq-transform-reset{
                height:20px;

                padding:0 6px;

                border:1px solid var(--border-color,#4d4d4d81);
                border-radius:0;

                background:var(--bg-button,var(--secondary-dark,#3c3c3c));
                color:var(--text-secondary,#b0b0b0);

                font-size:8px;
                cursor:pointer;

                box-shadow:none;
                z-index:auto!important;
            }

            .sq-transform-reset:hover{
                background:var(--button-hover-bg,var(--secondary-dark,#3c3c3c));
                color:var(--text-primary,#fff);
                border-color:var(--accent-blue,#5f5f5f);
            }

            /* =========================================================
               RANGE INPUT
               ========================================================= */

            .sequencer-inspector input[type="range"]{
                height:20px;
                padding:0;
                border:0;
                background:transparent;
                accent-color:var(--accent-blue,#5f5f5f);
            }

            .sq-timecode-readonly{
                display:none;
            }

            /* =========================================================
               POPUP / STACKING SAFETY
               ---------------------------------------------------------
               Inspector itself must never create a local stacking context
               above Chromium/Electron system controls.
               ========================================================= */

            #inspector-main-content:has(.sequencer-inspector){
                overflow:visible!important;
                contain:none!important;
                isolation:auto!important;
                transform:none!important;
                filter:none!important;
                z-index:auto!important;
            }

            #inspector-main-content .sequencer-inspector,
            #inspector-main-content .sequencer-inspector *{
                z-index:auto!important;
            }
            `;
            document.head.appendChild(style);
        }
        open(clip) {
            if (!clip) return this.close();
            this.close(false);
            this.clip = clip;
            this.manager?._ensureClipAnimation?.(clip);
            const host = this.host();
            if (!host) return;
            host.innerHTML = '';
            const root = document.createElement('div');
            root.className = 'sequencer-inspector';
            host.appendChild(root);
            root.appendChild(this._card('CLIP', this._typeBadge(clip), this._nameFields(clip)));
            root.appendChild(this._card('TIME', null, this._timeFields(clip)));
            if (clip.mediaType !== 'audio') root.appendChild(this._card('TRANSFORM', null, this._transformFields(clip)));
            if (clip.mediaType === 'audio') root.appendChild(this._card('AUDIO', null, this._audioFields(clip)));
            else root.appendChild(this._card('VIDEO / IMAGE', null, this._videoFields(clip)));
            if (clip.mediaType === 'solid') root.appendChild(this._card('SOLID', null, this._solidFields(clip)));
            if (clip.mediaType === 'text') root.appendChild(this._card('TEXT', null, this._textFields(clip)));
            const gradeCard = document.createElement('div');
            gradeCard.className = 'inspector-card sequencer-inspector-grade';
            const gradeHdr = document.createElement('div'); gradeHdr.className = 'inspector-card-header';
            const gradeTitle = document.createElement('span'); gradeTitle.textContent = 'COLOR / FX'; gradeHdr.appendChild(gradeTitle);
            const gradeBody = document.createElement('div'); gradeBody.className = 'inspector-card-body';
            const veaHost = document.createElement('div'); veaHost.id = 'video-inspector-content'; veaHost.className = 'vea-host';
            gradeBody.appendChild(veaHost); gradeCard.append(gradeHdr,gradeBody); root.appendChild(gradeCard);
            this._refreshInputs();
        }
        close(restore) {
            this.clip = null;
            const host = this.host();
            if (!host) return;
            if (host.querySelector('.sequencer-inspector')) {
                host.innerHTML = '';
                if (restore !== false && window.InspectorPanel?.renderDefaultInspector) window.InspectorPanel.renderDefaultInspector();
            }
        }
        refresh() { if (this.clip) this._refreshInputs(); }
        _card(title, extra, bodyEls) {
            const card=document.createElement('div'); card.className='inspector-card';
            const hdr=document.createElement('div'); hdr.className='inspector-card-header';
            const t=document.createElement('span'); t.textContent=title; hdr.appendChild(t); if(extra)hdr.appendChild(extra);
            const body=document.createElement('div'); body.className='inspector-card-body'; bodyEls.forEach(el=>body.appendChild(el));
            card.append(hdr,body); return card;
        }
        _staticRow(label,input,readonlyText) {
            const row=document.createElement('div'); row.className='sq-field-row sq-static-row';
            const lab=document.createElement('span'); lab.className='sq-field-label'; lab.textContent=label; row.append(lab,input);
            if(readonlyText){const t=document.createElement('span');t.className='sq-timecode-readonly';t.textContent=readonlyText;row.appendChild(t);} return row;
        }
        _keyRow(label,channel,input) {
            const row=document.createElement('div'); row.className='sq-field-row'; row.dataset.channel=channel;
            const lab=document.createElement('span'); lab.className='sq-field-label'; lab.textContent=label;
            const watch=document.createElement('button'); watch.type='button'; watch.className='sq-kf-stopwatch'; watch.title='Enable animation'; watch.innerHTML='<i class="fas fa-stopwatch"></i>';
            const diamond=document.createElement('button'); diamond.type='button'; diamond.className='sq-kf-diamond'; diamond.title='Add / remove keyframe at playhead';
            watch.addEventListener('click',()=>{this.manager?.togglePropertyAnimation?.(this.clip,channel);this._refreshInputs();});
            diamond.addEventListener('click',()=>{this.manager?.toggleKeyframeAt?.(this.clip,channel);this._refreshInputs();});
            input.dataset.kfChannel=channel;
            row.append(lab,watch,diamond,input); return row;
        }
        _numInput(value,onChange,opts={}) {
            const input=document.createElement('input'); input.type='number'; input.step=opts.step??'any';
            if(opts.min!=null)input.min=String(opts.min); if(opts.max!=null)input.max=String(opts.max); input.value=value;
            input.addEventListener('change',()=>{const v=parseFloat(input.value);if(Number.isFinite(v))onChange(v);}); return input;
        }
        _typeBadge(clip){const b=document.createElement('span');b.className='sq-inspector-badge';b.textContent=TYPE_LABEL[clip.mediaType]||clip.mediaType;return b;}
        _nameFields(clip){const name=document.createElement('input');name.type='text';name.value=clip.name;name.addEventListener('change',()=>{const clean=String(name.value||'').trim();if(!clean)return;clip.name=clean;const el=this.manager?.renderer?.clipEls?.get(clip.id);const n=el?.querySelector('.sequencer-clip-name');if(n)n.textContent=clean;this._commit();});return[this._staticRow('Name',name)];}
        _timeFields(clip){
            const fps=this.manager?.state?.fps||30,tc=v=>SequencerMath.timecode(v,fps);
            const start=this._numInput(clip.start,v=>{clip.start=Math.max(0,v||0);this._commit();});
            const dur=this._numInput(clip.duration,v=>{clip.duration=Math.max(1/fps,v||1/fps);clip.sourceOut=clip.sourceIn+clip.duration;this._commit();});
            const inf=this._numInput(clip.sourceIn,v=>{clip.sourceIn=Math.max(0,v||0);clip.sourceOut=clip.sourceIn+clip.duration;this._commit();});
            const outf=this._numInput(clip.sourceOut,v=>{clip.sourceOut=Math.max(clip.sourceIn+1/fps,v||clip.sourceIn+1/fps);clip.duration=clip.sourceOut-clip.sourceIn;this._commit();});
            return[this._staticRow('Start',start,tc(clip.start)),this._staticRow('Duration',dur,tc(clip.duration)),this._staticRow('Source In',inf,tc(clip.sourceIn)),this._staticRow('Source Out',outf,tc(clip.sourceOut))];
        }
        _transformFields(clip){
            const els=[];
            const toolbar=document.createElement('div');toolbar.className='sq-transform-toolbar';
            const reset=document.createElement('button');reset.type='button';reset.className='sq-transform-reset';reset.textContent='Reset Transform';
            reset.addEventListener('click',()=>{['positionX','positionY','scaleX','scaleY','rotation','anchorX','anchorY','opacity'].forEach(ch=>{if(clip.keyframeEnabled?.[ch]){clip.keyframeEnabled[ch]=false;clip.keyframes[ch]=[];}});clip.x=null;clip.y=null;clip.scaleX=1;clip.scaleY=1;clip.rotation=0;clip.anchorX=.5;clip.anchorY=.5;clip.opacity=1;this._commit();this._refreshInputs();});
            toolbar.appendChild(reset);els.push(toolbar);
            const make=(label,ch,step=1,min=null,max=null,displayScale=1)=>{
                const current=this.manager?.evaluateClipProperty?.(clip,ch,this.manager.state.playhead)??0;
                const input=this._numInput(current*displayScale,v=>this.manager?.setAnimatedProperty?.(clip,ch,v/displayScale),{step,min,max});
                els.push(this._keyRow(label,ch,input));
            };
            make('Position X','positionX',1); make('Position Y','positionY',1);
            make('Scale X','scaleX',.1,0.01,10000,100); make('Scale Y','scaleY',.1,0.01,10000,100);
            make('Rotation','rotation',.1); make('Anchor X','anchorX',.1,0,100,100); make('Anchor Y','anchorY',.1,0,100,100);
            make('Opacity','opacity',1,0,100,100);
            const w=this._numInput(clip.w!=null?clip.w:'',v=>{clip.w=Math.max(1,v);this._commit();});
            const h=this._numInput(clip.h!=null?clip.h:'',v=>{clip.h=Math.max(1,v);this._commit();});
            els.push(this._staticRow('Width',w),this._staticRow('Height',h));
            return els;
        }
        _protectNativePopupControl(control) {
            if (!control) return control;

            /*
             * Do NOT call preventDefault here.
             * We only stop SM Engine parent/global interaction handlers from
             * reacting to the click. Chromium/Electron keeps the default action
             * and therefore opens the real native popup.
             */
            ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(type => {
                control.addEventListener(type, event => {
                    event.stopPropagation();
                });
            });

            control.addEventListener('keydown', event => {
                event.stopPropagation();
            });

            return control;
        }

        _videoFields(clip){
            const blend=document.createElement('select');
            BLEND_MODES.forEach(m=>{
                const o=document.createElement('option');
                o.value=m[0];
                o.textContent=m[1];
                blend.appendChild(o);
            });
            blend.value=clip.blendMode||'source-over';

            this._protectNativePopupControl(blend);

            blend.addEventListener('change',()=>{
                clip.blendMode=blend.value;
                this._commit();
            });

            return[this._staticRow('Blend Mode',blend)];
        }
        _audioFields(clip){
            const current=this.manager?.evaluateClipProperty?.(clip,'volume',this.manager.state.playhead)??1;
            const vol=document.createElement('input');vol.type='range';vol.min='0';vol.max='2';vol.step='.01';vol.value=current;vol.dataset.kfChannel='volume';
            vol.addEventListener('input',()=>this.manager?.setAnimatedProperty?.(clip,'volume',parseFloat(vol.value),{fullRender:false}));
            return[this._keyRow('Volume','volume',vol)];
        }
        _solidFields(clip){
            const color=document.createElement('input');
            color.type='color';
            color.value=clip.color||'#4778ff';

            this._protectNativePopupControl(color);

            color.addEventListener('input',()=>{
                clip.color=color.value;
                this._commit(false);
            });
            color.addEventListener('change',()=>this._commit());

            return[this._staticRow('Color',color)];
        }
        _textFields(clip){const text=document.createElement('textarea');text.rows=3;text.value=clip.text||'';text.addEventListener('change',()=>{clip.text=text.value;this._commit();});return[this._staticRow('Content',text)];}
        _refreshInputs(){
            if(!this.clip)return;const clip=this.clip,host=this.host();if(!host)return;
            this.manager?._ensureClipAnimation?.(clip);
            host.querySelectorAll('.sq-field-row[data-channel]').forEach(row=>{
                const ch=row.dataset.channel,watch=row.querySelector('.sq-kf-stopwatch'),diamond=row.querySelector('.sq-kf-diamond'),input=row.querySelector('input,select,textarea');
                const animated=this.manager?.isPropertyAnimated?.(clip,ch);watch?.classList.toggle('active',!!animated);diamond?.classList.toggle('disabled',!animated);diamond?.classList.toggle('has-key',!!this.manager?.hasKeyframeAt?.(clip,ch));
                if(input&&document.activeElement!==input){let value=this.manager?.evaluateClipProperty?.(clip,ch,this.manager.state.playhead);if(ch==='scaleX'||ch==='scaleY'||ch==='anchorX'||ch==='anchorY'||ch==='opacity')value*=100;input.value=Number.isFinite(value)?String(Math.round(value*1000)/1000):'';}
            });
            host.querySelectorAll('.sq-static-row').forEach(row=>{const lab=row.querySelector('.sq-field-label');const input=row.querySelector('input,select,textarea');if(!lab||!input||document.activeElement===input)return;const k=lab.textContent;if(k==='Name')input.value=clip.name||'';else if(k==='Start')input.value=clip.start;else if(k==='Duration')input.value=clip.duration;else if(k==='Source In')input.value=clip.sourceIn;else if(k==='Source Out')input.value=clip.sourceOut;else if(k==='Width')input.value=clip.w??'';else if(k==='Height')input.value=clip.h??'';else if(k==='Blend Mode')input.value=clip.blendMode||'source-over';else if(k==='Color')input.value=clip.color||'#4778ff';else if(k==='Content')input.value=clip.text||'';});
        }
        _commit(repaint=true){if(this.manager)this.manager._clipsChanged();if(repaint!==false)this.manager?.renderer?.render?.();}
    }
    window.VideoClipInspector=VideoClipInspector;
    window.ensureVideoClipInspector=function(manager){if(!window.videoClipInspector)window.videoClipInspector=new VideoClipInspector(manager);else if(manager&&window.videoClipInspector.manager!==manager)window.videoClipInspector.manager=manager;return window.videoClipInspector;};
})();
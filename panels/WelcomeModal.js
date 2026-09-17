(function(){
    'use strict';
    const STORAGE_KEY='hideSmEngineWelcome';
    const WelcomeModal={
        modal:null,
        checkbox:null,
        previouslyFocused:null,
        focusables:[],
        initialized:false,
        _onKeyDown:null,
        _onBackdropClick:null,
        init(){
            if(this.initialized)return this;
            this.modal=document.getElementById('welcome-modal');
            if(!this.modal){
                console.warn('[WelcomeModal] Element #welcome-modal was not found.');
                return this;
            }
            this.modal.innerHTML=this.render();
            this.checkbox=this.modal.querySelector('#dont-show-again-checkbox');
            this._bind();
            this.initialized=true;
            this._autoOpen();
            window.dispatchEvent(new CustomEvent('sm:welcome-ready',{detail:{modal:this}}));
            return this;
        },
        render(){
            return`<div class="sm-welcome-shell" role="document">
                <aside class="sm-welcome-rail" aria-label="SM Engine welcome">
                    <div class="sm-welcome-brand">
                        <div class="sm-welcome-logo" aria-hidden="true">
                            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M30 170V45l30-15h70l40 20v105l-15 15h-55l-15-15v-55l30-15V45l-15-15M85 100l30-15"/></svg>
                        </div>
                        <div>
                            <div class="sm-welcome-product">SM Engine</div>
                            <div class="sm-welcome-version">3D Creation & Runtime Workspace</div>
                        </div>
                    </div>
                    <nav class="sm-welcome-nav" aria-label="Welcome navigation">
                        <button class="sm-welcome-nav-item is-active" type="button" data-welcome-section="home"><i class="fa-solid fa-house"></i><span>Home</span></button>
                        <a class="sm-welcome-nav-item" href="https://github.com/medelbou3/SM-Engine" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-github"></i><span>Source Code</span><i class="fa-solid fa-arrow-up-right-from-square sm-welcome-external"></i></a>
                        <a class="sm-welcome-nav-item" href="https://youtube.com/@medelbou3" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-youtube"></i><span>Tutorials</span><i class="fa-solid fa-arrow-up-right-from-square sm-welcome-external"></i></a>
                    </nav>
                    <div class="sm-welcome-rail-footer">
                        <span class="sm-welcome-status-dot"></span>
                        <span>Editor ready</span>
                    </div>
                </aside>
                <section class="sm-welcome-main">
                    <header class="sm-welcome-topbar">
                        <div>
                            <div class="sm-welcome-eyebrow">WELCOME</div>
                            <h1 id="modal-title-main">Build worlds, games and visual experiences.</h1>
                            <p>Start from the editor, explore the core toolsets, or watch the quick introduction.</p>
                        </div>
                        <button class="sm-welcome-close" type="button" data-welcome-action="close" aria-label="Close welcome window" title="Close"><i class="fa-solid fa-xmark"></i></button>
                    </header>
                    <div class="sm-welcome-content">
                        <section class="sm-welcome-start-panel" aria-labelledby="sm-welcome-start-title">
                            <div class="sm-welcome-section-head">
                                <div>
                                    <h2 id="sm-welcome-start-title">Quick Start</h2>
                                    <p>Jump directly into the workspace.</p>
                                </div>
                            </div>
                            <div class="sm-welcome-actions">
                                <button class="sm-welcome-primary-action" type="button" data-welcome-action="start">
                                    <span class="sm-welcome-action-icon"><i class="fa-solid fa-cube"></i></span>
                                    <span class="sm-welcome-action-copy"><strong>Open 3D Workspace</strong><small>Continue to the main editor viewport</small></span>
                                    <i class="fa-solid fa-arrow-right sm-welcome-action-arrow"></i>
                                </button>
                                <div class="sm-welcome-secondary-actions">
                                    <button type="button" data-welcome-action="new-project"><i class="fa-regular fa-file"></i><span><strong>New Project</strong><small>Create a clean workspace</small></span></button>
                                    <button type="button" data-welcome-action="open-project"><i class="fa-regular fa-folder-open"></i><span><strong>Open Project</strong><small>Load an existing project</small></span></button>
                                </div>
                            </div>
                        </section>
                        <section class="sm-welcome-showcase">
                            <div class="sm-welcome-video-wrap">
                                <div class="sm-welcome-video-head">
                                    <div><span class="sm-welcome-chip">GETTING STARTED</span><strong>SM Engine Overview</strong></div>
                                    <a href="https://youtube.com/@medelbou3" target="_blank" rel="noopener noreferrer">More videos <i class="fa-solid fa-arrow-up-right-from-square"></i></a>
                                </div>
                                <div class="sm-welcome-video">
                                    <iframe src="https://www.youtube.com/embed/EY7ggEMSEGI" title="SM Engine introduction" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                                </div>
                            </div>
                            <div class="sm-welcome-features">
                                <div class="sm-welcome-feature">
                                    <i class="fa-solid fa-shapes"></i>
                                    <div><strong>3D Modeling</strong><span>Modeling, sculpting and architecture workflows.</span></div>
                                </div>
                                <div class="sm-welcome-feature">
                                    <i class="fa-solid fa-diagram-project"></i>
                                    <div><strong>Node Workflows</strong><span>Material, geometry and visual graph systems.</span></div>
                                </div>
                                <div class="sm-welcome-feature">
                                    <i class="fa-solid fa-cubes-stacked"></i>
                                    <div><strong>Game Runtime</strong><span>Physics, components, player and runtime systems.</span></div>
                                </div>
                                <div class="sm-welcome-feature">
                                    <i class="fa-solid fa-film"></i>
                                    <div><strong>Animation & Media</strong><span>Timeline, sequencer and video-oriented tools.</span></div>
                                </div>
                            </div>
                        </section>
                    </div>
                    <footer class="sm-welcome-footer">
                        <label class="sm-welcome-preference">
                            <input type="checkbox" id="dont-show-again-checkbox">
                            <span class="sm-welcome-checkmark" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
                            <span>Don't show this window on startup</span>
                        </label>
                        <div class="sm-welcome-footer-actions">
                            <a href="https://github.com/medelbou3/SM-Engine" target="_blank" rel="noopener noreferrer" class="sm-welcome-text-link"><i class="fa-brands fa-github"></i> GitHub</a>
                            <button class="sm-welcome-continue" type="button" data-welcome-action="start">Continue to Editor <i class="fa-solid fa-arrow-right"></i></button>
                        </div>
                    </footer>
                </section>
            </div>`;
        },
        open(){
            if(!this.modal)return false;
            this.previouslyFocused=document.activeElement;
            document.body.classList.add('sm-welcome-open');
            this.modal.classList.add('is-visible');
            this.modal.setAttribute('aria-hidden','false');
            this._refreshFocusables();
            requestAnimationFrame(()=>this.modal.querySelector('[data-welcome-action="start"]')?.focus());
            window.dispatchEvent(new CustomEvent('sm:welcome-opened',{detail:{modal:this}}));
            return true;
        },
        close(options={}){
            if(!this.modal)return false;
            if(this.checkbox?.checked||options.remember===true)this._setHiddenPreference(true);
            this.modal.classList.remove('is-visible');
            this.modal.setAttribute('aria-hidden','true');
            document.body.classList.remove('sm-welcome-open');
            const iframe=this.modal.querySelector('iframe');
            if(iframe){
                const src=iframe.src;
                iframe.src='';
                iframe.src=src;
            }
            if(this.previouslyFocused&&typeof this.previouslyFocused.focus==='function'){
                try{this.previouslyFocused.focus();}catch{}
            }
            window.dispatchEvent(new CustomEvent('sm:welcome-closed',{detail:{modal:this}}));
            return true;
        },
        resetPreference(){
            try{localStorage.removeItem(STORAGE_KEY);}catch{}
            if(this.checkbox)this.checkbox.checked=false;
            return true;
        },
        shouldShow(){
            try{return localStorage.getItem(STORAGE_KEY)!=='true';}catch{return true;}
        },
        _setHiddenPreference(hidden){
            try{
                if(hidden)localStorage.setItem(STORAGE_KEY,'true');
                else localStorage.removeItem(STORAGE_KEY);
            }catch(error){
                console.warn('[WelcomeModal] localStorage is unavailable.',error);
            }
        },
        _autoOpen(){
            if(!this.shouldShow())return;
            window.setTimeout(()=>this.open(),250);
        },
        _bind(){
            this.modal.addEventListener('click',event=>{
                const action=event.target.closest('[data-welcome-action]')?.dataset?.welcomeAction;
                if(action)this._handleAction(action);
                if(event.target===this.modal)this.close();
            });
            this._onKeyDown=event=>{
                if(!this.modal.classList.contains('is-visible'))return;
                if(event.key==='Escape'){
                    event.preventDefault();
                    this.close();
                    return;
                }
                if(event.key==='Tab')this._trapTab(event);
            };
            document.addEventListener('keydown',this._onKeyDown);
        },
        _handleAction(action){
            switch(action){
                case'close':
                case'start':
                    this.close();
                    break;
                case'new-project':
                    this.close();
                    window.dispatchEvent(new CustomEvent('sm:welcome-new-project'));
                    if(typeof window.createNewProject==='function')window.createNewProject();
                    else if(typeof window.newProject==='function')window.newProject();
                    break;
                case'open-project':
                    this.close();
                    window.dispatchEvent(new CustomEvent('sm:welcome-open-project'));
                    if(typeof window.openProject==='function')window.openProject();
                    else if(typeof window.loadProject==='function')window.loadProject();
                    break;
            }
        },
        _refreshFocusables(){
            this.focusables=Array.from(this.modal.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),iframe,[tabindex]:not([tabindex="-1"])')).filter(element=>element.offsetParent!==null);
        },
        _trapTab(event){
            this._refreshFocusables();
            if(!this.focusables.length)return;
            const first=this.focusables[0];
            const last=this.focusables[this.focusables.length-1];
            if(event.shiftKey&&document.activeElement===first){
                last.focus();
                event.preventDefault();
            }else if(!event.shiftKey&&document.activeElement===last){
                first.focus();
                event.preventDefault();
            }
        },
        debug(){
            const state={initialized:this.initialized,visible:Boolean(this.modal?.classList.contains('is-visible')),shouldShow:this.shouldShow(),focusables:this.focusables.length};
            console.log('[WelcomeModal]',state);
            return state;
        }
    };
    window.WelcomeModal=WelcomeModal;
    window.openWelcomeModal=()=>WelcomeModal.open();
    window.closeWelcomeModal=()=>WelcomeModal.close();
    window.resetWelcomeModalPreference=()=>WelcomeModal.resetPreference();
    const boot=()=>WelcomeModal.init();
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
    else boot();
})();
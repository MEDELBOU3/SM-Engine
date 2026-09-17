/**
 * MediaPoolManager.js — professional media ingest for SM Engine Video Editing.
 * Generates lightweight thumbnails, source metadata and audio peak data used
 * directly by the SequencerRenderer. No external dependencies.
 */
class MediaPoolManager {
    constructor() {
        this.media = [];
        this.filter = 'all';
        this.grid = document.getElementById('media-pool-grid');
        this.input = document.getElementById('media-upload-input');
        this._audioContext = null;
        this._bind();
        this.render();
    }
    _bind() {
        document.getElementById('import-media-btn')?.addEventListener('click', () => this.input?.click());
        this.input?.addEventListener('change', e => { this.importFiles(e.target.files); this.input.value=''; });
        document.querySelectorAll('#media-pool-content .media-pool-filters .panel-button-set').forEach(btn => btn.addEventListener('click', () => this.setFilter(btn.textContent.trim().toLowerCase())));
        document.getElementById('media-pool-header')?.addEventListener('click', () => this.toggleCollapsed());
        this.grid?.addEventListener('dragover', e => e.preventDefault());
        this.grid?.addEventListener('drop', e => { e.preventDefault(); this.importFiles(e.dataTransfer.files); });
        document.getElementById('media-pool-content')?.addEventListener('click', e => { const cell=e.target.closest('.media-item'); if(cell)this.addToCanvas(cell.dataset.id); });
    }
    toggleCollapsed() {
        const content=document.getElementById('media-pool-content');
        const icon=document.querySelector('#media-pool-header .expand-button i');
        if(!content)return;
        const collapsed=content.style.display==='none';
        content.style.display=collapsed?'':'none';
        icon?.classList.toggle('fa-caret-right',!collapsed);icon?.classList.toggle('fa-caret-down',collapsed);
    }
    triggerImport(){this.input?.click();}
    importFiles(fileList) {
        const files=Array.from(fileList||[]);if(!files.length)return;
        files.forEach(file=>{
            const mediaType=file.type.startsWith('video/')?'video':file.type.startsWith('image/')?'image':file.type.startsWith('audio/')?'audio':null;
            if(!mediaType)return;
            const entry={id:`media-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name:file.name,mediaType,type:'media',mimeType:file.type||'',src:URL.createObjectURL(file),file,duration:0,mediaWidth:0,mediaHeight:0,thumb:null,thumbnails:[],audioPeaks:null,status:'loading'};
            this.media.push(entry);
            this._hydrateEntry(entry,file).catch(err=>{console.warn('[MediaPool] metadata failed:',file.name,err);entry.status='ready';this.render();});
        });
        this.render();
    }
    async _hydrateEntry(entry,file){
        if(entry.mediaType==='image')await this._hydrateImage(entry);
        else if(entry.mediaType==='video')await this._hydrateVideo(entry);
        else if(entry.mediaType==='audio')await this._hydrateAudio(entry,file);
        entry.status='ready';
        const mgr=window.videoEditingManager;
        const instances=mgr?.items?.filter?.(it=>it.sourceMediaId===entry.id)||[];
        instances.forEach(it=>{
            it.duration=entry.duration||it.duration||0;
            it.sourceDuration=entry.duration||it.sourceDuration||0;
            it.mediaWidth=entry.mediaWidth||it.mediaWidth||0;
            it.mediaHeight=entry.mediaHeight||it.mediaHeight||0;
            if(entry.thumb)it.thumb=entry.thumb;
            if(Array.isArray(entry.thumbnails)&&entry.thumbnails.length)it.thumbnails=entry.thumbnails.slice();
            if(entry.audioPeaks)it.audioPeaks=entry.audioPeaks;
        });
        const seq=window.sequencerManager;
        if(seq?.state?.clips){
            const instanceIds=new Set(instances.map(it=>it.id));
            seq.state.clips.filter(c=>instanceIds.has(c.mediaRef)).forEach(c=>{
                const wasDefault=!c.sourceDuration&&Math.abs((c.duration||0)-4)<0.001;
                c.sourceDuration=entry.duration||c.sourceDuration||0;
                c.mediaWidth=entry.mediaWidth||c.mediaWidth||0;
                c.mediaHeight=entry.mediaHeight||c.mediaHeight||0;
                if(entry.thumb)c.thumb=entry.thumb;
                if(Array.isArray(entry.thumbnails)&&entry.thumbnails.length)c.thumbnails=entry.thumbnails.slice();
                if(entry.audioPeaks)c.audioPeaks=entry.audioPeaks;
                if(wasDefault&&entry.duration>0){c.duration=entry.duration;c.sourceOut=c.sourceIn+c.duration;}
            });
            seq.renderer?.render?.();
        }
        mgr?.renderCompositeAt?.(seq?.state?.playhead??mgr.currentTime??0);
        this.render();
    }
    _captureSource(source,w,h,targetW=180,targetH=100){
        if(!w||!h)return null;
        const cv=document.createElement('canvas');cv.width=targetW;cv.height=targetH;
        const ctx=cv.getContext('2d');if(!ctx)return null;
        const scale=Math.max(targetW/w,targetH/h),dw=w*scale,dh=h*scale,dx=(targetW-dw)/2,dy=(targetH-dh)/2;
        ctx.fillStyle='#111';ctx.fillRect(0,0,targetW,targetH);ctx.drawImage(source,dx,dy,dw,dh);
        try{return cv.toDataURL('image/jpeg',.72);}catch(_){return null;}
    }
    _hydrateImage(entry){
        return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{entry.mediaWidth=img.naturalWidth;entry.mediaHeight=img.naturalHeight;entry.thumb=this._captureSource(img,img.naturalWidth,img.naturalHeight)||entry.src;entry.thumbnails=[entry.thumb];resolve();};img.onerror=reject;img.src=entry.src;});
    }
    _hydrateVideo(entry){
        return new Promise((resolve,reject)=>{
            const v=document.createElement('video');v.muted=true;v.defaultMuted=true;v.playsInline=true;v.preload='auto';if(entry.mimeType&&v.canPlayType&&v.canPlayType(entry.mimeType)===''){entry.codecWarning=`Browser reports ${entry.mimeType} may be unsupported`;console.warn('[MediaPool]',entry.codecWarning,entry.name);}v.src=entry.src;v.load();
            let done=false;
            const finish=()=>{if(done)return;done=true;entry.thumb=entry.thumbnails[0]||entry.thumb;resolve();};
            v.addEventListener('loadedmetadata',async()=>{
                entry.duration=Number.isFinite(v.duration)?v.duration:0;entry.mediaWidth=v.videoWidth||0;entry.mediaHeight=v.videoHeight||0;
                const duration=Math.max(.01,entry.duration||1);const sampleCount=Math.min(8,Math.max(3,Math.ceil(duration/4)));
                const times=Array.from({length:sampleCount},(_,i)=>Math.min(Math.max(.01,duration*(i/(sampleCount-1||1))),Math.max(.01,duration-.03)));
                for(const t of times){
                    try{await this._seekVideo(v,t);const thumb=this._captureSource(v,v.videoWidth,v.videoHeight);if(thumb)entry.thumbnails.push(thumb);}catch(_){break;}
                }
                finish();
            },{once:true});
            v.addEventListener('error',reject,{once:true});
            setTimeout(finish,7000);
        });
    }
    _seekVideo(video,time){return new Promise((resolve,reject)=>{const onSeek=()=>{cleanup();resolve();};const onErr=()=>{cleanup();reject(new Error('seek failed'));};const cleanup=()=>{video.removeEventListener('seeked',onSeek);video.removeEventListener('error',onErr);};video.addEventListener('seeked',onSeek,{once:true});video.addEventListener('error',onErr,{once:true});try{video.currentTime=time;}catch(err){cleanup();reject(err);}});}
    async _hydrateAudio(entry,file){
        const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
        this._audioContext=this._audioContext||new Ctx();
        const buf=await file.arrayBuffer();const audio=await this._audioContext.decodeAudioData(buf.slice(0));entry.duration=audio.duration||0;
        const channel=audio.getChannelData(0);const bucketCount=1600;const stride=Math.max(1,Math.floor(channel.length/bucketCount));const peaks=new Float32Array(Math.min(bucketCount,Math.ceil(channel.length/stride)));
        for(let i=0;i<peaks.length;i++){const start=i*stride,end=Math.min(channel.length,start+stride);let peak=0;for(let j=start;j<end;j++)peak=Math.max(peak,Math.abs(channel[j]));peaks[i]=peak;}
        entry.audioPeaks=peaks;
    }
    setFilter(filter){if(!['all','video','image','audio'].includes(filter))return;this.filter=filter;document.querySelectorAll('#media-pool-content .media-pool-filters .panel-button-set').forEach(btn=>btn.classList.toggle('active',btn.textContent.trim().toLowerCase()===filter));this.render();}
    render(){
        if(!this.grid)return;this.grid.innerHTML='';
        if(!this.media.length){const e=document.createElement('div');e.setAttribute('data-media-empty','');e.textContent='No media imported.';this.grid.appendChild(e);return;}
        const visible=this.media.filter(m=>this.filter==='all'||m.mediaType===this.filter);if(!visible.length){const e=document.createElement('div');e.setAttribute('data-media-empty','');e.textContent='No media in this category.';this.grid.appendChild(e);return;}
        visible.forEach(entry=>this.grid.appendChild(this._buildCell(entry)));
    }
    _buildCell(entry){
        const cell=document.createElement('div');cell.className='media-item';cell.dataset.id=entry.id;cell.title=`Add "${entry.name}" to timeline`;
        const preview=document.createElement('div');preview.className='media-item-preview';
        if(entry.thumb){const img=document.createElement('img');img.src=entry.thumb;img.loading='lazy';img.alt=entry.name;preview.appendChild(img);}
        else if(entry.mediaType==='image'){const img=document.createElement('img');img.src=entry.src;img.loading='lazy';img.alt=entry.name;preview.appendChild(img);}
        else if(entry.mediaType==='video'){const video=document.createElement('video');video.src=entry.src;video.muted=true;video.playsInline=true;video.preload='metadata';preview.appendChild(video);}
        else preview.innerHTML='<i class="fas fa-music media-audio-icon"></i>';
        const name=document.createElement('div');name.className='media-item-name';name.textContent=entry.name;name.title=entry.name;
        const meta=document.createElement('div');meta.className='media-item-meta';meta.style.cssText='font-size:9px;color:#737c89;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        const dur=entry.duration?this._time(entry.duration):'';meta.textContent=[entry.mediaType.toUpperCase(),dur,entry.mediaWidth?`${entry.mediaWidth}×${entry.mediaHeight}`:'',entry.status==='loading'?'Analyzing…':''].filter(Boolean).join(' • ');
        cell.append(preview,name,meta);return cell;
    }
    _time(t){const m=Math.floor(t/60),s=Math.floor(t%60),f=Math.floor((t%1)*30);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(f).padStart(2,'0')}`;}
    addToCanvas(id){const entry=this.media.find(m=>m.id===id);if(!entry)return;const mgr=window.ensureVideoEditingManager();if(!mgr.active)mgr.enter();const result=mgr.addMedia(entry);this.grid?.querySelectorAll('.media-item.selected').forEach(c=>c.classList.remove('selected'));this.grid?.querySelector(`[data-id="${id}"]`)?.classList.add('selected');return result;}
}
window.MediaPoolManager=MediaPoolManager;
window.ensureMediaPoolManager=function(){if(!window.mediaPoolManager)window.mediaPoolManager=new MediaPoolManager();return window.mediaPoolManager;};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>window.ensureMediaPoolManager());else window.ensureMediaPoolManager();
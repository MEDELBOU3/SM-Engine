/*
 * SMTilemapSystem.js - SpriteMind 2D Tilemap runtime/editor data system.
 * AssetsPanel stays the single source of project assets. Tilemaps reference
 * an asset id; they never copy or move the source image.
 */
(() => {
  'use strict';
  const W = window;
  if (!W.THREE) { console.warn('[SMTilemapSystem] THREE is not available.'); return; }
  const T = W.THREE;
  const VERSION = '1.2.0';
  const DEF = { tileWidth:32, tileHeight:32, mapWidth:128, mapHeight:128, ppu:32 };
  const uid = p => `${p||'id'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const int = (v,d,min=1,max=10000) => { const n=Number(v); return Number.isFinite(n)?Math.max(min,Math.min(max,Math.floor(n))):d; };

  class SMTilemapSystem {
    constructor(){
      this.version=VERSION; this.tilemaps=new Map(); this.activeTilemapId=null;
      this._images=new Map(); this._textures=new Map();
      W.SMTilemapSystem=this; W.smTilemapSystem=this; W.SM_TILEMAP_VERSION=VERSION;
      this._installIntegration();
      console.log('[SMTilemapSystem] v'+VERSION+' ready');
    }

    /* ---------- AssetsPanel adapter ---------- */
    findAsset(id){
      if(!id) return null;
      const panels=[W.AssetsPanel,W.assetsPanel,W.SMAssetsPanel,W.assetManager,W.assetsManager];
      for(const p of panels){
        if(!p) continue;
        try{
          for(const m of ['getAssetById','findAssetById']) if(typeof p[m]==='function'){ const a=p[m](id); if(a) return a; }
          const list=p.assets||p.assetList||p.items;
          if(Array.isArray(list)){ const a=list.find(x=>String(x?.id??x?.assetId??'')===String(id)); if(a) return a; }
        }catch(e){ console.warn('[SMTilemapSystem] asset lookup failed',e); }
      }
      return null;
    }
    async resolveSource(input){
      if(!input) return null;
      const a=typeof input==='string'?this.findAsset(input):input;
      if(typeof input==='string' && !a && /^(blob:|data:|https?:|file:)/i.test(input)) return input;
      if(!a) return null;
      const direct=[a.sourceURL,a.sourceUrl,a.dataURL,a.url,a.src,a.data,a.blob,a.file,a.source];
      for(const v of direct){ if(typeof v==='string'||(typeof Blob!=='undefined'&&v instanceof Blob)) return v; if(v?.url) return v.url; }
      const id=a.id||a.assetId||a.storageKey;
      const p=W.AssetsPanel||W.assetsPanel||W.SMAssetsPanel;
      const s=p?.storage||p?.assetStorage||W.assetStorage||W.SMAssetStorage;
      for(const owner of [s,p]) if(owner&&id) for(const m of ['resolveAssetData','resolveAssetSource','getAssetSource','getBlob','getFile','loadBlob','readBlob']){
        if(typeof owner[m]!=='function') continue;
        try{ const v=await owner[m](id,a); if(typeof v==='string'||(typeof Blob!=='undefined'&&v instanceof Blob)) return v; if(v?.url) return v.url; }catch(e){}
      }
      return null; // thumbnail is intentionally not used as tile source
    }
    async loadImage(source,key){
      if(key&&this._images.has(key)) return this._images.get(key);
      const promise=new Promise((resolve,reject)=>{
        let url=source, revoke=false;
        if(typeof Blob!=='undefined'&&source instanceof Blob){ url=URL.createObjectURL(source); revoke=true; }
        if(typeof source!=='string'){ reject(new Error('Unsupported tileset source')); return; }
        const img=new Image(); img.crossOrigin='anonymous';
        const timer=setTimeout(()=>{ if(revoke)URL.revokeObjectURL(url); reject(new Error('Tileset load timeout')); },15000);
        img.onload=()=>{clearTimeout(timer);if(revoke)URL.revokeObjectURL(url);resolve(img);};
        img.onerror=()=>{clearTimeout(timer);if(revoke)URL.revokeObjectURL(url);reject(new Error('Tileset image decode failed'));};
        img.src=url;
      });
      if(key)this._images.set(key,promise); return promise;
    }

    /* ---------- model ---------- */
    _layer(name,w,h){ return {id:uid('layer'),name:name||'Layer',visible:true,locked:false,opacity:1,zIndex:0,tiles:new Int32Array(w*h).fill(-1)}; }
    create(options={}){
      const w=int(options.width??options.mapWidth,DEF.mapWidth), h=int(options.height??options.mapHeight,DEF.mapHeight);
      const tw=int(options.tileWidth,DEF.tileWidth,1,4096), th=int(options.tileHeight,DEF.tileHeight,1,4096);
      const tm={id:options.id||uid('tilemap'),name:options.name||'Tilemap',version:1,width:w,height:h,tileWidth:tw,tileHeight:th,
        pixelsPerUnit:Number(options.pixelsPerUnit)||DEF.ppu,tilesetAssetId:options.tilesetAssetId||options.assetId||null,tilesetName:'',
        tilesetColumns:0,tilesetRows:0,tilesetImageWidth:0,tilesetImageHeight:0,layers:[],activeLayerId:null,object:null,_renderRoot:null,_texture:null,dirty:false};
      const names=Array.isArray(options.layers)&&options.layers.length?options.layers:['Ground'];
      names.forEach((n,i)=>{const l=this._layer(n,w,h);l.zIndex=i;tm.layers.push(l);}); tm.activeLayerId=tm.layers[0].id;
      this.tilemaps.set(tm.id,tm); this.activeTilemapId=tm.id;
      if(options.object)this.attach(tm,options.object);
      this.emit('sm:tilemap-created',{tilemap:tm,object:tm.object});
      return tm;
    }
    get(id=this.activeTilemapId){return id?this.tilemaps.get(id)||null:null;}
    coerce(v){if(!v)return null;if(typeof v==='string')return this.get(v);return v.layers&&v.width?v:null;}
    layer(tm,id){return tm.layers.find(l=>l.id===(id||tm.activeLayerId))||null;}
    addLayer(v,name='Layer'){const tm=this.coerce(v);if(!tm)return null;const l=this._layer(name,tm.width,tm.height);l.zIndex=tm.layers.length;tm.layers.push(l);tm.activeLayerId=l.id;tm.dirty=true;this.render(tm);return l;}
    removeLayer(v,id){const tm=this.coerce(v);if(!tm||tm.layers.length<=1)return false;const i=tm.layers.findIndex(l=>l.id===id);if(i<0)return false;tm.layers.splice(i,1);tm.layers.forEach((l,n)=>l.zIndex=n);tm.activeLayerId=tm.layers[Math.max(0,i-1)].id;tm.dirty=true;this.render(tm);return true;}
    setActiveLayer(v,id){const tm=this.coerce(v);if(!tm||!tm.layers.some(l=>l.id===id))return false;tm.activeLayerId=id;this.emit('sm:tilemap-layer-selected',{tilemap:tm,layerId:id});return true;}

    /* ---------- tileset ---------- */
    async setTileset(v,input,options={}){
      const tm=this.coerce(v);if(!tm)throw Error('Tilemap not found');
      const a=typeof input==='string'?this.findAsset(input):input, source=await this.resolveSource(input);
      if(!source)throw Error('Could not resolve original tileset image from AssetsPanel');
      const key=a?.id||a?.assetId||(typeof input==='string'?input:null), img=await this.loadImage(source,key);
      tm.tileWidth=int(options.tileWidth,tm.tileWidth,1,4096);tm.tileHeight=int(options.tileHeight,tm.tileHeight,1,4096);
      tm.tilesetAssetId=a?.id||a?.assetId||(typeof input==='string'?input:null);tm.tilesetName=a?.name||options.name||'';
      tm.tilesetImageWidth=img.naturalWidth||img.width;tm.tilesetImageHeight=img.naturalHeight||img.height;
      tm.tilesetColumns=Math.max(1,Math.floor(tm.tilesetImageWidth/tm.tileWidth));tm.tilesetRows=Math.max(1,Math.floor(tm.tilesetImageHeight/tm.tileHeight));
      const tex=new T.Texture(img);tex.needsUpdate=true;tex.magFilter=T.NearestFilter;tex.minFilter=T.NearestFilter;tex.generateMipmaps=false;tex.wrapS=T.ClampToEdgeWrapping;tex.wrapT=T.ClampToEdgeWrapping;
      if('colorSpace' in tex&&T.SRGBColorSpace)tex.colorSpace=T.SRGBColorSpace; else if('encoding' in tex&&T.sRGBEncoding)tex.encoding=T.sRGBEncoding;
      this._textures.set(key||tm.id,tex);tm._texture=tex;tm.dirty=true;this.render(tm);this.emit('sm:tilemap-tileset-changed',{tilemap:tm});return tm;
    }

    /* ---------- editing ---------- */
    valid(tm,x,y){return x>=0&&y>=0&&x<tm.width&&y<tm.height;}
    setTile(v,x,y,tile,layerId=null){const tm=this.coerce(v),l=tm&&this.layer(tm,layerId);x=Math.floor(x);y=Math.floor(y);if(!tm||!l||l.locked||!this.valid(tm,x,y))return false;l.tiles[y*tm.width+x]=Number.isFinite(Number(tile))?Math.floor(Number(tile)):-1;tm.dirty=true;this.render(tm);this.emit('sm:tilemap-changed',{tilemap:tm,x,y,tileIndex:l.tiles[y*tm.width+x],layerId:l.id});return true;}
    getTile(v,x,y,layerId=null){const tm=this.coerce(v),l=tm&&this.layer(tm,layerId);return tm&&l&&this.valid(tm,x,y)?l.tiles[Math.floor(y)*tm.width+Math.floor(x)]:-1;}
    paint(v,x,y,tile,radius=0,layerId=null){const tm=this.coerce(v),l=tm&&this.layer(tm,layerId);if(!tm||!l||l.locked)return false;const r=Math.max(0,Math.floor(radius));for(let yy=Math.floor(y)-r;yy<=Math.floor(y)+r;yy++)for(let xx=Math.floor(x)-r;xx<=Math.floor(x)+r;xx++)if(this.valid(tm,xx,yy)&&((xx-x)**2+(yy-y)**2<=r*r))l.tiles[yy*tm.width+xx]=tile;tm.dirty=true;this.render(tm);return true;}
    erase(v,x,y,r=0,l=null){return this.paint(v,x,y,-1,r,l);}
    fill(v,sx,sy,tile,layerId=null){const tm=this.coerce(v),l=tm&&this.layer(tm,layerId);sx=Math.floor(sx);sy=Math.floor(sy);if(!tm||!l||l.locked||!this.valid(tm,sx,sy))return false;const old=l.tiles[sy*tm.width+sx],next=Number(tile);if(old===next)return true;const q=[[sx,sy]],seen=new Uint8Array(tm.width*tm.height);while(q.length){const [x,y]=q.pop();if(!this.valid(tm,x,y))continue;const i=y*tm.width+x;if(seen[i]||l.tiles[i]!==old)continue;seen[i]=1;l.tiles[i]=next;q.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);}tm.dirty=true;this.render(tm);return true;}
    resize(v,w,h){const tm=this.coerce(v);w=int(w,tm?.width||1);h=int(h,tm?.height||1);if(!tm)return false;for(const l of tm.layers){const n=new Int32Array(w*h).fill(-1);for(let y=0;y<Math.min(h,tm.height);y++)for(let x=0;x<Math.min(w,tm.width);x++)n[y*w+x]=l.tiles[y*tm.width+x];l.tiles=n;}tm.width=w;tm.height=h;tm.dirty=true;this.render(tm);return true;}

    /* ---------- rendering: one batched mesh per layer ---------- */
    attach(v,obj){const tm=this.coerce(v);if(!tm||!obj)return null;tm.object=obj;tm._renderRoot=tm._renderRoot||new T.Group();tm._renderRoot.name=tm.name+'_Tiles';if(tm._renderRoot.parent!==obj)obj.add(tm._renderRoot);obj.userData=obj.userData||{};obj.userData.is2DObject=true;obj.userData.is2DTilemap=true;obj.userData.smComponent='Tilemap';obj.userData.tilemapId=tm.id;this.render(tm);return obj;}
    createGameObject(options={}){const scene=options.scene||W.scene;if(!scene)throw Error('No scene available');const o=new T.Group();o.name=options.name||'Tilemap';o.position.set(Number(options.x)||0,Number(options.y)||0,Number(options.z)||0);o.userData={...(options.userData||{}),is2DObject:true,is2DTilemap:true,smComponent:'Tilemap',layer2D:options.layer2D||'midground'};scene.add(o);const tm=this.create({...options,name:o.name,object:o});o.userData.tilemapId=tm.id;o.userData.tilemap=this.serialize(tm);W.selectedObject=o;W.transformControls?.attach?.(o);W.updateHierarchy?.();this.emit('sm:object-selected',{object:o,tilemap:tm});this.emit('sm:tilemap-applied',{tilemap:tm,object:o});return o;}
    async addAssetTo2DGame(asset,options={}){const a=typeof asset==='string'?this.findAsset(asset):asset;const o=this.createGameObject({...options,name:options.name||a?.name||'Tilemap',tilesetAssetId:a?.id||a?.assetId||(typeof asset==='string'?asset:null)});const tm=this.get(o.userData.tilemapId);await this.setTileset(tm,a||asset,{tileWidth:options.tileWidth||tm.tileWidth,tileHeight:options.tileHeight||tm.tileHeight});o.userData.tilemap=this.serialize(tm);W.selectedObject=o;W.transformControls?.attach?.(o);W.updateHierarchy?.();W.updateInspector?.();return o;}
    _buildLayer(tm,l,li){const cols=tm.tilesetColumns,rows=tm.tilesetRows;if(!tm._texture||!cols||!rows)return null;const ppu=Math.max(.0001,tm.pixelsPerUnit),cw=tm.tileWidth/ppu,ch=tm.tileHeight/ppu,pos=[],uv=[],ind=[];let v=0;for(let y=0;y<tm.height;y++)for(let x=0;x<tm.width;x++){const tile=l.tiles[y*tm.width+x];if(tile<0)continue;const tx=tile%cols,ty=Math.floor(tile/cols);if(tx<0||ty<0||tx>=cols||ty>=rows)continue;const x0=x*cw-tm.width*cw/2,x1=x0+cw,y1=(tm.height-y)*ch-tm.height*ch/2,y0=y1-ch,u0=tx/cols,u1=(tx+1)/cols,v1=1-ty/rows,v0=1-(ty+1)/rows;pos.push(x0,y0,0,x1,y0,0,x1,y1,0,x0,y1,0);uv.push(u0,v0,u1,v0,u1,v1,u0,v1);ind.push(v,v+1,v+2,v,v+2,v+3);v+=4;}if(!v)return null;const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ind);g.computeBoundingSphere();const m=new T.MeshBasicMaterial({map:tm._texture,transparent:true,opacity:Math.max(0,Math.min(1,Number(l.opacity)||0)),side:T.DoubleSide,depthTest:true,depthWrite:true});const mesh=new T.Mesh(g,m);mesh.name='TilemapLayer_'+l.name;mesh.position.z=l.zIndex*.01;mesh.renderOrder=li;mesh.userData={is2DTilemapLayer:true,tilemapId:tm.id,layerId:l.id};return mesh;}
    render(v){const tm=this.coerce(v);if(!tm||!tm._renderRoot)return false;while(tm._renderRoot.children.length){const c=tm._renderRoot.children.pop();c.traverse?.(o=>{o.geometry?.dispose?.();o.material?.dispose?.();});}if(tm._texture)for(const l of [...tm.layers].sort((a,b)=>a.zIndex-b.zIndex))if(l.visible){const m=this._buildLayer(tm,l,l.zIndex);if(m)tm._renderRoot.add(m);}this.syncObjectData(tm);return true;}
    syncObjectData(tm){if(!tm?.object)return;tm.object.userData.tilemap=this.serialize(tm);tm.object.userData.tilemapId=tm.id;}

    /* ---------- coordinates + persistence ---------- */
    worldToCell(v,wx,wy){const tm=this.coerce(v);if(!tm)return null;const p=Number(tm.pixelsPerUnit)||DEF.ppu,cw=tm.tileWidth/p,ch=tm.tileHeight/p;const q=new T.Vector3(wx,wy,0);tm.object?.worldToLocal(q);const x=Math.floor((q.x+tm.width*cw/2)/cw),y=Math.floor((tm.height*ch/2-q.y)/ch);return{x,y,inside:this.valid(tm,x,y)};}
    cellToWorld(v,x,y){const tm=this.coerce(v);if(!tm)return null;const p=Number(tm.pixelsPerUnit)||DEF.ppu,cw=tm.tileWidth/p,ch=tm.tileHeight/p;const q=new T.Vector3(x*cw+cw/2-tm.width*cw/2,tm.height*ch/2-y*ch-ch/2,0);tm.object?.localToWorld(q);return q;}
    encode(a){const out=[];let last=null,n=0;for(const v of a){if(v===last)n++;else{if(last!==null)out.push([last,n]);last=v;n=1;}}if(last!==null)out.push([last,n]);return out;}
    decode(a,len){const out=new Int32Array(len).fill(-1);let p=0;for(const pair of Array.isArray(a)?a:[]){const v=Number(pair?.[0]),n=Math.max(0,Math.floor(Number(pair?.[1])||0));for(let i=0;i<n&&p<len;i++)out[p++]=Number.isFinite(v)?v:-1;}return out;}
    serialize(v){const tm=this.coerce(v);if(!tm)return null;return{type:'SMTilemap',version:1,id:tm.id,name:tm.name,width:tm.width,height:tm.height,tileWidth:tm.tileWidth,tileHeight:tm.tileHeight,pixelsPerUnit:tm.pixelsPerUnit,tilesetAssetId:tm.tilesetAssetId,tilesetName:tm.tilesetName,tilesetColumns:tm.tilesetColumns,tilesetRows:tm.tilesetRows,tilesetImageWidth:tm.tilesetImageWidth,tilesetImageHeight:tm.tilesetImageHeight,activeLayerId:tm.activeLayerId,layers:tm.layers.map(l=>({id:l.id,name:l.name,visible:l.visible,locked:l.locked,opacity:l.opacity,zIndex:l.zIndex,tiles:this.encode(l.tiles)}))};}
    deserialize(d,options={}){const tm=this.create({...d,id:d.id,name:d.name,width:d.width,height:d.height,tileWidth:d.tileWidth,tileHeight:d.tileHeight,pixelsPerUnit:d.pixelsPerUnit,tilesetAssetId:d.tilesetAssetId,layers:[]});tm.layers=(d.layers?.length?d.layers:[{name:'Ground',tiles:[]}]).map((s,i)=>{const l=this._layer(s.name||'Layer '+(i+1),tm.width,tm.height);l.id=s.id||uid('layer');l.visible=s.visible!==false;l.locked=s.locked===true;l.opacity=Number.isFinite(Number(s.opacity))?Number(s.opacity):1;l.zIndex=Number.isFinite(Number(s.zIndex))?Number(s.zIndex):i;l.tiles=this.decode(s.tiles,tm.width*tm.height);return l;});tm.activeLayerId=d.activeLayerId&&tm.layers.some(l=>l.id===d.activeLayerId)?d.activeLayerId:tm.layers[0].id;if(options.object)this.attach(tm,options.object);if(d.tilesetAssetId)this.setTileset(tm,d.tilesetAssetId).catch(e=>console.warn('[SMTilemapSystem] restore tileset failed',e));return tm;}

    emit(name,detail){try{W.dispatchEvent(new CustomEvent(name,{detail}));}catch(e){}}
    _installIntegration(){
      W.create2DTilemap=(o={})=>this.createGameObject(o);
      W.addAssetTo2DGameAsTilemap=(a,o={})=>this.addAssetTo2DGame(a,o);
      W.openTilemapEditor=(tm=null)=>{this.emit('sm:open-tilemap-editor',{tilemap:this.coerce(tm)});return this.coerce(tm);};
      // AssetsPanel -> 2D Game Mode bridge. It only reacts to elements carrying an asset id.
      document.addEventListener('dragstart',e=>{const el=e.target?.closest?.('[data-sm-asset-id],[data-asset-id]');if(!el||!e.dataTransfer)return;const id=el.dataset.smAssetId||el.dataset.assetId;e.dataTransfer.setData('application/x-sm-asset-id',id);});
      document.addEventListener('drop',e=>{const target=e.target?.closest?.('[data-sm-2d-viewport],[data-2d-game-viewport],#sm-2d-viewport');if(!target||!e.dataTransfer)return;const id=e.dataTransfer.getData('application/x-sm-asset-id');if(!id)return;const a=this.findAsset(id);const type=String(a?.type||'').toLowerCase();if(!a||!(type.includes('image')||type.includes('texture')||type.includes('sprite')||/\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(a.name||'')))return;e.preventDefault();const r=target.getBoundingClientRect(),ppu=Number(W.sm2DViewportPixelsPerUnit)||DEF.ppu;this.addAssetTo2DGame(a,{x:(e.clientX-r.left-r.width/2)/ppu,y:(r.height/2-(e.clientY-r.top))/ppu}).catch(err=>console.error('[SMTilemapSystem] drop failed',err));});
    }
    dispose(){for(const tm of this.tilemaps.values()){tm._renderRoot?.traverse?.(o=>{o.geometry?.dispose?.();o.material?.dispose?.();});}for(const t of this._textures.values())t.dispose?.();this.tilemaps.clear();this._images.clear();this._textures.clear();}
  }

  if(W.SMTilemapSystem?.version&&W.SMTilemapSystem.version!==VERSION)try{W.SMTilemapSystem.dispose?.();}catch(e){}
  W.SMTilemapSystem=new SMTilemapSystem();
  W.smTilemapSystem=W.SMTilemapSystem;
})();

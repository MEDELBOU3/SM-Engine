(function(){
    'use strict';
    class SMComponentRegistry{
        constructor(){
            this.types=new Map();
            this.aliases=new Map();
            this.metadata=new Map();
            this._registerBuiltins();
        }
        register(type,ComponentClass,options={}){
            if(!type)throw new Error('SMComponentRegistry.register(type, ComponentClass) requires a type.');
            if(typeof ComponentClass!=='function')throw new TypeError(`Component "${type}" must be a constructor.`);
            const key=this._normalize(type);
            if(this.types.has(key)&&options.override!==true)throw new Error(`Component type "${type}" is already registered.`);
            const base=window.SMComponent;
            if(base&&ComponentClass!==base&&!(ComponentClass.prototype instanceof base))throw new TypeError(`Component "${type}" must extend SMComponent.`);
            ComponentClass.componentType=options.componentType||ComponentClass.componentType||String(type);
            if(options.executionOrder!==undefined)ComponentClass.executionOrder=Number(options.executionOrder)||0;
            this.types.set(key,ComponentClass);
            this.metadata.set(key,{type:String(type),displayName:options.displayName||String(type),category:options.category||'Gameplay',description:options.description||'',hidden:options.hidden===true,singleton:options.singleton===true,allowMultiple:options.allowMultiple!==false,version:Number(options.version||1),className:ComponentClass.name||String(type)});
            const aliases=[...(Array.isArray(options.aliases)?options.aliases:[]),ComponentClass.name,ComponentClass.componentType].filter(Boolean);
            for(const alias of aliases)this.aliases.set(this._normalize(alias),key);
            window.SMRuntimeEventBus?.emit?.('component-registry:registered',{registry:this,type:key,ComponentClass,metadata:this.metadata.get(key)});
            return ComponentClass;
        }
        unregister(type){
            const key=this.resolveType(type);
            if(!key||!this.types.has(key))return false;
            this.types.delete(key);
            this.metadata.delete(key);
            for(const[alias,target]of Array.from(this.aliases))if(target===key)this.aliases.delete(alias);
            window.SMRuntimeEventBus?.emit?.('component-registry:unregistered',{registry:this,type:key});
            return true;
        }
        has(type){
            const key=this.resolveType(type);
            return Boolean(key&&this.types.has(key));
        }
        getClass(type){
            const key=this.resolveType(type);
            return key?this.types.get(key)||null:null;
        }
        getMetadata(type){
            const key=this.resolveType(type);
            return key?this.metadata.get(key)||null:null;
        }
        resolveType(type){
            if(typeof type==='function'){
                for(const[key,ComponentClass]of this.types)if(ComponentClass===type)return key;
                const name=type.componentType||type.name;
                if(name)return this.resolveType(name);
                return null;
            }
            const key=this._normalize(type);
            if(this.types.has(key))return key;
            return this.aliases.get(key)||null;
        }
        create(type,options={}){
            const ComponentClass=this.getClass(type);
            if(!ComponentClass)throw new Error(`Unknown component type "${typeof type==='string'?type:type?.name||'Unknown'}".`);
            const component=new ComponentClass(options);
            if(!(component instanceof window.SMComponent))throw new TypeError(`Registered component "${type}" did not create an SMComponent.`);
            return component;
        }
        createFromDescriptor(descriptor={}){
            if(typeof descriptor==='string')return this.create(descriptor,{});
            if(!descriptor||typeof descriptor!=='object')throw new TypeError('Component descriptor must be a string or object.');
            const type=descriptor.type||descriptor.component||descriptor.className;
            if(!type)throw new Error('Component descriptor is missing "type".');
            const component=this.create(type,descriptor);
            component.deserialize?.(descriptor);
            return component;
        }
        serialize(component){
            if(!(component instanceof window.SMComponent))throw new TypeError('serialize(component) expects SMComponent.');
            return component.serialize();
        }
        list(options={}){
            const rows=[];
            for(const[key,ComponentClass]of this.types){
                const meta=this.metadata.get(key)||{};
                if(options.includeHidden!==true&&meta.hidden===true)continue;
                rows.push({key,type:meta.type||ComponentClass.componentType||ComponentClass.name,className:ComponentClass.name,category:meta.category||'Gameplay',displayName:meta.displayName||meta.type||key,allowMultiple:meta.allowMultiple!==false,singleton:meta.singleton===true,version:meta.version||1});
            }
            rows.sort((a,b)=>a.category.localeCompare(b.category)||a.displayName.localeCompare(b.displayName));
            return rows;
        }
        _registerBuiltins(){
            if(window.SMComponent)this.register('SMComponent',window.SMComponent,{hidden:true,aliases:['component'],override:true});
            if(window.SMBehaviour)this.register('SMBehaviour',window.SMBehaviour,{hidden:true,aliases:['behaviour','behavior'],override:true});
        }
        _normalize(value){
            return String(value||'').trim().toLowerCase().replace(/\s+/g,'-');
        }
        debug(){
            const rows=this.list({includeHidden:true});
            console.table(rows);
            return rows;
        }
    }
    const registry=new SMComponentRegistry();
    window.SMComponentRegistryClass=SMComponentRegistry;
    window.SMComponentRegistry=registry;
    window.smComponentRegistry=registry;
})();
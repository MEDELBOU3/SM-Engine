/**
 * MODIFIER MANAGER - Central hub for all modifier operations
 * Manages modifier stacks for all objects in the scene
 */
(function () {
    const root = window.SMModifiers = window.SMModifiers || {};

    class ModifierManager {
        constructor() {
            this.stacks = new Map(); // Map<objectUuid, ModifierStack>
            this.registry = new Map(); // Map<modifierType, ModifierClass>
            this.events = new EventTarget();
            this.selectedObject = null;
            this.updateQueue = [];
            this.isProcessing = false;
            
            this.initializeBuiltInModifiers();
            this.setupEventListeners();
        }

        // ===== INITIALIZATION =====
        initializeBuiltInModifiers() {
            // Register all built-in modifier types
            const modifierTypes = [
                // Generate
                'array', 'mirror', 'subdivision',
                // Deform
                'bend', 'twist', 'taper', 'lattice',
                // Modify
                'bevel', 'solidify', 'weld', 'decimate',
                // Simulate
                'cloth', 'softbody',
                // Procedural
                'noisedisplace', 'terrain', 'fractal'
            ];

            modifierTypes.forEach(type => {
                this.registerModifier(type, this.getModifierClass(type));
            });

            console.log('✓ Modifier Manager initialized with', modifierTypes.length, 'modifier types');
        }

        getModifierClass(type) {
            // This will be populated as modifier classes are loaded
            return root[this.typeToClassName(type)] || root.Modifier;
        }

        typeToClassName(type) {
            return type.split(/[-_]/).map((part, i) => 
                i === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : 
                part.charAt(0).toUpperCase() + part.slice(1)
            ).join('') + 'Modifier';
        }

        registerModifier(type, modifierClass) {
            this.registry.set(type, modifierClass);
        }

        setupEventListeners() {
            // Listen for object selection changes
            window.addEventListener('objectSelected', (e) => {
                this.setSelectedObject(e.detail);
            });
        }

        // ===== MODIFIER STACK MANAGEMENT =====
        getStack(object) {
            if (!object || !object.uuid) return null;
            
            if (!this.stacks.has(object.uuid)) {
                this.stacks.set(object.uuid, new root.ModifierStack(object.uuid));
            }
            
            return this.stacks.get(object.uuid);
        }

        addModifier(object, type, params = {}) {
            if (!object || !object.isMesh) {
                console.warn('Cannot add modifier: invalid object');
                return null;
            }

            const ModifierClass = this.registry.get(type) || root.Modifier;
            const modifier = new ModifierClass({
                type: type,
                params: params
            });

            const stack = this.getStack(object);
            stack.add(modifier);

            // Queue update
            this.queueUpdate(object);

            // Emit event
            this.events.dispatchEvent(new CustomEvent('modifierAdded', {
                detail: { object, modifier, stack }
            }));

            console.log(`✓ Added ${type} modifier to ${object.name}`);
            return modifier;
        }

        removeModifier(object, modifierId) {
            const stack = this.getStack(object);
            if (!stack) return;

            stack.remove(modifierId);
            this.queueUpdate(object);

            this.events.dispatchEvent(new CustomEvent('modifierRemoved', {
                detail: { object, modifierId }
            }));
        }

        moveModifier(object, modifierId, direction) {
            const stack = this.getStack(object);
            if (!stack) return;

            stack.move(modifierId, direction);
            this.queueUpdate(object);

            this.events.dispatchEvent(new CustomEvent('modifierMoved', {
                detail: { object, modifierId, direction }
            }));
        }

        updateModifier(object, modifierId, params) {
            const stack = this.getStack(object);
            if (!stack) return;

            const modifier = stack.modifiers.find(m => m.id === modifierId);
            if (!modifier) return;

            Object.assign(modifier.params, params);
            this.queueUpdate(object);

            this.events.dispatchEvent(new CustomEvent('modifierUpdated', {
                detail: { object, modifier }
            }));
        }

        toggleModifier(object, modifierId) {
            const stack = this.getStack(object);
            if (!stack) return;

            const modifier = stack.modifiers.find(m => m.id === modifierId);
            if (!modifier) return;

            modifier.enabled = !modifier.enabled;
            this.queueUpdate(object);

            this.events.dispatchEvent(new CustomEvent('modifierToggled', {
                detail: { object, modifier }
            }));
        }

        // ===== UPDATE QUEUE =====
        queueUpdate(object) {
            if (!this.updateQueue.includes(object)) {
                this.updateQueue.push(object);
            }
        }

        processUpdateQueue() {
            if (this.isProcessing || this.updateQueue.length === 0) return;

            this.isProcessing = true;

            while (this.updateQueue.length > 0) {
                const object = this.updateQueue.shift();
                const stack = this.getStack(object);
                
                if (stack && object.isMesh) {
                    try {
                        stack.evaluate(object);
                        object.geometry.attributes.position.needsUpdate = true;
                        object.geometry.computeVertexNormals?.();
                    } catch (e) {
                        console.error('Error evaluating modifier stack:', e);
                    }
                }
            }

            this.isProcessing = false;
        }

        // ===== SELECTION & UI =====
        setSelectedObject(object) {
            this.selectedObject = object;
            this.events.dispatchEvent(new CustomEvent('selectedObjectChanged', {
                detail: { object }
            }));
        }

        getSelectedObject() {
            return this.selectedObject;
        }

        getModifiers(object) {
            const stack = this.getStack(object);
            return stack ? stack.modifiers : [];
        }

        // ===== SERIALIZATION =====
        serialize(object) {
            const stack = this.getStack(object);
            return stack ? stack.serialize() : [];
        }

        deserialize(object, serialized) {
            this.getStack(object).clear(object);
            
            serialized.forEach(modData => {
                const ModifierClass = this.registry.get(modData.type);
                if (ModifierClass) {
                    const modifier = new ModifierClass(modData);
                    this.getStack(object).add(modifier);
                }
            });

            this.queueUpdate(object);
        }

        // ===== UTILITY =====
        bakeModifiers(object) {
            const stack = this.getStack(object);
            if (!stack) return;

            this.processUpdateQueue();
            stack.bake(object);
            
            this.events.dispatchEvent(new CustomEvent('modifiersBaked', {
                detail: { object }
            }));
        }

        clearAllModifiers(object) {
            const stack = this.getStack(object);
            if (!stack) return;

            stack.clear(object);
            this.events.dispatchEvent(new CustomEvent('modifiersCleared', {
                detail: { object }
            }));
        }
    }

    root.ModifierManager = ModifierManager;
    root.modifierManager = new ModifierManager();
})();

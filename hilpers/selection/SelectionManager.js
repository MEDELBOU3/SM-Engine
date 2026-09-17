class SelectionManager extends THREE.EventDispatcher {
    constructor(scene, camera, transformControls) {
        super();
        this.scene = scene;
        this.camera = camera;
        this.transformControls = transformControls;

        this.selectedObjects = [];
        this.activeObject = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this._tempVec = new THREE.Vector3(); // For reuse
    }

    /**
     * The main method to set or update the current selection.
     * @param {THREE.Object3D | null} object The primary object to select.
     * @param {boolean} isMultiSelect If true, adds to or toggles the selection.
     */
    setSelection(object, isMultiSelect = false) {
        if (isMultiSelect) {
            const index = this.selectedObjects.indexOf(object);
            if (index > -1) {
                // Object is already selected, so deselect it
                this.selectedObjects.splice(index, 1);
                if (this.activeObject === object) {
                    // If the deselected object was the active one, pick a new active one
                    this.activeObject = this.selectedObjects.length > 0 ? this.selectedObjects[this.selectedObjects.length - 1] : null;
                }
            } else if (object) {
                // Add new object to selection
                this.selectedObjects.push(object);
                this.activeObject = object;
            }
        } else {
            // Single selection mode
            this.selectedObjects = object ? [object] : [];
            this.activeObject = object;
        }

        this._updateGizmoAndOutline();
        this._dispatchSelectionChangeEvent();
    }

    /**
     * Clears the entire selection.
     */
    clearSelection() {
        this.selectedObjects = [];
        this.activeObject = null;
        this._updateGizmoAndOutline();
        this._dispatchSelectionChangeEvent();
    }

    /**
     * Gets the current selection array.
     * @returns {THREE.Object3D[]}
     */
    getCurrentSelection() {
        return this.selectedObjects;
    }

    /**
     * Handles a click event in the 3D viewport to perform selection.
     * @param {MouseEvent} event The mouse event from the renderer's DOM element.
     */
    handleClick(event, rendererDomElement) {
        // Don't select if the user is dragging the transform controls
        if (this.transformControls.dragging) return;

        const rect = rendererDomElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        // Find the first object that is marked as 'selectable'
        const firstSelectable = intersects.find(i => {
            let obj = i.object;
            // Traverse up to find the selectable parent
            while(obj) {
                if (obj.userData.selectable) return true;
                obj = obj.parent;
            }
            return false;
        });

        let targetObject = null;
        if (firstSelectable) {
            targetObject = firstSelectable.object;
            while(targetObject && !targetObject.userData.selectable) {
                targetObject = targetObject.parent;
            }
        }

        const isMultiSelect = event.ctrlKey || event.metaKey;
        this.setSelection(targetObject, isMultiSelect);
    }

    _updateGizmoAndOutline() {
        if (this.activeObject) {
            this.transformControls.attach(this.activeObject);
        } else {
            this.transformControls.detach();
        }

        // Update the outline pass with the new selection
        if (window.outlinePass) {
            window.outlinePass.selectedObjects = this.selectedObjects;
        }
    }

    _dispatchSelectionChangeEvent() {
        this.dispatchEvent({
            type: 'selectionChanged',
            selectedObjects: this.selectedObjects,
            activeObject: this.activeObject
        });
    }
}
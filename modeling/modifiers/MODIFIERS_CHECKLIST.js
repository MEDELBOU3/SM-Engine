/**
 * MODIFIERS SYSTEM - Quick Start Implementation Checklist
 * 
 * This file serves as a comprehensive initialization and verification guide.
 * Run this after loading the modifiers system to verify everything is working.
 */

class ModifiersImplementationChecklist {
    constructor() {
        this.checks = [];
        this.results = {};
    }

    /**
     * Run all checks and tests
     */
    async runAll() {
        console.clear();
        console.log('╔════════════════════════════════════════════╗');
        console.log('║   SM-Engine Modifiers System - Init Check  ║');
        console.log('╚════════════════════════════════════════════╝\n');

        this.checkSystemState();
        this.checkModifierRegistry();
        this.checkGeometrySystem();
        this.checkEventSystem();
        this.checkUISystem();

        console.log('\n╔════════════════════════════════════════════╗');
        const passed = Object.values(this.results).filter(r => r).length;
        const total = Object.keys(this.results).length;
        console.log(`║  Results: ${passed}/${total} checks passed       ║`);
        console.log('╚════════════════════════════════════════════╝\n');

        if (passed === total) {
            console.log('✅ SYSTEM READY - Begin using modifiers!');
            this.printQuickTips();
        } else {
            console.log('⚠️ Some checks failed - see details above');
        }

        return passed === total;
    }

    checkSystemState() {
        console.group('SYSTEM STATE');

        this.results.globalObject = this.check('Global SMModifiers', () => !!window.SMModifiers);
        this.results.modifierManager = this.check('ModifierManager', () => !!window.SMModifiers?.modifierManager);
        this.results.threejs = this.check('THREE.js loaded', () => !!window.THREE);
        this.results.scene = this.check('Scene exists', () => !!window.scene);

        console.groupEnd();
    }

    checkModifierRegistry() {
        console.group('MODIFIER REGISTRY');

        const registry = window.SMModifiers?.modifierManager?.modifierRegistry;
        const requiredModifiers = [
            'array', 'mirror', 'bevel', 'bend', 'twist', 
            'taper', 'solidify', 'decimate', 'weld'
        ];

        requiredModifiers.forEach(modifier => {
            this.results[`mod_${modifier}`] = this.check(
                `${modifier}`,
                () => registry && modifier in registry
            );
        });

        console.groupEnd();
    }

    checkGeometrySystem() {
        console.group('GEOMETRY SYSTEM');

        this.results.meshData = this.check('MeshData class', () => !!window.SMModifiers?.MeshData);
        this.results.geometryUtils = this.check('GeometryUtils', () => !!window.SMModifiers?.GeometryUtils);

        console.groupEnd();
    }

    checkEventSystem() {
        console.group('EVENT SYSTEM');

        const eventBus = window.SMModifiers?.modifierManager?.events;
        this.results.eventBus = this.check('Event bus', () => !!eventBus);
        this.results.eventDispatch = this.check('Event dispatch', () => {
            if (!eventBus) return false;
            let fired = false;
            const listener = () => { fired = true; };
            eventBus.addEventListener('test', listener);
            eventBus.dispatchEvent(new CustomEvent('test'));
            eventBus.removeEventListener('test', listener);
            return fired;
        });

        console.groupEnd();
    }

    checkUISystem() {
        console.group('UI SYSTEM');

        const panel = document.querySelector('.modifier-panel');
        this.results.modifierPanelExists = this.check('Modifier panel DOM', () => !!panel);

        const css = Array.from(document.styleSheets).some(sheet => 
            sheet.href?.includes('modifiers.css')
        );
        this.results.modifiersCss = this.check('modifiers.css loaded', () => css);

        console.groupEnd();
    }

    check(name, fn) {
        try {
            const result = fn();
            console.log(`${result ? '✓' : '✗'} ${name}`);
            return result;
        } catch (error) {
            console.log(`✗ ${name} (error: ${error.message})`);
            return false;
        }
    }

    printQuickTips() {
        console.log('╔════════════════════════════════════════════╗');
        console.log('║           QUICK START COMMANDS             ║');
        console.log('╚════════════════════════════════════════════╝\n');

        const tips = [
            'Select an object in the scene',
            'Open browser console (F12)',
            'Copy and paste one of these:',
            '',
            '  // Add Array modifier',
            '  SMModifiers.addModifier(selectedObject, "array", {',
            '    count: 3, spacing: 1, axis: "x"',
            '  });',
            '',
            '  // Add Bend modifier',
            '  SMModifiers.addModifier(selectedObject, "bend", {',
            '    strength: 0.3, axis: "y"',
            '  });',
            '',
            '  // Chain multiple modifiers',
            '  ModifiersExamples.chainModifiers();',
            '',
            '  // Check modifier status',
            '  ModifiersExamples.checkStatus();',
            '',
            '  // Run diagnostics',
            '  ModifiersDiagnostics.runFullDiagnostics();',
            '',
            '  // Bake to permanent geometry',
            '  ModifiersExamples.bake();'
        ];

        tips.forEach(tip => console.log(tip));
    }
}

/**
 * Initialize and run on page load
 */
function initializeModifiersChecklist() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            const checker = new ModifiersImplementationChecklist();
            checker.runAll();
        });
    } else {
        const checker = new ModifiersImplementationChecklist();
        checker.runAll();
    }
}

// Auto-run on page load
initializeModifiersChecklist();

// Also expose globally for manual runs
window.ModifiersChecklist = ModifiersImplementationChecklist;

console.log('✓ Modifiers checklist loaded - check will run on page ready');

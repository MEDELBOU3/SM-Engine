// SM Engine - Player animation graph compiler.
(function () {
    const cloneConditions = conditions => (Array.isArray(conditions) ? conditions : []).map(condition => ({
        parameter: String(condition?.parameter || ''),
        operator: condition?.operator || '==',
        value: condition?.value
    }));
    const Compiler = {
        compileStateMachine(editorData = {}) {
            const states = Array.isArray(editorData.states) ? editorData.states : [];
            const transitions = Array.isArray(editorData.transitions) ? editorData.transitions : [];
            const entry = states.find(state => state.type === 'entry');
            const compiledStates = states
                .filter(state => state?.id && state.type !== 'entry')
                .map(state => ({
                    id: state.id,
                    name: state.name || state.id,
                    motion: this.compileMotion(state.data || {})
                }));
            const known = new Set(compiledStates.map(state => state.id));
            const compiledTransitions = transitions
                .filter(transition => transition?.fromStateId && transition?.toStateId)
                .filter(transition => transition.fromStateId === entry?.id || known.has(transition.fromStateId))
                .filter(transition => known.has(transition.toStateId))
                .map(transition => ({
                    from: transition.fromStateId,
                    to: transition.toStateId,
                    duration: Math.max(0, Number(transition.duration) || 0),
                    minStateTime: Math.max(0, Number(transition.minStateTime) || 0),
                    priority: Number(transition.priority) || 0,
                    conditions: cloneConditions(transition.conditions)
                }));
            const errors = [];
            if (!compiledStates.length) errors.push('The state machine has no playable states.');
            if (entry && !compiledTransitions.some(transition => transition.from === entry.id)) errors.push('Entry node has no outgoing transition.');
            return {
                success: errors.length === 0,
                errors,
                machine: {
                    version: 1,
                    name: editorData.name || 'Locomotion',
                    entryStateId: entry?.id || null,
                    states: compiledStates,
                    transitions: compiledTransitions
                }
            };
        },
        compileMotion(data = {}) {
            const type = data.motionType || data.type || 'clip';
            if (type === 'blendSpace1D') {
                return {
                    type,
                    parameter: data.parameter || 'Speed',
                    min: Number(data.min) || 0,
                    max: Number(data.max) || 1,
                    samples: (Array.isArray(data.samples) ? data.samples : []).map(sample => ({
                        value: Number(sample.value) || 0,
                        clip: String(sample.clip || ''),
                        playRate: Number.isFinite(Number(sample.playRate)) ? Number(sample.playRate) : 1,
                        loop: sample.loop !== false
                    }))
                };
            }
            if (type === 'blendSpace2D') {
                return {
                    type,
                    parameterX: data.parameterX || 'Direction',
                    parameterY: data.parameterY || 'Speed',
                    minX: Number.isFinite(Number(data.minX)) ? Number(data.minX) : -180,
                    maxX: Number.isFinite(Number(data.maxX)) ? Number(data.maxX) : 180,
                    minY: Number.isFinite(Number(data.minY)) ? Number(data.minY) : 0,
                    maxY: Number.isFinite(Number(data.maxY)) ? Number(data.maxY) : 1,
                    samples: (Array.isArray(data.samples) ? data.samples : []).map(sample => ({
                        id: sample.id,
                        x: Number(sample.x ?? sample.valueX) || 0,
                        y: Number(sample.y ?? sample.valueY) || 0,
                        clip: String(sample.clip || ''),
                        playRate: Number.isFinite(Number(sample.playRate)) ? Number(sample.playRate) : 1,
                        loop: sample.loop !== false
                    }))
                };
            }
            return { type: 'clip', clip: data.clip || '', playRate: Number.isFinite(Number(data.playRate)) ? Number(data.playRate) : 1, loop: data.loop !== false };
        },
        compileAndStore(editorData, options = {}) {
            const result = this.compileStateMachine(editorData);
            if (!result.success) return result;
            const machine = result.machine;
            const all = { ...(window.SMCompiledAnimationStateMachines || {}) };
            try {
                const raw = localStorage.getItem('sm_player_animation_state_machines');
                Object.assign(all, raw ? JSON.parse(raw) : {});
            } catch { }
            all[machine.name] = machine;
            window.SMCompiledAnimationStateMachines = all;
            try { localStorage.setItem('sm_player_animation_state_machines', JSON.stringify(all)); } catch (error) { console.warn('[PlayerAnimationGraphCompiler] Could not store compiled machine:', error); }
            window.dispatchEvent(new CustomEvent('sm:animation-graph-compiled', { detail: { machine, source: options.source || 'editor' } }));
            return result;
        }
    };
    window.PlayerAnimationGraphCompiler = Compiler;
})();

/**
 * VideoTransitionsManager.js
 * SM Engine — professional transitions backend.
 *
 * Backward compatible with previous API:
 *   ensure(clip)
 *   apply(clip,presetId,edge,duration)
 *   remove(clip,edge)
 *   opacityMultiplier(clip,globalTime)
 *   renderPanel(container)
 *
 * New architecture:
 *   Library + Evaluator + Inspector + Dock
 */
(function (global) {
  "use strict";

  class VideoTransitionsManager {
    constructor(library = null, evaluator = null) {
      this.library =
        library ||
        global.videoTransitionsLibrary ||
        new global.VideoTransitionsLibrary();

      this.evaluator =
        evaluator ||
        global.videoTransitionEvaluator ||
        new global.VideoTransitionEvaluator(this.library);

      this.duration = 0.5;
      this.selectedRef = null;
      this.listeners = new Set();
      this.clipboard = null;
    }

    subscribe(cb) {
      if (typeof cb !== "function") {
        return () => {};
      }

      this.listeners.add(cb);

      return () => {
        this.listeners.delete(cb);
      };
    }

    _emit(type, detail = {}) {
      const event = {
        type,
        detail,
        manager: this,
      };

      this.listeners.forEach((cb) => {
        try {
          cb(event);
        } catch (error) {
          console.error("[VideoTransitionsManager]", error);
        }
      });

      try {
        global.dispatchEvent(
          new CustomEvent("videoTransitionChanged", {
            detail: event,
          }),
        );
      } catch (_) {}
    }

    selectedClip() {
      const id =
        global.videoProject?.selection?.primaryClipId ||
        global.sequencerManager?.state?.primarySelection?.id ||
        null;

      return (
        global.videoProject?.getClip?.(id) ||
        global.videoProject?.timeline?.clips?.find((clip) => clip.id === id) ||
        global.sequencerManager?.state?.primarySelection ||
        null
      );
    }

    clips() {
      return (
        global.videoProject?.timeline?.clips ||
        global.sequencerManager?.state?.clips ||
        []
      );
    }

    ensure(clip) {
      if (!clip) {
        return null;
      }

      if (!clip.transitions || typeof clip.transitions !== "object") {
        clip.transitions = {
          in: null,
          out: null,
        };
      }

      if (!Object.prototype.hasOwnProperty.call(clip.transitions, "in")) {
        clip.transitions.in = null;
      }

      if (!Object.prototype.hasOwnProperty.call(clip.transitions, "out")) {
        clip.transitions.out = null;
      }

      return clip.transitions;
    }

    adjacent(clip, direction = "next") {
      if (!clip) return null;

      const sameTrack = this.clips()
        .filter(
          (candidate) =>
            candidate.trackId === clip.trackId && candidate.id !== clip.id,
        )
        .sort((a, b) => Number(a.start || 0) - Number(b.start || 0));

      if (direction === "next") {
        return (
          sameTrack.find(
            (candidate) =>
              Number(candidate.start || 0) >=
              Number(clip.start || 0) + Number(clip.duration || 0) - 0.05,
          ) ||
          sameTrack.find(
            (candidate) =>
              Number(candidate.start || 0) > Number(clip.start || 0),
          ) ||
          null
        );
      }

      return (
        [...sameTrack]
          .reverse()
          .find(
            (candidate) =>
              Number(candidate.start || 0) + Number(candidate.duration || 0) <=
              Number(clip.start || 0) + 0.05,
          ) ||
        [...sameTrack]
          .reverse()
          .find(
            (candidate) =>
              Number(candidate.start || 0) < Number(clip.start || 0),
          ) ||
        null
      );
    }

    apply(clip, presetId, edge = "in", duration = this.duration, options = {}) {
      if (!clip || !["in", "out"].includes(edge)) {
        return null;
      }

      const transitions = this.ensure(clip);

      const instance = this.library.createInstance(presetId, {
        edge,
        duration,
        alignment: options.alignment || "center",

        easing: options.easing || "ease-in-out",

        reverse: !!options.reverse,

        params: options.params || {},
      });

      if (!instance) {
        return null;
      }

      transitions[edge] = instance;

      this.duration = instance.duration;

      this.select(clip.id, edge);

      this._sync(clip, "apply", {
        edge,
        transition: this._clone(instance),
      });

      return instance;
    }

    applyBetween(
      fromClip,
      toClip,
      presetId,
      duration = this.duration,
      options = {},
    ) {
      if (!fromClip || !toClip) {
        return null;
      }

      const pairId = `pair-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const out = this.library.createInstance(presetId, {
        pairId,
        edge: "out",
        duration,
        alignment: options.alignment || "center",

        easing: options.easing || "ease-in-out",

        reverse: !!options.reverse,

        params: options.params || {},
      });

      const incoming = this.library.createInstance(presetId, {
        pairId,
        edge: "in",
        duration,
        alignment: options.alignment || "center",

        easing: options.easing || "ease-in-out",

        reverse: !!options.reverse,

        params: options.params || {},
      });

      if (!out || !incoming) {
        return null;
      }

      out.toClipId = toClip.id;

      incoming.fromClipId = fromClip.id;

      this.ensure(fromClip).out = out;

      this.ensure(toClip).in = incoming;

      this.duration = Number(duration) || 0.5;

      this.select(fromClip.id, "out");

      this._sync(fromClip, "apply-between", {
        pairId,
        toClipId: toClip.id,
        transitionId: presetId,
      });

      this._sync(toClip, "apply-between", {
        pairId,
        fromClipId: fromClip.id,
        transitionId: presetId,
      });

      return {
        pairId,
        out,
        in: incoming,
      };
    }

    applyToSelection(presetId, target = "between", options = {}) {
      const clip = this.selectedClip();

      if (!clip) {
        return null;
      }

      const duration = Math.max(
        0.03,
        Number(options.duration ?? this.duration),
      );

      if (target === "in") {
        return this.apply(clip, presetId, "in", duration, options);
      }

      if (target === "out") {
        return this.apply(clip, presetId, "out", duration, options);
      }

      const next = this.adjacent(clip, "next");

      if (!next) {
        return null;
      }

      return this.applyBetween(clip, next, presetId, duration, options);
    }

    remove(clip, edge) {
      if (!clip || !["in", "out"].includes(edge)) {
        return false;
      }

      const transitions = this.ensure(clip);

      const current = transitions[edge];

      if (!current) {
        return false;
      }

      const pairId = current.pairId;

      transitions[edge] = null;

      if (pairId) {
        this.clips().forEach((candidate) => {
          if (candidate.id === clip.id) {
            return;
          }

          const t = this.ensure(candidate);

          ["in", "out"].forEach((candidateEdge) => {
            if (t[candidateEdge]?.pairId === pairId) {
              t[candidateEdge] = null;
              this._sync(candidate, "remove-pair", {
                pairId,
              });
            }
          });
        });
      }

      if (
        this.selectedRef?.clipId === clip.id &&
        this.selectedRef?.edge === edge
      ) {
        this.selectedRef = null;
      }

      this._sync(clip, "remove", {
        edge,
        pairId,
      });

      return true;
    }

    clearClip(clip = this.selectedClip()) {
      if (!clip) return false;

      const t = this.ensure(clip);

      if (t.in) {
        this.remove(clip, "in");
      }

      if (t.out) {
        this.remove(clip, "out");
      }

      return true;
    }

    select(clipId, edge) {
      if (!clipId || !["in", "out"].includes(edge)) {
        this.selectedRef = null;
      } else {
        this.selectedRef = {
          clipId,
          edge,
        };
      }

      this._emit("select", {
        ref: this.selectedRef ? { ...this.selectedRef } : null,
      });
    }

    selectedTransition() {
      if (this.selectedRef) {
        const clip = this.clips().find(
          (item) => item.id === this.selectedRef.clipId,
        );

        const transition = this.ensure(clip)?.[this.selectedRef.edge];

        if (clip && transition) {
          return {
            clip,
            edge: this.selectedRef.edge,
            transition,
          };
        }
      }

      const clip = this.selectedClip();

      if (!clip) {
        return null;
      }

      const t = this.ensure(clip);

      if (t.out) {
        this.selectedRef = {
          clipId: clip.id,
          edge: "out",
        };

        return {
          clip,
          edge: "out",
          transition: t.out,
        };
      }

      if (t.in) {
        this.selectedRef = {
          clipId: clip.id,
          edge: "in",
        };

        return {
          clip,
          edge: "in",
          transition: t.in,
        };
      }

      return null;
    }

    setDuration(value, selected = this.selectedTransition()) {
      if (!selected) return false;

      const duration = Math.max(0.03, Number(value) || 0.5);

      selected.transition.duration = duration;

      this.duration = duration;

      if (selected.transition.pairId) {
        this._updatePair(selected.transition.pairId, (transition) => {
          transition.duration = duration;
        });
      }

      this._sync(selected.clip, "duration", {
        duration,
      });

      return true;
    }

    setOption(key, value, selected = this.selectedTransition()) {
      if (!selected) return false;

      if (["alignment", "easing", "reverse", "enabled"].includes(key)) {
        selected.transition[key] = value;
      } else {
        selected.transition.params = selected.transition.params || {};

        selected.transition.params[key] = value;
      }

      if (selected.transition.pairId) {
        this._updatePair(selected.transition.pairId, (transition) => {
          if (["alignment", "easing", "reverse", "enabled"].includes(key)) {
            transition[key] = value;
          } else {
            transition.params = transition.params || {};

            transition.params[key] = value;
          }
        });
      }

      this._sync(selected.clip, "option", {
        key,
        value,
      });

      return true;
    }

    duplicateSelected() {
      const selected = this.selectedTransition();

      if (!selected) {
        return null;
      }

      this.clipboard = this._clone(selected.transition);

      return this.clipboard;
    }

    pasteToSelection(target = "out") {
      const clip = this.selectedClip();

      if (!clip || !this.clipboard) {
        return null;
      }

      return this.apply(
        clip,
        this.clipboard.id,
        target,
        this.clipboard.duration,
        {
          alignment: this.clipboard.alignment,
          easing: this.clipboard.easing,
          reverse: this.clipboard.reverse,
          params: this.clipboard.params,
        },
      );
    }

    opacityMultiplier(clip, globalTime) {
      const t = this.ensure(clip);

      if (!t) {
        return 1;
      }

      const local = Number(globalTime || 0) - Number(clip.start || 0);

      let multiplier = 1;

      if (t.in?.enabled !== false) {
        const progress = this.evaluator.progress(
          t.in,
          "in",
          local,
          Number(clip.duration || 0),
        );

        if (progress) {
          const def = this.library.get(t.in.id);

          if (def?.renderer === "live-opacity") {
            multiplier *=
              this.evaluator.evaluate(t.in, "in", progress)?.opacity ?? 1;
          }
        }
      }

      if (t.out?.enabled !== false) {
        const progress = this.evaluator.progress(
          t.out,
          "out",
          local,
          Number(clip.duration || 0),
        );

        if (progress) {
          const def = this.library.get(t.out.id);

          if (def?.renderer === "live-opacity") {
            multiplier *=
              this.evaluator.evaluate(t.out, "out", progress)?.opacity ?? 1;
          }
        }
      }

      return Math.max(0, Math.min(1, multiplier));
    }

    evaluateClip(clip, globalTime) {
      const t = this.ensure(clip);

      if (!t) {
        return {
          in: null,
          out: null,
        };
      }

      const local = Number(globalTime || 0) - Number(clip.start || 0);

      const result = {
        in: null,
        out: null,
      };

      ["in", "out"].forEach((edge) => {
        const transition = t[edge];

        if (!transition || transition.enabled === false) {
          return;
        }

        const progress = this.evaluator.progress(
          transition,
          edge,
          local,
          Number(clip.duration || 0),
        );

        if (progress) {
          result[edge] = {
            transition,
            progress,
            state: this.evaluator.evaluate(transition, edge, progress),
          };
        }
      });

      return result;
    }

    renderPanel(container) {
      if (!container) return;

      container.innerHTML = `
   <div style="padding:8px;color:var(--text-secondary,#b0b0b0);font-size:8px;">
    Transitions are now handled by the docked Transitions Studio.
    <button
     type="button"
     data-open-transitions-studio
     style="display:block;margin-top:7px;height:23px;border:1px solid var(--border-color,#4d4d4d81);border-radius:0;background:var(--bg-button,#363636);color:var(--text-primary,#fff);font-size:7px;">
     OPEN TRANSITIONS STUDIO
    </button>
   </div>
  `;

      container
        .querySelector("[data-open-transitions-studio]")
        ?.addEventListener("click", () => {
          global.ensureVideoTransitionsDockManager?.()?.open?.();
        });
    }

    _updatePair(pairId, mutator) {
      this.clips().forEach((clip) => {
        const t = this.ensure(clip);

        ["in", "out"].forEach((edge) => {
          const transition = t[edge];

          if (transition?.pairId === pairId) {
            mutator(transition, clip, edge);

            this._sync(clip, "pair-update", {
              pairId,
              edge,
            });
          }
        });
      });
    }

    _sync(clip, reason, detail = {}) {
      if (!clip) return;

      global.videoProject?.touch?.("transitions.clip", {
        clipId: clip.id,
        reason,
        transitions: this._clone(this.ensure(clip)),
        ...detail,
      });

      global.sequencerManager?.renderer?.updateClip?.(clip);

      global.sequencerManager?.renderer?.render?.();

      const time =
        global.sequencerManager?.state?.playhead ??
        global.videoEditingManager?.currentTime ??
        0;

      global.videoEditingManager?.renderCompositeAt?.(time);

      global.videoEditingManager?.renderCanvas?.();

      this._emit(reason, {
        clipId: clip.id,
        ...detail,
      });
    }

    _clone(value) {
      if (global.structuredClone) {
        try {
          return global.structuredClone(value);
        } catch (_) {}
      }

      return JSON.parse(JSON.stringify(value));
    }
  }

  global.VideoTransitionsManager = VideoTransitionsManager;

  global.videoTransitionsManager =
    global.videoTransitionsManager || new VideoTransitionsManager();
})(window);

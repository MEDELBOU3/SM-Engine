/**
 * VideoTransitionEvaluator.js
 * SM Engine — transition progress/evaluation helpers.
 *
 * Existing compositor currently consumes opacityMultiplier().
 * This evaluator also exposes transform / wipe / overlay data for the next
 * compositor pass without changing UI/state files again.
 */
(function (global) {
  "use strict";

  class VideoTransitionEvaluator {
    constructor(library = null) {
      this.library = library || global.videoTransitionsLibrary;
    }

    ease(t, name = "ease-in-out") {
      const x = Math.max(0, Math.min(1, Number(t) || 0));

      switch (name) {
        case "linear":
          return x;

        case "ease-in":
          return x * x;

        case "ease-out":
          return 1 - Math.pow(1 - x, 2);

        case "smooth":
          return x * x * (3 - 2 * x);

        case "ease-in-out":
        default:
          return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
      }
    }

    progress(transition, edge, localTime, clipDuration) {
      if (!transition?.enabled) {
        return null;
      }

      const duration = Math.max(0.001, Number(transition.duration || 0.5));

      let raw;

      if (edge === "in") {
        if (localTime < 0 || localTime > duration) {
          return null;
        }

        raw = localTime / duration;
      } else {
        const start = Math.max(0, Number(clipDuration || 0) - duration);

        if (localTime < start || localTime > clipDuration) {
          return null;
        }

        raw = (localTime - start) / duration;
      }

      if (transition.reverse) {
        raw = 1 - raw;
      }

      return {
        raw,
        eased: this.ease(raw, transition.easing),
      };
    }

    evaluate(transition, edge, progress) {
      if (!transition) {
        return null;
      }

      const p = Math.max(
        0,
        Math.min(1, Number(progress?.eased ?? progress ?? 0)),
      );

      const params = transition.params || {};

      const id = transition.id;

      const result = {
        opacity: 1,
        translateX: 0,
        translateY: 0,
        scale: 1,
        blur: 0,
        clip: null,
        overlayColor: null,
        overlayOpacity: 0,
      };

      if (
        id === "cross-dissolve" ||
        id === "fade-black" ||
        id === "fade-white" ||
        id === "dip-color"
      ) {
        result.opacity = edge === "in" ? p : 1 - p;
      }

      if (id === "fade-black") {
        result.overlayColor = "#000000";

        result.overlayOpacity = 1 - Math.abs(p - 0.5) * 2;
      }

      if (id === "fade-white") {
        result.overlayColor = "#ffffff";

        result.overlayOpacity = 1 - Math.abs(p - 0.5) * 2;
      }

      if (id === "dip-color") {
        result.overlayColor = params.color || "#000000";

        result.overlayOpacity = 1 - Math.abs(p - 0.5) * 2;
      }

      if (id === "slide" || id === "push") {
        const dir = params.direction || "left";

        const amount = edge === "in" ? 1 - p : -p;

        if (dir === "left") {
          result.translateX = amount;
        } else if (dir === "right") {
          result.translateX = -amount;
        } else if (dir === "up") {
          result.translateY = amount;
        } else {
          result.translateY = -amount;
        }
      }

      if (id === "zoom") {
        const start = Number(params.startScale ?? 0.7);

        const end = Number(params.endScale ?? 1);

        result.scale = start + (end - start) * p;

        result.blur = Number(params.blur || 0) * (1 - Math.abs(p - 0.5) * 2);
      }

      if (id === "blur-dissolve") {
        result.opacity = edge === "in" ? p : 1 - p;

        result.blur = Number(params.blur || 0) * (1 - Math.abs(p - 0.5) * 2);
      }

      if (id === "wipe" || id === "luma-fade") {
        result.clip = {
          kind: id,
          progress: p,
          direction: params.direction || "left",

          softness: Number(params.softness || 0),

          threshold: Number(params.threshold ?? p),

          invert: !!params.invert,
        };
      }

      return result;
    }
  }

  global.VideoTransitionEvaluator = VideoTransitionEvaluator;

  global.videoTransitionEvaluator =
    global.videoTransitionEvaluator || new VideoTransitionEvaluator();
})(window);

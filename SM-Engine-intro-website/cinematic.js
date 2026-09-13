// SM Engine — cinematic drive logic: scroll FPS readout, gear progress,
// masked entrances, clip reveals, counters. Content stays visible without JS.
(() => {
    const hasGSAP = typeof gsap !== "undefined";
    const motionOK = hasGSAP && typeof ScrollTrigger !== "undefined";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (motionOK) gsap.registerPlugin(ScrollTrigger);

    // Year
    document.querySelectorAll("[data-year]").forEach((el) => {
        el.textContent = new Date().getFullYear();
    });

    // Reverse gear: back to top
    document.querySelectorAll("[data-to-top]").forEach((btn) => {
        btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" }));
    });

    // Light / dark theme with persistence (default: dark cinematic)
    const themeKey = "sm_cine_theme";
    const themeBtns = Array.from(document.querySelectorAll("[data-theme-toggle]"));
    const applyTheme = (next) => {
        const theme = next === "light" ? "light" : "dark";
        document.documentElement.dataset.theme = theme;
        try { localStorage.setItem(themeKey, theme); } catch (e) { /* private mode */ }
        themeBtns.forEach((b) => {
            const label = b.querySelector("[data-theme-label]");
            if (label) label.textContent = theme;
            b.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
        });
        const mc = document.querySelector('meta[name="theme-color"]');
        if (mc) mc.setAttribute("content", theme === "light" ? "#f0efe9" : "#0a0a0b");
    };
    applyTheme(document.documentElement.dataset.theme || "dark");
    themeBtns.forEach((b) => {
        b.addEventListener("click", () => {
            applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
        });
    });

    // Fixed chrome steps aside while scrolling down, returns on scroll up:
    // top cluster slides away, bottom cluster fades.
    const hud = document.querySelector(".hud");
    if (hud) {
        let lastHudY = window.scrollY;
        let hudTick = false;
        const onHudScroll = () => {
            hudTick = false;
            const y = window.scrollY;
            if (y > lastHudY + 8 && y > 420) {
                hud.classList.add("hud-dim");
                hud.classList.add("hud-hidden");
            } else if (y < lastHudY - 8 || y < 220) {
                hud.classList.remove("hud-dim");
                hud.classList.remove("hud-hidden");
            }
            const brand = document.querySelector("[data-brand]");
            if (brand) brand.classList.toggle("brand-hidden", hud.classList.contains("hud-hidden"));
            lastHudY = y;
        };
        window.addEventListener("scroll", () => {
            if (!hudTick) { hudTick = true; requestAnimationFrame(onHudScroll); }
        }, { passive: true });
    }

    // Scroll FPS: velocity readout that decays to zero, like a speedometer.
    const fpsEl = document.querySelector("[data-fps]");
    const graph = document.querySelector("[data-fps-graph]");
    const gtx = graph ? graph.getContext("2d") : null;
    const samples = new Array(72).fill(0);
    const drawGraph = () => {
        if (!gtx || !graph) return;
        const W = graph.width;
        const H = graph.height;
        gtx.clearRect(0, 0, W, H);
        const max = Math.max(60, ...samples);
        gtx.beginPath();
        samples.forEach((v, i) => {
            const x = (i / (samples.length - 1)) * W;
            const y = H - 4 - (v / max) * (H - 8);
            if (i === 0) gtx.moveTo(x, y);
            else gtx.lineTo(x, y);
        });
        gtx.strokeStyle = "rgba(255,255,255,.9)";
        gtx.lineWidth = 2;
        gtx.stroke();
        gtx.lineTo(W, H);
        gtx.lineTo(0, H);
        gtx.closePath();
        gtx.fillStyle = "rgba(255,255,255,.12)";
        gtx.fill();
    };
    if (fpsEl) {
        let lastY = window.scrollY;
        let lastT = performance.now();
        let velocity = 0;
        let displayed = 0;
        window.addEventListener("scroll", () => {
            const now = performance.now();
            const dy = Math.abs(window.scrollY - lastY);
            const dt = Math.max(1, now - lastT);
            velocity = Math.min(999, (dy / dt) * 60);
            lastY = window.scrollY;
            lastT = now;
        }, { passive: true });
        const tick = () => {
            velocity *= 0.9;
            displayed += (velocity - displayed) * 0.25;
            samples.push(displayed);
            samples.shift();
            drawGraph();
            fpsEl.textContent = String(Math.round(displayed)).padStart(1, "0");
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    // Gear progress + nav spy
    const gearEl = document.querySelector("[data-gear]");
    const spyLinks = Array.from(document.querySelectorAll("[data-spy]"));
    const spySections = Array.from(document.querySelectorAll("[data-spy-section]"));
    const setActive = (key, gear) => {
        if (gearEl && gear) gearEl.textContent = gear;
        spyLinks.forEach((a) => a.classList.toggle("active", a.dataset.spy === key));
    };
    if ("IntersectionObserver" in window && spySections.length) {
        const spy = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const key = entry.target.dataset.spySection;
                const chapter = entry.target.closest("[data-gear-chapter]") || entry.target;
                const gear = (chapter.dataset && chapter.dataset.gearChapter) || gearEl.textContent;
                setActive(key, gear);
            });
        }, { rootMargin: "-40% 0px -55% 0px" });
        spySections.forEach((s) => spy.observe(s));
    }

    // ---------- Advanced menu overlay (works with or without motion) ----------
    const overlay = document.querySelector("[data-menu]");
    const openBtn = document.querySelector("[data-menu-open]");
    const closeBtn = document.querySelector("[data-menu-close]");
    const preview = document.querySelector(".menu-preview");
    const previewImg = document.querySelector("[data-menu-preview]");
    if (overlay && openBtn) {
        const animated = hasGSAP && !reduced;
        let menuTl = null;
        if (animated) {
            gsap.set(overlay, { autoAlpha: 0 });
            menuTl = gsap.timeline({ paused: true, defaults: { ease: "expo.out" } });
            menuTl
                .to(overlay, { autoAlpha: 1, duration: 0.35, ease: "power2.out" }, 0)
                .fromTo(".menu-panel", { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0%)", duration: 0.75 }, 0)
                .fromTo(".menu-link-inner", { yPercent: 120 }, { yPercent: 0, duration: 0.9, stagger: 0.055 }, 0.2)
                .fromTo(".menu-idx, .menu-link small", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, stagger: 0.03 }, 0.45)
                .fromTo(".menu-top, .menu-meta > a", { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.07 }, 0.35);
            menuTl.eventCallback("onReverseComplete", () => {
                overlay.setAttribute("aria-hidden", "true");
            });
        }
        const openMenu = () => {
            overlay.setAttribute("aria-hidden", "false");
            document.body.style.overflow = "hidden";
            if (animated && menuTl) menuTl.timeScale(1).play();
            else overlay.classList.add("is-open");
        };
        const closeMenu = () => {
            document.body.style.overflow = "";
            overlay.setAttribute("aria-hidden", "true");
            if (animated && menuTl) {
                if (preview) gsap.to(preview, { autoAlpha: 0, duration: 0.2, overwrite: true });
                menuTl.timeScale(1.5).reverse();
            } else {
                overlay.classList.remove("is-open");
            }
        };
        openBtn.addEventListener("click", openMenu);
        if (closeBtn) closeBtn.addEventListener("click", closeMenu);
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && overlay.getAttribute("aria-hidden") === "false") closeMenu();
        });
        overlay.querySelectorAll("[data-menu-link]").forEach((a) => {
            a.addEventListener("click", () => closeMenu());
        });

        // Floating preview follows the cursor across chapter links
        if (animated && preview && previewImg && window.matchMedia("(pointer: fine)").matches) {
            overlay.querySelectorAll(".menu-link[data-img]").forEach((a) => {
                const pre = new Image();
                pre.src = a.dataset.img;
            });
            gsap.set(preview, { xPercent: -50, yPercent: -115, scale: 0.92 });
            const px = gsap.quickTo(preview, "x", { duration: 0.45, ease: "expo.out" });
            const py = gsap.quickTo(preview, "y", { duration: 0.45, ease: "expo.out" });
            overlay.querySelector(".menu-panel").addEventListener("pointermove", (e) => {
                px(e.clientX);
                py(e.clientY);
            });
            overlay.querySelectorAll(".menu-link[data-img]").forEach((a) => {
                a.addEventListener("pointerenter", () => {
                    previewImg.src = a.dataset.img;
                    gsap.to(preview, { autoAlpha: 1, scale: 1, duration: 0.35, ease: "expo.out", overwrite: true });
                });
                a.addEventListener("pointerleave", () => {
                    gsap.to(preview, { autoAlpha: 0, scale: 0.92, duration: 0.25, overwrite: true });
                });
            });
        }
    }

    // ---------- Editor hotkeys + shortcuts overlay ----------
    const keysOverlay = document.createElement("div");
    keysOverlay.className = "keys-overlay";
    keysOverlay.setAttribute("aria-hidden", "true");
    keysOverlay.innerHTML = `
        <div class="keys-panel" role="dialog" aria-label="Editor shortcuts">
            <div class="keys-head"><span>editor shortcuts</span><button type="button" data-keys-close aria-label="Close shortcuts">×</button></div>
            <div class="keys-row"><span>Shift to gear 01 – 06</span><span><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> <kbd>5</kbd> <kbd>6</kbd></span></div>
            <div class="keys-row"><span>Toggle menu</span><kbd>M</kbd></div>
            <div class="keys-row"><span>Switch theme</span><kbd>T</kbd></div>
            <div class="keys-row"><span>Back to top</span><kbd>0</kbd></div>
            <div class="keys-row"><span>This panel</span><kbd>H</kbd></div>
        </div>`;
    document.body.appendChild(keysOverlay);
    const GEAR_URLS = {
        1: "./index.html#one-place", 2: "./craft.html", 3: "./workspaces.html",
        4: "./realtime.html", 5: "./core.html", 6: "./download.html"
    };
    const keysOpen = () => {
        keysOverlay.setAttribute("aria-hidden", "false");
        keysOverlay.classList.add("is-open");
    };
    const keysClose = () => {
        keysOverlay.setAttribute("aria-hidden", "true");
        keysOverlay.classList.remove("is-open");
    };
    const keysIsOpen = () => keysOverlay.getAttribute("aria-hidden") === "false";
    keysOverlay.querySelector("[data-keys-close]").addEventListener("click", keysClose);
    keysOverlay.addEventListener("click", (e) => {
        if (e.target === keysOverlay) keysClose();
    });
    document.querySelectorAll(".page-foot-meta span:last-child").forEach((slot) => {
        const a = document.createElement("a");
        a.href = "#";
        a.textContent = "hotkeys";
        a.addEventListener("click", (e) => { e.preventDefault(); keysOpen(); });
        slot.appendChild(a);
    });
    document.addEventListener("keydown", (e) => {
        const tag = (e.target && e.target.tagName) || "";
        if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
        const k = String(e.key || "").toLowerCase();
        if (k === "escape") {
            if (keysIsOpen()) keysClose();
            return;
        }
        if (keysIsOpen()) return;
        if (GEAR_URLS[k]) {
            window.location.href = GEAR_URLS[k];
        } else if (k === "m") {
            if (overlay && openBtn) {
                (overlay.getAttribute("aria-hidden") === "false" ? closeBtn : openBtn).click();
            }
        } else if (k === "t") {
            const t = document.querySelector("[data-theme-toggle]");
            if (t) t.click();
        } else if (k === "h" || k === "?") {
            keysOpen();
        } else if (k === "0") {
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    });

    if (!hasGSAP || reduced) return;

    // Hero title rows rise on load
    const heroRows = gsap.utils.toArray("[data-hero-title] .row > span");
    if (heroRows.length) {
        gsap.from(heroRows, { yPercent: 112, duration: 1.2, ease: "expo.out", stagger: 0.12, delay: 0.15 });
        gsap.from(".hero-kicker, .hero-sub, .scroll-hint",
            { autoAlpha: 0, y: 22, duration: 0.9, ease: "expo.out", stagger: 0.1, delay: 0.5 });
        gsap.from(".hero-media",
            { autoAlpha: 0, y: 44, duration: 1.1, ease: "expo.out", delay: 0.55 });
        gsap.from(".hero-shot",
            { autoAlpha: 0, y: 36, duration: 0.9, ease: "expo.out", stagger: 0.14, delay: 0.65 });
    }

    if (!motionOK) return;

    // Masked line rises for display headings
    document.querySelectorAll("[data-lines]").forEach((el) => {
        if (el.closest("[data-hero-title]")) return;
        const lines = [];
        const parts = el.innerHTML.split(/<br\s*\/?>/i);
        el.innerHTML = "";
        parts.forEach((html) => {
            const mask = document.createElement("span");
            mask.className = "row";
            const inner = document.createElement("span");
            inner.innerHTML = html;
            mask.appendChild(inner);
            el.appendChild(mask);
            lines.push(inner);
        });
        gsap.set(lines, { yPercent: 112 });
        ScrollTrigger.create({
            trigger: el, start: "top 88%", once: true,
            onEnter: () => gsap.to(lines, { yPercent: 0, duration: 1.1, ease: "expo.out", stagger: 0.09 })
        });
    });

    // Clip-path unveils for frames + facts + spec blocks
    gsap.utils.toArray(".shot-frame, .shot-card, .graph-panel, .facts, .spec-table, .get-grid").forEach((frame) => {
        gsap.fromTo(frame,
            { clipPath: "inset(8% 4% 8% 4%)", autoAlpha: 0.35, y: 30 },
            { clipPath: "inset(0% 0% 0% 0%)", autoAlpha: 1, y: 0, duration: 1.1, ease: "expo.out",
              scrollTrigger: { trigger: frame, start: "top 90%", once: true } });
    });

    // Gentle parallax on display titles against the scroll
    gsap.utils.toArray(".display").forEach((title) => {
        gsap.to(title, {
            y: -34, ease: "none",
            scrollTrigger: { trigger: title, start: "top bottom", end: "bottom top", scrub: true }
        });
    });

    // Counters
    document.querySelectorAll("[data-count]").forEach((el) => {
        const target = parseFloat(el.dataset.count || "0");
        if (!target) return;
        const state = { value: 0 };
        ScrollTrigger.create({
            trigger: el, start: "top 92%", once: true,
            onEnter: () => gsap.to(state, {
                value: target, duration: 1.8, ease: "power2.out",
                onUpdate: () => { el.textContent = String(Math.round(state.value)); }
            })
        });
    });

    // ---------- Pro scroll motion: hero exit, band skew, parallax ----------
    // Hero dissolves as the story takes over (home page only)
    const heroRoot = document.querySelector(".hero");
    if (heroRoot) {
    gsap.to("[data-hero-title]", {
        y: -110, autoAlpha: 0.15, scale: 0.96, ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom 30%", scrub: true }
    });
    gsap.to(".hero-sub, .scroll-hint", {
        y: -40, autoAlpha: 0, ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom 45%", scrub: true }
    });
    gsap.to(".hero-media", {
        y: -55, ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom 30%", scrub: true }
    });
    }

    // Marquee bands skew with scroll velocity, then relax
    let skewCall = null;
    ScrollTrigger.create({
        onUpdate: (self) => {
            const skew = gsap.utils.clamp(-7, 7, self.getVelocity() / -350);
            gsap.to(".band-track", { skewX: skew, duration: 0.3, ease: "power2.out", overwrite: true });
            if (skewCall) skewCall.kill();
            skewCall = gsap.delayedCall(0.3, () =>
                gsap.to(".band-track", { skewX: 0, duration: 0.6, ease: "expo.out" }));
        }
    });

    // Screenshots settle with a slow zoom on entry (full natural dimensions)
    gsap.utils.toArray(".shot-frame img").forEach((img) => {
        gsap.fromTo(img, { scale: 1.07 }, {
            scale: 1, duration: 1.5, ease: "expo.out",
            onComplete: () => gsap.set(img, { clearProps: "transform" }),
            scrollTrigger: { trigger: img.closest(".shot-frame") || img, start: "top 88%", once: true }
        });
    });

    // Spec sheets slide in from alternating sides
    gsap.utils.toArray(".spec-split").forEach((el, i) => {
        gsap.from(Array.from(el.children), {
            x: (i % 2 === 0 ? 46 : -46), autoAlpha: 0,
            duration: 1.05, ease: "expo.out", stagger: 0.12,
            scrollTrigger: { trigger: el, start: "top 86%", once: true }
        });
    });

    // Facts + download cards rise as ensembles
    gsap.utils.toArray(".facts > div, .get-grid article, .credits > div").forEach((el) => {
        gsap.from(el, {
            y: 34, autoAlpha: 0, duration: 0.9, ease: "expo.out",
            scrollTrigger: { trigger: el, start: "top 92%", once: true }
        });
    });

    // Thin progress hairline across the very top
    gsap.to("[data-progress]", {
        scaleX: 1, ease: "none",
        scrollTrigger: { start: 0, end: "max", scrub: 0.3 }
    });

    // Ghost gear numerals drifting behind each chapter
    gsap.utils.toArray("[data-gear-chapter]").forEach((chapter) => {
        const ghost = document.createElement("span");
        ghost.className = "ghost-num";
        ghost.setAttribute("aria-hidden", "true");
        ghost.textContent = String(chapter.dataset.gearChapter || "").padStart(2, "0");
        chapter.prepend(ghost);
        gsap.fromTo(ghost, { y: 70 }, {
            y: -70, ease: "none",
            scrollTrigger: { trigger: chapter, start: "top bottom", end: "bottom top", scrub: true }
        });
    });
})();

// SM Engine - Professional GSAP & Minimalist Dark UI Engine
document.addEventListener("DOMContentLoaded", () => {
    const hasGSAP = typeof gsap !== "undefined";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (hasGSAP && typeof ScrollTrigger !== "undefined") {
        gsap.registerPlugin(ScrollTrigger);
    }

    const introSplash = document.querySelector("[data-intro-splash]");
    const introEnter = document.querySelector("[data-intro-enter]");
    const introProgress = document.querySelector("[data-intro-progress]");
    if (introSplash) {
        let introClosed = false;
        const hideIntroImmediately = () => {
            document.body.classList.remove("intro-loading");
            introSplash.classList.remove("is-leaving");
            introSplash.classList.add("is-hidden");
        };
        const closeIntro = () => {
            if (introClosed) return;
            introClosed = true;
            document.body.classList.remove("intro-loading");
            introSplash.classList.add("is-leaving");
            if (!hasGSAP || reducedMotion) {
                hideIntroImmediately();
                return;
            }
            try {
                gsap.to(introSplash, { yPercent: -100, duration: .9, ease: "power4.inOut", onComplete: hideIntroImmediately });
                gsap.fromTo(".hero-animate", { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .8, stagger: .08, delay: .35, ease: "power3.out" });
                window.setTimeout(hideIntroImmediately, 1200);
            } catch (_error) {
                hideIntroImmediately();
            }
        };
        introEnter?.addEventListener("click", closeIntro, { once: true });
        if (hasGSAP && !reducedMotion) {
            try {
                gsap.to(introProgress, { width: "100%", duration: 1.25, ease: "power2.inOut" });
                gsap.fromTo(".intro-splash-mark", { scale: .55, rotation: 20, autoAlpha: 0 }, { scale: 1, rotation: 45, autoAlpha: 1, duration: 1, ease: "power3.out" });
                gsap.fromTo(".intro-splash-title, .intro-splash-kicker", { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .75, stagger: .08, delay: .3, ease: "power3.out" });
                gsap.delayedCall(1.65, closeIntro);
            } catch (_error) {
                hideIntroImmediately();
            }
        } else {
            closeIntro();
        }
    }

    // Shared light / dark theme with persistence across the public website.
    const themeStorageKey = "sm_engine_theme";
    const themeIconMarkup = `
        <svg class="theme-icon theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"></circle><path d="M12 2v2.2M12 19.8V22M4.93 4.93l1.55 1.55M17.52 17.52l1.55 1.55M2 12h2.2M19.8 12H22M4.93 19.07l1.55-1.55M17.52 6.48l1.55-1.55"></path></svg>
        <svg class="theme-icon theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 14.5A8.5 8.5 0 0 1 9.5 3.6 8.5 8.5 0 1 0 20.4 14.5Z"></path></svg>
    `;

    // Theme toggle lives directly in the header bar so it stays visible on
    // desktop AND mobile (the header action cluster hides below 900px).
    const headerBar = document.querySelector("[data-header-bar]");
    if (headerBar && !headerBar.querySelector("[data-theme-toggle]")) {
        const themeButton = document.createElement("button");
        themeButton.type = "button";
        themeButton.className = "theme-toggle header-theme-toggle";
        themeButton.dataset.themeToggle = "";
        themeButton.setAttribute("aria-label", "Switch color theme");
        themeButton.innerHTML = themeIconMarkup;
        const menuButton = headerBar.querySelector("[data-menu-button]");
        const actionCluster = headerBar.querySelector(".header-actions, div:last-child");
        if (menuButton) {
            headerBar.insertBefore(themeButton, menuButton);
        } else if (actionCluster) {
            actionCluster.prepend(themeButton);
        } else {
            headerBar.appendChild(themeButton);
        }
    }

    const mobileMenuForTheme = document.querySelector("[data-mobile-menu]");
    if (mobileMenuForTheme && !mobileMenuForTheme.querySelector("[data-theme-toggle]")) {
        const mobileThemeButton = document.createElement("button");
        mobileThemeButton.type = "button";
        mobileThemeButton.className = "mobile-theme-switch";
        mobileThemeButton.dataset.themeToggle = "";
        mobileThemeButton.innerHTML = `<span>Appearance</span><strong data-theme-label>Dark mode</strong>`;
        mobileMenuForTheme.appendChild(mobileThemeButton);
    }

    function applyTheme(theme, persist = true) {
        const nextTheme = theme === "light" ? "light" : "dark";
        document.documentElement.dataset.theme = nextTheme;
        document.documentElement.classList.toggle("dark", nextTheme === "dark");
        try {
            document.documentElement.style.colorScheme = nextTheme;
        } catch (_error) { /* older browsers ignore colorScheme */ }
        if (persist) {
            try { localStorage.setItem(themeStorageKey, nextTheme); } catch (_error) { /* private mode */ }
        }

        const label = nextTheme === "dark" ? "Dark mode" : "Light mode";
        const action = nextTheme === "dark" ? "Switch to light mode" : "Switch to dark mode";
        document.querySelectorAll("[data-theme-label]").forEach((el) => { el.textContent = label; });
        document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
            button.setAttribute("aria-label", action);
            button.setAttribute("title", action);
        });

        const themeColor = document.querySelector('meta[name="theme-color"]');
        if (themeColor) themeColor.setAttribute("content", nextTheme === "dark" ? "#111416" : "#f0efe9");
    }

    const storedTheme = localStorage.getItem(themeStorageKey);
    const initialTheme = storedTheme || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    applyTheme(initialTheme, false);
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
        button.addEventListener("click", () => {
            const current = document.documentElement.dataset.theme || "dark";
            applyTheme(current === "dark" ? "light" : "dark");
        });
    });

    // Set Dynamic Current Year
    document.querySelectorAll("[data-year]").forEach((el) => {
        el.textContent = new Date().getFullYear();
    });

    // Active Navigation
    const currentPage = document.body.dataset.page || "";
    document.querySelectorAll("[data-nav]").forEach((link) => {
        const navKeys = String(link.dataset.nav || "").split(/\s+/).filter(Boolean);
        if (navKeys.includes(currentPage)) {
            link.classList.add("active");
        }
    });

    // Sticky Header Scroll Behavior
    const siteHeader = document.querySelector("[data-site-header]");
    function updateHeaderOnScroll() {
        if (!siteHeader) return;
        const isScrolled = window.scrollY > 20;
        siteHeader.classList.toggle("is-scrolled", isScrolled);
    }
    window.addEventListener("scroll", updateHeaderOnScroll, { passive: true });
    updateHeaderOnScroll();

    // Reading progress gives the long landing page a constant sense of position.
    const progressBar = document.querySelector("[data-scroll-progress]");
    let progressFrame = 0;
    function updateScrollProgress() {
        progressFrame = 0;
        if (!progressBar) return;
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
        progressBar.style.transform = `scaleX(${progress})`;
    }
    if (progressBar) {
        window.addEventListener("scroll", () => {
            if (!progressFrame) progressFrame = requestAnimationFrame(updateScrollProgress);
        }, { passive: true });
        window.addEventListener("resize", updateScrollProgress, { passive: true });
        updateScrollProgress();
    }

    // A restrained cursor light reinforces direct manipulation on fine pointers.
    const pointerAurora = document.querySelector("[data-pointer-aurora]");
    if (pointerAurora && window.matchMedia("(pointer: fine)").matches && !reducedMotion) {
        window.addEventListener("pointermove", (event) => {
            pointerAurora.style.setProperty("--pointer-x", `${event.clientX}px`);
            pointerAurora.style.setProperty("--pointer-y", `${event.clientY}px`);
        }, { passive: true });
    }

    // Dropdown Navigation
    const dropdowns = Array.from(document.querySelectorAll("[data-dropdown]"));

    function closeAllDropdowns(except = null) {
        dropdowns.forEach((dropdown) => {
            if (dropdown === except) return;
            const panel = dropdown.querySelector(".dropdown-panel");
            const trigger = dropdown.querySelector("[data-dropdown-trigger]");

            if (hasGSAP && panel && dropdown.classList.contains("open")) {
                gsap.to(panel, {
                    autoAlpha: 0,
                    y: 6,
                    duration: 0.18,
                    ease: "power2.inOut",
                    onComplete: () => {
                        dropdown.classList.remove("open");
                        if (trigger) trigger.setAttribute("aria-expanded", "false");
                    }
                });
            } else {
                dropdown.classList.remove("open");
                if (trigger) trigger.setAttribute("aria-expanded", "false");
            }
        });
    }

    dropdowns.forEach((dropdown) => {
        const trigger = dropdown.querySelector("[data-dropdown-trigger]");
        const panel = dropdown.querySelector(".dropdown-panel");
        if (!trigger || !panel) return;

        dropdown.addEventListener("mouseenter", () => {
            if (window.innerWidth < 768) return;
            closeAllDropdowns(dropdown);
            dropdown.classList.add("open");
            trigger.setAttribute("aria-expanded", "true");
            if (hasGSAP) {
                gsap.fromTo(panel,
                    { autoAlpha: 0, y: 6 },
                    { autoAlpha: 1, y: 0, duration: 0.2, ease: "power2.out" }
                );
            }
        });

        dropdown.addEventListener("mouseleave", () => {
            if (window.innerWidth < 768) return;
            if (hasGSAP) {
                gsap.to(panel, {
                    autoAlpha: 0,
                    y: 6,
                    duration: 0.16,
                    ease: "power2.inOut",
                    onComplete: () => {
                        dropdown.classList.remove("open");
                        trigger.setAttribute("aria-expanded", "false");
                    }
                });
            } else {
                dropdown.classList.remove("open");
                trigger.setAttribute("aria-expanded", "false");
            }
        });

        trigger.addEventListener("click", (e) => {
            e.preventDefault();
            const willOpen = !dropdown.classList.contains("open");
            closeAllDropdowns(willOpen ? dropdown : null);
            if (willOpen) {
                dropdown.classList.add("open");
                trigger.setAttribute("aria-expanded", "true");
                if (hasGSAP) {
                    gsap.fromTo(panel,
                        { autoAlpha: 0, y: 6 },
                        { autoAlpha: 1, y: 0, duration: 0.2, ease: "power2.out" }
                    );
                }
            }
        });
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest("[data-dropdown]")) {
            closeAllDropdowns();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeAllDropdowns();
    });

    // Mobile Menu Toggle
    const menuBtn = document.querySelector("[data-menu-button]");
    const mobileMenu = document.querySelector("[data-mobile-menu]");

    if (menuBtn && mobileMenu) {
        menuBtn.addEventListener("click", () => {
            const isHidden = mobileMenu.classList.contains("hidden");
            if (isHidden) {
                mobileMenu.classList.remove("hidden");
                menuBtn.setAttribute("aria-expanded", "true");
                if (hasGSAP) {
                    gsap.fromTo(mobileMenu,
                        { autoAlpha: 0, y: -8 },
                        { autoAlpha: 1, y: 0, duration: 0.25, ease: "power2.out" }
                    );
                }
            } else {
                if (hasGSAP) {
                    gsap.to(mobileMenu, {
                        autoAlpha: 0,
                        y: -8,
                        duration: 0.2,
                        ease: "power2.inOut",
                        onComplete: () => {
                            mobileMenu.classList.add("hidden");
                            menuBtn.setAttribute("aria-expanded", "false");
                        }
                    });
                } else {
                    mobileMenu.classList.add("hidden");
                    menuBtn.setAttribute("aria-expanded", "false");
                }
            }
        });

        mobileMenu.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", () => {
                mobileMenu.classList.add("hidden");
                menuBtn.setAttribute("aria-expanded", "false");
            });
        });
    }

    // Scroll Reveal with GSAP ScrollTrigger
    const revealElements = Array.from(document.querySelectorAll(".reveal"));
    if (hasGSAP && typeof ScrollTrigger !== "undefined") {
        revealElements.forEach((el) => {
            gsap.fromTo(el,
                { autoAlpha: 0, y: 24 },
                {
                    autoAlpha: 1,
                    y: 0,
                    duration: 0.7,
                    ease: "power3.out",
                    scrollTrigger: {
                        trigger: el,
                        start: "top 88%",
                        toggleActions: "play none none none",
                        once: true
                    }
                }
            );
        });
    } else {
        revealElements.forEach((el) => el.classList.add("in-view"));
    }

    // Product-specific entrance sequence: hierarchy first, product second.
    if (hasGSAP && !reducedMotion) {
        const headerBar = document.querySelector("[data-header-bar]");
        const heroV2Items = Array.from(document.querySelectorAll(".hero-animate"));
        const heroBadge = document.querySelector(".hero-badge");
        const heroTitle = document.querySelector(".hero-title");
        const heroDesc = document.querySelector(".hero-desc");
        const heroCtas = document.querySelector(".hero-ctas");
        const heroMedia = document.querySelector(".hero-media");

        const heroTl = gsap.timeline({ defaults: { ease: "power3.out" } });
        if (headerBar) heroTl.from(headerBar, { y: -20, autoAlpha: 0, duration: 0.7 });
        if (heroV2Items.length) {
            heroTl.from(heroV2Items, { autoAlpha: 0, y: 30, duration: .85, stagger: .12 }, "-=.35");
        }
        if (heroBadge) heroTl.from(heroBadge, { autoAlpha: 0, y: 10, duration: 0.4 }, "-=0.3");
        if (heroTitle) heroTl.from(heroTitle, { autoAlpha: 0, y: 20, duration: 0.7 }, "-=0.3");
        if (heroDesc) heroTl.from(heroDesc, { autoAlpha: 0, y: 15, duration: 0.6 }, "-=0.4");
        if (heroCtas) heroTl.from(heroCtas.children, { autoAlpha: 0, y: 10, stagger: 0.08, duration: 0.5 }, "-=0.3");
        if (heroMedia) heroTl.from(heroMedia, { autoAlpha: 0, y: 20, duration: 0.8 }, "-=0.5");
    }

    // Light spatial response: cards follow the pointer without fighting readability.
    if (window.matchMedia("(pointer: fine)").matches && !reducedMotion) {
        document.querySelectorAll("[data-tilt-card]").forEach((card) => {
            card.addEventListener("pointermove", (event) => {
                const rect = card.getBoundingClientRect();
                const x = (event.clientX - rect.left) / rect.width - .5;
                const y = (event.clientY - rect.top) / rect.height - .5;
                const depth = card.classList.contains("hero-product") ? 2.1 : 3.2;
                card.style.transform = `perspective(1400px) rotateX(${-y * depth}deg) rotateY(${x * depth}deg) translateY(-2px)`;
            });
            card.addEventListener("pointerleave", () => {
                card.style.transform = "";
            });
        });

        document.querySelectorAll("[data-magnetic]").forEach((button) => {
            button.addEventListener("pointermove", (event) => {
                const rect = button.getBoundingClientRect();
                const x = event.clientX - rect.left - rect.width / 2;
                const y = event.clientY - rect.top - rect.height / 2;
                button.style.transform = `translate(${x * .08}px, ${y * .12}px)`;
            });
            button.addEventListener("pointerleave", () => {
                button.style.transform = "";
            });
        });
    }

    // Lightbox Image Inspection Modal
    let modalBackdrop = document.querySelector(".sm-modal-backdrop");
    if (!modalBackdrop) {
        modalBackdrop = document.createElement("div");
        modalBackdrop.className = "sm-modal-backdrop";
        modalBackdrop.innerHTML = `
            <div class="sm-modal-content">
                <button type="button" class="sm-modal-close" data-modal-close aria-label="Close image preview">
                    <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
                <img src="" alt="Full preview" class="sm-modal-img" data-modal-image>
                <div class="sm-modal-meta">
                    <span data-modal-caption>SM Engine Preview</span>
                    <small>High-resolution inspect</small>
                </div>
            </div>
        `;
        document.body.appendChild(modalBackdrop);
    }

    const modalImg = modalBackdrop.querySelector("[data-modal-image]");
    const modalCaption = modalBackdrop.querySelector("[data-modal-caption]");
    const modalClose = modalBackdrop.querySelector("[data-modal-close]");

    function openLightbox(src, captionText) {
        modalImg.src = src;
        modalCaption.textContent = captionText || "SM Engine Preview";
        modalBackdrop.classList.add("is-open");
        document.body.style.overflow = "hidden";
        if (hasGSAP) {
            gsap.fromTo(".sm-modal-content",
                { scale: 0.96, autoAlpha: 0 },
                { scale: 1, autoAlpha: 1, duration: 0.25, ease: "power3.out" }
            );
        }
    }

    function closeLightbox() {
        if (hasGSAP) {
            gsap.to(".sm-modal-content", {
                scale: 0.96,
                autoAlpha: 0,
                duration: 0.18,
                ease: "power2.inOut",
                onComplete: () => {
                    modalBackdrop.classList.remove("is-open");
                    document.body.style.overflow = "";
                }
            });
        } else {
            modalBackdrop.classList.remove("is-open");
            document.body.style.overflow = "";
        }
    }

    if (modalClose) modalClose.addEventListener("click", closeLightbox);
    modalBackdrop.addEventListener("click", (e) => {
        if (e.target === modalBackdrop) closeLightbox();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modalBackdrop.classList.contains("is-open")) {
            closeLightbox();
        }
    });

    document.querySelectorAll(".img-zoom-container").forEach((el) => {
        el.addEventListener("click", () => {
            const img = el.querySelector("img");
            if (img && img.src) {
                const caption = el.getAttribute("data-caption") || img.getAttribute("alt") || "SM Engine Preview";
                openLightbox(img.src, caption);
            }
        });
    });

    // Workspace Tab Switcher
    const tabButtons = Array.from(document.querySelectorAll("[data-workspace-tab]"));
    const tabContents = Array.from(document.querySelectorAll("[data-workspace-content]"));

    if (tabButtons.length > 0 && tabContents.length > 0) {
        function activateWorkspace(btn) {
            const targetKey = btn.dataset.workspaceTab;
            tabButtons.forEach((button) => {
                const active = button === btn;
                button.classList.toggle("active", active);
                button.setAttribute("aria-selected", String(active));
                button.tabIndex = active ? 0 : -1;
            });

            tabContents.forEach((content) => {
                const isMatch = content.dataset.workspaceContent === targetKey;
                content.classList.toggle("hidden", !isMatch);
                content.setAttribute("aria-hidden", String(!isMatch));
                if (isMatch && hasGSAP && !reducedMotion) {
                    gsap.fromTo(content,
                        { autoAlpha: 0, y: 12 },
                        { autoAlpha: 1, y: 0, duration: 0.35, ease: "power2.out" }
                    );
                }
            });
        }

        tabButtons.forEach((btn, index) => {
            btn.addEventListener("click", () => activateWorkspace(btn));
            btn.addEventListener("keydown", (event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                let nextIndex = index;
                if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabButtons.length;
                if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
                if (event.key === 'Home') nextIndex = 0;
                if (event.key === 'End') nextIndex = tabButtons.length - 1;
                tabButtons[nextIndex].focus();
                activateWorkspace(tabButtons[nextIndex]);
            });
        });

        activateWorkspace(tabButtons.find((button) => button.classList.contains("active")) || tabButtons[0]);
    }

    // Gallery Filter System
    const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
    const galleryItems = Array.from(document.querySelectorAll("[data-category]"));

    if (filterButtons.length > 0 && galleryItems.length > 0) {
        filterButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                const filter = btn.dataset.filter;
                filterButtons.forEach((b) => b.classList.toggle("active", b === btn));

                galleryItems.forEach((item) => {
                    const categories = String(item.dataset.category || "").split(/\s+/);
                    const isVisible = filter === "all" || categories.includes(filter);

                    if (isVisible) {
                        item.classList.remove("hidden");
                        if (hasGSAP) {
                            gsap.fromTo(item,
                                { autoAlpha: 0, y: 10 },
                                { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out" }
                            );
                        }
                    } else {
                        item.classList.add("hidden");
                    }
                });
            });
        });
    }

    // ---------- Commercial motion suite: product-site GSAP language ----------
    // Masked line reveals, choreographed hero entrance, scroll parallax,
    // animated counters, infinite marquee + hide-on-scroll header.
    // Everything is gated behind GSAP + no-preference for reduced motion.
    if (hasGSAP && !reducedMotion) {
        const motionOK = typeof ScrollTrigger !== "undefined";

        // Split <br> headings into overflow-masked lines for cinematic rises.
        const splitLines = (el) => {
            if (!el || el.dataset.split === "lined") {
                return Array.from(el.querySelectorAll(":scope > .mask-line > .mask-inner"));
            }
            const parts = el.innerHTML.split(/<br\s*\/?>/i);
            el.innerHTML = parts
                .map((part) => `<span class="mask-line"><span class="mask-inner">${part}</span></span>`)
                .join("");
            el.dataset.split = "lined";
            return Array.from(el.querySelectorAll(":scope > .mask-line > .mask-inner"));
        };

        // ----- Hero entrance: plays once the intro splash leaves -----
        const playHeroEntrance = () => {
            if (playHeroEntrance.done) return;
            playHeroEntrance.done = true;
            const heading = document.querySelector(".hero-heading");
            const inners = heading ? splitLines(heading) : [];
            const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
            tl.fromTo(".hero-eyebrow", { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.8 }, 0);
            if (inners.length) {
                tl.fromTo(inners, { yPercent: 118 }, { yPercent: 0, duration: 1.15, stagger: 0.1 }, 0.08);
            }
            tl.fromTo(".hero-support", { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 0.9 }, 0.45)
                .fromTo(".hero-product",
                    { autoAlpha: 0, y: 60, clipPath: "inset(10% 5% 10% 5%)" },
                    { autoAlpha: 1, y: 0, clipPath: "inset(0% 0% 0% 0%)", duration: 1.2 }, 0.5)
                .fromTo(".hero-proof > div",
                    { autoAlpha: 0, y: 22 },
                    { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.09 }, 0.75)
                .fromTo(".floating-signal",
                    { autoAlpha: 0, scale: 0.6 },
                    { autoAlpha: 1, scale: 1, duration: 0.9, ease: "back.out(1.6)", stagger: 0.12,
                      onComplete: () => gsap.set(".floating-signal", { clearProps: "transform,opacity,visibility" }) }, 0.95);
        };
        playHeroEntrance.done = false;

        const splash = document.querySelector("[data-intro-splash]");
        if (document.querySelector(".hero-heading")) {
            if (splash) {
                const splashObserver = new MutationObserver(() => {
                    if (splash.classList.contains("is-hidden")) {
                        splashObserver.disconnect();
                        window.setTimeout(playHeroEntrance, 120);
                    }
                });
                splashObserver.observe(splash, { attributes: true, attributeFilter: ["class"] });
                window.setTimeout(playHeroEntrance, 4000);
            } else {
                window.setTimeout(playHeroEntrance, 200);
            }
        }

        if (!motionOK) return;

        // ----- Scroll parallax: hero layers drift at different speeds -----
        const heroSection = document.querySelector(".hero-v2");
        if (heroSection) {
            gsap.to(".hero-copy-v2", {
                y: -70, ease: "none",
                scrollTrigger: { trigger: heroSection, start: "top top", end: "bottom top", scrub: true }
            });
            gsap.to(".hero-product", {
                y: 60, ease: "none",
                scrollTrigger: { trigger: heroSection, start: "top top", end: "bottom top", scrub: true }
            });
            gsap.fromTo(".hero-product .product-window", { rotationX: 0 }, {
                rotationX: 5, transformPerspective: 1200, ease: "none",
                scrollTrigger: { trigger: heroSection, start: "top top", end: "bottom top", scrub: true }
            });
        }

        // ----- Cinematic line reveals for section + page headings -----
        document.querySelectorAll(
            ".section-heading-v2 h2, .final-copy h2, .showcase-title-v2, " +
            ".showcase-next-v2 h2, .page-editorial .page-display"
        ).forEach((heading) => {
            const inners = splitLines(heading);
            if (!inners.length) return;
            gsap.set(inners, { yPercent: 118 });
            ScrollTrigger.create({
                trigger: heading, start: "top 88%", once: true,
                onEnter: () => gsap.to(inners, { yPercent: 0, duration: 1.05, ease: "expo.out", stagger: 0.09 })
            });
        });

        // ----- Section headings drift gently against the scroll -----
        document.querySelectorAll(".section-heading-v2").forEach((block) => {
            const title = block.querySelector("h2");
            if (!title) return;
            gsap.to(title, {
                y: -28, ease: "none",
                scrollTrigger: { trigger: block, start: "top bottom", end: "bottom top", scrub: true }
            });
        });

        // ----- Media frames unveil with a clip-path wipe on entry -----
        const mediaFrames = gsap.utils.toArray(
            ".attention-media, .capability-media, .workspace-visual, " +
            ".showcase-image, .showcase-feature-image, .feature-visual, " +
            ".workspace-shot, .workspace-overview-image"
        );
        mediaFrames.forEach((frame) => {
            gsap.fromTo(frame,
                { clipPath: "inset(10% 6% 10% 6%)", y: 34 },
                { clipPath: "inset(0% 0% 0% 0%)", y: 0, duration: 1.1, ease: "expo.out",
                  scrollTrigger: { trigger: frame, start: "top 88%", once: true } });
        });

        // ----- Animated counters in the hero proof strip -----
        document.querySelectorAll(".hero-proof strong").forEach((el) => {
            const match = el.textContent.trim().match(/^(\d+(?:\.\d+)?)(\+?)/);
            if (!match) return;
            const target = parseFloat(match[1]);
            const suffix = match[2] || "";
            const state = { value: 0 };
            ScrollTrigger.create({
                trigger: el, start: "top 94%", once: true,
                onEnter: () => gsap.to(state, {
                    value: target, duration: 1.8, ease: "power2.out",
                    onUpdate: () => { el.textContent = Math.round(state.value) + suffix; }
                })
            });
        });

        // ----- Infinite capability ticker with scroll-velocity boost -----
        const marqueeTrack = document.querySelector("[data-marquee-track]");
        if (marqueeTrack) {
            const loop = gsap.to(marqueeTrack, { xPercent: -50, ease: "none", duration: 24, repeat: -1 });
            const ticker = marqueeTrack.closest(".ticker");
            if (ticker) {
                ticker.addEventListener("mouseenter", () => loop.pause());
                ticker.addEventListener("mouseleave", () => loop.play());
            }
            let boostCall = null;
            ScrollTrigger.create({
                onUpdate: (self) => {
                    const boost = 1 + Math.min(3, Math.abs(self.getVelocity()) / 2800);
                    loop.timeScale(boost);
                    if (boostCall) boostCall.kill();
                    boostCall = gsap.delayedCall(0.25, () => loop.timeScale(1));
                }
            });
        }

        // ----- Footer wordmark drifts on scroll -----
        const wordmark = document.querySelector(".footer-wordmark");
        if (wordmark) {
            gsap.fromTo(wordmark, { xPercent: -4 }, {
                xPercent: 4, ease: "none",
                scrollTrigger: { trigger: wordmark, start: "top bottom", end: "bottom top", scrub: true }
            });
        }

        // ----- Hide-on-scroll header, reveal on scroll up -----
        const shell = document.querySelector("[data-site-header]");
        if (shell) {
            let lastY = window.scrollY;
            let ticking = false;
            const onScrollDir = () => {
                ticking = false;
                const y = window.scrollY;
                const menuOpen = document.querySelector("[data-mobile-menu]:not(.hidden)");
                const dropOpen = document.querySelector("[data-dropdown].open");
                if (menuOpen || dropOpen || y < 320) {
                    shell.classList.remove("header-hidden");
                } else if (y > lastY + 6) {
                    shell.classList.add("header-hidden");
                } else if (y < lastY - 6) {
                    shell.classList.remove("header-hidden");
                }
                lastY = y;
            };
            window.addEventListener("scroll", () => {
                if (!ticking) { ticking = true; requestAnimationFrame(onScrollDir); }
            }, { passive: true });
        }
    }

});

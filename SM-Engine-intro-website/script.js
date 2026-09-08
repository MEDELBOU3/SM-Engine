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

    if (!document.querySelector("[data-theme-toggle]")) {
        const headerAction = document.querySelector("[data-header-bar] .btn-primary")?.parentElement;
        if (headerAction) {
            const themeButton = document.createElement("button");
            themeButton.type = "button";
            themeButton.className = "theme-toggle";
            themeButton.dataset.themeToggle = "";
            themeButton.setAttribute("aria-label", "Switch color theme");
            themeButton.innerHTML = themeIconMarkup;
            headerAction.prepend(themeButton);
        }

        const mobileMenuForTheme = document.querySelector("[data-mobile-menu]");
        if (mobileMenuForTheme) {
            const mobileThemeButton = document.createElement("button");
            mobileThemeButton.type = "button";
            mobileThemeButton.className = "mobile-theme-switch";
            mobileThemeButton.dataset.themeToggle = "";
            mobileThemeButton.innerHTML = `<span>Appearance</span><strong data-theme-label>Dark mode</strong>`;
            mobileMenuForTheme.appendChild(mobileThemeButton);
        }
    }

    function applyTheme(theme, persist = true) {
        const nextTheme = theme === "light" ? "light" : "dark";
        document.documentElement.dataset.theme = nextTheme;
        document.documentElement.classList.toggle("dark", nextTheme === "dark");
        if (persist) localStorage.setItem(themeStorageKey, nextTheme);

        const label = nextTheme === "dark" ? "Dark mode" : "Light mode";
        const action = nextTheme === "dark" ? "Switch to light mode" : "Switch to dark mode";
        document.querySelectorAll("[data-theme-label]").forEach((el) => { el.textContent = label; });
        document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
            button.setAttribute("aria-label", action);
            button.setAttribute("title", action);
        });

        const themeColor = document.querySelector('meta[name="theme-color"]');
        if (themeColor) themeColor.setAttribute("content", nextTheme === "dark" ? "#070b10" : "#f1f4f5");
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

    // A small procedural field gives the homepage a living technical backdrop.
    // It stays decorative, lightweight, and disappears for reduced-motion users.
    const heroCanvas = document.querySelector("[data-hero-webgl]");
    if (heroCanvas && typeof THREE !== "undefined" && !reducedMotion) {
        const renderer = new THREE.WebGLRenderer({ canvas: heroCanvas, alpha: true, antialias: true });
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        const group = new THREE.Group();
        const pointCount = 900;
        const positions = new Float32Array(pointCount * 3);
        const colors = new Float32Array(pointCount * 3);
        const mint = new THREE.Color("#8de4d6");
        const violet = new THREE.Color("#9a8cff");

        for (let index = 0; index < pointCount; index += 1) {
            const radius = 4 + Math.random() * 7;
            const angle = Math.random() * Math.PI * 2;
            const height = (Math.random() - 0.5) * 5;
            const offset = index * 3;
            positions[offset] = Math.cos(angle) * radius;
            positions[offset + 1] = height + Math.sin(angle * 3) * 0.35;
            positions[offset + 2] = Math.sin(angle) * radius - 5;
            const color = index % 3 === 0 ? violet : mint;
            colors[offset] = color.r;
            colors[offset + 1] = color.g;
            colors[offset + 2] = color.b;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        const material = new THREE.PointsMaterial({ size: 0.035, vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
        group.add(new THREE.Points(geometry, material));

        const ringMaterial = new THREE.MeshBasicMaterial({ color: mint, wireframe: true, transparent: true, opacity: 0.12 });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.012, 8, 128), ringMaterial);
        ring.rotation.x = Math.PI * 0.62;
        ring.position.set(2.2, 0.3, -4);
        group.add(ring);
        scene.add(group);
        camera.position.set(0, 0, 8);

        const resize = () => {
            const width = heroCanvas.clientWidth || window.innerWidth;
            const height = heroCanvas.clientHeight || window.innerHeight;
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        };

        let pointerX = 0;
        let pointerY = 0;
        window.addEventListener("pointermove", (event) => {
            pointerX = (event.clientX / window.innerWidth - 0.5) * 0.18;
            pointerY = (event.clientY / window.innerHeight - 0.5) * 0.12;
        }, { passive: true });
        window.addEventListener("resize", resize, { passive: true });
        resize();

        const animate = (time) => {
            group.rotation.y += 0.00022;
            group.rotation.x += (pointerY - group.rotation.x) * 0.006;
            group.rotation.z += (pointerX - group.rotation.z) * 0.006;
            ring.rotation.z = time * 0.00012;
            renderer.render(scene, camera);
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }
});

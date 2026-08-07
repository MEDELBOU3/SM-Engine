const pageKey = document.body.dataset.page || "";
const navLinks = Array.from(document.querySelectorAll("[data-nav]"));
const revealItems = Array.from(document.querySelectorAll(".reveal"));
const menuButton = document.querySelector("[data-menu-button]");
const mobileMenu = document.querySelector("[data-mobile-menu]");
const yearEls = Array.from(document.querySelectorAll("[data-year]"));
const siteHeader = document.querySelector("[data-site-header]");
const headerBar = document.querySelector("[data-header-bar]");
const navDropdowns = Array.from(document.querySelectorAll("[data-dropdown]"));
const heroVisual = document.querySelector("[data-hero-visual]");
const heroImage = document.querySelector("[data-hero-image]");
const footerWord = document.querySelector("[data-footer-word]");

yearEls.forEach((el) => {
    el.textContent = new Date().getFullYear();
});

navLinks.forEach((link) => {
    const navKeys = String(link.dataset.nav || "").split(/\s+/).filter(Boolean);
    const isActive = navKeys.includes(pageKey);
    link.classList.toggle("active", isActive);
});

if (menuButton && mobileMenu) {
    menuButton.addEventListener("click", () => {
        const isHidden = mobileMenu.classList.contains("hidden");
        const timeline = gsap.timeline();
        
        if (!isHidden) {
            timeline.to(mobileMenu, {
                autoAlpha: 0,
                height: 0,
                duration: 0.3,
                ease: "power2.inOut",
                onComplete: () => {
                    mobileMenu.classList.add("hidden");
                }
            });
        } else {
            mobileMenu.classList.remove("hidden");
            timeline.fromTo(mobileMenu, 
                { autoAlpha: 0, height: 0 },
                { autoAlpha: 1, height: "auto", duration: 0.4, ease: "power2.out" }
            );
        }
        
        menuButton.setAttribute("aria-expanded", String(isHidden));
    });
}

function setHeaderScrolledState() {
    if (!siteHeader) return;
    const isScrolled = window.scrollY > 14;
    siteHeader.classList.toggle("is-scrolled", isScrolled);
    
    if (isScrolled) {
        gsap.to(headerBar, {
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            borderColor: "rgba(0, 0, 0, 0.08)",
            duration: 0.3,
            ease: "power2.out"
        });
    } else {
        gsap.to(headerBar, {
            backgroundColor: "transparent",
            borderColor: "transparent",
            duration: 0.3,
            ease: "power2.out"
        });
    }
}

setHeaderScrolledState();
window.addEventListener("scroll", setHeaderScrolledState, { passive: true });

function closeDropdowns(except = null) {
    navDropdowns.forEach((dropdown) => {
        if (dropdown === except) return;
        const panel = dropdown.querySelector(".dropdown-panel");
        
        gsap.to(panel, {
            autoAlpha: 0,
            y: 12,
            duration: 0.25,
            ease: "power2.inOut",
            onComplete: () => {
                dropdown.classList.remove("open");
                const trigger = dropdown.querySelector("[data-dropdown-trigger]");
                if (trigger) trigger.setAttribute("aria-expanded", "false");
            }
        });
    });
}

function alignDropdown(dropdown) {
    const panel = dropdown?.querySelector(".dropdown-panel");
    if (!panel || window.innerWidth < 768) return;

    panel.classList.remove("align-right");
    const rect = panel.getBoundingClientRect();
    const overflowRight = rect.right > (window.innerWidth - 20);
    const overflowLeft = rect.left < 20;

    if (overflowRight && !overflowLeft) {
        panel.classList.add("align-right");
    }
}

function openDropdown(dropdown, trigger, panel, duration = 0.25) {
    if (!dropdown || !panel) return;
    dropdown.classList.add("open");
    if (trigger) trigger.setAttribute("aria-expanded", "true");
    
    const children = panel.querySelectorAll("p, div, a, span");
    if (window.gsap && children.length) {
        gsap.set(children, { autoAlpha: 1, y: 0, clearProps: "opacity,visibility,transform" });
    }
    
    if (window.gsap) {
        gsap.fromTo(panel,
            { autoAlpha: 0, y: 12 },
            { autoAlpha: 1, y: 0, duration: duration, ease: "power2.out" }
        );
    } else {
        panel.style.opacity = "1";
        panel.style.visibility = "visible";
    }
    alignDropdown(dropdown);
}

navDropdowns.forEach((dropdown) => {
    const trigger = dropdown.querySelector("[data-dropdown-trigger]");
    const panel = dropdown.querySelector(".dropdown-panel");
    if (!trigger) return;

    trigger.addEventListener("click", (event) => {
        if (window.innerWidth < 768) return;
        event.preventDefault();
        const willOpen = !dropdown.classList.contains("open");
        closeDropdowns(willOpen ? dropdown : null);
        
        if (willOpen) {
            openDropdown(dropdown, trigger, panel, 0.3);
        }
    });

    dropdown.addEventListener("mouseenter", () => {
        if (window.innerWidth < 768) return;
        closeDropdowns(dropdown);
        openDropdown(dropdown, trigger, panel, 0.25);
    });

    dropdown.addEventListener("mouseleave", () => {
        if (window.innerWidth < 768) return;
        gsap.to(panel, {
            autoAlpha: 0,
            y: 12,
            duration: 0.2,
            ease: "power2.inOut",
            onComplete: () => {
                dropdown.classList.remove("open");
                trigger.setAttribute("aria-expanded", "false");
            }
        });
    });

    dropdown.addEventListener("focusin", () => {
        if (window.innerWidth < 768) return;
        closeDropdowns(dropdown);
        openDropdown(dropdown, trigger, panel, 0.25);
    });

    dropdown.addEventListener("focusout", () => {
        if (window.innerWidth < 768) return;
        window.setTimeout(() => {
            if (dropdown.contains(document.activeElement)) return;
            gsap.to(panel, {
                autoAlpha: 0,
                y: 12,
                duration: 0.2,
                ease: "power2.inOut",
                onComplete: () => {
                    dropdown.classList.remove("open");
                    trigger.setAttribute("aria-expanded", "false");
                }
            });
        }, 0);
    });
});

document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-dropdown]")) {
        closeDropdowns();
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closeDropdowns();
    }
});

window.addEventListener("resize", () => {
    closeDropdowns();
});

function revealWithAnimation(item) {
    if (window.gsap) {
        gsap.fromTo(item,
            { autoAlpha: 0, y: 24 },
            { autoAlpha: 1, y: 0, duration: 0.7, ease: "power2.out" }
        );
    } else {
        item.classList.add("in-view");
    }
}

if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("in-view");
            revealWithAnimation(entry.target);
            observer.unobserve(entry.target);
        });
    }, {
        threshold: 0.14,
        rootMargin: "0px 0px -8% 0px"
    });

    revealItems.forEach((item) => observer.observe(item));
} else {
    revealItems.forEach((item) => item.classList.add("in-view"));
}

if (heroVisual) {
    heroVisual.classList.add("in-view");
    heroVisual.style.opacity = "1";
    heroVisual.style.visibility = "visible";
}

if (heroImage) {
    heroImage.addEventListener("error", () => {
        heroImage.src = "../screenshoots/Screenshot%20(493).png";
    }, { once: true });
}

// Add smooth hover effects to cards - DISABLED
const cards = document.querySelectorAll(".sm-card, .sm-card-strong");
cards.forEach((card) => {
    // Hover effects removed per design update
});

if (window.gsap) {
    const noiseLayer = document.createElement("div");
    noiseLayer.className = "site-noise";
    document.body.prepend(noiseLayer);

    // Header animation
    if (headerBar) {
        gsap.from(headerBar, {
            y: -25,
            autoAlpha: 0,
            duration: 0.9,
            ease: "power3.out"
        });
    }

    // Hero visual animation - slide in only
    if (heroVisual) {
        gsap.set(heroVisual, { autoAlpha: 1 });
        gsap.from(heroVisual, {
            y: 20,
            autoAlpha: 0,
            duration: 0.8,
            ease: "power2.out",
            delay: 0.2
        });
    }

    // Footer word animation
    if (footerWord) {
        gsap.from(footerWord, {
            y: 50,
            autoAlpha: 0.1,
            duration: 1.1,
            ease: "power2.out",
            scrollTrigger: {
                trigger: footerWord,
                start: "top 80%",
                toggleActions: "play none none none"
            }
        });
    }

    // Animate all h1, h2, h3 tags - but keep them visible with opacity 1
    const headings = document.querySelectorAll("h1, h2, h3");
    headings.forEach((heading, index) => {
        // Skip if heading is inside hero section (first section)
        const isInHero = heading.closest(".hero-section");
        if (isInHero) {
            // Make hero headings visible immediately
            gsap.set(heading, { autoAlpha: 1, y: 0 });
            return;
        }
        
        gsap.from(heading, {
            y: 20,
            autoAlpha: 0.7,
            duration: 0.6,
            ease: "power2.out",
            delay: index * 0.03
        });
    });


    // Animate paragraphs (excluding navigation header and dropdown panels)
    const paragraphs = document.querySelectorAll("p:not(.dropdown-panel p):not(.site-header-shell p)");
    paragraphs.forEach((para, index) => {
        gsap.from(para, {
            y: 15,
            autoAlpha: 0,
            duration: 0.7,
            ease: "power2.out",
            delay: index * 0.03
        });
    });

    // Navigation link animations
    navLinks.forEach((link, index) => {
        gsap.from(link, {
            x: -15,
            autoAlpha: 0,
            duration: 0.6,
            ease: "power2.out",
            delay: 0.3 + index * 0.05
        });
    });

    // Smooth page transitions
    window.addEventListener("beforeunload", () => {
        gsap.to("body", {
            autoAlpha: 0,
            duration: 0.4,
            ease: "power2.inOut"
        });
    });

    // Fade in on page load
    gsap.from("body", {
        autoAlpha: 0,
        duration: 0.5,
        ease: "power2.out"
    });
}

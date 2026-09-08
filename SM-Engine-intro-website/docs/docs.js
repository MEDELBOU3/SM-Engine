/* ==========================================================================
   SM Engine Documentation JavaScript - Modern 2026 Edition
   Features:
   - Light/Dark Theme Switcher with Persistence
   - Collapsible Category Groups with Item Counts
   - Active Page Auto-Expansion & Scroll-into-View
   - Global Quick Search & Ctrl+K Keyboard Shortcut
   - Auto Table of Contents (TOC) with Scrollspy Highlight
   - Reading Progress Bar Indicator
   - Code Block Header & Animated Copy Button
   - Lightbox Zoom Modal for Images
   - Mobile Sidebar Drawer Navigation
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    initReadingProgressBar();
    initThemeToggle();
    initSidebarEnhancements();
    generateTOC();
    initCodeCopyButtons();
    initSearchFilter();
    initDocLightbox();
    initMobileSidebar();
});

/* ─── 1. Reading Progress Bar ─────────────────────────────────────────── */
function initReadingProgressBar() {
    let bar = document.querySelector(".doc-reading-bar");
    if (!bar) {
        bar = document.createElement("div");
        bar.className = "doc-reading-bar";
        document.body.appendChild(bar);
    }

    const content = document.querySelector(".content");
    if (!content) return;

    content.addEventListener("scroll", () => {
        const scrollTop = content.scrollTop;
        const scrollHeight = content.scrollHeight - content.clientHeight;
        const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
        bar.style.width = progress + "%";
    }, { passive: true });
}

/* ─── 2. Light / Dark Theme Switcher ───────────────────────────────────── */
function initThemeToggle() {
    const savedTheme = localStorage.getItem("sm_engine_theme") || localStorage.getItem("sm_docs_theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);

    const themeToggleBtn = document.getElementById("themeToggleBtn");
    if (!themeToggleBtn) return;

    updateThemeIcon(themeToggleBtn, savedTheme);

    themeToggleBtn.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        const newTheme = currentTheme === "light" ? "dark" : "light";

        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("sm_engine_theme", newTheme);
        localStorage.setItem("sm_docs_theme", newTheme);
        updateThemeIcon(themeToggleBtn, newTheme);
    });
}

function updateThemeIcon(btn, theme) {
    if (theme === "light") {
        btn.innerHTML = `<svg class="doc-icon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
        btn.setAttribute("title", "Switch to Dark Mode");
    } else {
        btn.innerHTML = `<svg class="doc-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
        btn.setAttribute("title", "Switch to Light Mode");
    }
}

/* ─── 3. Sidebar Collapsible Groups & Active Highlighting ──────────────── */
function initSidebarEnhancements() {
    const currentPath = window.location.pathname.split("/").pop() || "index.html";
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar) return;

    // Inject sidebar filter if not present
    let filterWrapper = sidebar.querySelector(".sidebar-filter-wrapper");
    if (!filterWrapper) {
        filterWrapper = document.createElement("div");
        filterWrapper.className = "sidebar-filter-wrapper";
        filterWrapper.innerHTML = `
            <div style="position:relative;">
                <svg class="doc-icon sm sidebar-filter-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <input type="search" class="sidebar-filter-input" placeholder="Quick filter docs...">
            </div>
        `;
        sidebar.insertBefore(filterWrapper, sidebar.firstChild);

        const filterInput = filterWrapper.querySelector(".sidebar-filter-input");
        filterInput.addEventListener("input", (e) => {
            filterSidebarLinks(e.target.value);
        });
    }

    const groups = sidebar.querySelectorAll(".sidebar-group");

    groups.forEach((group, idx) => {
        const titleEl = group.querySelector(".sidebar-group-title");
        const links = group.querySelectorAll(".sidebar-links li a");
        const linksList = group.querySelector(".sidebar-links");

        if (!titleEl || !linksList) return;

        // Wrap title content and add count badge and chevron
        const rawTitle = titleEl.textContent.trim();
        const iconSvg = titleEl.querySelector("svg");
        const iconHtml = iconSvg ? iconSvg.outerHTML : `<svg class="doc-icon sm" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`;

        titleEl.innerHTML = `
            <span class="sidebar-group-label">
                ${iconHtml}
                <span>${rawTitle}</span>
            </span>
            <span style="display:flex; align-items:center; gap:0.4rem;">
                <span class="sidebar-group-count">${links.length}</span>
                <svg class="sidebar-group-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg>
            </span>
        `;

        // Check if active link is inside this group
        let hasActive = false;
        links.forEach(link => {
            const href = link.getAttribute("href");
            if (href === currentPath || (currentPath === "" && href === "index.html")) {
                link.classList.add("active");
                hasActive = true;
            } else {
                link.classList.remove("active");
            }
        });

        // Restore collapsed state (unless group contains active link)
        const storageKey = `sm_doc_group_${idx}`;
        const isCollapsed = localStorage.getItem(storageKey) === "true";

        if (isCollapsed && !hasActive) {
            group.classList.add("collapsed");
        }

        // Toggle on click
        titleEl.addEventListener("click", () => {
            group.classList.toggle("collapsed");
            localStorage.setItem(storageKey, group.classList.contains("collapsed"));
        });
    });

    // Auto-scroll active link into view inside sidebar
    const activeLink = sidebar.querySelector(".sidebar-link.active");
    if (activeLink) {
        setTimeout(() => {
            activeLink.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }, 100);
    }
}

function filterSidebarLinks(query) {
    const q = query.toLowerCase().trim();
    const groups = document.querySelectorAll(".sidebar-group");

    groups.forEach(group => {
        const links = group.querySelectorAll(".sidebar-links li");
        let visibleCount = 0;

        links.forEach(li => {
            const text = li.textContent.toLowerCase();
            if (q === "" || text.includes(q)) {
                li.style.display = "";
                visibleCount++;
            } else {
                li.style.display = "none";
            }
        });

        if (visibleCount > 0) {
            group.style.display = "";
            if (q !== "") group.classList.remove("collapsed");
        } else {
            group.style.display = "none";
        }
    });
}

/* ─── 4. Auto Table of Contents (On-Page Anchor Navigator) ───────────── */
function generateTOC() {
    const tocList = document.getElementById("tocList");
    if (!tocList) return;

    const headings = document.querySelectorAll(".content h2, .content h3");
    const tocSidebar = document.querySelector(".toc-sidebar");

    if (headings.length === 0) {
        if (tocSidebar) tocSidebar.style.display = "none";
        return;
    }

    if (tocSidebar) {
        const tocTitle = tocSidebar.querySelector(".toc-title");
        if (tocTitle && !tocTitle.querySelector("svg")) {
            tocTitle.innerHTML = `<svg class="doc-icon sm" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg> On This Page`;
        }
    }

    tocList.innerHTML = "";
    headings.forEach((heading, index) => {
        if (!heading.id) {
            heading.id = "section-" + (index + 1);
        }

        const li = document.createElement("li");
        const a = document.createElement("a");
        a.setAttribute("href", "#" + heading.id);
        a.textContent = heading.textContent.replace(/^[^\w\s]+/, "").trim();

        if (heading.tagName.toLowerCase() === "h3") {
            a.style.paddingLeft = "0.75rem";
            a.style.fontSize = "0.78rem";
            a.style.opacity = "0.85";
        }

        a.addEventListener("click", (e) => {
            e.preventDefault();
            const target = document.getElementById(heading.id);
            if (target) {
                target.scrollIntoView({ behavior: "smooth", block: "start" });
                history.pushState(null, null, "#" + heading.id);
            }
        });

        li.appendChild(a);
        tocList.appendChild(li);
    });

    // Highlight active heading on scroll
    const content = document.querySelector(".content");
    if (content) {
        content.addEventListener("scroll", () => {
            let currentId = "";
            headings.forEach(heading => {
                const rect = heading.getBoundingClientRect();
                if (rect.top < 180) {
                    currentId = heading.id;
                }
            });

            tocList.querySelectorAll("a").forEach(a => {
                if (a.getAttribute("href") === "#" + currentId) {
                    a.classList.add("active");
                } else {
                    a.classList.remove("active");
                }
            });
        }, { passive: true });
    }
}

/* ─── 5. Code Block Copy Buttons ───────────────────────────────────────── */
function initCodeCopyButtons() {
    const preBlocks = document.querySelectorAll("pre");

    preBlocks.forEach(pre => {
        if (pre.querySelector(".code-header")) return;

        const header = document.createElement("div");
        header.className = "code-header";
        header.innerHTML = `
            <span>SNIPPET</span>
            <button type="button" class="copy-btn" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:0.75rem; display:flex; align-items:center; gap:0.35rem; font-family:inherit;">
                <svg class="doc-icon sm" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                <span>Copy</span>
            </button>
        `;

        pre.insertBefore(header, pre.firstChild);

        const copyBtn = header.querySelector(".copy-btn");
        copyBtn.addEventListener("click", () => {
            const codeText = pre.querySelector("code") ? pre.querySelector("code").innerText : pre.innerText;
            navigator.clipboard.writeText(codeText).then(() => {
                copyBtn.innerHTML = `<span style="color:#10b981; font-weight:600;">✓ Copied!</span>`;
                setTimeout(() => {
                    copyBtn.innerHTML = `
                        <svg class="doc-icon sm" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        <span>Copy</span>
                    `;
                }, 2000);
            });
        });
    });
}

/* ─── 6. Global Search & Ctrl+K Keyboard Shortcut ─────────────────────── */
function initSearchFilter() {
    const searchInput = document.getElementById("searchInput");
    if (!searchInput) return;

    // Add Ctrl + K shortcut badge in search container
    const searchContainer = document.querySelector(".search-container");
    if (searchContainer && !searchContainer.querySelector(".search-kbd")) {
        const kbd = document.createElement("span");
        kbd.className = "search-kbd";
        kbd.textContent = "Ctrl K";
        searchContainer.appendChild(kbd);
    }

    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
    });

    searchInput.addEventListener("input", (e) => {
        filterSidebarLinks(e.target.value);
    });
}

/* ─── 7. Lightbox Zoom Modal for Images ───────────────────────────────── */
function initDocLightbox() {
    let lightbox = document.querySelector(".doc-lightbox");
    if (!lightbox) {
        lightbox = document.createElement("div");
        lightbox.className = "doc-lightbox";
        lightbox.innerHTML = `
            <button type="button" class="doc-lightbox-close" aria-label="Close Preview">&times;</button>
            <img src="" alt="Full Resolution Inspection">
        `;
        document.body.appendChild(lightbox);
    }

    const lightboxImg = lightbox.querySelector("img");
    const closeBtn = lightbox.querySelector(".doc-lightbox-close");

    function openLightbox(src) {
        lightboxImg.src = src;
        lightbox.classList.add("is-open");
    }

    function closeLightbox() {
        lightbox.classList.remove("is-open");
    }

    if (closeBtn) closeBtn.addEventListener("click", closeLightbox);
    lightbox.addEventListener("click", (e) => {
        if (e.target === lightbox) closeLightbox();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && lightbox.classList.contains("is-open")) {
            closeLightbox();
        }
    });

    document.querySelectorAll(".doc-image-frame img, .doc-image-frame--panel img, .doc-image-frame--wide img").forEach(img => {
        img.style.cursor = "zoom-in";
        img.addEventListener("click", () => {
            if (img.src) openLightbox(img.src);
        });
    });
}

/* ─── 8. Mobile Sidebar Drawer ────────────────────────────────────────── */
function initMobileSidebar() {
    const topNav = document.querySelector(".top-nav");
    const sidebar = document.querySelector(".sidebar");
    if (!topNav || !sidebar) return;

    let toggleBtn = topNav.querySelector(".mobile-sidebar-toggle");
    if (!toggleBtn) {
        toggleBtn = document.createElement("button");
        toggleBtn.className = "mobile-sidebar-toggle";
        toggleBtn.setAttribute("aria-label", "Toggle Documentation Menu");
        toggleBtn.innerHTML = `<svg class="doc-icon" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"></path></svg>`;
        topNav.querySelector(".nav-brand").after(toggleBtn);
    }

    let backdrop = document.querySelector(".sidebar-mobile-backdrop");
    if (!backdrop) {
        backdrop = document.createElement("div");
        backdrop.className = "sidebar-mobile-backdrop";
        backdrop.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:140; opacity:0; pointer-events:none; transition:opacity 0.25s;";
        document.body.appendChild(backdrop);
    }

    function toggleMobileMenu() {
        const isOpen = sidebar.classList.toggle("mobile-open");
        backdrop.style.opacity = isOpen ? "1" : "0";
        backdrop.style.pointerEvents = isOpen ? "auto" : "none";
    }

    toggleBtn.addEventListener("click", toggleMobileMenu);
    backdrop.addEventListener("click", toggleMobileMenu);
}

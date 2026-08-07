/* ==========================================================================
   SM Engine Documentation JavaScript
   Features: Light/Dark Theme Switcher, Auto TOC Generator, Code Copy, Search
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    initThemeToggle();
    initActiveSidebar();
    generateTOC();
    initCodeCopyButtons();
    initSearchFilter();
});

/* ─── 1. Light / Dark Theme Switcher ───────────────────────────────────── */
function initThemeToggle() {
    const savedTheme = localStorage.getItem("sm_docs_theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);

    const themeToggleBtn = document.getElementById("themeToggleBtn");
    if (!themeToggleBtn) return;

    updateThemeIcon(themeToggleBtn, savedTheme);

    themeToggleBtn.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        const newTheme = currentTheme === "light" ? "dark" : "light";

        document.documentElement.setAttribute("data-theme", newTheme);
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

/* ─── 2. Active Sidebar Link Highlighting ──────────────────────────────── */
function initActiveSidebar() {
    const currentPath = window.location.pathname.split("/").pop() || "index.html";
    const links = document.querySelectorAll(".sidebar-link");

    links.forEach(link => {
        const href = link.getAttribute("href");
        if (href === currentPath || (currentPath === "" && href === "index.html")) {
            link.classList.add("active");
        } else {
            link.classList.remove("active");
        }
    });
}

/* ─── 3. Auto Table of Contents (On-Page Anchor Navigator) ───────────── */
function generateTOC() {
    const tocList = document.getElementById("tocList");
    if (!tocList) return;

    const headings = document.querySelectorAll(".content h2, .content h3");
    if (headings.length === 0) {
        const tocSidebar = document.querySelector(".toc-sidebar");
        if (tocSidebar) tocSidebar.style.display = "none";
        return;
    }

    tocList.innerHTML = "";
    headings.forEach((heading, index) => {
        if (!heading.id) {
            heading.id = "section-" + (index + 1);
        }

        const li = document.createElement("li");
        const a = document.createElement("a");
        a.setAttribute("href", "#" + heading.id);
        a.textContent = heading.textContent.replace(/^[^\w\s]+/, "").trim(); // Strip lead symbols
        if (heading.tagName.toLowerCase() === "h3") {
            a.style.paddingLeft = "0.75rem";
            a.style.fontSize = "0.8em";
        }

        li.appendChild(a);
        tocList.appendChild(li);
    });

    // Highlight active heading on scroll
    const content = document.querySelector(".content");
    if (content) {
        content.addEventListener("scroll", () => {
            let currentId = "";
            headings.forEach(heading => {
                const top = heading.getBoundingClientRect().top;
                if (top < 150) {
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
        });
    }
}

/* ─── 4. Code Block Copy Buttons ───────────────────────────────────────── */
function initCodeCopyButtons() {
    const preBlocks = document.querySelectorAll("pre");

    preBlocks.forEach(pre => {
        if (pre.querySelector(".code-header")) return; // Skip if already has header

        const header = document.createElement("div");
        header.className = "code-header";
        header.innerHTML = `<span>Code</span><button class="copy-btn" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:0.75rem; display:flex; align-items:center; gap:0.2rem;"><svg class="doc-icon sm" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy</button>`;

        pre.insertBefore(header, pre.firstChild);

        const copyBtn = header.querySelector(".copy-btn");
        copyBtn.addEventListener("click", () => {
            const codeText = pre.querySelector("code") ? pre.querySelector("code").innerText : pre.innerText;
            navigator.clipboard.writeText(codeText).then(() => {
                copyBtn.innerHTML = `<span style="color:#10b981;">✓ Copied!</span>`;
                setTimeout(() => {
                    copyBtn.innerHTML = `<svg class="doc-icon sm" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy`;
                }, 2000);
            });
        });
    });
}

/* ─── 5. Search Filter ─────────────────────────────────────────────────── */
function initSearchFilter() {
    const searchInput = document.getElementById("searchInput");
    if (!searchInput) return;

    searchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();
        const sidebarLinks = document.querySelectorAll(".sidebar-link");

        sidebarLinks.forEach(link => {
            const text = link.textContent.toLowerCase();
            const group = link.closest(".sidebar-group");

            if (query === "" || text.includes(query)) {
                link.style.display = "flex";
                if (group) group.style.display = "block";
            } else {
                link.style.display = "none";
            }
        });
    });
}

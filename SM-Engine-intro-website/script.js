const SM_ENGINE_RELEASES = {
    repo: 'https://github.com/MEDELBOU3/SM-Engine',
    installer: 'https://github.com/MEDELBOU3/SM-Engine/releases/latest/download/SM%20Engine%20Setup%201.0.0.exe',
    portable: 'https://github.com/MEDELBOU3/SM-Engine/releases/latest/download/SM%20Engine%201.0.0.exe',
    downloadsPage: './download.html'
};

const LEGACY_DOWNLOADS = new Map([
    ['../dist/SM%20Engine%20Setup%201.0.0.exe', SM_ENGINE_RELEASES.installer],
    ['../dist/SM%20Engine%20Setup%201.0.0.exe#download', SM_ENGINE_RELEASES.installer],
    ['../dist/SM%20Engine%201.0.0.exe', SM_ENGINE_RELEASES.portable]
]);

function patchDownloadLinks() {
    const isDownloadPage = document.body?.dataset?.page === 'download';
    const anchors = document.querySelectorAll('a[href]');

    anchors.forEach((anchor) => {
        const href = anchor.getAttribute('href');
        if (!href) return;

        if (LEGACY_DOWNLOADS.has(href)) {
            if (isDownloadPage) {
                anchor.href = LEGACY_DOWNLOADS.get(href);
                anchor.removeAttribute('download');
            } else {
                anchor.href = SM_ENGINE_RELEASES.downloadsPage;
                anchor.removeAttribute('download');
                anchor.removeAttribute('target');
                anchor.removeAttribute('rel');
            }
            return;
        }

        if (href.includes('github.com/MEDELBOU3/SM-Engine')) {
            anchor.setAttribute('target', '_blank');
            anchor.setAttribute('rel', 'noreferrer');
        }
    });

    document.querySelectorAll('[data-download-path="installer"]').forEach((node) => {
        node.textContent = 'Latest GitHub Release installer (.exe)';
    });

    document.querySelectorAll('[data-download-path="portable"]').forEach((node) => {
        node.textContent = 'Latest GitHub Release portable build (.exe)';
    });
}

function syncCurrentYear() {
    document.querySelectorAll('[data-year]').forEach((node) => {
        node.textContent = new Date().getFullYear();
    });
}

function markActiveNavigation() {
    const page = document.body?.dataset?.page;
    if (!page) return;

    document.querySelectorAll('[data-nav]').forEach((node) => {
        const pages = (node.dataset.nav || '').split(/\s+/).filter(Boolean);
        if (pages.includes(page)) {
            node.classList.add('active');
            node.setAttribute('aria-current', 'page');
        }
    });
}

function setupMobileMenu() {
    const button = document.querySelector('[data-menu-button]');
    const menu = document.querySelector('[data-mobile-menu]');
    if (!button || !menu) return;

    button.addEventListener('click', () => {
        const expanded = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!expanded));
        menu.classList.toggle('hidden', expanded);
    });
}

function setupDropdowns() {
    const dropdowns = document.querySelectorAll('[data-dropdown]');

    dropdowns.forEach((dropdown) => {
        const trigger = dropdown.querySelector('[data-dropdown-trigger]');
        if (!trigger) return;

        const close = () => {
            dropdown.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
        };

        const open = () => {
            dropdown.classList.add('open');
            trigger.setAttribute('aria-expanded', 'true');
        };

        trigger.addEventListener('click', (event) => {
            if (window.innerWidth >= 768) return;

            event.preventDefault();
            const isOpen = dropdown.classList.contains('open');
            dropdowns.forEach((item) => {
                item.classList.remove('open');
                const itemTrigger = item.querySelector('[data-dropdown-trigger]');
                if (itemTrigger) {
                    itemTrigger.setAttribute('aria-expanded', 'false');
                }
            });

            if (!isOpen) {
                open();
            }
        });

        dropdown.addEventListener('mouseenter', () => {
            if (window.innerWidth >= 768) {
                open();
            }
        });

        dropdown.addEventListener('mouseleave', () => {
            if (window.innerWidth >= 768) {
                close();
            }
        });
    });

    document.addEventListener('click', (event) => {
        dropdowns.forEach((dropdown) => {
            if (!dropdown.contains(event.target)) {
                const trigger = dropdown.querySelector('[data-dropdown-trigger]');
                dropdown.classList.remove('open');
                if (trigger) {
                    trigger.setAttribute('aria-expanded', 'false');
                }
            }
        });
    });
}

function setupScrollState() {
    const header = document.querySelector('[data-site-header]');
    if (!header) return;

    const sync = () => {
        header.classList.toggle('is-scrolled', window.scrollY > 18);
    };

    sync();
    window.addEventListener('scroll', sync, { passive: true });
}

function setupRevealAnimations() {
    const reveals = document.querySelectorAll('.reveal');
    if (!reveals.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;

            entry.target.classList.add('in-view');

            if (window.gsap) {
                window.gsap.fromTo(
                    entry.target,
                    { opacity: 0, y: 28 },
                    { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out', overwrite: true }
                );
            }

            observer.unobserve(entry.target);
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

        reveals.forEach((node) => {
        if (node.closest('.hero-section')) {
            node.classList.add('in-view');
            return;
        }

        node.style.opacity = '0';
        node.style.transform = 'translateY(28px)';

        observer.observe(node);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    patchDownloadLinks();
    syncCurrentYear();
    markActiveNavigation();
    setupMobileMenu();
    setupDropdowns();
    setupScrollState();
    setupRevealAnimations();
});

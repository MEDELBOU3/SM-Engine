const modal = document.getElementById('welcome-modal');
const dontShowAgainCheckbox = document.getElementById('dont-show-again-checkbox');
let previouslyFocusedElement;

function openWelcomeModal() {
    previouslyFocusedElement = document.activeElement;
    document.body.classList.add('modal-open');
    modal.classList.add('is-visible');
    trapFocus(modal);
}

function closeWelcomeModal() {
    if (dontShowAgainCheckbox.checked) {
        try { localStorage.setItem('hideSmEngineWelcome', 'true'); }
        catch (e) { console.warn("localStorage is not available."); }
    }
    modal.classList.remove('is-visible');
    document.body.classList.remove('modal-open');
    if (previouslyFocusedElement) { previouslyFocusedElement.focus(); }
}

function trapFocus(element) {
    const focusableEls = element.querySelectorAll('iframe, a[href]:not([disabled]), button:not([disabled]), input[type="checkbox"]:not([disabled])');
    if (focusableEls.length === 0) return;
    const firstFocusableEl = focusableEls[0];
    const lastFocusableEl = focusableEls[focusableEls.length - 1];

    element.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab') return;
        if (e.shiftKey) {
            if (document.activeElement === firstFocusableEl) {
                lastFocusableEl.focus();
                e.preventDefault();
            }
        } else {
            if (document.activeElement === lastFocusableEl) {
                firstFocusableEl.focus();
                e.preventDefault();
            }
        }
    });
    firstFocusableEl.focus();
}

modal.addEventListener('click', (event) => {
    if (event.target === modal) closeWelcomeModal();
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('is-visible')) {
        closeWelcomeModal();
    }
});

window.addEventListener('DOMContentLoaded', () => {
    let hideModal = false;
    try { hideModal = localStorage.getItem('hideSmEngineWelcome') === 'true'; }
    catch (e) { /* localStorage not available */ }

    if (!hideModal) {
        setTimeout(openWelcomeModal, 500);
    }
});
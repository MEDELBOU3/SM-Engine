document.addEventListener("DOMContentLoaded", () => {

    function enablePinning(menuSelector) {
        document.querySelectorAll(`${menuSelector} button`).forEach(button => {
            button.addEventListener("contextmenu", e => {
                e.preventDefault();
                pinButtonToToolbar(button);
            });
        });
    }

    function pinButtonToToolbar(button) {
        const toolbar = document.getElementById("toolBar");
        if (!toolbar) return;

        const clone = button.cloneNode(true);
        clone.classList.add("tool-button");
        toolbar.insertBefore(clone, document.getElementById("toolbar-group-shapes"));

        clone.addEventListener("click", () => {
            const shapeType = clone.id.replace("add", "").toLowerCase();
            shapeAction("add" + shapeType);
        });

        showPinnedFeedback(clone);
    }

    function showPinnedFeedback(button) {
        const originalBg = button.style.backgroundColor;
        button.style.backgroundColor = "#4CAF50";
        setTimeout(() => (button.style.backgroundColor = originalBg), 500);
    }

    enablePinning("#shapeMenu");
    enablePinning("#shapesSubmenu");

});

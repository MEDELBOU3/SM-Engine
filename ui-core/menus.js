document.addEventListener("DOMContentLoaded", () => {

    function setupMenu(triggerId, menuId, onAction = null) {
        const trigger = document.getElementById(triggerId);
        const menu = document.getElementById(menuId);

        if (!trigger || !menu) return;

        trigger.classList.add("menu-trigger");

        trigger.addEventListener("click", e => {
            e.stopPropagation();
            const isOpen = menu.classList.toggle("show");
            if (isOpen) closeAllOtherMenus(menu);
        });

        menu.addEventListener("click", e => e.stopPropagation());

        menu.querySelectorAll("button:not(.submenu-trigger)").forEach(btn => {
            btn.addEventListener("click", e => {
                e.stopPropagation();
                menu.classList.remove("show");
                if (onAction) onAction(btn.id);
            });
        });

        menu.addEventListener("keydown", e => {
            if (e.key === "Escape") {
                menu.classList.remove("show");
                trigger.focus();
            }
        });
    }

    function closeAllOtherMenus(menuToKeepOpen) {
        document.querySelectorAll(".menu.show").forEach(menu => {
            if (menu !== menuToKeepOpen) menu.classList.remove("show");
        });
    }

    document.addEventListener("click", e => {
        if (!e.target.closest(".menu") && !e.target.closest(".menu-trigger")) {
            document.querySelectorAll(".menu.show").forEach(menu =>
                menu.classList.remove("show")
            );
        }
    });

    setupMenu("shapeButton", "shapeMenu", shapeAction);
    setupMenu("cameraTools", "cameraMenu", cameraAction);

});

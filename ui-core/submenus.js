document.addEventListener("DOMContentLoaded", () => {

    function setupSubmenu(triggerId, submenuId, parentMenuId) {
        const trigger = document.getElementById(triggerId);
        const submenu = document.getElementById(submenuId);
        const parentMenu = document.getElementById(parentMenuId);

        if (!trigger || !submenu || !parentMenu) return;

        trigger.classList.add("submenu-trigger");
        submenu.classList.add("submenu");

        trigger.addEventListener("click", e => {
            e.stopPropagation();

            parentMenu.querySelectorAll(".submenu.show").forEach(sm => {
                if (sm !== submenu) sm.classList.remove("show");
            });

            submenu.classList.toggle("show");
            parentMenu.classList.add("show");
        });

        submenu.addEventListener("click", e => e.stopPropagation());

        submenu.querySelectorAll("button").forEach(btn => {
            btn.addEventListener("click", e => {
                e.stopPropagation();
                submenu.classList.remove("show");
                parentMenu.classList.remove("show");
                shapeAction(btn.id);
            });
        });
    }

    setupSubmenu("shapesSubmenuBtn", "shapesSubmenu", "shapeMenu");
    setupSubmenu("curvesSubmenuBtn", "curvesSubmenu", "shapeMenu");
    setupSubmenu("surfacesSubmenuBtn", "surfacesSubmenu", "shapeMenu");
    setupSubmenu("metaballSubmenuBtn", "metaballSubmenu", "shapeMenu");

});

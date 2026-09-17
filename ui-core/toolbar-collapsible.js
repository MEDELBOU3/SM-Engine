document.addEventListener("DOMContentLoaded", () => {

    document.querySelectorAll(".toolbar-collapsible").forEach(group => {
        const btn = group.querySelector(".tool-button");
        if (!btn) return;

        btn.addEventListener("click", e => {
            e.stopPropagation();
            document.querySelectorAll(".toolbar-collapsible").forEach(g => {
                if (g !== group) g.classList.remove("active");
            });
            group.classList.toggle("active");
        });
    });

    document.addEventListener("click", () => {
        document.querySelectorAll(".toolbar-collapsible")
            .forEach(group => group.classList.remove("active"));
    });

    document.querySelectorAll(".toolbar-collapsible-content").forEach(content => {
        content.addEventListener("click", e => e.stopPropagation());
    });

});

export class UIManager {
    toast(title, message, duration = 3300) {
        const root =
            document.getElementById(
                "toast-root"
            );

        if (!root) return;

        const node =
            document.createElement("div");

        node.className = "toast";
        node.innerHTML = `
            <strong>${this.escape(title)}</strong>
            <span>${this.escape(message)}</span>
        `;

        root.appendChild(node);

        window.setTimeout(
            () => {
                node.style.opacity = "0";
                node.style.transform =
                    "translateY(6px)";

                window.setTimeout(
                    () => node.remove(),
                    180
                );
            },
            duration
        );
    }

    escape(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }
}
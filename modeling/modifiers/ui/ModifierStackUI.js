/**
 * MODIFIER STACK UI - UI for managing modifier stacks
 */
(function () {
    const root = window.SMModifiers = window.SMModifiers || {};

    class ModifierStackUI {
        static renderStackHeader(stack, object) {
            const header = document.createElement('div');
            header.className = 'modifier-stack-header';
            header.innerHTML = `
                <h3>${object.name} - Modifiers</h3>
                <span class="modifier-count">${stack.modifiers.length}</span>
            `;
            return header;
        }

        static renderModifierList(modifiers) {
            const list = document.createElement('ul');
            list.className = 'modifier-list';
            modifiers.forEach((mod, idx) => {
                const li = document.createElement('li');
                li.textContent = `${idx + 1}. ${mod.name}`;
                list.appendChild(li);
            });
            return list;
        }
    }

    root.ModifierStackUI = ModifierStackUI;
})();

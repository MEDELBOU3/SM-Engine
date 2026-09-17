/**
 * ADD MODIFIER MENU - Menu for adding new modifiers
 */
(function () {
    const root = window.SMModifiers = window.SMModifiers || {};

    class AddModifierMenu {
        static categories = {
            'Generate': ['array', 'mirror', 'subdivision'],
            'Deform': ['bend', 'twist', 'taper', 'lattice'],
            'Modify': ['bevel', 'solidify', 'weld', 'decimate'],
            'Simulate': ['cloth', 'softbody'],
            'Procedural': ['noisedisplace', 'terrain', 'fractal']
        };

        static show(event, onSelect) {
            const menu = document.createElement('div');
            menu.className = 'add-modifier-menu';

            Object.entries(this.categories).forEach(([category, modifiers]) => {
                const categoryEl = document.createElement('div');
                categoryEl.className = 'modifier-menu-category';

                const categoryTitle = document.createElement('h4');
                categoryTitle.textContent = category;
                categoryEl.appendChild(categoryTitle);

                modifiers.forEach(modType => {
                    const item = document.createElement('button');
                    item.className = 'modifier-menu-item';
                    item.textContent = this.formatName(modType);
                    item.addEventListener('click', () => {
                        onSelect(modType);
                        menu.remove();
                    });
                    categoryEl.appendChild(item);
                });

                menu.appendChild(categoryEl);
            });

            menu.style.position = 'fixed';
            menu.style.top = event.clientY + 'px';
            menu.style.left = event.clientX + 'px';
            menu.style.zIndex = '10000';

            document.body.appendChild(menu);

            // Close on outside click
            setTimeout(() => {
                document.addEventListener('click', function closeMenu(e) {
                    if (!menu.contains(e.target)) {
                        menu.remove();
                        document.removeEventListener('click', closeMenu);
                    }
                });
            }, 0);
        }

        static formatName(type) {
            return type
                .split(/[-_]/)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        }
    }

    root.AddModifierMenu = AddModifierMenu;
})();

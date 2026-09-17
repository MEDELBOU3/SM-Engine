/**
 * MODIFIER CONTROLS - Individual modifier parameter controls
 */
(function () {
    const root = window.SMModifiers = window.SMModifiers || {};

    class ModifierControls {
        static createNumberInput(params) {
            const { key, label, value, min = 0, max = 100, step = 0.1, onChanged } = params;
            const container = document.createElement('div');
            container.className = 'control-group';

            const label_el = document.createElement('label');
            label_el.textContent = label;
            container.appendChild(label_el);

            const input = document.createElement('input');
            input.type = 'range';
            input.min = min;
            input.max = max;
            input.step = step;
            input.value = value;
            input.addEventListener('change', () => onChanged(parseFloat(input.value)));

            container.appendChild(input);

            const valueDisplay = document.createElement('span');
            valueDisplay.className = 'value-display';
            valueDisplay.textContent = value.toFixed(2);
            input.addEventListener('input', () => {
                valueDisplay.textContent = input.value.toFixed(2);
            });

            container.appendChild(valueDisplay);
            return container;
        }

        static createToggle(params) {
            const { key, label, value, onChanged } = params;
            const container = document.createElement('div');
            container.className = 'control-group';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = value;
            checkbox.addEventListener('change', () => onChanged(checkbox.checked));

            const label_el = document.createElement('label');
            label_el.appendChild(checkbox);
            label_el.appendChild(document.createTextNode(label));

            container.appendChild(label_el);
            return container;
        }

        static createSelect(params) {
            const { key, label, value, options, onChanged } = params;
            const container = document.createElement('div');
            container.className = 'control-group';

            const label_el = document.createElement('label');
            label_el.textContent = label;
            container.appendChild(label_el);

            const select = document.createElement('select');
            options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                select.appendChild(option);
            });
            select.value = value;
            select.addEventListener('change', () => onChanged(select.value));

            container.appendChild(select);
            return container;
        }
    }

    root.ModifierControls = ModifierControls;
})();

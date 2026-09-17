(function () {
    'use strict';
    const H = window.SMHistory = window.SMHistory || {};

    class HistoryListRenderer {
        static getIconAndColor(action) {
            const type = action.type || '';
            let iconClass = 'fa-cube';
            let colorClass = 'pp-color-blue';

            if (type === 'transform' || type === 'transform_2d') {
                colorClass = 'pp-color-green';
                iconClass = 'fa-arrows-alt';
            } else if (type === 'material') {
                colorClass = 'pp-color-purple';
                iconClass = 'fa-palette';
            } else if (type === 'property') {
                colorClass = 'pp-color-teal';
                iconClass = 'fa-sliders-h';
            } else if (type === 'sculpt') {
                colorClass = 'pp-color-orange';
                iconClass = 'fa-paint-brush';
            } else if (type === 'geometry' || type === 'modeling') {
                colorClass = 'pp-color-blue';
                iconClass = 'fa-shapes';
            } else if (type === 'lifecycle') {
                if (action.actionType === 'delete') {
                    colorClass = 'pp-color-orange';
                    iconClass = 'fa-trash-alt';
                } else {
                    colorClass = 'pp-color-blue';
                    iconClass = 'fa-plus-circle';
                }
            } else if (type.startsWith('2d_') || type === '2d_animation' || type === 'animation2d') {
                colorClass = 'pp-color-orange';
                if (type === '2d_stroke') iconClass = 'fa-pen-nib';
                else if (type === '2d_keyframe') iconClass = 'fa-film';
                else if (type === '2d_layer') iconClass = 'fa-layer-group';
                else iconClass = 'fa-paint-brush';
            } else if (type === 'custom') {
                colorClass = 'pp-color-purple';
                iconClass = 'fa-magic';
            }

            return { iconClass, colorClass };
        }

        static createSidebarRow(action, onJump) {
            const row = document.createElement("div");
            row.className = `pp-row ${action.status || ''}`;

            const { iconClass, colorClass } = this.getIconAndColor(action);
            const timeStr = action.timestamp ? new Date(action.timestamp).toLocaleTimeString([], {
                hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit"
            }) : '';

            row.innerHTML = `
                <div class="pp-cell" style="padding:0;"><div class="pp-color-strip ${colorClass}"></div></div>
                <div class="pp-cell pp-icon"><i class="fas ${iconClass}"></i></div>
                <div class="pp-cell name-cell">${action.name}</div>
                <div class="pp-cell time-cell">${timeStr}</div>
            `;

            if (typeof onJump === 'function') {
                row.onclick = () => onJump(action.id);
            }
            return row;
        }

        static createSystemItemRow(action, onJump) {
            const row = document.createElement("div");
            const isCurrent = action.status === 'current-state';
            const isFuture = action.status === 'future';

            row.className = `history-item ${isCurrent ? 'current-state' : ''} ${isFuture ? 'future-state' : ''}`;

            const { iconClass } = this.getIconAndColor(action);
            const timeStr = action.timestamp ? new Date(action.timestamp).toLocaleTimeString([], {
                hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit"
            }) : '';

            row.innerHTML = `
                <div class="history-icon"><i class="fas ${iconClass}"></i></div>
                <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${action.name}</div>
                <div style="font-size:10px; opacity:0.6; margin-left:6px;">${timeStr}</div>
            `;

            if (typeof onJump === 'function') {
                row.onclick = () => onJump(action.id);
            }
            return row;
        }
    }

    H.HistoryListRenderer = HistoryListRenderer;
})();
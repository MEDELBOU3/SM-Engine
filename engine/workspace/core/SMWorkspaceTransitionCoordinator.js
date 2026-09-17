// engine/workspace/core/SMWorkspaceTransitionCoordinator.js
// SM Engine — cancelable, token-based workspace transitions.
(function () {
    'use strict';

    class SMWorkspaceTransitionCoordinator {
        constructor() {
            this.id = 0;
            this.active = null;
            this.timers = new Set();
        }

        cancelScheduled() {
            for (
                const timer of
                this.timers
            ) {
                clearTimeout(
                    timer
                );
            }

            this.timers.clear();
        }

        begin({
            from = null,
            to,
            scene =
                window.scene,
            managerToken = 0
        } = {}) {
            this.cancelScheduled();

            const id =
                ++this.id;

            this.active = {
                id,
                from,
                to,
                managerToken,
                startedAt:
                    performance.now?.() ||
                    Date.now()
            };

            window.smWorkspaceVisibilityAuthority
                ?.setMode?.(
                    to,
                    {
                        scene,
                        transitionId:
                            id
                    }
                );

            window.dispatchEvent(
                new CustomEvent(
                    'sm:workspace-transition-start',
                    {
                        detail: {
                            ...this.active
                        }
                    }
                )
            );

            return id;
        }

        isCurrent(
            id,
            mode = null
        ) {
            if (
                !this.active ||
                this.active.id !==
                    id
            ) {
                return false;
            }

            if (
                mode &&
                window.workspaceManager
                    ?.currentMode !==
                    mode
            ) {
                return false;
            }

            return true;
        }

        schedule(
            id,
            callback,
            {
                mode = null,
                delays = [
                    50,
                    200,
                    600,
                    1400,
                    3200
                ]
            } = {}
        ) {
            if (
                typeof callback !==
                'function'
            ) {
                return;
            }

            requestAnimationFrame(
                () => {
                    if (
                        this.isCurrent(
                            id,
                            mode
                        )
                    ) {
                        callback();
                    }
                }
            );

            delays.forEach(
                delay => {
                    const timer =
                        setTimeout(
                            () => {
                                this.timers
                                    .delete(
                                        timer
                                    );

                                if (
                                    !this.isCurrent(
                                        id,
                                        mode
                                    )
                                ) {
                                    return;
                                }

                                callback();
                            },
                            delay
                        );

                    this.timers.add(
                        timer
                    );
                }
            );
        }

        commit(
            id,
            extra = {}
        ) {
            if (
                !this.isCurrent(
                    id
                )
            ) {
                return false;
            }

            const detail = {
                ...this.active,
                ...extra,
                committedAt:
                    performance.now?.() ||
                    Date.now()
            };

            window.dispatchEvent(
                new CustomEvent(
                    'sm:workspace-transition-complete',
                    {
                        detail
                    }
                )
            );

            window.dispatchEvent(
                new CustomEvent(
                    'sm:workspace-mode-changed',
                    {
                        detail: {
                            mode:
                                this.active.to,
                            previousMode:
                                this.active.from,
                            transitionId:
                                id
                        }
                    }
                )
            );

            return true;
        }
    }

    window.SMWorkspaceTransitionCoordinator =
        SMWorkspaceTransitionCoordinator;

    window.smWorkspaceTransitionCoordinator =
        window.smWorkspaceTransitionCoordinator ||
        new SMWorkspaceTransitionCoordinator();
})();
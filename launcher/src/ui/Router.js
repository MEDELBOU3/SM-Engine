export class Router {
    constructor() {
        this.routes = new Map();
        this.current = null;
        this.listeners = new Set();
    }

    register(name, factory) {
        this.routes.set(name, factory);
        return this;
    }

    onChange(callback) {
        this.listeners.add(callback);
        return () =>
            this.listeners.delete(callback);
    }

    start(initialRoute = "home") {
        this.go(initialRoute, {
            replace: true
        });
    }

    go(route, options = {}) {
        if (!this.routes.has(route)) {
            route = "home";
        }

        this.current = route;

        if (options.replace) {
            history.replaceState(
                { route },
                "",
                `#${route}`
            );
        } else {
            history.pushState(
                { route },
                "",
                `#${route}`
            );
        }

        this.emit();
    }

    refresh() {
        if (!this.current) return;
        this.emit();
    }

    emit() {
        const factory =
            this.routes.get(this.current);

        const view = factory?.();

        for (
            const callback
            of this.listeners
        ) {
            callback(
                this.current,
                view
            );
        }
    }
}
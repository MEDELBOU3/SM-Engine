// Run this in the renderer DevTools console after creating a NEW water body.
// It compares the latest JS CPU water surface with the native C++ surface.

(function () {
    const system =
        window.waterSystem ||
        window.smWaterSystem ||
        null;

    const bridge =
        window.SMNativeWaterBridge ||
        null;

    if (!system) {
        console.error('[SM Native Water Diagnostic] waterSystem is missing.');
        return;
    }

    if (!bridge) {
        console.error('[SM Native Water Diagnostic] SMNativeWaterBridge is missing.');
        return;
    }

    const body =
        system.activeBody ||
        Array.from(system.bodies?.values?.() || [])[0] ||
        null;

    if (!body) {
        console.error('[SM Native Water Diagnostic] Create/select a water body first.');
        return;
    }

    bridge.syncBody(body);

    let x = 0;
    let z = 0;

    if (body.type === 'river' && body.points?.length >= 2) {
        const a = body.points[0];
        const b = body.points[1];
        x = (a.x + b.x) * 0.5;
        z = (a.z + b.z) * 0.5;
    } else if (body.points?.length) {
        x =
            body.points.reduce((sum, p) => sum + p.x, 0) /
            body.points.length;
        z =
            body.points.reduce((sum, p) => sum + p.z, 0) /
            body.points.length;
    }

    const jsSurface =
        body.surfaceYAt(
            x,
            z,
            true,
            system.time
        );

    const native =
        bridge.sampleBody(
            body,
            { x, y: jsSurface, z }
        );

    const error =
        native?.found
            ? Math.abs(native.surfaceY - jsSurface)
            : Infinity;

    const row = {
        bodyId: body.id,
        type: body.type,
        nativeLoaded: bridge.stats().nativeLoaded,
        time: system.time,
        position: { x, z },
        jsSurfaceY: jsSurface,
        nativeSurfaceY: native?.surfaceY,
        absoluteError: error,
        normal: native?.normal,
        current: native?.current,
        PASS:
            !!native?.found &&
            error < 0.03
    };

    console.table([row]);

    if (row.PASS) {
        console.log(
            '[SM Native Water Diagnostic] PASS: native macro-wave sampling is synchronized with the latest JS water clock.'
        );
    } else {
        console.warn(
            '[SM Native Water Diagnostic] CHECK: expected < 0.03 m difference before adding native-only impulses.',
            row
        );
    }

    console.log(
        '[SM Native Water Diagnostic] Bridge stats:',
        bridge.stats()
    );
})();

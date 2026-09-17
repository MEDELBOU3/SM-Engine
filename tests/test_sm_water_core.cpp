#include "SMWaterCore.hpp"

#include <cassert>
#include <cmath>
#include <iostream>

int main() {
    sm::water::WaterWorld world;

    sm::water::WaterBody river;
    river.id = "river-test";
    river.config.type = sm::water::BodyType::River;
    river.config.width = 4.0;
    river.config.levelOffset = 0.08;
    river.config.waveHeight = 0.22;
    river.config.waveLength = 9.0;
    river.config.waveSpeed = 1.05;
    river.config.animationSpeed = 1.25;
    river.config.flowSpeed = 0.72;
    river.config.flowCoherence = 0.86;
    river.config.currentStrength = 1.5;
    river.config.currentBankDrag = 0.55;
    river.points = {
        {0.0, 0.0, 0.0},
        {10.0, 1.0, 0.0},
        {20.0, 1.5, 4.0}
    };

    assert(world.upsertBody(river));
    world.setTime(1.75);

    const auto sample = world.sample(5.0, 0.0);
    assert(sample.found);
    assert(sample.bodyId == "river-test");
    assert(std::isfinite(sample.surfaceY));
    assert(std::isfinite(sample.normal.x));
    assert(std::isfinite(sample.normal.y));
    assert(std::isfinite(sample.normal.z));
    assert(sample.normal.y > 0.5);
    assert(sample.current.length() > 0.0);

    assert(
        world.addRipple(
            "river-test",
            5.0,
            0.0,
            5.0,
            0.12,
            2.6,
            11.0,
            1.4,
            world.time()
        )
    );

    const auto afterRipple = world.sampleBody("river-test", 5.0, 0.0);
    assert(afterRipple.found);
    assert(std::isfinite(afterRipple.surfaceY));

    std::cout
        << "SMWaterCore test PASS\n"
        << "surfaceY=" << afterRipple.surfaceY << "\n"
        << "normal=("
        << afterRipple.normal.x << ", "
        << afterRipple.normal.y << ", "
        << afterRipple.normal.z << ")\n"
        << "current=("
        << afterRipple.current.x << ", "
        << afterRipple.current.y << ", "
        << afterRipple.current.z << ")\n";

    return 0;
}

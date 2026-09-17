/*
 * SM Engine - WebAssembly ABI for the shared native WaterWorld core.
 *
 * The Node addon and this ABI intentionally expose the same operations. The
 * Electron renderer can therefore use C++ water physics even when a local
 * MSVC toolchain is not installed, while the Node addon remains available for
 * desktop builds that need a native .node module.
 */

#include "SMWaterCore.hpp"

#include <emscripten.h>
#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstring>
#include <string>

using sm::water::BodyType;
using sm::water::Vec2;
using sm::water::Vec3;
using sm::water::WaterBody;
using sm::water::WaterConfig;
using sm::water::WaterSample;
using sm::water::WaterWorld;

namespace {

WaterWorld g_world;

double finiteOr(double value, double fallback) {
    return std::isfinite(value) ? value : fallback;
}

double configValue(const double* config, std::size_t index, double fallback) {
    return config ? finiteOr(config[index], fallback) : fallback;
}

BodyType parseType(double value) {
    const int type = static_cast<int>(value);
    if (type == 1) return BodyType::Lake;
    if (type == 2) return BodyType::Ocean;
    if (type == 3) return BodyType::Pool;
    return BodyType::River;
}

void writeId(const std::string& id, char* output, int capacity) {
    if (!output || capacity <= 0) return;
    const std::size_t maxCopy = static_cast<std::size_t>(capacity - 1);
    const std::size_t length = std::min(id.size(), maxCopy);
    if (length > 0) std::memcpy(output, id.data(), length);
    output[length] = '\0';
}

void writeSample(const WaterSample& sample, double* output, char* bodyId, int bodyIdCapacity) {
    if (!output) return;

    output[0] = sample.surfaceY;
    output[1] = sample.normal.x;
    output[2] = sample.normal.y;
    output[3] = sample.normal.z;
    output[4] = sample.current.x;
    output[5] = sample.current.y;
    output[6] = sample.current.z;
    output[7] = sample.surfaceVelocityY;
    output[8] = sample.waterDepth;
    writeId(sample.bodyId, bodyId, bodyIdCapacity);
}

WaterBody makeBody(const char* id, const double* config, const double* points, int pointCount) {
    WaterBody body;
    body.id = id ? id : "";

    WaterConfig& c = body.config;
    c.type = parseType(configValue(config, 0, 0.0));
    c.width = configValue(config, 1, c.width);
    c.levelOffset = configValue(config, 2, c.levelOffset);
    c.oceanSize = configValue(config, 3, c.oceanSize);
    c.volumeDepth = configValue(config, 4, c.volumeDepth);
    c.bedDepth = configValue(config, 5, c.bedDepth);
    c.waveHeight = configValue(config, 6, c.waveHeight);
    c.waveLength = configValue(config, 7, c.waveLength);
    c.waveSpeed = configValue(config, 8, c.waveSpeed);
    c.choppiness = configValue(config, 9, c.choppiness);
    c.waveScale = configValue(config, 19, c.waveScale);
    c.waveSteepness = configValue(config, 20, c.waveSteepness);
    c.waveChoppiness = configValue(config, 21, c.waveChoppiness);
    c.waveSpread = configValue(config, 22, c.waveSpread);
    c.windSpeed = configValue(config, 23, c.windSpeed);
    c.windDirection = {
        configValue(config, 24, c.windDirection.x),
        configValue(config, 25, c.windDirection.y)
    };
    c.smallWaveStrength = configValue(config, 26, c.smallWaveStrength);
    c.animationSpeed = configValue(config, 10, c.animationSpeed);
    c.flowSpeed = configValue(config, 11, c.flowSpeed);
    c.flowDirection = {
        configValue(config, 12, c.flowDirection.x),
        configValue(config, 13, c.flowDirection.y)
    };
    c.flowCoherence = configValue(config, 14, c.flowCoherence);
    c.flowReverse = configValue(config, 15, 0.0) > 0.5;
    c.currentStrength = configValue(config, 16, c.currentStrength);
    c.currentBankDrag = configValue(config, 17, c.currentBankDrag);
    c.rippleHeightScale = configValue(config, 18, c.rippleHeightScale);

    const int safeCount = std::max(0, std::min(pointCount, 1000000));
    if (points && safeCount > 0) {
        body.points.reserve(static_cast<std::size_t>(safeCount));
        for (int i = 0; i < safeCount; ++i) {
            const double* point = points + i * 3;
            body.points.push_back({
                finiteOr(point[0], 0.0),
                finiteOr(point[1], 0.0),
                finiteOr(point[2], 0.0)
            });
        }
    }

    return body;
}

} // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE void water_reset() {
    g_world.reset();
}

EMSCRIPTEN_KEEPALIVE void water_set_time(double seconds) {
    g_world.setTime(finiteOr(seconds, 0.0));
}

EMSCRIPTEN_KEEPALIVE void water_step(double deltaSeconds, double absoluteTime) {
    if (std::isfinite(absoluteTime)) {
        g_world.setTime(absoluteTime);
    } else {
        g_world.step(finiteOr(deltaSeconds, 0.0));
    }
}

EMSCRIPTEN_KEEPALIVE int water_upsert_body(
    const char* id,
    const double* config,
    const double* points,
    int pointCount
) {
    if (!id || !*id) return 0;
    return g_world.upsertBody(makeBody(id, config, points, pointCount)) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int water_remove_body(const char* id) {
    return id && g_world.removeBody(id) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int water_sample(
    double x,
    double z,
    double* output,
    char* bodyId,
    int bodyIdCapacity
) {
    const WaterSample sample = g_world.sample(
        finiteOr(x, 0.0),
        finiteOr(z, 0.0)
    );
    writeSample(sample, output, bodyId, bodyIdCapacity);
    return sample.found ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int water_sample_body(
    const char* id,
    double x,
    double z,
    double* output,
    char* bodyId,
    int bodyIdCapacity
) {
    const WaterSample sample = g_world.sampleBody(
        id ? id : "",
        finiteOr(x, 0.0),
        finiteOr(z, 0.0)
    );
    writeSample(sample, output, bodyId, bodyIdCapacity);
    return sample.found ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int water_add_ripple(
    const char* id,
    double x,
    double z,
    double radius,
    double strength,
    double speed,
    double frequency,
    double decay,
    double startTime
) {
    if (!id || !*id) return 0;
    return g_world.addRipple(
        id,
        finiteOr(x, 0.0),
        finiteOr(z, 0.0),
        finiteOr(radius, 7.0),
        finiteOr(strength, 0.14),
        finiteOr(speed, 2.6),
        finiteOr(frequency, 11.0),
        finiteOr(decay, 1.4),
        finiteOr(startTime, g_world.time())
    ) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int water_get_body_count() {
    return static_cast<int>(g_world.bodyCount());
}

EMSCRIPTEN_KEEPALIVE double water_get_time() {
    return g_world.time();
}

} // extern "C"

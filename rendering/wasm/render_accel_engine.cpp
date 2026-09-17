/*
 * SM Engine - native rendering preparation kernels.
 *
 * WebGL/Three.js still owns the GPU draw.  This module handles the CPU work
 * that is safe to move out of JavaScript: display-referred luminance
 * statistics and distance/intensity light selection.  Both kernels are
 * allocation-free from the caller's point of view and write into caller
 * supplied buffers so they can run every frame without creating JavaScript
 * garbage. The light candidate storage keeps its capacity between calls.
 */

#include <emscripten.h>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>

namespace {

static inline float finite_or(float value, float fallback) {
    return std::isfinite(value) ? value : fallback;
}

static inline float clamp01(float value) {
    return std::max(0.0f, std::min(1.0f, value));
}

static inline float srgb_to_linear(float value) {
    return value <= 0.04045f
        ? value / 12.92f
        : std::pow((value + 0.055f) / 1.055f, 2.4f);
}

static inline int luminance_bin(float value) {
    /* Log bins preserve shadow detail where exposure is most sensitive. */
    const float logMin = std::log(0.0001f);
    const float normalized = clamp01(
        (std::log(std::max(0.0001f, value)) - logMin) / -logMin
    );
    return std::max(0, std::min(255, static_cast<int>(normalized * 255.0f + 0.5f)));
}

struct LightCandidate {
    int index;
    float score;
    bool inRange;
};

static inline bool stronger(const LightCandidate& a, const LightCandidate& b) {
    if (a.score == b.score) return a.index < b.index;
    return a.score > b.score;
}

} // namespace

extern "C" {

/*
 * Analyse an RGBA8 display-referred buffer.
 * outStats = [weighted luminance, center luminance, 8th percentile,
 *             92nd percentile]
 * outSamples receives the number of valid alpha samples.
 */
EMSCRIPTEN_KEEPALIVE int render_analyze_luminance(
    const uint8_t* rgba,
    int width,
    int height,
    float centerWeight,
    float* outStats,
    int* outSamples
) {
    if (!rgba || !outStats || !outSamples || width <= 0 || height <= 0) {
        return 0;
    }

    const float center = clamp01(finite_or(centerWeight, 0.78f));
    const float edgeFloor = 1.0f - center;
    float weightedLog = 0.0f;
    float centerLog = 0.0f;
    float totalWeight = 0.0f;
    int centerSamples = 0;
    int samples = 0;
    int histogram[256] = {};

    const float invWidth = 1.0f / static_cast<float>(width);
    const float invHeight = 1.0f / static_cast<float>(height);

    for (int y = 0; y < height; ++y) {
        const float ny = ((static_cast<float>(y) + 0.5f) * invHeight - 0.5f) * 2.0f;
        for (int x = 0; x < width; ++x) {
            const int offset = (y * width + x) * 4;
            if (rgba[offset + 3] < 8) continue;

            const float r = srgb_to_linear(static_cast<float>(rgba[offset]) / 255.0f);
            const float g = srgb_to_linear(static_cast<float>(rgba[offset + 1]) / 255.0f);
            const float b = srgb_to_linear(static_cast<float>(rgba[offset + 2]) / 255.0f);
            const float luminance = std::max(
                0.0001f,
                std::min(1.0f, 0.2126f * r + 0.7152f * g + 0.0722f * b)
            );
            const float nx = ((static_cast<float>(x) + 0.5f) * invWidth - 0.5f) * 2.0f;
            const float radial = std::exp(-2.6f * (nx * nx + ny * ny));
            const float weight = edgeFloor + center * radial;
            const float logLum = std::log(luminance);

            weightedLog += logLum * weight;
            totalWeight += weight;
            if (nx * nx + ny * ny < 0.36f) {
                centerLog += logLum;
                ++centerSamples;
            }
            ++histogram[luminance_bin(luminance)];
            ++samples;
        }
    }

    auto percentile = [&](float fraction) {
        if (samples <= 0) return 0.18f;
        const int target = static_cast<int>(std::floor(
            static_cast<float>(samples - 1) * fraction
        ));
        int cumulative = 0;
        for (int bin = 0; bin < 256; ++bin) {
            cumulative += histogram[bin];
            if (cumulative > target) {
                return std::exp(
                    std::log(0.0001f) +
                    (static_cast<float>(bin) / 255.0f) * -std::log(0.0001f)
                );
            }
        }
        return 1.0f;
    };

    outStats[0] = totalWeight > 0.0f
        ? std::exp(weightedLog / totalWeight) : 0.18f;
    outStats[1] = centerSamples > 0
        ? std::exp(centerLog / static_cast<float>(centerSamples)) : 0.18f;
    outStats[2] = percentile(0.08f);
    outStats[3] = percentile(0.92f);
    *outSamples = samples;
    return 1;
}

/*
 * Select point and spot lights by the same score used by the JS fallback.
 * Each input record is six floats: world x/y/z, configured range, intensity,
 * and type (0 = point, 1 = spot). outVisible is one byte per input record;
 * outScores receives the calculated score for diagnostics and stable tests.
 */
EMSCRIPTEN_KEEPALIVE int render_select_lights(
    const float* input,
    int count,
    float cameraX,
    float cameraY,
    float cameraZ,
    float maxDistance,
    int maxPointLights,
    int maxSpotLights,
    uint8_t* outVisible,
    float* outScores
) {
    if (!input || !outVisible || !outScores || count <= 0) return 0;

    const float cx = finite_or(cameraX, 0.0f);
    const float cy = finite_or(cameraY, 0.0f);
    const float cz = finite_or(cameraZ, 0.0f);
    const float sceneDistance = std::max(0.0f, finite_or(maxDistance, 120.0f));
    const int pointLimit = std::max(0, maxPointLights);
    const int spotLimit = std::max(0, maxSpotLights);

    /* WASM is single-threaded here; retain capacity to avoid frame allocations. */
    static std::vector<LightCandidate> points;
    static std::vector<LightCandidate> spots;
    points.clear();
    spots.clear();
    if (points.capacity() < static_cast<size_t>(count)) {
        points.reserve(static_cast<size_t>(count));
    }
    if (spots.capacity() < static_cast<size_t>(count)) {
        spots.reserve(static_cast<size_t>(count));
    }

    for (int i = 0; i < count; ++i) {
        outVisible[i] = 0;
        const float* record = input + i * 6;
        const float x = finite_or(record[0], 0.0f);
        const float y = finite_or(record[1], 0.0f);
        const float z = finite_or(record[2], 0.0f);
        const float configuredRange = finite_or(record[3], 0.0f);
        const float intensity = std::max(0.0f, finite_or(record[4], 0.0f));
        const int type = static_cast<int>(record[5]);
        const float dx = cx - x;
        const float dy = cy - y;
        const float dz = cz - z;
        const float distance = std::sqrt(dx * dx + dy * dy + dz * dz);
        const float range = std::min(
            sceneDistance,
            configuredRange > 0.0f ? configuredRange : sceneDistance
        );
        const float score = intensity / std::max(1.0f, distance * distance);
        const bool inRange = distance <= range;
        outScores[i] = score;

        const LightCandidate candidate { i, score, inRange };
        if (type == 0) points.push_back(candidate);
        else if (type == 1) spots.push_back(candidate);
    }

    std::sort(points.begin(), points.end(), stronger);
    std::sort(spots.begin(), spots.end(), stronger);

    int selected = 0;
    for (size_t i = 0; i < points.size(); ++i) {
        if (points[i].inRange && static_cast<int>(i) < pointLimit) {
            outVisible[points[i].index] = 1;
            ++selected;
        }
    }
    for (size_t i = 0; i < spots.size(); ++i) {
        if (spots[i].inRange && static_cast<int>(i) < spotLimit) {
            outVisible[spots[i].index] = 1;
            ++selected;
        }
    }
    return selected;
}

} // extern "C"

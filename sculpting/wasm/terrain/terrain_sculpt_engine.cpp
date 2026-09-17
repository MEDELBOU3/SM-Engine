/*
 * SM Engine - native terrain heightfield sculpting kernels.
 *
 * This file intentionally stays separate from sculpt_engine.cpp. Mesh
 * sculpting works on arbitrary indexed geometry; terrain sculpting works on a
 * dense row-major heightfield. Keeping the state separate lets both systems
 * share one WASM module without coupling their lifetimes.
 *
 * Coordinates are grid-space floats:
 *   x: [0, width - 1]
 *   z: [0, height - 1]
 * radiusX/radiusZ are ellipse radii in grid samples.
 * heights are stored in the same normalized units as TerrainData.heights.
 */

#include <emscripten.h>
#include <algorithm>
#include <cmath>
#include <climits>
#include <cstdlib>
#include <cstring>
#include <stdint.h>

namespace {

enum TerrainTool {
    TOOL_RAISE_LOWER = 0,
    TOOL_SMOOTH = 1,
    TOOL_FLATTEN = 2,
    TOOL_PINCH = 3,
    TOOL_CLAY = 4,
    TOOL_SCRAPE = 5,
    TOOL_NOISE = 6,
    TOOL_PERLIN = 7,
    TOOL_EROSION = 8,
    TOOL_THERMAL_EROSION = 9,
    TOOL_TERRACE = 10,
    TOOL_GRAB = 11,
    TOOL_INFLATE = 12,
    TOOL_DEFLATE = 13,
    TOOL_CREASE = 14,
    TOOL_FILL = 15,
    TOOL_RELAX = 16,
    TOOL_LEVEL = 17,
    TOOL_RIDGE = 18,
    TOOL_VALLEY = 19,
    TOOL_CLIFF = 20,
    TOOL_PLATEAU = 21,
    TOOL_CRATER = 22,
    TOOL_CANYON = 23,
    TOOL_DUNE = 24,
    TOOL_HYDRAULIC = 25,
    TOOL_DEPOSITION = 26,
    TOOL_SHARPEN = 27,
    TOOL_BLUR = 28
};

static float* g_terrain_height = nullptr;
static int g_terrain_width = 0;
static int g_terrain_height_count = 0;
static float g_terrain_step_x = 1.0f;
static float g_terrain_step_z = 1.0f;

static int g_dirty_min_x = INT_MAX;
static int g_dirty_max_x = INT_MIN;
static int g_dirty_min_z = INT_MAX;
static int g_dirty_max_z = INT_MIN;

static inline float clampf(float value, float low, float high) {
    return std::max(low, std::min(high, value));
}

static inline bool isFiniteValue(float value) {
    return std::isfinite(value);
}

static inline int clamp_x(int x) {
    return std::max(0, std::min(g_terrain_width - 1, x));
}

static inline int clamp_z(int z) {
    return std::max(0, std::min(g_terrain_height_count - 1, z));
}

static inline int terrain_index(int x, int z) {
    return clamp_z(z) * g_terrain_width + clamp_x(x);
}

static inline void reset_dirty() {
    g_dirty_min_x = INT_MAX;
    g_dirty_max_x = INT_MIN;
    g_dirty_min_z = INT_MAX;
    g_dirty_max_z = INT_MIN;
}

static inline void mark_dirty(int x, int z) {
    if (x < g_dirty_min_x) g_dirty_min_x = x;
    if (x > g_dirty_max_x) g_dirty_max_x = x;
    if (z < g_dirty_min_z) g_dirty_min_z = z;
    if (z > g_dirty_max_z) g_dirty_max_z = z;
}

static inline float read_height(const float* source, int x, int z) {
    return source[terrain_index(x, z)];
}

static inline void write_height(int x, int z, float value) {
    if (!isFiniteValue(value)) return;
    const int index = terrain_index(x, z);
    if (g_terrain_height[index] == value) return;
    g_terrain_height[index] = value;
    mark_dirty(clamp_x(x), clamp_z(z));
}

static inline void add_height(int x, int z, float delta) {
    if (!isFiniteValue(delta)) return;
    const int index = terrain_index(x, z);
    write_height(x, z, g_terrain_height[index] + delta);
}

static float neighbour_average(
    const float* source,
    int x,
    int z,
    int radius
) {
    float total = 0.0f;
    int count = 0;

    for (int dz = -radius; dz <= radius; dz++) {
        for (int dx = -radius; dx <= radius; dx++) {
            const int nx = x + dx;
            const int nz = z + dz;
            if (nx < 0 || nx >= g_terrain_width ||
                nz < 0 || nz >= g_terrain_height_count) {
                continue;
            }
            total += read_height(source, nx, nz);
            count++;
        }
    }

    return count > 0 ? total / static_cast<float>(count) :
        read_height(source, x, z);
}

static float neighbour_average_8(const float* source, int x, int z) {
    float total = 0.0f;
    int count = 0;

    for (int dz = -1; dz <= 1; dz++) {
        for (int dx = -1; dx <= 1; dx++) {
            if (dx == 0 && dz == 0) continue;
            const int nx = x + dx;
            const int nz = z + dz;
            if (nx < 0 || nx >= g_terrain_width ||
                nz < 0 || nz >= g_terrain_height_count) {
                continue;
            }
            total += read_height(source, nx, nz);
            count++;
        }
    }

    return count > 0 ? total / static_cast<float>(count) :
        read_height(source, x, z);
}

static inline float brush_weight(
    int x,
    int z,
    float center_x,
    float center_z,
    float radius_x,
    float radius_z,
    float falloff_shape
) {
    const float dx = (static_cast<float>(x) - center_x) /
        std::max(0.5f, radius_x);
    const float dz = (static_cast<float>(z) - center_z) /
        std::max(0.5f, radius_z);
    const float distance = std::sqrt(dx * dx + dz * dz);
    if (distance > 1.0f) return 0.0f;

    const float exponent = 0.35f + clampf(falloff_shape, 0.0f, 1.0f) * 4.0f;
    return std::pow(std::max(0.0f, 1.0f - distance), exponent);
}

static inline float hash2d(int x, int z, int seed) {
    uint32_t h = static_cast<uint32_t>(x) * 374761393u;
    h ^= static_cast<uint32_t>(z) * 668265263u;
    h ^= static_cast<uint32_t>(seed) * 2246822519u;
    h ^= h >> 13;
    h *= 1274126177u;
    h ^= h >> 16;
    return static_cast<float>(h) / 4294967295.0f;
}

static inline float smoothstep(float value) {
    const float t = clampf(value, 0.0f, 1.0f);
    return t * t * (3.0f - 2.0f * t);
}

static float value_noise(float x, float z, int seed) {
    const int x0 = static_cast<int>(std::floor(x));
    const int z0 = static_cast<int>(std::floor(z));
    const float tx = smoothstep(x - static_cast<float>(x0));
    const float tz = smoothstep(z - static_cast<float>(z0));

    const float n00 = hash2d(x0, z0, seed) * 2.0f - 1.0f;
    const float n10 = hash2d(x0 + 1, z0, seed) * 2.0f - 1.0f;
    const float n01 = hash2d(x0, z0 + 1, seed) * 2.0f - 1.0f;
    const float n11 = hash2d(x0 + 1, z0 + 1, seed) * 2.0f - 1.0f;

    const float a = n00 + (n10 - n00) * tx;
    const float b = n01 + (n11 - n01) * tx;
    return a + (b - a) * tz;
}

static float fractal_noise(float x, float z, int seed, int octaves) {
    float value = 0.0f;
    float amplitude = 1.0f;
    float frequency = 1.0f;
    float total_amplitude = 0.0f;
    const int count = std::max(1, std::min(8, octaves));

    for (int octave = 0; octave < count; octave++) {
        value += value_noise(
            x * frequency,
            z * frequency,
            seed + octave * 1013
        ) * amplitude;
        total_amplitude += amplitude;
        amplitude *= 0.5f;
        frequency *= 2.0f;
    }

    return total_amplitude > 0.0f ? value / total_amplitude : 0.0f;
}

static bool needs_source(int tool) {
    switch (tool) {
        case TOOL_SMOOTH:
        case TOOL_PINCH:
        case TOOL_CLAY:
        case TOOL_SCRAPE:
        case TOOL_EROSION:
        case TOOL_THERMAL_EROSION:
        case TOOL_FILL:
        case TOOL_RELAX:
        case TOOL_LEVEL:
        case TOOL_RIDGE:
        case TOOL_VALLEY:
        case TOOL_CLIFF:
        case TOOL_PLATEAU:
        case TOOL_SHARPEN:
        case TOOL_BLUR:
        case TOOL_DEPOSITION:
        case TOOL_HYDRAULIC:
            return true;
        default:
            return false;
    }
}

static void apply_thermal_erosion(
    int min_x,
    int max_x,
    int min_z,
    int max_z,
    float center_x,
    float center_z,
    float radius_x,
    float radius_z,
    float falloff_shape,
    float amount,
    float talus,
    int iterations,
    float* source
) {
    const int passes = std::max(1, std::min(12, iterations));
    for (int pass = 0; pass < passes; pass++) {
        std::memcpy(
            source,
            g_terrain_height,
            static_cast<size_t>(g_terrain_width) *
                static_cast<size_t>(g_terrain_height_count) * sizeof(float)
        );

        for (int z = min_z; z <= max_z; z++) {
            for (int x = min_x; x <= max_x; x++) {
                const float weight = brush_weight(
                    x, z, center_x, center_z, radius_x, radius_z, falloff_shape
                );
                if (weight <= 0.0f) continue;

                const float current = read_height(source, x, z);
                const float average = neighbour_average_8(source, x, z);
                const float difference = current - average;
                if (difference > talus) {
                    add_height(x, z, -difference * 0.18f * amount * weight);
                }
            }
        }
    }
}

static void apply_hydraulic_erosion(
    int min_x,
    int max_x,
    int min_z,
    int max_z,
    float center_x,
    float center_z,
    float radius_x,
    float radius_z,
    float falloff_shape,
    float amount,
    int iterations,
    float sediment_capacity,
    float evaporation,
    float* source
) {
    std::memcpy(
        source,
        g_terrain_height,
        static_cast<size_t>(g_terrain_width) *
            static_cast<size_t>(g_terrain_height_count) * sizeof(float)
    );

    const int steps = std::max(2, std::min(16, iterations));
    const float capacity_scale = std::max(0.05f, sediment_capacity);
    const float evaporation_rate = clampf(evaporation, 0.0f, 0.8f);

    for (int z = min_z; z <= max_z; z++) {
        for (int x = min_x; x <= max_x; x++) {
            const float brush = brush_weight(
                x, z, center_x, center_z, radius_x, radius_z, falloff_shape
            );
            if (brush <= 0.0f) continue;

            int cx = x;
            int cz = z;
            float water = 0.35f;
            float sediment = 0.0f;

            for (int step = 0; step < steps; step++) {
                const float current = read_height(source, cx, cz);
                float lowest = current;
                int low_x = cx;
                int low_z = cz;

                for (int dz = -1; dz <= 1; dz++) {
                    for (int dx = -1; dx <= 1; dx++) {
                        if (dx == 0 && dz == 0) continue;
                        const int nx = cx + dx;
                        const int nz = cz + dz;
                        if (nx < 0 || nx >= g_terrain_width ||
                            nz < 0 || nz >= g_terrain_height_count) continue;
                        const float neighbour = read_height(source, nx, nz);
                        if (neighbour < lowest) {
                            lowest = neighbour;
                            low_x = nx;
                            low_z = nz;
                        }
                    }
                }

                const float downhill = current - lowest;
                if (downhill > 0.0f) {
                    const float capacity = std::max(
                        0.001f,
                        downhill * water * capacity_scale
                    );
                    const float eroded = std::min(
                        downhill * 0.35f,
                        capacity
                    ) * amount * brush;
                    add_height(cx, cz, -eroded);
                    sediment += eroded;
                } else if (sediment > 0.0f) {
                    const float deposited = sediment * 0.35f;
                    add_height(cx, cz, deposited);
                    sediment -= deposited;
                }

                cx = low_x;
                cz = low_z;
                water *= std::max(0.2f, 1.0f - evaporation_rate);
            }
        }
    }
}

} // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE
void terrain_bind(
    int heights_ptr,
    int width,
    int height,
    float step_x,
    float step_z
) {
    g_terrain_height = reinterpret_cast<float*>(heights_ptr);
    g_terrain_width = std::max(0, width);
    g_terrain_height_count = std::max(0, height);
    g_terrain_step_x = std::max(0.0001f, step_x);
    g_terrain_step_z = std::max(0.0001f, step_z);
    reset_dirty();
}

EMSCRIPTEN_KEEPALIVE
void terrain_sync(int heights_ptr) {
    g_terrain_height = reinterpret_cast<float*>(heights_ptr);
    reset_dirty();
}

EMSCRIPTEN_KEEPALIVE
void terrain_clear_state() {
    g_terrain_height = nullptr;
    g_terrain_width = 0;
    g_terrain_height_count = 0;
    g_terrain_step_x = 1.0f;
    g_terrain_step_z = 1.0f;
    reset_dirty();
}

EMSCRIPTEN_KEEPALIVE
int terrain_get_dirty_rect(
    int* out_min_x,
    int* out_max_x,
    int* out_min_z,
    int* out_max_z
) {
    const bool dirty =
        g_dirty_min_x != INT_MAX &&
        g_dirty_max_x != INT_MIN &&
        g_dirty_min_z != INT_MAX &&
        g_dirty_max_z != INT_MIN;

    *out_min_x = dirty ? g_dirty_min_x : 0;
    *out_max_x = dirty ? g_dirty_max_x : 0;
    *out_min_z = dirty ? g_dirty_min_z : 0;
    *out_max_z = dirty ? g_dirty_max_z : 0;
    reset_dirty();
    return dirty ? 1 : 0;
}

/*
 * Apply one terrain stamp.
 *
 * param0 is the signed direction (+1/-1).
 * param1/2/3 are tool-specific:
 *   flatten/level target, terrace step, noise amplitude/frequency/octaves,
 *   erosion iterations/talus/capacity, or hydraulic iterations/capacity/
 *   evaporation.
 */
EMSCRIPTEN_KEEPALIVE
int terrain_apply_brush(
    int tool,
    float center_x,
    float center_z,
    float radius_x,
    float radius_z,
    float strength,
    float pressure,
    float falloff_shape,
    float height_scale,
    float param0,
    float param1,
    float param2,
    float param3,
    int seed
) {
    if (!g_terrain_height || g_terrain_width < 2 ||
        g_terrain_height_count < 2) {
        return 0;
    }

    reset_dirty();

    radius_x = std::max(0.5f, std::fabs(radius_x));
    radius_z = std::max(0.5f, std::fabs(radius_z));
    const int min_x = std::max(
        0,
        static_cast<int>(std::floor(center_x - radius_x))
    );
    const int max_x = std::min(
        g_terrain_width - 1,
        static_cast<int>(std::ceil(center_x + radius_x))
    );
    const int min_z = std::max(
        0,
        static_cast<int>(std::floor(center_z - radius_z))
    );
    const int max_z = std::min(
        g_terrain_height_count - 1,
        static_cast<int>(std::ceil(center_z + radius_z))
    );

    const float amount = clampf(strength, 0.0f, 1.0f) *
        clampf(pressure, 0.0f, 1.0f);
    const float direction = param0 < 0.0f ? -1.0f : 1.0f;
    const float height_scale_safe = std::max(0.0001f, std::fabs(height_scale));
    const float world_to_height = 1.0f / height_scale_safe;

    float* source = nullptr;
    if (needs_source(tool)) {
        const size_t count = static_cast<size_t>(g_terrain_width) *
            static_cast<size_t>(g_terrain_height_count);
        source = static_cast<float*>(std::malloc(count * sizeof(float)));
        if (!source) return 0;
        std::memcpy(source, g_terrain_height, count * sizeof(float));
    }

    if (tool == TOOL_THERMAL_EROSION) {
        const int iterations = isFiniteValue(param1) ? static_cast<int>(std::round(param1)) : 2;
        const float talus = isFiniteValue(param2) ? std::max(0.0f, param2) : 0.08f;
        apply_thermal_erosion(
            min_x, max_x, min_z, max_z,
            center_x, center_z, radius_x, radius_z, falloff_shape,
            amount, talus, iterations, source
        );
        std::free(source);
        return 1;
    }

    if (tool == TOOL_HYDRAULIC || tool == TOOL_EROSION) {
        const int iterations = isFiniteValue(param1) ? static_cast<int>(std::round(param1)) : 4;
        const float capacity = isFiniteValue(param2) ? param2 : 1.2f;
        const float evaporation = isFiniteValue(param3) ? param3 : 0.08f;
        apply_hydraulic_erosion(
            min_x, max_x, min_z, max_z,
            center_x, center_z, radius_x, radius_z, falloff_shape,
            amount, iterations, capacity, evaporation, source
        );
        std::free(source);
        return 1;
    }

    const int center_ix = clamp_x(static_cast<int>(std::round(center_x)));
    const int center_iz = clamp_z(static_cast<int>(std::round(center_z)));
    const float center_height = source
        ? read_height(source, center_ix, center_iz)
        : g_terrain_height[terrain_index(center_ix, center_iz)];

    float target = param1;
    if ((tool == TOOL_FLATTEN || tool == TOOL_LEVEL || tool == TOOL_PLATEAU ||
         tool == TOOL_CLIFF) && !isFiniteValue(target)) {
        target = source
            ? neighbour_average(source, center_ix, center_iz, 2)
            : center_height;
    }

    for (int z = min_z; z <= max_z; z++) {
        for (int x = min_x; x <= max_x; x++) {
            const float weight = brush_weight(
                x, z, center_x, center_z, radius_x, radius_z, falloff_shape
            );
            if (weight <= 0.0f) continue;

            const int index = terrain_index(x, z);
            const float current = source ? source[index] : g_terrain_height[index];
            const float average8 = source
                ? neighbour_average_8(source, x, z)
                : current;
            const float blend = amount * weight;

            switch (tool) {
                case TOOL_RAISE_LOWER:
                    add_height(x, z, direction * 0.35f * amount *
                        world_to_height * weight);
                    break;

                case TOOL_SMOOTH:
                    add_height(x, z, (average8 - current) * amount * 0.82f * weight);
                    break;

                case TOOL_FLATTEN:
                case TOOL_LEVEL:
                    add_height(x, z, (target - current) * blend * 0.9f);
                    break;

                case TOOL_PINCH:
                    add_height(x, z, (center_height - current) * blend * 0.38f);
                    break;

                case TOOL_CLAY: {
                    const float local_average = source
                        ? neighbour_average(source, x, z, 1)
                        : current;
                    const float displacement = direction * 0.26f * amount *
                        world_to_height + (local_average - current) * 0.06f;
                    add_height(x, z, displacement * weight);
                    break;
                }

                case TOOL_SCRAPE:
                    add_height(x, z, -(current - average8) * amount * 0.28f * weight);
                    break;

                case TOOL_NOISE:
                case TOOL_PERLIN: {
                    const float amplitude = isFiniteValue(param1) ? param1 : 1.0f;
                    const float frequency = isFiniteValue(param2) ? std::max(0.0001f, param2) : 0.08f;
                    const int octaves = isFiniteValue(param3) ? static_cast<int>(std::round(param3)) : 5;
                    const float n = fractal_noise(
                        static_cast<float>(x) * frequency,
                        static_cast<float>(z) * frequency,
                        seed,
                        octaves
                    );
                    const float mode_scale = tool == TOOL_PERLIN ? 0.12f : 0.08f;
                    add_height(x, z, (n * amplitude * amount * mode_scale) * weight);
                    break;
                }

                case TOOL_TERRACE: {
                    const float step = isFiniteValue(param1) ? std::max(0.001f, param1) : 1.0f;
                    const float stepped = std::round(current / step) * step;
                    add_height(x, z, (stepped - current) * blend);
                    break;
                }

                case TOOL_GRAB:
                    add_height(x, z, direction * 0.45f * amount *
                        world_to_height * std::pow(weight, 0.8f));
                    break;

                case TOOL_INFLATE:
                case TOOL_DEFLATE:
                    add_height(x, z, direction * (tool == TOOL_DEFLATE ? -1.0f : 1.0f) *
                        0.35f * amount * world_to_height * weight);
                    break;

                case TOOL_CREASE:
                    add_height(x, z, direction * (current - average8) * amount * 0.75f * weight);
                    break;

                case TOOL_FILL: {
                    const float local_average = source
                        ? neighbour_average(source, x, z, 2)
                        : current;
                    add_height(x, z, (local_average - current) * amount * 0.32f * weight);
                    break;
                }

                case TOOL_RELAX:
                    add_height(x, z, (average8 - current) * amount * 0.32f);
                    break;

                case TOOL_RIDGE: {
                    const float local_average = source
                        ? neighbour_average(source, x, z, 2)
                        : current;
                    add_height(x, z, std::fabs(current - local_average) * amount * 0.42f * weight);
                    break;
                }

                case TOOL_VALLEY: {
                    const float depression = std::max(0.0f, current - average8);
                    add_height(x, z, -depression * amount * 0.5f * weight);
                    break;
                }

                case TOOL_CLIFF: {
                    const float stepped = std::round((current - target) * 2.0f) * 0.5f + target;
                    add_height(x, z, (stepped - current) * amount * 0.65f * weight);
                    break;
                }

                case TOOL_PLATEAU:
                    if (current > target) {
                        add_height(x, z, (target - current) * blend);
                    }
                    break;

                case TOOL_CRATER: {
                    const float dx = (static_cast<float>(x) - center_x) /
                        std::max(0.5f, radius_x);
                    const float dz = (static_cast<float>(z) - center_z) /
                        std::max(0.5f, radius_z);
                    const float distance = std::sqrt(dx * dx + dz * dz);
                    const float bowl = std::pow(std::max(0.0f, 1.0f - distance), 1.5f);
                    const float rim = std::exp(-std::pow((distance - 0.62f) * 7.0f, 2.0f));
                    add_height(x, z, direction * (rim * 0.038f - bowl * 0.07f) *
                        amount * world_to_height * weight);
                    break;
                }

                case TOOL_CANYON: {
                    const float nx = (static_cast<float>(x) - center_x) /
                        std::max(0.5f, radius_x);
                    const float nz = (static_cast<float>(z) - center_z) /
                        std::max(0.5f, radius_z);
                    const float axis = std::fabs(nx * 0.82f + nz * 0.18f);
                    const float trench = std::pow(std::max(0.0f, 1.0f - axis), 3.0f);
                    const float shoulder = std::exp(-std::pow((axis - 0.58f) * 6.0f, 2.0f));
                    add_height(x, z, direction * (-trench * 0.11f + shoulder * 0.035f) *
                        amount * world_to_height * weight);
                    break;
                }

                case TOOL_DUNE: {
                    const float nx = (static_cast<float>(x) - center_x) /
                        std::max(0.5f, radius_x);
                    const float nz = (static_cast<float>(z) - center_z) /
                        std::max(0.5f, radius_z);
                    const float wave = std::sin((nx * 3.5f + nz * 1.7f) * 3.14159265f);
                    add_height(x, z, wave * amount * 0.025f * world_to_height * weight);
                    break;
                }

                case TOOL_DEPOSITION: {
                    const float local_average = source
                        ? neighbour_average(source, x, z, 2)
                        : current;
                    add_height(x, z, std::max(0.0f, local_average - current) *
                        amount * 0.35f * weight);
                    break;
                }

                case TOOL_SHARPEN:
                    add_height(x, z, (current - average8) * amount * 0.6f);
                    break;

                case TOOL_BLUR: {
                    const float local_average = source
                        ? neighbour_average(source, x, z, 2)
                        : current;
                    add_height(x, z, (local_average - current) * amount * 0.65f);
                    break;
                }

                default:
                    break;
            }
        }
    }

    std::free(source);
    return 1;
}

} // extern "C"

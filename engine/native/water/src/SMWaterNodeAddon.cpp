#include "SMWaterCore.hpp"

#include <node_api.h>

#include <cmath>
#include <memory>
#include <optional>
#include <string>
#include <vector>

using sm::water::BodyType;
using sm::water::Vec2;
using sm::water::Vec3;
using sm::water::WaterBody;
using sm::water::WaterConfig;
using sm::water::WaterSample;
using sm::water::WaterWorld;

namespace {

std::unique_ptr<WaterWorld> g_world = std::make_unique<WaterWorld>();

void throwNapi(napi_env env, const char* message) {
    napi_throw_error(env, nullptr, message);
}

bool isObject(napi_env env, napi_value value) {
    napi_valuetype type{};
    if (napi_typeof(env, value, &type) != napi_ok) return false;
    return type == napi_object;
}

bool getNamed(napi_env env, napi_value object, const char* key, napi_value* out) {
    bool has = false;
    if (napi_has_named_property(env, object, key, &has) != napi_ok || !has) {
        return false;
    }
    return napi_get_named_property(env, object, key, out) == napi_ok;
}

double getNumber(
    napi_env env,
    napi_value object,
    const char* key,
    double fallback
) {
    napi_value value{};
    if (!getNamed(env, object, key, &value)) return fallback;

    double result = fallback;
    if (napi_get_value_double(env, value, &result) != napi_ok || !std::isfinite(result)) {
        return fallback;
    }
    return result;
}

bool getBool(
    napi_env env,
    napi_value object,
    const char* key,
    bool fallback
) {
    napi_value value{};
    if (!getNamed(env, object, key, &value)) return fallback;

    bool result = fallback;
    if (napi_get_value_bool(env, value, &result) != napi_ok) {
        return fallback;
    }
    return result;
}

std::string valueToString(napi_env env, napi_value value) {
    std::size_t length = 0;
    if (napi_get_value_string_utf8(env, value, nullptr, 0, &length) != napi_ok) {
        return {};
    }

    std::string out(length + 1, '\0');
    std::size_t written = 0;
    if (
        napi_get_value_string_utf8(
            env,
            value,
            out.data(),
            out.size(),
            &written
        ) != napi_ok
    ) {
        return {};
    }
    out.resize(written);
    return out;
}

std::string getString(
    napi_env env,
    napi_value object,
    const char* key,
    const std::string& fallback = {}
) {
    napi_value value{};
    if (!getNamed(env, object, key, &value)) return fallback;

    const std::string out = valueToString(env, value);
    return out.empty() ? fallback : out;
}

BodyType parseType(const std::string& type) {
    if (type == "lake") return BodyType::Lake;
    if (type == "ocean") return BodyType::Ocean;
    if (type == "pool") return BodyType::Pool;
    return BodyType::River;
}

Vec2 parseVec2(
    napi_env env,
    napi_value object,
    const char* key,
    Vec2 fallback
) {
    napi_value value{};
    if (!getNamed(env, object, key, &value) || !isObject(env, value)) {
        return fallback;
    }

    Vec2 out{
        getNumber(env, value, "x", fallback.x),
        getNumber(env, value, "y", fallback.y)
    };

    if (out.lengthSq() < 1e-12) {
        return fallback;
    }
    out.normalize();
    return out;
}

bool parsePoints(
    napi_env env,
    napi_value object,
    std::vector<Vec3>& out
) {
    napi_value points{};
    if (!getNamed(env, object, "points", &points)) {
        return true;
    }

    bool isArray = false;
    if (napi_is_array(env, points, &isArray) != napi_ok || !isArray) {
        return false;
    }

    std::uint32_t length = 0;
    if (napi_get_array_length(env, points, &length) != napi_ok) {
        return false;
    }

    out.clear();
    out.reserve(length);

    for (std::uint32_t i = 0; i < length; ++i) {
        napi_value point{};
        if (napi_get_element(env, points, i, &point) != napi_ok || !isObject(env, point)) {
            continue;
        }

        out.push_back({
            getNumber(env, point, "x", 0.0),
            getNumber(env, point, "y", 0.0),
            getNumber(env, point, "z", 0.0)
        });
    }

    return true;
}

WaterConfig parseConfig(napi_env env, napi_value object) {
    WaterConfig c{};
    c.type = parseType(getString(env, object, "type", "river"));

    c.width = getNumber(env, object, "width", c.width);
    c.levelOffset = getNumber(env, object, "levelOffset", c.levelOffset);
    c.oceanSize = getNumber(env, object, "oceanSize", c.oceanSize);
    c.volumeDepth = getNumber(env, object, "volumeDepth", c.volumeDepth);
    c.bedDepth = getNumber(env, object, "bedDepth", c.bedDepth);

    c.waveHeight = getNumber(env, object, "waveHeight", c.waveHeight);
    c.waveLength = getNumber(env, object, "waveLength", c.waveLength);
    c.waveSpeed = getNumber(env, object, "waveSpeed", c.waveSpeed);
    c.choppiness = getNumber(env, object, "choppiness", c.choppiness);
    c.waveScale = getNumber(env, object, "waveScale", c.waveScale);
    c.waveSteepness = getNumber(env, object, "waveSteepness", c.waveSteepness);
    c.waveChoppiness = getNumber(env, object, "waveChoppiness", c.choppiness);
    c.waveSpread = getNumber(env, object, "waveSpread", c.waveSpread);
    c.windSpeed = getNumber(env, object, "windSpeed", c.windSpeed);
    c.windDirection = parseVec2(env, object, "windDirection", c.windDirection);
    c.smallWaveStrength = getNumber(env, object, "smallWaveStrength", c.smallWaveStrength);
    c.animationSpeed = getNumber(env, object, "animationSpeed", c.animationSpeed);

    c.flowSpeed = getNumber(env, object, "flowSpeed", c.flowSpeed);
    c.flowDirection = parseVec2(env, object, "flowDirection", c.flowDirection);
    c.flowCoherence = getNumber(env, object, "flowCoherence", c.flowCoherence);
    c.flowReverse = getBool(env, object, "flowReverse", c.flowReverse);

    c.currentStrength = getNumber(env, object, "currentStrength", c.currentStrength);
    c.currentBankDrag = getNumber(env, object, "currentBankDrag", c.currentBankDrag);

    c.rippleHeightScale = getNumber(
        env,
        object,
        "nativeRippleHeightScale",
        c.rippleHeightScale
    );

    return c;
}

napi_value makeVec3(napi_env env, const Vec3& v) {
    napi_value out{};
    napi_create_object(env, &out);

    napi_value x{}, y{}, z{};
    napi_create_double(env, v.x, &x);
    napi_create_double(env, v.y, &y);
    napi_create_double(env, v.z, &z);

    napi_set_named_property(env, out, "x", x);
    napi_set_named_property(env, out, "y", y);
    napi_set_named_property(env, out, "z", z);
    return out;
}

napi_value makeSample(napi_env env, const WaterSample& sample) {
    napi_value out{};
    napi_create_object(env, &out);

    napi_value found{};
    napi_get_boolean(env, sample.found, &found);
    napi_set_named_property(env, out, "found", found);

    napi_value bodyId{};
    napi_create_string_utf8(
        env,
        sample.bodyId.c_str(),
        sample.bodyId.size(),
        &bodyId
    );
    napi_set_named_property(env, out, "bodyId", bodyId);

    napi_value surfaceY{};
    napi_create_double(env, sample.surfaceY, &surfaceY);
    napi_set_named_property(env, out, "surfaceY", surfaceY);

    napi_set_named_property(env, out, "normal", makeVec3(env, sample.normal));
    napi_set_named_property(env, out, "current", makeVec3(env, sample.current));

    napi_value surfaceVelocityY{};
    napi_create_double(env, sample.surfaceVelocityY, &surfaceVelocityY);
    napi_set_named_property(env, out, "surfaceVelocityY", surfaceVelocityY);

    napi_value waterDepth{};
    napi_create_double(env, sample.waterDepth, &waterDepth);
    napi_set_named_property(env, out, "waterDepth", waterDepth);

    return out;
}

napi_value jsReset(napi_env env, napi_callback_info) {
    g_world->reset();
    napi_value undefined{};
    napi_get_undefined(env, &undefined);
    return undefined;
}

napi_value jsSetTime(napi_env env, napi_callback_info info) {
    std::size_t argc = 1;
    napi_value argv[1]{};
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

    if (argc < 1) {
        throwNapi(env, "setTime(seconds) requires one number.");
        return nullptr;
    }

    double seconds = 0.0;
    if (napi_get_value_double(env, argv[0], &seconds) != napi_ok) {
        throwNapi(env, "setTime(seconds): seconds must be a number.");
        return nullptr;
    }

    g_world->setTime(seconds);

    napi_value undefined{};
    napi_get_undefined(env, &undefined);
    return undefined;
}

napi_value jsStep(napi_env env, napi_callback_info info) {
    std::size_t argc = 2;
    napi_value argv[2]{};
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

    if (argc < 1) {
        throwNapi(env, "step(deltaSeconds[, absoluteTime]) requires deltaSeconds.");
        return nullptr;
    }

    double delta = 0.0;
    if (napi_get_value_double(env, argv[0], &delta) != napi_ok) {
        throwNapi(env, "step: deltaSeconds must be a number.");
        return nullptr;
    }

    if (argc >= 2) {
        double absoluteTime = 0.0;
        if (napi_get_value_double(env, argv[1], &absoluteTime) == napi_ok) {
            g_world->setTime(absoluteTime);
        } else {
            g_world->step(delta);
        }
    } else {
        g_world->step(delta);
    }

    napi_value undefined{};
    napi_get_undefined(env, &undefined);
    return undefined;
}

napi_value jsUpsertBody(napi_env env, napi_callback_info info) {
    std::size_t argc = 1;
    napi_value argv[1]{};
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

    if (argc < 1 || !isObject(env, argv[0])) {
        throwNapi(env, "upsertBody(body) requires a body object.");
        return nullptr;
    }

    const napi_value source = argv[0];

    WaterBody body;
    body.id = getString(env, source, "id");
    if (body.id.empty()) {
        throwNapi(env, "upsertBody(body): body.id is required.");
        return nullptr;
    }

    body.config = parseConfig(env, source);
    if (!parsePoints(env, source, body.points)) {
        throwNapi(env, "upsertBody(body): body.points must be an array.");
        return nullptr;
    }

    const bool ok = g_world->upsertBody(std::move(body));
    napi_value result{};
    napi_get_boolean(env, ok, &result);
    return result;
}

napi_value jsRemoveBody(napi_env env, napi_callback_info info) {
    std::size_t argc = 1;
    napi_value argv[1]{};
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

    if (argc < 1) {
        throwNapi(env, "removeBody(id) requires a body id.");
        return nullptr;
    }

    const std::string id = valueToString(env, argv[0]);
    const bool ok = g_world->removeBody(id);

    napi_value result{};
    napi_get_boolean(env, ok, &result);
    return result;
}

napi_value jsSample(napi_env env, napi_callback_info info) {
    std::size_t argc = 2;
    napi_value argv[2]{};
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

    if (argc < 2) {
        throwNapi(env, "sample(x, z) requires x and z.");
        return nullptr;
    }

    double x = 0.0;
    double z = 0.0;
    if (
        napi_get_value_double(env, argv[0], &x) != napi_ok ||
        napi_get_value_double(env, argv[1], &z) != napi_ok
    ) {
        throwNapi(env, "sample(x, z): x and z must be numbers.");
        return nullptr;
    }

    return makeSample(env, g_world->sample(x, z));
}

napi_value jsSampleBody(napi_env env, napi_callback_info info) {
    std::size_t argc = 3;
    napi_value argv[3]{};
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

    if (argc < 3) {
        throwNapi(env, "sampleBody(id, x, z) requires id, x and z.");
        return nullptr;
    }

    const std::string id = valueToString(env, argv[0]);
    double x = 0.0;
    double z = 0.0;

    if (
        napi_get_value_double(env, argv[1], &x) != napi_ok ||
        napi_get_value_double(env, argv[2], &z) != napi_ok
    ) {
        throwNapi(env, "sampleBody(id, x, z): x and z must be numbers.");
        return nullptr;
    }

    return makeSample(env, g_world->sampleBody(id, x, z));
}

napi_value jsAddRipple(napi_env env, napi_callback_info info) {
    std::size_t argc = 2;
    napi_value argv[2]{};
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

    if (argc < 2) {
        throwNapi(env, "addRipple(bodyId, options) requires bodyId and options.");
        return nullptr;
    }

    const std::string bodyId = valueToString(env, argv[0]);
    if (bodyId.empty() || !isObject(env, argv[1])) {
        throwNapi(env, "addRipple: invalid body id or options.");
        return nullptr;
    }

    const napi_value o = argv[1];
    const bool ok = g_world->addRipple(
        bodyId,
        getNumber(env, o, "x", 0.0),
        getNumber(env, o, "z", 0.0),
        getNumber(env, o, "radius", 7.0),
        getNumber(env, o, "strength", 0.14),
        getNumber(env, o, "speed", 2.6),
        getNumber(env, o, "frequency", 11.0),
        getNumber(env, o, "decay", 1.4),
        getNumber(env, o, "time", g_world->time())
    );

    napi_value result{};
    napi_get_boolean(env, ok, &result);
    return result;
}

napi_value jsStats(napi_env env, napi_callback_info) {
    napi_value out{};
    napi_create_object(env, &out);

    napi_value bodyCount{};
    napi_create_uint32(
        env,
        static_cast<std::uint32_t>(g_world->bodyCount()),
        &bodyCount
    );
    napi_set_named_property(env, out, "bodyCount", bodyCount);

    napi_value time{};
    napi_create_double(env, g_world->time(), &time);
    napi_set_named_property(env, out, "time", time);

    napi_value version{};
    constexpr const char* kVersion = "sm-native-water-v1";
    napi_create_string_utf8(env, kVersion, NAPI_AUTO_LENGTH, &version);
    napi_set_named_property(env, out, "version", version);

    return out;
}

napi_value init(napi_env env, napi_value exports) {
    const napi_property_descriptor properties[] = {
        {"reset", nullptr, jsReset, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"setTime", nullptr, jsSetTime, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"step", nullptr, jsStep, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"upsertBody", nullptr, jsUpsertBody, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"removeBody", nullptr, jsRemoveBody, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"sample", nullptr, jsSample, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"sampleBody", nullptr, jsSampleBody, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"addRipple", nullptr, jsAddRipple, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"stats", nullptr, jsStats, nullptr, nullptr, nullptr, napi_default, nullptr},
    };

    napi_define_properties(
        env,
        exports,
        sizeof(properties) / sizeof(properties[0]),
        properties
    );

    return exports;
}

} // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)

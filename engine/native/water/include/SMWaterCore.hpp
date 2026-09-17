#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace sm::water {

constexpr double kPi = 3.1415926535897932384626433832795;
constexpr double kTau = kPi * 2.0;

struct Vec2 {
    double x{0.0};
    double y{0.0};

    Vec2() = default;
    Vec2(double x_, double y_) : x(x_), y(y_) {}

    [[nodiscard]] double lengthSq() const { return x * x + y * y; }
    [[nodiscard]] double length() const { return std::sqrt(lengthSq()); }

    Vec2& normalize() {
        const double len = length();
        if (len > 1e-12) {
            x /= len;
            y /= len;
        }
        return *this;
    }

    Vec2 operator+(const Vec2& rhs) const { return {x + rhs.x, y + rhs.y}; }
    Vec2 operator-(const Vec2& rhs) const { return {x - rhs.x, y - rhs.y}; }
    Vec2 operator*(double s) const { return {x * s, y * s}; }
};

struct Vec3 {
    double x{0.0};
    double y{0.0};
    double z{0.0};

    Vec3() = default;
    Vec3(double x_, double y_, double z_) : x(x_), y(y_), z(z_) {}

    [[nodiscard]] double lengthSq() const { return x * x + y * y + z * z; }
    [[nodiscard]] double length() const { return std::sqrt(lengthSq()); }

    Vec3& normalize() {
        const double len = length();
        if (len > 1e-12) {
            x /= len;
            y /= len;
            z /= len;
        }
        return *this;
    }

    Vec3 operator+(const Vec3& rhs) const { return {x + rhs.x, y + rhs.y, z + rhs.z}; }
    Vec3 operator-(const Vec3& rhs) const { return {x - rhs.x, y - rhs.y, z - rhs.z}; }
    Vec3 operator*(double s) const { return {x * s, y * s, z * s}; }
};

enum class BodyType {
    River,
    Lake,
    Ocean,
    Pool
};

struct WaterConfig {
    BodyType type{BodyType::River};

    double width{4.0};
    double levelOffset{0.08};
    double oceanSize{800.0};
    double volumeDepth{4.0};
    double bedDepth{3.0};

    double waveHeight{0.22};
    double waveLength{9.0};
    double waveSpeed{1.05};
    double choppiness{0.48};
    double waveScale{1.0};
    double waveSteepness{0.42};
    double waveChoppiness{0.48};
    double waveSpread{0.72};
    double windSpeed{1.0};
    Vec2 windDirection{1.0, 0.0};
    double smallWaveStrength{0.34};
    double animationSpeed{1.25};

    double flowSpeed{0.72};
    Vec2 flowDirection{1.0, 0.0};
    double flowCoherence{0.86};
    bool flowReverse{false};

    double currentStrength{1.5};
    double currentBankDrag{0.55};

    // Native interaction layer. These do not replace the existing shader ripple
    // system; they provide a physical height contribution for boats/objects.
    double rippleHeightScale{1.0};
};

struct Ripple {
    double x{0.0};
    double z{0.0};
    double startTime{0.0};
    double radius{7.0};
    double strength{0.14};
    double speed{2.6};
    double frequency{11.0};
    double decay{1.4};
};

struct WaterBody {
    std::string id;
    WaterConfig config;
    std::vector<Vec3> points;
    std::vector<Ripple> ripples;
};

struct WaterSample {
    bool found{false};
    std::string bodyId;

    double surfaceY{0.0};
    Vec3 normal{0.0, 1.0, 0.0};
    Vec3 current{0.0, 0.0, 0.0};

    // dy/dt of the animated surface, useful for buoyancy damping.
    double surfaceVelocityY{0.0};

    // Configured depth at the sample. V1 uses volumeDepth/bedDepth rather than
    // duplicating the JS terrain-depth profile.
    double waterDepth{0.0};
};

class WaterWorld {
public:
    WaterWorld() = default;

    void reset();
    void setTime(double seconds);
    [[nodiscard]] double time() const { return timeSeconds_; }
    void step(double deltaSeconds);

    bool upsertBody(WaterBody body);
    bool removeBody(const std::string& id);
    [[nodiscard]] std::size_t bodyCount() const { return bodies_.size(); }

    bool addRipple(
        const std::string& bodyId,
        double x,
        double z,
        double radius,
        double strength,
        double speed,
        double frequency,
        double decay,
        std::optional<double> startTime = std::nullopt
    );

    [[nodiscard]] WaterSample sample(double x, double z) const;
    [[nodiscard]] WaterSample sampleBody(const std::string& id, double x, double z) const;

private:
    struct RiverInfo {
        std::size_t segmentIndex{0};
        double t{0.0};
        double px{0.0};
        double pz{0.0};
        double distance{0.0};
        Vec3 a{};
        Vec3 b{};
    };

    std::unordered_map<std::string, WaterBody> bodies_;
    double timeSeconds_{0.0};

    static double clamp(double v, double lo, double hi);
    static double lerp(double a, double b, double t);
    static double smooth01(double t);

    static BodyType normalizeType(BodyType type) { return type; }

    [[nodiscard]] static Vec3 centerOf(const WaterBody& body);
    [[nodiscard]] static bool pointInPolygonXZ(const WaterBody& body, double x, double z);
    [[nodiscard]] static double distanceToSegmentXZ(double x, double z, const Vec3& a, const Vec3& b);
    [[nodiscard]] static double distanceToPolygonEdgeXZ(const WaterBody& body, double x, double z);
    [[nodiscard]] static std::optional<RiverInfo> closestRiverSegment(const WaterBody& body, double x, double z);

    [[nodiscard]] static bool containsXZ(const WaterBody& body, double x, double z, double padding = 0.0);
    [[nodiscard]] static double baseSurfaceY(const WaterBody& body, double x, double z);
    [[nodiscard]] static Vec2 flowDirection2D(const WaterBody& body, double x, double z);
    [[nodiscard]] static Vec3 currentAt(const WaterBody& body, double x, double z);

    // Mirrors SMWaterMaterialFactory.sampleWaveHeight() from the latest
    // Smooth Animation water package so native physics and JS/GPU sampling use
    // the same phase clock and macro-wave composition.
    [[nodiscard]] static double macroWaveHeight(
        const WaterBody& body,
        double x,
        double z,
        double timeSeconds
    );

    [[nodiscard]] static double rippleHeight(
        const WaterBody& body,
        double x,
        double z,
        double timeSeconds
    );

    [[nodiscard]] static double surfaceY(
        const WaterBody& body,
        double x,
        double z,
        double timeSeconds
    );

    [[nodiscard]] static Vec3 surfaceNormal(
        const WaterBody& body,
        double x,
        double z,
        double timeSeconds
    );

    [[nodiscard]] static double surfaceVelocityY(
        const WaterBody& body,
        double x,
        double z,
        double timeSeconds
    );

    [[nodiscard]] static double configuredDepth(const WaterBody& body);
};

} // namespace sm::water

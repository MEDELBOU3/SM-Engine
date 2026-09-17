#include "SMWaterCore.hpp"

#include <limits>

namespace sm::water {

double WaterWorld::clamp(double v, double lo, double hi) {
    return std::max(lo, std::min(hi, v));
}

double WaterWorld::lerp(double a, double b, double t) {
    return a + (b - a) * t;
}

double WaterWorld::smooth01(double t) {
    t = clamp(t, 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

void WaterWorld::reset() {
    bodies_.clear();
    timeSeconds_ = 0.0;
}

void WaterWorld::setTime(double seconds) {
    timeSeconds_ = std::isfinite(seconds) ? seconds : 0.0;
}

void WaterWorld::step(double deltaSeconds) {
    if (!std::isfinite(deltaSeconds) || deltaSeconds <= 0.0) {
        return;
    }
    timeSeconds_ += clamp(deltaSeconds, 0.0, 0.05);

    // Keep the native ripple pool bounded. The existing JS material still owns
    // its own visual ripple ring buffer.
    for (auto& [_, body] : bodies_) {
        auto& ripples = body.ripples;
        ripples.erase(
            std::remove_if(
                ripples.begin(),
                ripples.end(),
                [this, &body](const Ripple& r) {
                    const double animationSpeed = clamp(body.config.animationSpeed, 0.05, 8.0);
                    const double age = timeSeconds_ * animationSpeed - r.startTime;
                    if (age < 0.0) return false;
                    const double decay = std::max(0.05, r.decay);
                    return age > std::max(4.0, 7.0 / decay);
                }
            ),
            ripples.end()
        );
        constexpr std::size_t kMaxNativeRipples = 32;
        if (ripples.size() > kMaxNativeRipples) {
            ripples.erase(ripples.begin(), ripples.end() - kMaxNativeRipples);
        }
    }
}

bool WaterWorld::upsertBody(WaterBody body) {
    if (body.id.empty()) {
        return false;
    }

    if (body.config.flowDirection.lengthSq() < 1e-12) {
        body.config.flowDirection = {1.0, 0.0};
    }
    body.config.flowDirection.normalize();
    if (body.config.windDirection.lengthSq() < 1e-12) {
        body.config.windDirection = body.config.flowDirection;
    }
    body.config.windDirection.normalize();

    if (const auto old = bodies_.find(body.id); old != bodies_.end()) {
        // Preserve live native impulses when editor settings/spline are updated.
        body.ripples = std::move(old->second.ripples);
    }

    bodies_[body.id] = std::move(body);
    return true;
}

bool WaterWorld::removeBody(const std::string& id) {
    return bodies_.erase(id) > 0;
}

bool WaterWorld::addRipple(
    const std::string& bodyId,
    double x,
    double z,
    double radius,
    double strength,
    double speed,
    double frequency,
    double decay,
    std::optional<double> startTime
) {
    const auto it = bodies_.find(bodyId);
    if (it == bodies_.end()) {
        return false;
    }

    Ripple ripple;
    ripple.x = x;
    ripple.z = z;
    ripple.startTime =
        startTime.value_or(timeSeconds_) *
        clamp(it->second.config.animationSpeed, 0.05, 8.0);
    ripple.radius = std::max(0.05, radius);
    ripple.strength = strength;
    ripple.speed = std::max(0.01, speed);
    ripple.frequency = std::max(0.01, frequency);
    ripple.decay = std::max(0.01, decay);

    auto& ripples = it->second.ripples;
    ripples.push_back(ripple);

    constexpr std::size_t kMaxNativeRipples = 32;
    if (ripples.size() > kMaxNativeRipples) {
        ripples.erase(ripples.begin(), ripples.begin() + (ripples.size() - kMaxNativeRipples));
    }

    return true;
}

Vec3 WaterWorld::centerOf(const WaterBody& body) {
    if (body.points.empty()) {
        return {};
    }

    Vec3 c{};
    for (const Vec3& p : body.points) {
        c.x += p.x;
        c.y += p.y;
        c.z += p.z;
    }

    const double inv = 1.0 / static_cast<double>(body.points.size());
    return {c.x * inv, c.y * inv, c.z * inv};
}

double WaterWorld::distanceToSegmentXZ(double x, double z, const Vec3& a, const Vec3& b) {
    const double abx = b.x - a.x;
    const double abz = b.z - a.z;
    const double ab2 = abx * abx + abz * abz;

    const double t =
        ab2 > 1e-12
            ? clamp(((x - a.x) * abx + (z - a.z) * abz) / ab2, 0.0, 1.0)
            : 0.0;

    const double px = a.x + abx * t;
    const double pz = a.z + abz * t;
    const double dx = x - px;
    const double dz = z - pz;
    return std::sqrt(dx * dx + dz * dz);
}

bool WaterWorld::pointInPolygonXZ(const WaterBody& body, double x, double z) {
    if (body.points.size() < 3) {
        return false;
    }

    bool inside = false;
    const std::size_t count = body.points.size();

    for (std::size_t i = 0, j = count - 1; i < count; j = i++) {
        const Vec3& pi = body.points[i];
        const Vec3& pj = body.points[j];

        const bool crosses = ((pi.z > z) != (pj.z > z));
        if (!crosses) {
            continue;
        }

        const double xAtZ =
            (pj.x - pi.x) * (z - pi.z) / (pj.z - pi.z) + pi.x;

        if (x < xAtZ) {
            inside = !inside;
        }
    }

    return inside;
}

double WaterWorld::distanceToPolygonEdgeXZ(const WaterBody& body, double x, double z) {
    if (body.points.size() < 2) {
        return std::numeric_limits<double>::infinity();
    }

    double best = std::numeric_limits<double>::infinity();
    for (std::size_t i = 0; i < body.points.size(); ++i) {
        const Vec3& a = body.points[i];
        const Vec3& b = body.points[(i + 1) % body.points.size()];
        best = std::min(best, distanceToSegmentXZ(x, z, a, b));
    }
    return best;
}

std::optional<WaterWorld::RiverInfo> WaterWorld::closestRiverSegment(
    const WaterBody& body,
    double x,
    double z
) {
    if (body.config.type != BodyType::River || body.points.size() < 2) {
        return std::nullopt;
    }

    RiverInfo best{};
    double bestDistanceSq = std::numeric_limits<double>::infinity();

    for (std::size_t i = 0; i + 1 < body.points.size(); ++i) {
        const Vec3& a = body.points[i];
        const Vec3& b = body.points[i + 1];

        const double abx = b.x - a.x;
        const double abz = b.z - a.z;
        const double lenSq = abx * abx + abz * abz;

        const double t =
            lenSq > 1e-12
                ? clamp(((x - a.x) * abx + (z - a.z) * abz) / lenSq, 0.0, 1.0)
                : 0.0;

        const double px = a.x + abx * t;
        const double pz = a.z + abz * t;
        const double dx = x - px;
        const double dz = z - pz;
        const double distanceSq = dx * dx + dz * dz;

        if (distanceSq < bestDistanceSq) {
            bestDistanceSq = distanceSq;
            best.segmentIndex = i;
            best.t = t;
            best.px = px;
            best.pz = pz;
            best.distance = std::sqrt(distanceSq);
            best.a = a;
            best.b = b;
        }
    }

    if (!std::isfinite(bestDistanceSq)) {
        return std::nullopt;
    }
    return best;
}

bool WaterWorld::containsXZ(const WaterBody& body, double x, double z, double padding) {
    padding = std::max(0.0, padding);

    switch (body.config.type) {
        case BodyType::Lake:
        case BodyType::Pool:
            if (pointInPolygonXZ(body, x, z)) {
                return true;
            }
            return padding > 0.0 && distanceToPolygonEdgeXZ(body, x, z) <= padding;

        case BodyType::River: {
            const auto info = closestRiverSegment(body, x, z);
            if (!info) {
                return false;
            }
            const double halfWidth =
                std::max(0.25, body.config.width * 0.5 + padding);
            return info->distance <= halfWidth;
        }

        case BodyType::Ocean: {
            const Vec3 c = centerOf(body);
            const double half = std::max(5.0, body.config.oceanSize * 0.5) + padding;
            return std::abs(x - c.x) <= half && std::abs(z - c.z) <= half;
        }
    }

    return false;
}

double WaterWorld::baseSurfaceY(const WaterBody& body, double x, double z) {
    switch (body.config.type) {
        case BodyType::River: {
            const auto info = closestRiverSegment(body, x, z);
            if (!info) {
                return body.config.levelOffset;
            }
            return lerp(info->a.y, info->b.y, info->t) + body.config.levelOffset;
        }

        case BodyType::Lake:
        case BodyType::Pool: {
            if (body.points.empty()) {
                return body.config.levelOffset;
            }
            double y = 0.0;
            for (const Vec3& p : body.points) {
                y += p.y;
            }
            y /= static_cast<double>(body.points.size());
            return y + body.config.levelOffset;
        }

        case BodyType::Ocean: {
            const Vec3 c = centerOf(body);
            return c.y + body.config.levelOffset;
        }
    }

    return body.config.levelOffset;
}

Vec2 WaterWorld::flowDirection2D(const WaterBody& body, double x, double z) {
    if (body.config.type != BodyType::River) {
        Vec2 d = body.config.flowDirection;
        if (d.lengthSq() < 1e-12) {
            d = {1.0, 0.0};
        }
        d.normalize();
        if (body.config.flowReverse) {
            d = d * -1.0;
        }
        return d;
    }

    const auto info = closestRiverSegment(body, x, z);
    if (!info) {
        return {1.0, 0.0};
    }

    Vec2 d{info->b.x - info->a.x, info->b.z - info->a.z};
    if (d.lengthSq() < 1e-12) {
        d = {1.0, 0.0};
    }
    d.normalize();

    if (body.config.flowReverse) {
        d = d * -1.0;
    }
    return d;
}

Vec3 WaterWorld::currentAt(const WaterBody& body, double x, double z) {
    if (body.config.type != BodyType::River) {
        return {};
    }

    const auto info = closestRiverSegment(body, x, z);
    if (!info) {
        return {};
    }

    Vec2 flow = flowDirection2D(body, x, z);

    // Mirrors the latest WaterBody.currentAt() bank slowdown.
    const double halfWidth = std::max(0.125, body.config.width * 0.5);
    const double centerFactor = 1.0 - clamp(info->distance / halfWidth, 0.0, 1.0);
    const double smoothCenter = smooth01(centerFactor);
    const double bankDrag = clamp(body.config.currentBankDrag, 0.0, 0.95);
    const double bankMultiplier = lerp(1.0 - bankDrag, 1.0, smoothCenter);
    const double strength = std::max(0.0, body.config.currentStrength);

    return {
        flow.x * strength * bankMultiplier,
        0.0,
        flow.y * strength * bankMultiplier
    };
}

double WaterWorld::macroWaveHeight(
    const WaterBody& body,
    double x,
    double z,
    double timeSeconds
) {
    struct WaveDescriptor {
        double length;
        double weight;
        double speed;
        double steepness;
        double angle;
        double phase;
        int band;
    };

    // Keep these values byte-for-byte equivalent to WaterWaveSpectrum.js.
    static constexpr WaveDescriptor waves[] = {
        {1.85, 0.48, 0.48, 0.72, 0.00, 0.37, 0},
        {1.18, 0.27, 0.72, 0.55, 0.24, -1.70, 0},
        {0.72, 0.14, 1.05, 0.42, -0.31, 2.40, 1},
        {0.42, 0.065, 1.35, 0.32, 0.58, -0.90, 1},
        {0.23, 0.032, 1.80, 0.22, -0.88, 1.70, 2},
        {0.12, 0.013, 2.45, 0.14, 1.25, -2.30, 2}
    };

    const bool river = body.config.type == BodyType::River;
    Vec2 base = river
        ? flowDirection2D(body, x, z)
        : body.config.windDirection;
    if (base.lengthSq() < 1e-12) base = {1.0, 0.0};
    base.normalize();
    const Vec2 side{-base.y, base.x};

    const double macro =
        body.config.type == BodyType::Ocean ? 1.0 :
        body.config.type == BodyType::Lake ? 0.24 :
        body.config.type == BodyType::Pool ? 0.06 : 0.16;
    const double meso =
        body.config.type == BodyType::Ocean ? 1.0 :
        body.config.type == BodyType::Lake ? 0.54 :
        body.config.type == BodyType::Pool ? 0.22 : 0.68;
    const double micro =
        body.config.type == BodyType::Ocean ? 1.0 :
        body.config.type == BodyType::Lake ? 0.82 :
        body.config.type == BodyType::Pool ? 0.58 : 1.0;
    const double spread = body.config.waveSpread *
        (river ? 0.22 + clamp(body.config.flowCoherence, 0.0, 1.0) * 0.78 : 1.0);
    const double animationTime = timeSeconds * clamp(body.config.animationSpeed, 0.05, 8.0);
    const double waveLength = std::max(body.config.waveLength, 0.2);
    const double waveScale = std::max(body.config.waveScale, 0.08);
    const double speed = std::max(body.config.waveSpeed, 0.0);
    const double windSpeed = std::max(body.config.windSpeed, 0.0);
    const double flowSpeed = std::max(body.config.flowSpeed, 0.0);

    double height = 0.0;
    for (const WaveDescriptor& wave : waves) {
        const double bandFactor = wave.band == 0 ? macro : wave.band == 1 ? meso : micro;
        const double angle = wave.angle * spread;
        const Vec2 direction{
            base.x * std::cos(angle) + side.x * std::sin(angle),
            base.y * std::cos(angle) + side.y * std::sin(angle)
        };
        const double wavelength = std::max(0.08, wave.length * waveScale * waveLength);
        const double k = kTau / wavelength;
        const double phase =
            (x * direction.x + z * direction.y) * k -
            animationTime * speed * windSpeed * wave.speed -
            animationTime * flowSpeed * (river ? 0.12 : 0.025) * wave.speed +
            wave.phase;
        height += body.config.waveHeight * wave.weight * bandFactor * std::sin(phase);
    }

    return height;
}

double WaterWorld::rippleHeight(
    const WaterBody& body,
    double x,
    double z,
    double timeSeconds
) {
    double total = 0.0;

    for (const Ripple& ripple : body.ripples) {
        const double animatedTime = timeSeconds * clamp(body.config.animationSpeed, 0.05, 8.0);
        const double age = animatedTime - ripple.startTime;
        if (age < 0.0) {
            continue;
        }

        const double dx = x - ripple.x;
        const double dz = z - ripple.z;
        const double dist = std::sqrt(dx * dx + dz * dz);

        const double radius = std::max(ripple.radius, 0.06);
        const double radiusMask = 1.0 - smooth01(
            (dist - radius * 0.55) / (radius * 0.45)
        );
        const double ring = std::sin(
            (dist - age * std::max(ripple.speed, 0.01)) *
            std::max(ripple.frequency, 0.01)
        );
        total += ring * std::exp(-age * std::max(ripple.decay, 0.01)) *
            radiusMask * ripple.strength * body.config.rippleHeightScale;
    }

    // Physical impulses should remain a perturbation over the authored macro waves.
    const double maxRipple = std::max(0.08, std::abs(body.config.waveHeight) * 1.6 + 0.12);
    return clamp(total, -maxRipple, maxRipple);
}

double WaterWorld::surfaceY(
    const WaterBody& body,
    double x,
    double z,
    double timeSeconds
) {
    return
        baseSurfaceY(body, x, z) +
        macroWaveHeight(body, x, z, timeSeconds) +
        rippleHeight(body, x, z, timeSeconds);
}

Vec3 WaterWorld::surfaceNormal(
    const WaterBody& body,
    double x,
    double z,
    double timeSeconds
) {
    // Finite differences are deliberately small relative to default water mesh
    // tessellation and avoid duplicating shader derivative logic in gameplay code.
    constexpr double eps = 0.08;

    const double hx0 = surfaceY(body, x - eps, z, timeSeconds);
    const double hx1 = surfaceY(body, x + eps, z, timeSeconds);
    const double hz0 = surfaceY(body, x, z - eps, timeSeconds);
    const double hz1 = surfaceY(body, x, z + eps, timeSeconds);

    const double dx = (hx1 - hx0) / (2.0 * eps);
    const double dz = (hz1 - hz0) / (2.0 * eps);

    Vec3 n{-dx, 1.0, -dz};
    return n.normalize();
}

double WaterWorld::surfaceVelocityY(
    const WaterBody& body,
    double x,
    double z,
    double timeSeconds
) {
    constexpr double dt = 1.0 / 120.0;
    const double a = surfaceY(body, x, z, timeSeconds - dt);
    const double b = surfaceY(body, x, z, timeSeconds + dt);
    return (b - a) / (2.0 * dt);
}

double WaterWorld::configuredDepth(const WaterBody& body) {
    const double volumeDepth =
        body.config.volumeDepth > 0.0
            ? body.config.volumeDepth
            : body.config.bedDepth;
    return std::max(0.02, volumeDepth);
}

WaterSample WaterWorld::sampleBody(const std::string& id, double x, double z) const {
    WaterSample out{};

    const auto it = bodies_.find(id);
    if (it == bodies_.end()) {
        return out;
    }

    const WaterBody& body = it->second;
    if (!containsXZ(body, x, z, 0.0)) {
        return out;
    }

    out.found = true;
    out.bodyId = body.id;
    out.surfaceY = surfaceY(body, x, z, timeSeconds_);
    out.normal = surfaceNormal(body, x, z, timeSeconds_);
    out.current = currentAt(body, x, z);
    out.surfaceVelocityY = surfaceVelocityY(body, x, z, timeSeconds_);
    out.waterDepth = configuredDepth(body);
    return out;
}

WaterSample WaterWorld::sample(double x, double z) const {
    // Prefer the water whose animated surface is highest at the XZ location.
    // This is deterministic for overlapping authored bodies.
    WaterSample best{};
    double bestSurface = -std::numeric_limits<double>::infinity();

    for (const auto& [id, body] : bodies_) {
        if (!containsXZ(body, x, z, 0.0)) {
            continue;
        }

        WaterSample candidate{};
        candidate.found = true;
        candidate.bodyId = id;
        candidate.surfaceY = surfaceY(body, x, z, timeSeconds_);
        candidate.normal = surfaceNormal(body, x, z, timeSeconds_);
        candidate.current = currentAt(body, x, z);
        candidate.surfaceVelocityY = surfaceVelocityY(body, x, z, timeSeconds_);
        candidate.waterDepth = configuredDepth(body);

        if (!best.found || candidate.surfaceY > bestSurface) {
            bestSurface = candidate.surfaceY;
            best = std::move(candidate);
        }
    }

    return best;
}

} // namespace sm::water

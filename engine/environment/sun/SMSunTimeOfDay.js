// engine/environment/sun/SMSunTimeOfDay.js
// SM Engine — Time Of Day → Sun position controller
(function () {
    'use strict';

    const DEFAULTS = {
        time: 14.0,
        sunrise: 6.0,
        sunset: 18.5,
        maxElevation: 67,
        nightElevation: -10,

        // World azimuth headings.
        sunriseAzimuth: 78,
        noonAzimuth: 180,
        sunsetAzimuth: 282,

        playing: false,

        // Real seconds required for one full 24-hour cycle.
        cycleDurationSeconds: 240
    };

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function wrap24(value) {
        let time = Number(value) || 0;
        time %= 24;
        if (time < 0) time += 24;
        return time;
    }

    class SMSunTimeOfDay {
        constructor(options = {}) {
            this.options = {
                ...DEFAULTS,
                ...options
            };

            this.time =
                wrap24(
                    this.options.time
                );

            this.playing =
                !!this.options.playing;

            this.controller =
                null;

            this._lastTimestamp =
                performance.now();

            this._engineCallback =
                null;

            this.initialized =
                false;
        }

        get presets() {
            return window.SMSunPresets || null;
        }

        init(
            controller =
                window.smSunController
        ) {
            this.controller =
                controller;

            if (!controller) {
                return false;
            }

            this.setTime(
                this.time,
                {
                    emit: false
                }
            );

            this._installUpdateLoop();

            this.initialized = true;

            window.dispatchEvent(
                new CustomEvent(
                    'sm:sun-time-ready',
                    {
                        detail: {
                            system: this
                        }
                    }
                )
            );

            return true;
        }

        _installUpdateLoop() {
            if (this._engineCallback) {
                return;
            }

            const tick = (
                delta = 0
            ) => {
                if (!this.playing) {
                    return;
                }

                const seconds =
                    Math.max(
                        0,
                        Number(delta) || 0
                    );

                if (
                    seconds <= 0
                ) {
                    return;
                }

                const cycleDuration =
                    Math.max(
                        10,
                        Number(
                            this.options
                                .cycleDurationSeconds
                        ) || 240
                    );

                const hoursPerSecond =
                    24 /
                    cycleDuration;

                this.setTime(
                    this.time +
                    seconds *
                    hoursPerSecond
                );
            };

            this._engineCallback =
                tick;

            if (
                Array.isArray(
                    window.engineFrameCallbacks
                )
            ) {
                window.engineFrameCallbacks
                    .push(
                        tick
                    );
                return;
            }

            // Fallback only when the engine callback list is unavailable.
            const raf = timestamp => {
                const delta =
                    Math.min(
                        0.05,
                        Math.max(
                            0,
                            (
                                timestamp -
                                this._lastTimestamp
                            ) /
                            1000
                        )
                    );

                this._lastTimestamp =
                    timestamp;

                tick(delta);

                requestAnimationFrame(
                    raf
                );
            };

            requestAnimationFrame(
                raf
            );
        }

        getSolarAngles(time = this.time) {
            const t =
                wrap24(time);

            const sunrise =
                this.options.sunrise;

            const sunset =
                this.options.sunset;

            const dayLength =
                Math.max(
                    1,
                    sunset - sunrise
                );

            let azimuth;
            let elevation;
            let daylight;

            if (
                t >= sunrise &&
                t <= sunset
            ) {
                daylight =
                    clamp(
                        (
                            t -
                            sunrise
                        ) /
                        dayLength,
                        0,
                        1
                    );

                /*
                 * Smooth physical-looking day arc.
                 */
                elevation =
                    Math.sin(
                        Math.PI *
                        daylight
                    ) *
                    this.options
                        .maxElevation;

                if (daylight <= 0.5) {
                    const local =
                        daylight / 0.5;

                    azimuth =
                        THREE.MathUtils.lerp(
                            this.options
                                .sunriseAzimuth,
                            this.options
                                .noonAzimuth,
                            local
                        );
                } else {
                    const local =
                        (
                            daylight -
                            0.5
                        ) /
                        0.5;

                    azimuth =
                        THREE.MathUtils.lerp(
                            this.options
                                .noonAzimuth,
                            this.options
                                .sunsetAzimuth,
                            local
                        );
                }
            } else {
                /*
                 * Continue the sun under the horizon so night/day transitions
                 * remain continuous.
                 */
                const nightStart =
                    sunset;

                const nightLength =
                    24 -
                    sunset +
                    sunrise;

                const nightProgress =
                    t > sunset
                        ? (
                            t -
                            nightStart
                        ) /
                        nightLength
                        : (
                            24 -
                            nightStart +
                            t
                        ) /
                        nightLength;

                daylight = 0;

                elevation =
                    -Math.sin(
                        Math.PI *
                        clamp(
                            nightProgress,
                            0,
                            1
                        )
                    ) *
                    Math.abs(
                        this.options
                            .nightElevation
                    );

                azimuth =
                    this.options
                        .sunsetAzimuth +
                    (
                        (
                            this.options
                                .sunriseAzimuth +
                            360
                        ) -
                        this.options
                            .sunsetAzimuth
                    ) *
                    nightProgress;
            }

            return {
                time: t,
                azimuth:
                    (
                        azimuth +
                        360
                    ) %
                    360,
                elevation,
                daylight
            };
        }

        setTime(
            value,
            {
                emit = true
            } = {}
        ) {
            this.time =
                wrap24(value);

            if (
                !this.controller
            ) {
                this.controller =
                    window.smSunController ||
                    null;
            }

            const solar =
                this.getSolarAngles(
                    this.time
                );

            this.controller
                ?.setAngles?.(
                    solar.azimuth,
                    solar.elevation
                );

            if (emit) {
                window.dispatchEvent(
                    new CustomEvent(
                        'sm:time-of-day-changed',
                        {
                            detail: {
                                system: this,
                                ...solar,
                                label:
                                    this.formatTime(
                                        this.time
                                    )
                            }
                        }
                    )
                );
            }

            return solar;
        }

        setTimeFromNormalized(
            value
        ) {
            return this.setTime(
                clamp(
                    Number(value) || 0,
                    0,
                    1
                ) *
                24
            );
        }

        setCycleDuration(
            seconds
        ) {
            this.options
                .cycleDurationSeconds =
                Math.max(
                    10,
                    Number(seconds) ||
                    240
                );

            return this.options
                .cycleDurationSeconds;
        }

        play() {
            this.playing = true;

            window.dispatchEvent(
                new CustomEvent(
                    'sm:time-of-day-play'
                )
            );
        }

        pause() {
            this.playing = false;

            window.dispatchEvent(
                new CustomEvent(
                    'sm:time-of-day-pause'
                )
            );
        }

        toggle() {
            if (this.playing) {
                this.pause();
            } else {
                this.play();
            }

            return this.playing;
        }

        formatTime(
            value = this.time
        ) {
            const time =
                wrap24(value);

            const hours =
                Math.floor(time);

            const minutes =
                Math.floor(
                    (
                        time -
                        hours
                    ) *
                    60
                );

            return (
                String(hours)
                    .padStart(2, '0') +
                ':' +
                String(minutes)
                    .padStart(2, '0')
            );
        }

        getPeriodName(
            value = this.time
        ) {
            const t =
                wrap24(value);

            if (
                t >= 5 &&
                t < 7
            ) {
                return 'Dawn';
            }

            if (
                t >= 7 &&
                t < 11
            ) {
                return 'Morning';
            }

            if (
                t >= 11 &&
                t < 15
            ) {
                return 'Midday';
            }

            if (
                t >= 15 &&
                t < 18
            ) {
                return 'Afternoon';
            }

            if (
                t >= 18 &&
                t < 19.5
            ) {
                return 'Golden Hour';
            }

            if (
                t >= 19.5 &&
                t < 21
            ) {
                return 'Blue Hour';
            }

            return 'Night';
        }
    }

    window.SMSunTimeOfDay =
        SMSunTimeOfDay;

    window.smSunTimeOfDay =
        window.smSunTimeOfDay ||
        new SMSunTimeOfDay();
})();
package com.smengine.camera

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import org.json.JSONObject

class SMTrackingSensorManager(
    context: Context,
    private val server: SMCompanionServer
) : SensorEventListener {

    private val sensorManager =
        context.getSystemService(
            Context.SENSOR_SERVICE
        ) as SensorManager

    private val rotationSensor =
        sensorManager.getDefaultSensor(
            Sensor.TYPE_ROTATION_VECTOR
        )

    private val accelerationSensor =
        sensorManager.getDefaultSensor(
            Sensor.TYPE_LINEAR_ACCELERATION
        )

    private val gyroSensor =
        sensorManager.getDefaultSensor(
            Sensor.TYPE_GYROSCOPE
        )

    private val quaternion =
        FloatArray(4) {
            if (it == 0) 1f else 0f
        }

    private val acceleration =
        FloatArray(3)

    private val gyro =
        FloatArray(3)

    private var lastSendNs =
        0L

    var targetRateHz: Int = 30
        set(value) {
            field =
                value.coerceIn(
                    5,
                    60
                )
        }

    fun start() {
        rotationSensor?.let {
            sensorManager.registerListener(
                this,
                it,
                SensorManager.SENSOR_DELAY_GAME
            )
        }

        accelerationSensor?.let {
            sensorManager.registerListener(
                this,
                it,
                SensorManager.SENSOR_DELAY_GAME
            )
        }

        gyroSensor?.let {
            sensorManager.registerListener(
                this,
                it,
                SensorManager.SENSOR_DELAY_GAME
            )
        }
    }

    fun stop() {
        sensorManager.unregisterListener(
            this
        )
    }

    override fun onAccuracyChanged(
        sensor: Sensor?,
        accuracy: Int
    ) {
    }

    override fun onSensorChanged(
        event: SensorEvent
    ) {
        when (
            event.sensor.type
        ) {
            Sensor.TYPE_ROTATION_VECTOR -> {
                SensorManager
                    .getQuaternionFromVector(
                        quaternion,
                        event.values
                    )
            }

            Sensor.TYPE_LINEAR_ACCELERATION -> {
                copy3(
                    event.values,
                    acceleration
                )
            }

            Sensor.TYPE_GYROSCOPE -> {
                copy3(
                    event.values,
                    gyro
                )
            }
        }

        maybeSend(
            event.timestamp
        )
    }

    private fun maybeSend(
        timestampNs: Long
    ) {
        if (!server.hasClients()) {
            return
        }

        val minimumDelta =
            1_000_000_000L /
            targetRateHz

        if (
            timestampNs -
            lastSendNs <
            minimumDelta
        ) {
            return
        }

        lastSendNs =
            timestampNs

        val payload =
            JSONObject()
                .put(
                    "quaternion",
                    JSONObject()
                        .put(
                            "x",
                            quaternion[1]
                        )
                        .put(
                            "y",
                            quaternion[2]
                        )
                        .put(
                            "z",
                            quaternion[3]
                        )
                        .put(
                            "w",
                            quaternion[0]
                        )
                )
                .put(
                    "acceleration",
                    JSONObject()
                        .put(
                            "x",
                            acceleration[0]
                        )
                        .put(
                            "y",
                            acceleration[1]
                        )
                        .put(
                            "z",
                            acceleration[2]
                        )
                )
                .put(
                    "angularVelocity",
                    JSONObject()
                        .put(
                            "x",
                            gyro[0]
                        )
                        .put(
                            "y",
                            gyro[1]
                        )
                        .put(
                            "z",
                            gyro[2]
                        )
                )
                .put(
                    "timestampNs",
                    timestampNs
                )

        server.broadcastJson(
            JSONObject()
                .put(
                    "type",
                    "tracking"
                )
                .put(
                    "payload",
                    payload
                )
        )
    }

    private fun copy3(
        source: FloatArray,
        destination: FloatArray
    ) {
        destination[0] =
            source.getOrElse(0) {
                0f
            }

        destination[1] =
            source.getOrElse(1) {
                0f
            }

        destination[2] =
            source.getOrElse(2) {
                0f
            }
    }
}

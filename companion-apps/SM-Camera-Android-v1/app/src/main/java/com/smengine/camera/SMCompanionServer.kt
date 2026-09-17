package com.smengine.camera

import android.os.Build
import org.java_websocket.WebSocket
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.server.WebSocketServer
import org.json.JSONObject
import java.net.InetSocketAddress
import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentHashMap

class SMCompanionServer(
    port: Int = 8765
) : WebSocketServer(InetSocketAddress("0.0.0.0", port)) {

    interface Listener {
        fun onClientCountChanged(count: Int)
        fun onControlMessage(message: JSONObject)
        fun onViewportFrame(jpeg: ByteArray)
        fun onServerError(error: Exception)
    }

    var listener: Listener? = null

    private val clients =
        ConcurrentHashMap.newKeySet<WebSocket>()

    @Volatile
    var jpegQuality: Int = 72

    @Volatile
    var streamingEnabled: Boolean = true

    @Volatile
    var virtualPreviewEnabled: Boolean = true
        private set

    @Volatile
    var virtualPreviewFps: Int = 12
        private set

    @Volatile
    var virtualPreviewQuality: Int = 68
        private set

    override fun onOpen(
        conn: WebSocket,
        handshake: ClientHandshake
    ) {
        clients.add(conn)

        conn.send(
            JSONObject()
                .put("type", "hello")
                .put("protocol", "SM_CAMERA_USB_TETHER")
                .put("version", 1)
                .put(
                    "device",
                    "${Build.MANUFACTURER} ${Build.MODEL}"
                )
                .toString()
        )

        conn.send(
            viewportRequestJson()
                .toString()
        )

        listener?.onClientCountChanged(
            clients.size
        )
    }

    override fun onClose(
        conn: WebSocket,
        code: Int,
        reason: String,
        remote: Boolean
    ) {
        clients.remove(conn)

        listener?.onClientCountChanged(
            clients.size
        )
    }

    override fun onMessage(
        conn: WebSocket,
        message: String
    ) {
        try {
            val json = JSONObject(message)

            if (
                json.optString("type") ==
                "control"
            ) {
                when (
                    json.optString("action")
                ) {
                    "setStreaming" -> {
                        streamingEnabled =
                            json.optBoolean(
                                "value",
                                true
                            )
                    }

                    "setJpegQuality" -> {
                        jpegQuality =
                            json.optInt(
                                "value",
                                jpegQuality
                            ).coerceIn(25, 95)
                    }
                }

                listener?.onControlMessage(
                    json
                )
            }
        } catch (_: Exception) {
        }
    }

    override fun onMessage(
        conn: WebSocket,
        message: ByteBuffer
    ) {
        if (!virtualPreviewEnabled) {
            return
        }

        val bytes =
            ByteArray(
                message.remaining()
            )

        message.get(bytes)

        if (bytes.isNotEmpty()) {
            listener?.onViewportFrame(
                bytes
            )
        }
    }

    override fun onError(
        conn: WebSocket?,
        ex: Exception
    ) {
        listener?.onServerError(ex)
    }

    override fun onStart() {
        connectionLostTimeout = 5
    }

    fun hasClients(): Boolean {
        return clients.any {
            it.isOpen
        }
    }

    fun sendFrame(
        jpeg: ByteArray
    ) {
        if (
            !streamingEnabled ||
            jpeg.isEmpty()
        ) {
            return
        }

        for (client in clients) {
            if (client.isOpen) {
                try {
                    client.send(jpeg)
                } catch (_: Exception) {
                }
            }
        }
    }

    fun broadcastJson(
        json: JSONObject
    ) {
        val text =
            json.toString()

        for (client in clients) {
            if (client.isOpen) {
                try {
                    client.send(text)
                } catch (_: Exception) {
                }
            }
        }
    }

    fun setVirtualPreview(
        enabled: Boolean,
        fps: Int = virtualPreviewFps,
        quality: Int = virtualPreviewQuality
    ) {
        virtualPreviewEnabled =
            enabled

        virtualPreviewFps =
            fps.coerceIn(
                4,
                20
            )

        virtualPreviewQuality =
            quality.coerceIn(
                35,
                90
            )

        broadcastJson(
            viewportRequestJson()
        )
    }

    fun sendVirtualCameraCommand(
        action: String,
        value: Any? = null
    ) {
        val message =
            JSONObject()
                .put(
                    "type",
                    "virtualCamera"
                )
                .put(
                    "action",
                    action
                )

        if (value != null) {
            message.put(
                "value",
                value
            )
        }

        broadcastJson(
            message
        )
    }

    private fun viewportRequestJson(): JSONObject {
        return JSONObject()
            .put(
                "type",
                "viewportRequest"
            )
            .put(
                "enabled",
                virtualPreviewEnabled
            )
            .put(
                "fps",
                virtualPreviewFps
            )
            .put(
                "quality",
                virtualPreviewQuality
            )
            .put(
                "tracking",
                virtualPreviewEnabled
            )
    }
}

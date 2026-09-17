package com.smengine.camera

import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import androidx.camera.core.ImageProxy
import java.io.ByteArrayOutputStream

object SMYuvJpegEncoder {

    fun encode(
        image: ImageProxy,
        quality: Int
    ): ByteArray {
        val nv21 =
            toNv21(image)

        val output =
            ByteArrayOutputStream()

        val yuv =
            YuvImage(
                nv21,
                ImageFormat.NV21,
                image.width,
                image.height,
                null
            )

        val ok =
            yuv.compressToJpeg(
                Rect(
                    0,
                    0,
                    image.width,
                    image.height
                ),
                quality.coerceIn(
                    25,
                    95
                ),
                output
            )

        return if (ok) {
            output.toByteArray()
        } else {
            ByteArray(0)
        }
    }

    private fun toNv21(
        image: ImageProxy
    ): ByteArray {
        val width =
            image.width

        val height =
            image.height

        val output =
            ByteArray(
                width *
                height *
                3 /
                2
            )

        val yPlane =
            image.planes[0]

        val uPlane =
            image.planes[1]

        val vPlane =
            image.planes[2]

        val yBuffer =
            yPlane.buffer

        var outIndex = 0

        for (
            row in 0 until height
        ) {
            for (
                col in 0 until width
            ) {
                val index =
                    row *
                    yPlane.rowStride +
                    col *
                    yPlane.pixelStride

                output[outIndex++] =
                    yBuffer.get(index)
            }
        }

        val uBuffer =
            uPlane.buffer

        val vBuffer =
            vPlane.buffer

        val chromaWidth =
            width / 2

        val chromaHeight =
            height / 2

        for (
            row in 0 until chromaHeight
        ) {
            for (
                col in 0 until chromaWidth
            ) {
                val vIndex =
                    row *
                    vPlane.rowStride +
                    col *
                    vPlane.pixelStride

                val uIndex =
                    row *
                    uPlane.rowStride +
                    col *
                    uPlane.pixelStride

                output[outIndex++] =
                    vBuffer.get(vIndex)

                output[outIndex++] =
                    uBuffer.get(uIndex)
            }
        }

        return output
    }
}

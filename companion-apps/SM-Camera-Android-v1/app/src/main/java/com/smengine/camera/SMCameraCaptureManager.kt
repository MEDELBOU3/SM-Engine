package com.smengine.camera

import android.content.Context
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class SMCameraCaptureManager(
    private val context: Context,
    private val lifecycleOwner: LifecycleOwner,
    private val previewView: PreviewView,
    private val server: SMCompanionServer
) {
    private var provider:
        ProcessCameraProvider? = null

    private var analysisExecutor:
        ExecutorService =
        Executors.newSingleThreadExecutor()

    private var lensFacing =
        CameraSelector.LENS_FACING_BACK

    private var lastFrameNs =
        0L

    var targetFps: Int = 15
        set(value) {
            field =
                value.coerceIn(
                    1,
                    30
                )
        }

    fun start(
        onReady: (() -> Unit)? = null,
        onError: ((Throwable) -> Unit)? = null
    ) {
        val future =
            ProcessCameraProvider.getInstance(
                context
            )

        future.addListener(
            {
                try {
                    provider =
                        future.get()

                    bindCamera()

                    onReady?.invoke()
                } catch (error: Throwable) {
                    onError?.invoke(error)
                }
            },
            ContextCompat.getMainExecutor(
                context
            )
        )
    }

    fun switchCamera() {
        lensFacing =
            if (
                lensFacing ==
                CameraSelector.LENS_FACING_BACK
            ) {
                CameraSelector
                    .LENS_FACING_FRONT
            } else {
                CameraSelector
                    .LENS_FACING_BACK
            }

        bindCamera()
    }

    private fun bindCamera() {
        val currentProvider =
            provider ?: return

        currentProvider.unbindAll()

        val selector =
            CameraSelector.Builder()
                .requireLensFacing(
                    lensFacing
                )
                .build()

        val preview =
            Preview.Builder()
                .build()

        preview.setSurfaceProvider(
            previewView.surfaceProvider
        )

        val analysis =
            ImageAnalysis.Builder()
                .setTargetResolution(
                    Size(
                        1280,
                        720
                    )
                )
                .setBackpressureStrategy(
                    ImageAnalysis
                        .STRATEGY_KEEP_ONLY_LATEST
                )
                .setOutputImageFormat(
                    ImageAnalysis
                        .OUTPUT_IMAGE_FORMAT_YUV_420_888
                )
                .build()

        analysis.setAnalyzer(
            analysisExecutor
        ) { image ->
            try {
                if (
                    !server.hasClients() ||
                    !server.streamingEnabled
                ) {
                    return@setAnalyzer
                }

                val now =
                    System.nanoTime()

                val minimumDelta =
                    1_000_000_000L /
                    targetFps

                if (
                    now -
                    lastFrameNs <
                    minimumDelta
                ) {
                    return@setAnalyzer
                }

                lastFrameNs =
                    now

                val jpeg =
                    SMYuvJpegEncoder.encode(
                        image,
                        server.jpegQuality
                    )

                if (jpeg.isNotEmpty()) {
                    server.sendFrame(
                        jpeg
                    )
                }
            } catch (_: Throwable) {
            } finally {
                image.close()
            }
        }

        currentProvider.bindToLifecycle(
            lifecycleOwner,
            selector,
            preview,
            analysis
        )
    }

    fun stop() {
        provider?.unbindAll()
    }

    fun destroy() {
        stop()
        analysisExecutor.shutdownNow()
    }
}

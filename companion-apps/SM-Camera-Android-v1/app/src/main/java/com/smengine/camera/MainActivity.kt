package com.smengine.camera

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean

class MainActivity :
    ComponentActivity(),
    SMCompanionServer.Listener {

    companion object {
        private const val PORT = 8765
        private val COLOR_BACKGROUND = Color.rgb(16, 17, 19)
        private val COLOR_PANEL = Color.rgb(45, 47, 50)
        private val COLOR_SURFACE = Color.rgb(56, 58, 62)
        private val COLOR_BORDER = Color.rgb(78, 81, 86)
        private val COLOR_TEXT = Color.rgb(242, 243, 244)
        private val COLOR_MUTED = Color.rgb(158, 162, 168)
        private val COLOR_ACCENT = Color.rgb(55, 189, 235)
        private val COLOR_SUCCESS = Color.rgb(79, 207, 139)
        private val COLOR_WARNING = Color.rgb(235, 178, 75)
    }

    private lateinit var previewView: PreviewView
    private lateinit var viewportView: ImageView
    private lateinit var viewportHint: TextView
    private lateinit var statusChip: TextView
    private lateinit var statusText: TextView
    private lateinit var addressText: TextView
    private lateinit var sceneModeButton: TextView
    private lateinit var lensModeButton: TextView
    private lateinit var recenterButton: TextView
    private lateinit var switchLensButton: TextView
    private lateinit var linkButton: TextView

    private var server: SMCompanionServer? = null
    private var cameraManager: SMCameraCaptureManager? = null
    private var trackingManager: SMTrackingSensorManager? = null
    private var started = false
    private var sceneMode = true
    private var clientCount = 0
    private var lastViewportBitmap: Bitmap? = null
    private val decodingViewport = AtomicBoolean(false)

    private val cameraPermissionLauncher =
        registerForActivityResult(
            ActivityResultContracts.RequestPermission()
        ) { granted ->
            if (granted) {
                startPhoneLens()
            } else {
                Toast.makeText(
                    this,
                    "Camera permission is only required for Phone Lens mode.",
                    Toast.LENGTH_LONG
                ).show()
                setSceneMode()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureWindow()
        buildUI()
        updateAddresses()
        startCompanion()
    }

    private fun configureWindow() {
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = COLOR_BACKGROUND

        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
    }

    private fun buildUI() {
        val root = FrameLayout(this).apply {
            setBackgroundColor(COLOR_BACKGROUND)
            keepScreenOn = true
        }

        previewView = PreviewView(this).apply {
            scaleType = PreviewView.ScaleType.FILL_CENTER
            visibility = View.GONE
            layoutParams = fillFrameParams()
        }

        viewportView = ImageView(this).apply {
            scaleType = ImageView.ScaleType.FIT_CENTER
            setBackgroundColor(COLOR_BACKGROUND)
            layoutParams = fillFrameParams()
        }

        root.addView(previewView)
        root.addView(viewportView)

        root.addView(
            View(this).apply {
                background = GradientDrawable(
                    GradientDrawable.Orientation.TOP_BOTTOM,
                    intArrayOf(
                        Color.argb(205, 16, 17, 19),
                        Color.argb(0, 16, 17, 19)
                    )
                )
                layoutParams = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    dp(130),
                    Gravity.TOP
                )
            }
        )

        root.addView(
            SMFramingGuideView(this).apply {
                layoutParams = fillFrameParams()
            }
        )

        viewportHint = TextView(this).apply {
            text = "WAITING FOR ENGINE VIEWPORT"
            textSize = 11f
            letterSpacing = 0.14f
            gravity = Gravity.CENTER
            setTextColor(COLOR_MUTED)
            setCompoundDrawablesWithIntrinsicBounds(
                0,
                android.R.drawable.ic_menu_camera,
                0,
                0
            )
            compoundDrawablePadding = dp(12)
            layoutParams = FrameLayout.LayoutParams(
                dp(280),
                dp(100),
                Gravity.CENTER
            )
        }

        root.addView(viewportHint)
        root.addView(createTopBar())
        root.addView(createControlDeck())
        setContentView(root)

        updateModePresentation()
        updateLinkPresentation()
    }

    private fun createTopBar(): View {
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), dp(8), dp(12), dp(8))
            background = roundedBackground(
                Color.argb(232, 45, 47, 50),
                12,
                COLOR_BORDER
            )
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(64),
                Gravity.TOP
            ).apply {
                setMargins(dp(14), dp(12), dp(14), 0)
            }
        }

        bar.addView(
            ImageView(this).apply {
                setImageResource(R.drawable.sm_engine_logo)
                scaleType = ImageView.ScaleType.FIT_CENTER
                layoutParams = LinearLayout.LayoutParams(
                    dp(43),
                    dp(43)
                ).apply {
                    marginEnd = dp(10)
                }
            }
        )

        bar.addView(
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_VERTICAL
                addView(
                    TextView(this@MainActivity).apply {
                        text = "SM VIRTUAL CAMERA"
                        textSize = 14f
                        letterSpacing = 0.08f
                        setTypeface(Typeface.DEFAULT, Typeface.BOLD)
                        setTextColor(COLOR_TEXT)
                    }
                )
                addView(
                    TextView(this@MainActivity).apply {
                        text = "Scene framing · motion tracking · live viewport"
                        textSize = 9.5f
                        setTextColor(COLOR_MUTED)
                    }
                )
            },
            LinearLayout.LayoutParams(
                0,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                1f
            )
        )

        statusChip = TextView(this).apply {
            textSize = 9f
            letterSpacing = 0.1f
            gravity = Gravity.CENTER
            setTypeface(Typeface.DEFAULT, Typeface.BOLD)
            setPadding(dp(12), dp(7), dp(12), dp(7))
        }
        bar.addView(statusChip)
        return bar
    }

    private fun createControlDeck(): View {
        val deck = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(10), dp(14), dp(10))
            background = roundedBackground(
                Color.argb(238, 45, 47, 50),
                12,
                COLOR_BORDER
            )
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM
            ).apply {
                setMargins(dp(14), 0, dp(14), dp(12))
            }
        }

        val infoRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        infoRow.addView(
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                addView(
                    TextView(this@MainActivity).apply {
                        text = "ENGINE LINK"
                        textSize = 8f
                        letterSpacing = 0.13f
                        setTypeface(Typeface.DEFAULT, Typeface.BOLD)
                        setTextColor(COLOR_ACCENT)
                    }
                )
                statusText = TextView(this@MainActivity).apply {
                    text = "Starting local camera link…"
                    textSize = 11f
                    setTextColor(COLOR_TEXT)
                }
                addView(statusText)
            },
            LinearLayout.LayoutParams(
                0,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                1f
            )
        )

        addressText = TextView(this).apply {
            textSize = 10f
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
            setTextColor(COLOR_MUTED)
            setPadding(dp(10), dp(5), dp(10), dp(5))
            background = roundedBackground(COLOR_SURFACE, 7, COLOR_BORDER)
            setOnClickListener { copyAddress() }
        }

        infoRow.addView(
            addressText,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        )
        deck.addView(infoRow)

        deck.addView(
            View(this).apply {
                setBackgroundColor(COLOR_BORDER)
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    1
                ).apply {
                    topMargin = dp(8)
                    bottomMargin = dp(8)
                }
            }
        )

        val controlsRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        sceneModeButton = createButton("SCENE VIEW") { setSceneMode() }
        lensModeButton = createButton("PHONE LENS") { setLensMode() }
        recenterButton = createButton("RECENTER") {
            server?.sendVirtualCameraCommand("recenter")
            Toast.makeText(
                this,
                "Virtual camera pose recentered",
                Toast.LENGTH_SHORT
            ).show()
        }
        switchLensButton = createButton("SWITCH LENS") {
            cameraManager?.switchCamera()
        }
        linkButton = createButton("STOP LINK") {
            if (started) stopCompanion() else startCompanion()
        }

        val buttonParams = LinearLayout.LayoutParams(
            0,
            dp(39),
            1f
        ).apply {
            marginEnd = dp(7)
        }

        controlsRow.addView(sceneModeButton, buttonParams)
        controlsRow.addView(lensModeButton, buttonParams)
        controlsRow.addView(recenterButton, buttonParams)
        controlsRow.addView(switchLensButton, buttonParams)
        controlsRow.addView(
            linkButton,
            LinearLayout.LayoutParams(0, dp(39), 1f)
        )
        deck.addView(controlsRow)

        deck.addView(
            TextView(this).apply {
                text = "MOVE THE PHONE TO FRAME THE 3D SCENE  •  RECENTER SETS THE CURRENT POSE AS ZERO"
                textSize = 7.5f
                letterSpacing = 0.08f
                gravity = Gravity.CENTER
                setTextColor(COLOR_MUTED)
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply {
                    topMargin = dp(7)
                }
            }
        )
        return deck
    }

    private fun createButton(label: String, action: () -> Unit): TextView {
        return TextView(this).apply {
            text = label
            textSize = 9f
            letterSpacing = 0.07f
            gravity = Gravity.CENTER
            setTypeface(Typeface.DEFAULT, Typeface.BOLD)
            setTextColor(COLOR_TEXT)
            background = roundedBackground(COLOR_SURFACE, 7, COLOR_BORDER)
            isClickable = true
            isFocusable = true
            setOnClickListener { action() }
        }
    }

    private fun startCompanion() {
        if (started) {
            updateAddresses()
            return
        }

        try {
            val newServer = SMCompanionServer(PORT)
            newServer.listener = this
            newServer.start()
            server = newServer

            trackingManager = SMTrackingSensorManager(
                context = this,
                server = newServer
            ).also { it.start() }

            started = true
            newServer.setVirtualPreview(sceneMode, fps = 12, quality = 68)

            if (!sceneMode) {
                ensureCameraPermissionAndStartLens()
            }

            setStatus(
                "Ready · open Live Capture in SM Engine",
                "STANDBY",
                COLOR_WARNING
            )
            updateAddresses()
            updateLinkPresentation()
        } catch (error: Exception) {
            setStatus(
                "Start failed: ${error.message}",
                "ERROR",
                Color.rgb(235, 93, 93)
            )
        }
    }

    private fun stopCompanion() {
        stopPhoneLens()
        trackingManager?.stop()
        trackingManager = null

        try {
            server?.stop(500)
        } catch (_: Exception) {
        }

        server = null
        started = false
        clientCount = 0
        setStatus("Link stopped", "OFFLINE", COLOR_MUTED)
        updateLinkPresentation()
    }

    private fun setSceneMode() {
        sceneMode = true
        stopPhoneLens()
        previewView.visibility = View.GONE
        viewportView.visibility = View.VISIBLE
        viewportHint.visibility =
            if (lastViewportBitmap == null) View.VISIBLE else View.GONE

        server?.setVirtualPreview(true, fps = 12, quality = 68)
        server?.sendVirtualCameraCommand("recenter")

        if (clientCount > 0) {
            setStatus(
                "Scene View linked · phone motion drives the 3D camera",
                "LINKED",
                COLOR_SUCCESS
            )
        }
        updateModePresentation()
    }

    private fun setLensMode() {
        sceneMode = false
        server?.setVirtualPreview(false)
        viewportView.visibility = View.GONE
        viewportHint.visibility = View.GONE
        previewView.visibility = View.VISIBLE
        ensureCameraPermissionAndStartLens()
        updateModePresentation()
    }

    private fun ensureCameraPermissionAndStartLens() {
        if (
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED
        ) {
            startPhoneLens()
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    private fun startPhoneLens() {
        val activeServer = server ?: return
        if (cameraManager != null) return

        cameraManager = SMCameraCaptureManager(
            context = this,
            lifecycleOwner = this,
            previewView = previewView,
            server = activeServer
        ).also { manager ->
            manager.start(
                onReady = {
                    runOnUiThread {
                        setStatus(
                            "Phone Lens streaming to SM Engine",
                            if (clientCount > 0) "LIVE" else "STANDBY",
                            if (clientCount > 0) COLOR_SUCCESS else COLOR_WARNING
                        )
                    }
                },
                onError = { error ->
                    runOnUiThread {
                        setStatus(
                            "Camera error: ${error.message}",
                            "ERROR",
                            Color.rgb(235, 93, 93)
                        )
                    }
                }
            )
        }
    }

    private fun stopPhoneLens() {
        cameraManager?.destroy()
        cameraManager = null
    }

    private fun updateModePresentation() {
        styleModeButton(sceneModeButton, sceneMode)
        styleModeButton(lensModeButton, !sceneMode)
        recenterButton.alpha = if (sceneMode) 1f else 0.38f
        recenterButton.isEnabled = sceneMode
        switchLensButton.alpha = if (sceneMode) 0.38f else 1f
        switchLensButton.isEnabled = !sceneMode
    }

    private fun styleModeButton(button: TextView, active: Boolean) {
        button.setTextColor(if (active) Color.BLACK else COLOR_TEXT)
        button.background = roundedBackground(
            if (active) COLOR_ACCENT else COLOR_SURFACE,
            7,
            if (active) COLOR_ACCENT else COLOR_BORDER
        )
    }

    private fun updateLinkPresentation() {
        if (!::linkButton.isInitialized) return
        linkButton.text = if (started) "STOP LINK" else "START LINK"
        linkButton.setTextColor(if (started) COLOR_TEXT else Color.BLACK)
        linkButton.background = roundedBackground(
            if (started) COLOR_SURFACE else COLOR_ACCENT,
            7,
            if (started) COLOR_BORDER else COLOR_ACCENT
        )
    }

    private fun updateAddresses() {
        if (!::addressText.isInitialized) return
        val addresses = SMNetworkInfo.websocketAddresses(PORT)
        addressText.text = addresses.firstOrNull() ?: "NO NETWORK ADDRESS"
    }

    private fun copyAddress() {
        val address = addressText.text
            ?.toString()
            ?.takeIf { it.startsWith("ws://") }
            ?: return

        val clipboard = getSystemService(
            Context.CLIPBOARD_SERVICE
        ) as ClipboardManager
        clipboard.setPrimaryClip(
            ClipData.newPlainText("SM Camera address", address)
        )
        Toast.makeText(this, "Engine address copied", Toast.LENGTH_SHORT).show()
    }

    private fun setStatus(text: String, chip: String, chipColor: Int) {
        if (!::statusText.isInitialized) return
        statusText.text = text
        statusChip.text = "●  $chip"
        statusChip.setTextColor(chipColor)
        statusChip.background = roundedBackground(
            Color.argb(
                42,
                Color.red(chipColor),
                Color.green(chipColor),
                Color.blue(chipColor)
            ),
            20,
            Color.argb(
                105,
                Color.red(chipColor),
                Color.green(chipColor),
                Color.blue(chipColor)
            )
        )
    }

    override fun onClientCountChanged(count: Int) {
        clientCount = count
        runOnUiThread {
            if (count > 0) {
                setStatus(
                    if (sceneMode) {
                        "Scene View linked · move the phone to frame the scene"
                    } else {
                        "Phone Lens linked · physical camera is streaming"
                    },
                    "LINKED",
                    COLOR_SUCCESS
                )

                if (sceneMode) {
                    server?.setVirtualPreview(true, fps = 12, quality = 68)
                    server?.sendVirtualCameraCommand("recenter")
                }
            } else if (started) {
                setStatus(
                    "Waiting for SM Engine · use the address on the right",
                    "STANDBY",
                    COLOR_WARNING
                )
            }
        }
    }

    override fun onControlMessage(message: JSONObject) {
        when (message.optString("action")) {
            "switchCamera" -> runOnUiThread {
                cameraManager?.switchCamera()
            }
        }
    }

    override fun onViewportFrame(jpeg: ByteArray) {
        if (
            !sceneMode ||
            jpeg.isEmpty() ||
            !decodingViewport.compareAndSet(false, true)
        ) return

        try {
            val options = BitmapFactory.Options().apply {
                inPreferredConfig = Bitmap.Config.RGB_565
            }
            val bitmap = BitmapFactory.decodeByteArray(
                jpeg,
                0,
                jpeg.size,
                options
            ) ?: return

            runOnUiThread {
                if (!sceneMode) {
                    bitmap.recycle()
                    return@runOnUiThread
                }

                val previous = lastViewportBitmap
                lastViewportBitmap = bitmap
                viewportView.setImageBitmap(bitmap)
                viewportHint.visibility = View.GONE
                viewportView.post {
                    if (
                        previous != null &&
                        previous !== lastViewportBitmap &&
                        !previous.isRecycled
                    ) previous.recycle()
                }
            }
        } finally {
            decodingViewport.set(false)
        }
    }

    override fun onServerError(error: Exception) {
        runOnUiThread {
            setStatus(
                "Link error: ${error.message}",
                "ERROR",
                Color.rgb(235, 93, 93)
            )
        }
    }

    private fun roundedBackground(
        color: Int,
        radiusDp: Int,
        strokeColor: Int? = null
    ): GradientDrawable {
        return GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(color)
            cornerRadius = dp(radiusDp).toFloat()
            if (strokeColor != null) setStroke(dp(1), strokeColor)
        }
    }

    private fun fillFrameParams(): FrameLayout.LayoutParams {
        return FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
    }

    private fun dp(value: Int): Int {
        return (value * resources.displayMetrics.density).toInt()
    }

    override fun onDestroy() {
        stopCompanion()
        lastViewportBitmap?.recycle()
        lastViewportBitmap = null
        super.onDestroy()
    }
}

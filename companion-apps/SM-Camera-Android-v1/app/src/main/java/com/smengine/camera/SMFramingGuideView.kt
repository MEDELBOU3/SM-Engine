package com.smengine.camera

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.View

class SMFramingGuideView(
    context: Context
) : View(context) {

    private val density =
        resources.displayMetrics.density

    private val guidePaint =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color =
                Color.argb(
                    74,
                    255,
                    255,
                    255
                )
            strokeWidth =
                density
            style =
                Paint.Style.STROKE
        }

    private val accentPaint =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color =
                Color.rgb(
                    55,
                    189,
                    235
                )
            strokeWidth =
                1.4f * density
            style =
                Paint.Style.STROKE
        }

    init {
        isClickable = false
        isFocusable = false
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val w =
            width.toFloat()

        val h =
            height.toFloat()

        if (w <= 0f || h <= 0f) {
            return
        }

        val insetX =
            w * 0.075f

        val insetY =
            h * 0.09f

        val safeFrame =
            RectF(
                insetX,
                insetY,
                w - insetX,
                h - insetY
            )

        canvas.drawRoundRect(
            safeFrame,
            7f * density,
            7f * density,
            guidePaint
        )

        canvas.drawLine(
            w / 3f,
            insetY,
            w / 3f,
            h - insetY,
            guidePaint
        )

        canvas.drawLine(
            w * 2f / 3f,
            insetY,
            w * 2f / 3f,
            h - insetY,
            guidePaint
        )

        canvas.drawLine(
            insetX,
            h / 3f,
            w - insetX,
            h / 3f,
            guidePaint
        )

        canvas.drawLine(
            insetX,
            h * 2f / 3f,
            w - insetX,
            h * 2f / 3f,
            guidePaint
        )

        val centerX =
            w / 2f

        val centerY =
            h / 2f

        val arm =
            11f * density

        val gap =
            4f * density

        canvas.drawLine(
            centerX - arm,
            centerY,
            centerX - gap,
            centerY,
            accentPaint
        )

        canvas.drawLine(
            centerX + gap,
            centerY,
            centerX + arm,
            centerY,
            accentPaint
        )

        canvas.drawLine(
            centerX,
            centerY - arm,
            centerX,
            centerY - gap,
            accentPaint
        )

        canvas.drawLine(
            centerX,
            centerY + gap,
            centerX,
            centerY + arm,
            accentPaint
        )

        canvas.drawCircle(
            centerX,
            centerY,
            1.6f * density,
            accentPaint
        )
    }
}

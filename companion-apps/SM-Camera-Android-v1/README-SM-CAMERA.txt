SM VIRTUAL CAMERA — ANDROID COMPANION
=====================================

PURPOSE
-------
SM Camera turns an Android phone into a handheld virtual-production camera for
SM Engine. Scene View mirrors the live engine viewport on the phone while the
phone rotation sensors drive the selected 3D camera. Move the phone to frame the
scene and use Recenter to make the current physical pose the new zero pose.

The separate Phone Lens mode keeps the original physical-camera workflow and
streams the Android camera into SM Engine as a capture source.

MODES
-----
Scene View (default)
    SM Engine viewport -> compressed preview -> phone display
    Phone motion sensors -> SM Engine virtual camera pose

Phone Lens
    Android CameraX -> JPEG video frames -> SM Engine capture input

This version is for phones that do NOT expose a native USB Webcam/UVC mode.

DISTRIBUTION
------------
The same companion APK works for every SM Engine user. It does not contain a
fixed phone or PC address: each phone advertises its current Wi-Fi/USB-tether
address at runtime. The SM Engine launcher/package includes the APK from this
folder so it can be distributed with the product.

TRANSPORT
---------
Bidirectional WebSocket over normal Wi-Fi or USB Tethering:
    Android -> motion tracking / optional physical lens frames -> SM Engine
    SM Engine -> live 3D viewport preview -> Android Scene View

Tracking:
Android rotation vector + accelerometer + gyroscope
    -> JSON over the same WebSocket
    -> SMUSBTrackingReceiver
    -> SMCameraPoseTracker

ANDROID SETUP
-------------
1. Open SM-Camera-Android-v1 in Android Studio.
2. Use JDK 17.
3. Sync Gradle.
4. Build/install the app on the phone.
5. Camera permission is only needed when using Phone Lens mode.
6. Connect phone to PC with USB.
7. In Android USB settings enable USB-Tethering.
8. Open SM Camera.
9. The app displays one or more ws:// addresses.

CONNECT FROM SM ENGINE
----------------------
1. Click Live Capture in the top workspace bar.
2. Set Source to Phone Camera.
3. Choose SM Camera App - Wi-Fi / USB Tether.
4. Paste the exact ws:// address displayed by the Android app.
5. Click Connect phone. The live image appears in Capture Preview.
6. Keep Scene View selected to monitor and move the 3D camera from the phone.
7. Press Recenter whenever you want to reset the neutral phone pose.

If the panel remains on Connecting, verify that the exact address shown by the
phone is pasted (including ws:// and :8765), both devices share Wi-Fi or USB
Tethering, and Windows Firewall allows the connection. The panel reports a
failure after a short timeout instead of waiting indefinitely.

The Android app can also work over normal Wi-Fi. The PC and phone must be on
the same network and Windows Firewall must allow the connection.

USB WEBCAM / UVC (NO COMPANION APP)
-----------------------------------
On Android phones that provide a USB Webcam option:

1. Connect the phone to the PC with USB.
2. In Android USB Preferences choose Webcam / USB Webcam.
3. In SM Engine open Live Capture and set Source to Phone Camera.
4. Choose USB Webcam (UVC), press Refresh, and select the phone camera.
5. Click Connect phone.

DEVELOPER TEST
--------------
The panel uses the same public helper internally. For a console test, use the
exact address shown on the phone:

await SMConnectUSBPhoneTether("ws://PHONE_IP:8765");

Then:

smUSBPhoneBridge.getStatus();
smUSBPhoneBridge.session;
smUSBPhoneBridge.session?.texture;

Controls:

smUSBPhoneBridge.switchPhoneCamera();
smUSBPhoneBridge.setPhoneJPEGQuality(65);
smUSBPhoneBridge.setPhoneStreaming(false);
smUSBPhoneBridge.setPhoneStreaming(true);

NOTES
-----
- V1 uses JPEG because it is simple to debug and integrates with the existing
  SMUSBVideoReceiver companion canvas.
- It starts at 1280x720 analysis and 15 FPS on the Android side.
- After the pipeline is confirmed, the next upgrade should be WebRTC/H.264 for
  lower latency and better quality.
- Raw Android sensor orientation still needs a calibration/recenter layer before
  it should drive the final virtual camera.

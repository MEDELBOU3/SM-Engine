plugins {
    id("com.android.application")
}
android {
    namespace = "com.smengine.camera"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.smengine.camera"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
dependencies {
    implementation("androidx.activity:activity-ktx:1.13.0")
    implementation("androidx.core:core-ktx:1.17.0")
    val cameraxVersion = "1.6.1"
    implementation("androidx.camera:camera-core:$cameraxVersion")
    implementation("androidx.camera:camera-camera2:$cameraxVersion")
    implementation("androidx.camera:camera-lifecycle:$cameraxVersion")
    implementation("androidx.camera:camera-view:$cameraxVersion")
    implementation("org.java-websocket:Java-WebSocket:1.6.0")
}

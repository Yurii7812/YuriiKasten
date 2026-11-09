plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val packageJson = rootProject.file("../package.json").readText()
val versionParts = Regex(""""version"\\s*:\\s*"([0-9]+)\\.([0-9]+)\\.([0-9]+)"""").find(packageJson)
    ?.groupValues?.drop(1)?.map(String::toInt) ?: error("package.json version missing")
val (majorVersion, minorVersion, patchVersion) = versionParts
val unifiedVersion = "$majorVersion.$minorVersion.$patchVersion"
val unifiedVersionCode = majorVersion * 1_000_000 + minorVersion * 1_000 + patchVersion

android {
    namespace = "net.yurii.kasten"
    compileSdk = 34
    defaultConfig {
        applicationId = "net.yurii.note"
        minSdk = 26
        targetSdk = 34
        versionCode = unifiedVersionCode
        versionName = unifiedVersion
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
        // PC の \M は adb の run-as でスマホのデータを読むので、デバッグ可能なままにする。そのうえで R8（コードの最適化）を効かせて、
        // 普通のデバッグ版より軽く・速くする（Compose はデバッグ版だと特に遅い）。gnosis#apk_install はこれを入れる
        create("fast") {
            initWith(getByName("release"))
            isDebuggable = true
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("debug")
            matchingFallbacks += listOf("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
        // 長いメモの一覧が、1 件のメモを押す・書くたびに全部組み直されないようにする（Compose の「強いスキップ」。ラムダも覚える）
        freeCompilerArgs += listOf("-P", "plugin:androidx.compose.compiler.plugins.kotlin:experimentalStrongSkipping=true")
    }
    buildFeatures { compose = true }
    composeOptions { kotlinCompilerExtensionVersion = "1.5.14" }
    packaging { resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" } }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    val bom = platform("androidx.compose:compose-bom:2024.06.00")
    implementation(bom)
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("io.coil-kt:coil-compose:2.6.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.3")
    implementation("androidx.profileinstaller:profileinstaller:1.3.1")   // Compose などが持つ事前コンパイル情報を入れて、起動とスクロールを速くする
    implementation("com.google.android.gms:play-services-mlkit-document-scanner:16.0.0-beta1")   // 紙のスキャン（Google の文書スキャナー。端末の Google Play 開発者サービスが使う）
}

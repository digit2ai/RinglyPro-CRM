# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Keep WebView JavaScript interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep WebView
-keepclassmembers class android.webkit.WebView {
    public *;
}

# Keep WebViewClient and WebChromeClient
-keep class android.webkit.WebViewClient
-keep class android.webkit.WebChromeClient
-keep class android.webkit.WebSettings
-keep class android.webkit.WebView
-keep class android.webkit.WebView$*

# Uncomment this to preserve the line number information for
# debugging stack traces.
-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
-renamesourcefileattribute SourceFile

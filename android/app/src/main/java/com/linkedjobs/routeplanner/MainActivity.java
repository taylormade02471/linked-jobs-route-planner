package com.linkedjobs.routeplanner;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

import java.util.Map;

import org.json.JSONObject;

public class MainActivity extends AppCompatActivity {
    private static final String PLANNER_URL = "https://www.routeplanner.space";
    private PermissionRequest pendingWebPermissionRequest;
    private GeolocationPermissions.Callback pendingGeolocationCallback;
    private String pendingGeolocationOrigin;
    private ActivityResultLauncher<String[]> permissionLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        permissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(),
            this::handlePermissionResult
        );

        WebView webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        String sharedText = sharedTextFromIntent(getIntent());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (sharedText == null || sharedText.isEmpty()) return;
                view.evaluateJavascript("window.LinkedJobsReceiveSharedText && window.LinkedJobsReceiveSharedText(" + JSONObject.quote(sharedText) + ");", null);
            }
        });
        webView.addJavascriptInterface(new ProviderAppBridge(), "LinkedJobsAndroid");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                pendingWebPermissionRequest = request;
                if (hasCameraPermission()) {
                    request.grant(request.getResources());
                    pendingWebPermissionRequest = null;
                    return;
                }
                permissionLauncher.launch(new String[] { Manifest.permission.CAMERA });
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                pendingGeolocationOrigin = origin;
                pendingGeolocationCallback = callback;
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, true);
                    pendingGeolocationOrigin = null;
                    pendingGeolocationCallback = null;
                    return;
                }
                permissionLauncher.launch(new String[] {
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                });
            }
        });
        webView.loadUrl(PLANNER_URL);
    }

    public class ProviderAppBridge {
        @JavascriptInterface
        public void openProviderApp(String providerId) {
            runOnUiThread(() -> openProviderAppOnUiThread(providerId));
        }
    }

    private void openProviderAppOnUiThread(String providerId) {
        String packageName = packageForProvider(providerId);
        if (packageName == null) return;

        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(packageName);
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(launchIntent);
            return;
        }

        Intent marketIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + packageName));
        if (marketIntent.resolveActivity(getPackageManager()) != null) {
            startActivity(marketIntent);
            return;
        }

        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + packageName)));
    }

    private String packageForProvider(String providerId) {
        if ("survey_merchandiser".equals(providerId)) return "iSurvey.Android";
        if ("clickworker".equals(providerId)) return "com.clickworker.clickworkerapp";
        if ("field_nation".equals(providerId)) return "com.fieldnation.android";
        if ("field_agent".equals(providerId)) return "net.fieldagent";
        return null;
    }

    private String sharedTextFromIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return "";
        String type = intent.getType();
        if (type == null || !"text/plain".equals(type)) return "";
        return intent.getStringExtra(Intent.EXTRA_TEXT);
    }

    private boolean hasCameraPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void handlePermissionResult(Map<String, Boolean> grants) {
        boolean cameraGranted = Boolean.TRUE.equals(grants.get(Manifest.permission.CAMERA));
        boolean locationGranted =
            Boolean.TRUE.equals(grants.get(Manifest.permission.ACCESS_FINE_LOCATION)) ||
            Boolean.TRUE.equals(grants.get(Manifest.permission.ACCESS_COARSE_LOCATION));

        if (pendingWebPermissionRequest != null) {
            if (cameraGranted || hasCameraPermission()) {
                pendingWebPermissionRequest.grant(pendingWebPermissionRequest.getResources());
            } else {
                pendingWebPermissionRequest.deny();
            }
            pendingWebPermissionRequest = null;
        }

        if (pendingGeolocationCallback != null) {
            boolean allow = locationGranted || hasLocationPermission();
            pendingGeolocationCallback.invoke(pendingGeolocationOrigin, allow, allow);
            pendingGeolocationOrigin = null;
            pendingGeolocationCallback = null;
        }
    }
}


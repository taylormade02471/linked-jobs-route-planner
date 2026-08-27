package com.linkedjobs.routeplanner;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
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

        webView.setWebViewClient(new WebViewClient());
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


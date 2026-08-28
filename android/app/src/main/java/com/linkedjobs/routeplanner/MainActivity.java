package com.linkedjobs.routeplanner;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
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

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Map;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "LinkedJobsRoutePlanner";
    private static final String PLANNER_URL = "https://nashville-live-audit-transit-planner-qo811sbnc.vercel.app";
    private static final String SHARED_INBOX_FILE = "shared_inbox/latest.txt";

    private WebView webView;
    private PermissionRequest pendingWebPermissionRequest;
    private GeolocationPermissions.Callback pendingGeolocationCallback;
    private String pendingGeolocationOrigin;
    private ActivityResultLauncher<String[]> permissionLauncher;
    private ProviderCredentialStore credentialStore;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        credentialStore = new ProviderCredentialStore(this);
        permissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(),
            this::handlePermissionResult
        );

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                deliverSharedPayload(view, sharedPayloadFromIntent(getIntent()));
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

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (webView != null) {
            deliverSharedPayload(webView, sharedPayloadFromIntent(intent));
        }
    }

    public class ProviderAppBridge {
        @JavascriptInterface
        public void openProviderApp(String providerId) {
            runOnUiThread(() -> openProviderAppOnUiThread(providerId));
        }

        @JavascriptInterface
        public void openProviderSettings(String providerId) {
            runOnUiThread(() -> {
                Intent intent = new Intent(MainActivity.this, ProviderConnectionActivity.class);
                intent.putExtra("provider_id", providerId);
                startActivity(intent);
            });
        }

        @JavascriptInterface
        public String getProviderLoginStatus(String providerId) {
            return credentialStore.statusJson(providerId);
        }

        @JavascriptInterface
        public String clearProviderLogin(String providerId) {
            return credentialStore.clearLogin(providerId);
        }

        @JavascriptInterface
        public void saveSharedText(String text) {
            runOnUiThread(() -> saveSharedTextToLocalInbox(text));
        }

        @JavascriptInterface
        public String getBridgeStatus() {
            return "Android bridge ready";
        }
    }

    private void saveSharedTextToLocalInbox(String text) {
        if (text == null || text.trim().isEmpty()) return;
        try {
            File file = new File(getFilesDir(), SHARED_INBOX_FILE);
            File parent = file.getParentFile();
            if (parent != null && !parent.exists()) {
                parent.mkdirs();
            }
            try (FileOutputStream out = new FileOutputStream(file, false)) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
            }
            Log.i(TAG, "Saved shared text to local inbox");
            if (webView != null) {
                webView.post(() -> webView.evaluateJavascript(
                    "window.LinkedJobsReceiveSharedText && window.LinkedJobsReceiveSharedText(" + JSONObject.quote(text) + ");",
                    null
                ));
            }
        } catch (Exception error) {
            Log.e(TAG, "Unable to save shared text", error);
        }
    }

    private void openProviderAppOnUiThread(String providerId) {
        String packageName = credentialStore.packageForProvider(providerId);
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

    private void deliverSharedPayload(WebView target, String payloadJson) {
        if (payloadJson == null || payloadJson.isEmpty()) return;
        target.evaluateJavascript("window.LinkedJobsReceiveAndroidShare && window.LinkedJobsReceiveAndroidShare(" + payloadJson + ");", null);
    }

    private String sharedPayloadFromIntent(Intent intent) {
        if (intent == null) return "";
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return "";
        String type = intent.getType();
        if (type == null || type.isEmpty()) return "";

        try {
            JSONObject payload = new JSONObject();
            payload.put("action", action);
            payload.put("mime_type", type);

            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null) payload.put("text", text);

            Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (stream != null) payload.put("uri", stream.toString());

            ArrayList<Uri> streams = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (streams != null && !streams.isEmpty()) {
                JSONArray items = new JSONArray();
                for (Uri item : streams) {
                    if (item != null) items.put(item.toString());
                }
                payload.put("items", items);
            }

            return payload.toString();
        } catch (Exception error) {
            return "";
        }
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

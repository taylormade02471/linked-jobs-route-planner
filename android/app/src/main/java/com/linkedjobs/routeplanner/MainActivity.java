package com.linkedjobs.routeplanner;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.DhcpInfo;
import android.net.ConnectivityManager;
import android.net.wifi.WifiManager;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceResponse;
import android.webkit.WebResourceRequest;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends AppCompatActivity {
    private static final String PREFS_NAME = "linked_jobs_route_planner";
    private static final String KEY_BASE_URL = "base_url";
    private static final String KEY_BRIDGE_URL = "bridge_url";
    private static final String DEFAULT_BASE_URL = "http://127.0.0.1:3300";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private SharedPreferences getPrefs() {
        return getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private String normalizeBaseUrl(String rawValue) {
        String value = rawValue == null ? "" : rawValue.trim();
        if (value.isEmpty()) {
            return DEFAULT_BASE_URL;
        }
        if ("10.0.2.2".equals(value) || value.startsWith("http://10.0.2.2") || value.startsWith("https://10.0.2.2")) {
            return DEFAULT_BASE_URL;
        }
        if (value.startsWith("http://") || value.startsWith("https://")) {
            return value.replaceAll("/+$", "");
        }
        return ("http://" + value).replaceAll("/+$", "");
    }

    private String getSavedBaseUrl() {
        String saved = getPrefs().getString(KEY_BASE_URL, DEFAULT_BASE_URL);
        return saved == null ? "" : normalizeBaseUrl(saved);
    }

    private String getSavedBridgeUrl() {
        String saved = getPrefs().getString(KEY_BRIDGE_URL, "");
        return saved == null ? "" : normalizeBaseUrl(saved);
    }

    private String getLaunchUrl() {
        Uri data = getIntent() != null ? getIntent().getData() : null;
        if (data != null) {
            String scheme = data.getScheme();
            if (scheme != null && ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))) {
                return data.toString();
            }
        }
        String baseUrl = getSavedBaseUrl();
        return baseUrl.isEmpty() ? "about:blank" : baseUrl + "/";
    }

    private void configureWebView(WebView webView) {
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);
        WebView.setWebContentsDebuggingEnabled(true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);
    }

    private String fetchUrl(String requestUrl) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(requestUrl).openConnection();
        connection.setConnectTimeout(5000);
        connection.setReadTimeout(5000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Authorization", "Basic " + android.util.Base64.encodeToString("kyle:taylor".getBytes(), android.util.Base64.NO_WRAP));
        int code = connection.getResponseCode();
        BufferedReader reader = new BufferedReader(new InputStreamReader(
                code >= 200 && code < 400 ? connection.getInputStream() : connection.getErrorStream()
        ));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            out.append(line);
        }
        reader.close();
        connection.disconnect();
        if (code < 200 || code >= 400) {
            throw new RuntimeException(out.toString());
        }
        return out.toString();
    }

    private String extractPreferredUrl(String json) {
        if (json == null) return null;
        int keyIndex = json.indexOf("\"preferred_url\"");
        if (keyIndex < 0) return null;
        int colonIndex = json.indexOf(":", keyIndex);
        int startQuote = json.indexOf("\"", colonIndex + 1);
        int endQuote = json.indexOf("\"", startQuote + 1);
        if (colonIndex < 0 || startQuote < 0 || endQuote < 0) return null;
        return json.substring(startQuote + 1, endQuote);
    }

    private int inetAddressToInt(InetAddress inetAddress) {
        byte[] bytes = inetAddress.getAddress();
        int value = 0;
        for (byte b : bytes) {
            value = (value << 8) | (b & 0xff);
        }
        return value;
    }

    private String intToIp(int value) {
        return String.format(
                "%d.%d.%d.%d",
                (value) & 0xff,
                (value >> 8) & 0xff,
                (value >> 16) & 0xff,
                (value >> 24) & 0xff
        );
    }

    private List<String> buildProbeUrls() {
        Set<String> urls = new LinkedHashSet<>();
        String saved = getSavedBaseUrl();
        if (!saved.isEmpty()) {
            urls.add(saved);
        }

        Object service = getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (service instanceof WifiManager) {
            WifiManager wifiManager = (WifiManager) service;
            DhcpInfo dhcpInfo = wifiManager.getDhcpInfo();
            if (dhcpInfo != null) {
                int ip = dhcpInfo.ipAddress;
                int mask = dhcpInfo.netmask;
                int network = ip & mask;
                int broadcast = network | ~mask;
                for (int candidate = network + 1; candidate < broadcast; candidate++) {
                    if (candidate == ip) continue;
                    urls.add("http://" + intToIp(candidate) + ":3300");
                }
                urls.add("http://" + intToIp(dhcpInfo.gateway) + ":3300");
            }
        }

        urls.add("http://127.0.0.1:3300");
        return new ArrayList<>(urls);
    }

    private void autoDetectBaseUrl(EditText baseUrlInput, TextView statusText, Button detectButton, WebView webView, boolean openLoginAfterDetect) {
        detectButton.setEnabled(false);
        statusText.setText("Looking for your PC on Wi-Fi...");
        executor.execute(() -> {
            String found = null;
            String lastError = null;
            for (String candidate : buildProbeUrls()) {
                try {
                    String health = fetchUrl(candidate + "/api/health");
                    if (health != null && !health.isEmpty()) {
                        found = candidate;
                        break;
                    }
                } catch (Exception error) {
                    lastError = error.getMessage();
                }
            }
            final String nextFound = found;
            final String nextError = lastError;
            runOnUiThread(() -> {
                detectButton.setEnabled(true);
                if (nextFound != null) {
                    baseUrlInput.setText(nextFound);
                    getPrefs().edit().putString(KEY_BASE_URL, nextFound).apply();
                    statusText.setText("Found PC server: " + nextFound);
                    if (openLoginAfterDetect) {
                        webView.loadUrl(nextFound + "/");
                    }
                } else {
                    statusText.setText(
                            nextError == null
                                    ? "Could not find the PC server on Wi-Fi."
                                    : "Could not find the PC server on Wi-Fi. Last error: " + nextError
                    );
                }
            });
        });
    }

    private void refreshDetectedBaseUrl(EditText baseUrlInput, TextView statusText, Button detectButton, WebView webView, boolean openLoginAfterDetect) {
        detectButton.setEnabled(false);
        statusText.setText("Detecting LAN IP...");
        executor.execute(() -> {
            try {
                String base = getSavedBaseUrl();
                if (base.isEmpty()) {
                    runOnUiThread(() -> {
                        detectButton.setEnabled(true);
                        statusText.setText("Enter your PC LAN URL first, or save it once, then detect again.");
                    });
                    return;
                }
                String json = fetchUrl(base + "/api/network-info");
                String preferredUrl = extractPreferredUrl(json);
                runOnUiThread(() -> {
                    detectButton.setEnabled(true);
                    if (preferredUrl != null && !preferredUrl.isEmpty()) {
                        baseUrlInput.setText(preferredUrl);
                        getPrefs().edit().putString(KEY_BASE_URL, preferredUrl).apply();
                        statusText.setText("Detected: " + preferredUrl);
                        if (openLoginAfterDetect) {
                            webView.loadUrl(preferredUrl + "/");
                        }
                    } else {
                        statusText.setText("Could not detect LAN IP");
                    }
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    detectButton.setEnabled(true);
                    statusText.setText("Detection failed: " + error.getMessage());
                });
            }
        });
    }

    private LinearLayout buildLayout(
            WebView webView,
            EditText baseUrlInput,
            EditText bridgeUrlInput,
            TextView statusText,
            Button saveButton,
            Button detectButton,
            Button testButton,
            Button saveBridgeButton,
            Button syncBridgeButton
    ) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        root.setPadding(24, 24, 24, 24);

        TextView title = new TextView(this);
        title.setText("Route Planner");
        title.setTextSize(24);
        title.setGravity(Gravity.START);
        title.setPadding(0, 0, 0, 8);

        TextView subtitle = new TextView(this);
        subtitle.setText("Enter your PC LAN IP or full URL, then save and load the dashboard.");
        subtitle.setPadding(0, 0, 0, 16);

        baseUrlInput.setHint("Example: 192.168.1.25:3300 or http://192.168.1.25:3300");
        baseUrlInput.setText(getSavedBaseUrl());
        baseUrlInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        baseUrlInput.setSingleLine(true);

        TextView bridgeTitle = new TextView(this);
        bridgeTitle.setText("Mobile bridge");
        bridgeTitle.setTextSize(18);
        bridgeTitle.setPadding(0, 18, 0, 4);

        TextView bridgeHelp = new TextView(this);
        bridgeHelp.setText("Optional: save a bridge endpoint for later live transit forwarding.");
        bridgeHelp.setPadding(0, 0, 0, 8);

        bridgeUrlInput.setHint("Bridge URL or endpoint");
        bridgeUrlInput.setText(getSavedBridgeUrl());
        bridgeUrlInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        bridgeUrlInput.setSingleLine(true);

        saveButton.setText("Save and open");
        saveButton.setOnClickListener(v -> {
            String normalized = normalizeBaseUrl(baseUrlInput.getText().toString());
            getPrefs().edit().putString(KEY_BASE_URL, normalized).apply();
            statusText.setText("Saved: " + normalized);
            webView.loadUrl(normalized + "/");
        });

        saveBridgeButton.setText("Save bridge");
        saveBridgeButton.setOnClickListener(v -> {
            String normalized = normalizeBaseUrl(bridgeUrlInput.getText().toString());
            getPrefs().edit().putString(KEY_BRIDGE_URL, normalized).apply();
            statusText.setText("Bridge saved: " + normalized);
        });

        syncBridgeButton.setText("Sync bridge");
        syncBridgeButton.setOnClickListener(v -> {
            String bridgeUrl = getSavedBridgeUrl();
            if (bridgeUrl.isEmpty()) {
                statusText.setText("Save a bridge URL first.");
                return;
            }
            statusText.setText("Bridge endpoint saved: " + bridgeUrl);
        });

        detectButton.setText("Connect to my PC");
        detectButton.setOnClickListener(v -> autoDetectBaseUrl(baseUrlInput, statusText, detectButton, webView, true));

        statusText.setText("Using: " + getSavedBaseUrl());
        statusText.setPadding(0, 12, 0, 12);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.addView(title);
        header.addView(subtitle);
        header.addView(baseUrlInput);
        header.addView(bridgeTitle);
        header.addView(bridgeHelp);
        header.addView(bridgeUrlInput);
        header.addView(saveBridgeButton);
        header.addView(syncBridgeButton);
        header.addView(detectButton);
        header.addView(testButton);
        header.addView(saveButton);
        header.addView(statusText);

        LinearLayout.LayoutParams headerParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        header.setLayoutParams(headerParams);

        LinearLayout.LayoutParams webParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
        );
        webView.setLayoutParams(webParams);

        root.addView(header);
        root.addView(webView);
        return root;
    }

    private void loadDashboard(WebView webView, TextView statusText, String path) {
        String url = getSavedBaseUrl() + path;
        statusText.setText("Opening " + url);
        webView.loadUrl(url);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        EditText baseUrlInput = new EditText(this);
        EditText bridgeUrlInput = new EditText(this);
        TextView statusText = new TextView(this);
        Button saveButton = new Button(this);
        Button detectButton = new Button(this);
        WebView webView = new WebView(this);
        Button testButton = new Button(this);
        Button saveBridgeButton = new Button(this);
        Button syncBridgeButton = new Button(this);

        configureWebView(webView);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                statusText.setText("Loaded: " + url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    statusText.setText("WebView error: " + error.getDescription());
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                if (request != null && request.isForMainFrame()) {
                    statusText.setText("HTTP error: " + errorResponse.getStatusCode());
                }
            }
        });

        setContentView(buildLayout(
                webView,
                baseUrlInput,
                bridgeUrlInput,
                statusText,
                saveButton,
                detectButton,
                testButton,
                saveBridgeButton,
                syncBridgeButton
        ));

        webView.loadUrl(getSavedBaseUrl() + "/");

        testButton.setText("Test connection");
        testButton.setOnClickListener(v -> {
            testButton.setEnabled(false);
            statusText.setText("Testing connection...");
            executor.execute(() -> {
                try {
                    String base = getSavedBaseUrl();
                    if (base.isEmpty()) {
                        runOnUiThread(() -> {
                            testButton.setEnabled(true);
                            statusText.setText("Save your PC LAN IP first.");
                        });
                        return;
                    }
                    String json = fetchUrl(base + "/api/health");
                    runOnUiThread(() -> {
                        testButton.setEnabled(true);
                        statusText.setText("Connection OK: " + json);
                    });
                } catch (Exception error) {
                    runOnUiThread(() -> {
                        testButton.setEnabled(true);
                        statusText.setText("Connection failed: " + error.getMessage());
                    });
                }
            });
        });

        webView.loadUrl(getLaunchUrl());
    }
}

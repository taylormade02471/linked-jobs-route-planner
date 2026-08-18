package com.linkedjobs.routeplanner;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends AppCompatActivity {
    private static final String PREFS_NAME = "linked_jobs_route_planner";
    private static final String KEY_BASE_URL = "base_url";
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
        if (value.startsWith("http://") || value.startsWith("https://")) {
            return value.replaceAll("/+$", "");
        }
        return ("http://" + value).replaceAll("/+$", "");
    }

    private String getSavedBaseUrl() {
        return normalizeBaseUrl(getPrefs().getString(KEY_BASE_URL, DEFAULT_BASE_URL));
    }

    private String getLaunchUrl() {
        Uri data = getIntent() != null ? getIntent().getData() : null;
        if (data != null) {
            String scheme = data.getScheme();
            if (scheme != null && ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))) {
                return data.toString();
            }
        }
        return getSavedBaseUrl() + "/login";
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

    private LinearLayout buildLayout(WebView webView, EditText baseUrlInput, TextView statusText, Button saveButton, Button detectButton) {
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

        saveButton.setText("Save and open");
        saveButton.setOnClickListener(v -> {
            String normalized = normalizeBaseUrl(baseUrlInput.getText().toString());
            getPrefs().edit().putString(KEY_BASE_URL, normalized).apply();
            statusText.setText("Saved: " + normalized);
            webView.loadUrl(normalized + "/login");
        });

        detectButton.setText("Detect LAN IP");
        detectButton.setOnClickListener(v -> {
            detectButton.setEnabled(false);
            statusText.setText("Detecting LAN IP...");
            executor.execute(() -> {
                try {
                    String base = getSavedBaseUrl();
                    String json = fetchUrl(base + "/api/network-info");
                    String preferredUrl = extractPreferredUrl(json);
                    runOnUiThread(() -> {
                        detectButton.setEnabled(true);
                        if (preferredUrl != null && !preferredUrl.isEmpty()) {
                            baseUrlInput.setText(preferredUrl);
                            getPrefs().edit().putString(KEY_BASE_URL, preferredUrl).apply();
                            statusText.setText("Detected: " + preferredUrl);
                            webView.loadUrl(preferredUrl + "/login");
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
        });

        statusText.setText("Using: " + getSavedBaseUrl());
        statusText.setPadding(0, 12, 0, 12);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.addView(title);
        header.addView(subtitle);
        header.addView(baseUrlInput);
        header.addView(detectButton);
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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        EditText baseUrlInput = new EditText(this);
        TextView statusText = new TextView(this);
        Button saveButton = new Button(this);
        Button detectButton = new Button(this);
        WebView webView = new WebView(this);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setWebViewClient(new WebViewClient());
        setContentView(buildLayout(webView, baseUrlInput, statusText, saveButton, detectButton));
        webView.loadUrl(getLaunchUrl());
    }
}

package com.linkedjobs.routeplanner;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.util.Base64;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URLEncoder;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final List<JobStop> stops = new ArrayList<>();
    private EditText baseUrlInput;
    private EditText usernameInput;
    private EditText passwordInput;
    private EditText startInput;
    private TextView statusView;
    private TextView jobsView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(buildLayout());
    }

    private View buildLayout() {
        ScrollView scrollView = new ScrollView(this);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(32, 32, 32, 32);
        scrollView.addView(layout);

        TextView title = new TextView(this);
        title.setText("Linked Jobs Route Planner");
        title.setTextSize(24);
        title.setPadding(0, 0, 0, 24);
        layout.addView(title);

        baseUrlInput = input("Server URL", "http://10.0.2.2:3300");
        usernameInput = input("Username", "");
        passwordInput = input("Password", "");
        passwordInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        startInput = input("Start address", "Current Location");
        layout.addView(baseUrlInput);
        layout.addView(usernameInput);
        layout.addView(passwordInput);
        layout.addView(startInput);

        Button refresh = new Button(this);
        refresh.setText("Refresh Jobs");
        refresh.setOnClickListener(view -> loadJobs());
        layout.addView(refresh);

        Button maps = new Button(this);
        maps.setText("Open Selected Stops In Maps");
        maps.setOnClickListener(view -> openRoute());
        layout.addView(maps);

        statusView = new TextView(this);
        statusView.setPadding(0, 20, 0, 12);
        layout.addView(statusView);

        jobsView = new TextView(this);
        jobsView.setText("No jobs loaded yet.");
        layout.addView(jobsView);
        return scrollView;
    }

    private EditText input(String hint, String value) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setText(value);
        input.setSingleLine(true);
        input.setPadding(0, 12, 0, 12);
        return input;
    }

    private void loadJobs() {
        statusView.setText("Loading jobs...");
        executor.execute(() -> {
            try {
                String response = getJson(baseUrlInput.getText().toString() + "/api/jobs");
                JSONObject root = new JSONObject(response);
                JSONArray jobs = root.optJSONArray("jobs");
                stops.clear();
                StringBuilder display = new StringBuilder();
                if (jobs != null) {
                    for (int index = 0; index < jobs.length(); index++) {
                        JSONObject job = jobs.getJSONObject(index);
                        String title = job.optString("title", "Job " + (index + 1));
                        String location = job.optString("location", "");
                        if (!location.isEmpty()) stops.add(new JobStop(title, location));
                        display.append(index + 1).append(". ")
                            .append(title).append("\n")
                            .append(location.isEmpty() ? "No location" : location)
                            .append("\n\n");
                    }
                }
                String text = display.length() == 0 ? "No jobs returned." : display.toString();
                runOnUiThread(() -> {
                    statusView.setText(stops.size() + " map-ready stops loaded.");
                    jobsView.setText(text);
                });
            } catch (Exception error) {
                runOnUiThread(() -> statusView.setText("Load failed: " + error.getMessage()));
            }
        });
    }

    private String getJson(String urlText) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlText).openConnection();
        connection.setRequestMethod("GET");
        String username = usernameInput.getText().toString();
        String password = passwordInput.getText().toString();
        if (!username.isEmpty() || !password.isEmpty()) {
            String raw = username + ":" + password;
            String encoded = Base64.encodeToString(raw.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
            connection.setRequestProperty("Authorization", "Basic " + encoded);
        }
        int status = connection.getResponseCode();
        BufferedReader reader = new BufferedReader(new InputStreamReader(
            status >= 400 ? connection.getErrorStream() : connection.getInputStream(),
            StandardCharsets.UTF_8
        ));
        StringBuilder response = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) response.append(line);
        if (status >= 400) throw new IllegalStateException("HTTP " + status + " " + response);
        return response.toString();
    }

    private void openRoute() {
        if (stops.isEmpty()) {
            statusView.setText("Load jobs with locations first.");
            return;
        }
        try {
            String origin = encode(startInput.getText().toString().trim().isEmpty()
                ? "Current Location"
                : startInput.getText().toString().trim());
            String destination = encode(stops.get(stops.size() - 1).location);
            StringBuilder url = new StringBuilder("https://www.google.com/maps/dir/?api=1")
                .append("&origin=").append(origin)
                .append("&destination=").append(destination);
            if (stops.size() > 1) {
                List<String> waypointValues = new ArrayList<>();
                for (int i = 0; i < Math.min(stops.size() - 1, 9); i++) {
                    waypointValues.add(stops.get(i).location);
                }
                url.append("&waypoints=").append(encode(String.join("|", waypointValues)));
            }
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url.toString())));
        } catch (Exception error) {
            statusView.setText("Maps failed: " + error.getMessage());
        }
    }

    private String encode(String value) throws Exception {
        return URLEncoder.encode(value, "UTF-8");
    }

    private static class JobStop {
        final String title;
        final String location;

        JobStop(String title, String location) {
            this.title = title;
            this.location = location;
        }
    }
}

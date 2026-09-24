package com.linkedjobs.routeplanner;

import android.os.Bundle;
import android.text.InputType;
import android.view.ViewGroup;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

public class ProviderConnectionActivity extends AppCompatActivity {
    private ProviderCredentialStore credentialStore;
    private Spinner providerSpinner;
    private EditText usernameInput;
    private EditText passwordInput;
    private TextView statusText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        credentialStore = new ProviderCredentialStore(this);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(32, 32, 32, 32);
        root.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        TextView title = new TextView(this);
        title.setText("Provider Connections");
        title.setTextSize(22);
        title.setPadding(0, 0, 0, 24);
        root.addView(title);

        TextView help = new TextView(this);
        help.setText("Save provider app logins encrypted on this Android device. The planner map only receives safe job records, never passwords.");
        help.setPadding(0, 0, 0, 16);
        root.addView(help);

        providerSpinner = new Spinner(this);
        ArrayAdapter<String> adapter = new ArrayAdapter<>(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            ProviderCredentialStore.PROVIDER_LABELS
        );
        providerSpinner.setAdapter(adapter);
        providerSpinner.setSelection(indexForProvider(getIntent().getStringExtra("provider_id")));
        providerSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                if (statusText != null) refreshStatus();
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {
            }
        });
        root.addView(providerSpinner);

        usernameInput = new EditText(this);
        usernameInput.setHint("Username or email");
        usernameInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        root.addView(usernameInput);

        passwordInput = new EditText(this);
        passwordInput.setHint("Password");
        passwordInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        root.addView(passwordInput);

        Button saveButton = new Button(this);
        saveButton.setText("Save encrypted login");
        saveButton.setOnClickListener((view) -> saveCurrentLogin());
        root.addView(saveButton);

        Button clearButton = new Button(this);
        clearButton.setText("Clear saved login");
        clearButton.setOnClickListener((view) -> clearCurrentLogin());
        root.addView(clearButton);

        statusText = new TextView(this);
        statusText.setPadding(0, 24, 0, 0);
        root.addView(statusText);

        setContentView(root);
        refreshStatus();
    }

    private void saveCurrentLogin() {
        String providerId = selectedProviderId();
        String result = credentialStore.saveLogin(
            providerId,
            usernameInput.getText().toString(),
            passwordInput.getText().toString()
        );
        passwordInput.setText("");
        statusText.setText(result.contains("\"ok\":true")
            ? credentialStore.labelForProvider(providerId) + " login saved in encrypted Android storage."
            : "Login was not saved. Enter both username and password.");
    }

    private void clearCurrentLogin() {
        String providerId = selectedProviderId();
        credentialStore.clearLogin(providerId);
        usernameInput.setText("");
        passwordInput.setText("");
        statusText.setText(credentialStore.labelForProvider(providerId) + " saved login cleared.");
    }

    private void refreshStatus() {
        String providerId = selectedProviderId();
        String status = credentialStore.statusJson(providerId);
        statusText.setText(status.contains("\"has_saved_login\":true")
            ? credentialStore.labelForProvider(providerId) + " has a saved encrypted login."
            : credentialStore.labelForProvider(providerId) + " has no saved login yet.");
    }

    private int indexForProvider(String providerId) {
        for (int index = 0; index < ProviderCredentialStore.PROVIDER_IDS.length; index++) {
            if (ProviderCredentialStore.PROVIDER_IDS[index].equals(providerId)) return index;
        }
        return 0;
    }

    private String selectedProviderId() {
        int index = Math.max(0, providerSpinner.getSelectedItemPosition());
        if (index >= ProviderCredentialStore.PROVIDER_IDS.length) return ProviderCredentialStore.PROVIDER_IDS[0];
        return ProviderCredentialStore.PROVIDER_IDS[index];
    }
}

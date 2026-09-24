package com.linkedjobs.routeplanner;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import org.json.JSONObject;

public class ProviderCredentialStore {
    public static final String CREDENTIAL_VAULT = "android_encrypted_storage";
    public static final String[] PROVIDER_IDS = {
        "survey_merchandiser",
        "clickworker",
        "field_nation",
        "field_agent"
    };
    public static final String[] PROVIDER_LABELS = {
        "Survey Merchandiser",
        "Clickworker",
        "Field Nation",
        "Field Agent"
    };

    private final SharedPreferences credentialPrefs;

    public ProviderCredentialStore(Context context) {
        try {
            MasterKey masterKey = new MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();
            credentialPrefs = EncryptedSharedPreferences.create(
                context,
                "linked_jobs_provider_logins",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            );
        } catch (Exception error) {
            throw new IllegalStateException("Unable to create encrypted provider login storage.", error);
        }
    }

    public boolean isValidProviderId(String providerId) {
        return packageForProvider(providerId) != null;
    }

    public String validProviderIdOrNull(String providerId) {
        return isValidProviderId(providerId) ? providerId : null;
    }

    public String packageForProvider(String providerId) {
        if ("survey_merchandiser".equals(providerId)) return "iSurvey.Android";
        if ("clickworker".equals(providerId)) return "com.clickworker.clickworkerapp";
        if ("field_nation".equals(providerId)) return "com.fieldnation.android";
        if ("field_agent".equals(providerId)) return "net.fieldagent";
        return null;
    }

    public String labelForProvider(String providerId) {
        for (int index = 0; index < PROVIDER_IDS.length; index++) {
            if (PROVIDER_IDS[index].equals(providerId)) return PROVIDER_LABELS[index];
        }
        return "Provider";
    }

    public String saveLogin(String providerId, String username, String password) {
        String id = validProviderIdOrNull(providerId);
        String cleanUsername = username == null ? "" : username.trim();
        String cleanPassword = password == null ? "" : password;

        if (id == null) return errorJson(providerId, "Unknown provider.");
        if (cleanUsername.isEmpty() || cleanPassword.isEmpty()) {
            return errorJson(id, "Username and password are required.");
        }

        long updatedAt = System.currentTimeMillis();
        credentialPrefs.edit()
            .putString(credentialKey(id, "username"), cleanUsername)
            .putString(credentialKey(id, "password"), cleanPassword)
            .putLong(credentialKey(id, "updated_at"), updatedAt)
            .apply();

        return credentialStatusJson(id, true, cleanUsername, updatedAt);
    }

    public String statusJson(String providerId) {
        String id = validProviderIdOrNull(providerId);
        if (id == null) return errorJson(providerId, "Unknown provider.");
        String username = credentialPrefs.getString(credentialKey(id, "username"), "");
        boolean hasPassword = credentialPrefs.contains(credentialKey(id, "password"));
        long updatedAt = credentialPrefs.getLong(credentialKey(id, "updated_at"), 0L);
        return credentialStatusJson(id, hasPassword && username != null && !username.isEmpty(), username, updatedAt);
    }

    public String clearLogin(String providerId) {
        String id = validProviderIdOrNull(providerId);
        if (id == null) return errorJson(providerId, "Unknown provider.");
        credentialPrefs.edit()
            .remove(credentialKey(id, "username"))
            .remove(credentialKey(id, "password"))
            .remove(credentialKey(id, "updated_at"))
            .apply();
        return credentialStatusJson(id, false, "", 0L);
    }

    private String credentialKey(String providerId, String field) {
        return providerId + "." + field;
    }

    private String credentialStatusJson(String providerId, boolean hasSavedLogin, String username, long updatedAt) {
        try {
            JSONObject out = new JSONObject();
            out.put("ok", true);
            out.put("provider_id", providerId);
            out.put("username", username == null ? "" : username);
            out.put("has_saved_login", hasSavedLogin);
            out.put("vault", CREDENTIAL_VAULT);
            out.put("updated_at", updatedAt);
            return out.toString();
        } catch (Exception error) {
            return "{\"ok\":false,\"error\":\"Unable to build credential status.\"}";
        }
    }

    private String errorJson(String providerId, String message) {
        try {
            JSONObject out = new JSONObject();
            out.put("ok", false);
            out.put("provider_id", providerId == null ? "" : providerId);
            out.put("has_saved_login", false);
            out.put("error", message);
            return out.toString();
        } catch (Exception error) {
            return "{\"ok\":false,\"error\":\"Android credential store error.\"}";
        }
    }
}

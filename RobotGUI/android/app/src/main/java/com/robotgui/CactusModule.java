package com.robotgui;

import android.util.Log;
import com.facebook.react.bridge.*;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import android.os.Handler;
import android.os.Looper;

public class CactusModule extends ReactContextBaseJavaModule {
    private static final String TAG = "CactusModule";
    private final ExecutorService executorService = Executors.newCachedThreadPool();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private String backendUrl;
    private String identity;
    private String password;
    private String domainId;
    private boolean isInitialized = false;

    public CactusModule(ReactApplicationContext reactContext) {
        super(reactContext);
        Log.d(TAG, "CactusModule constructor called");
    }

    private synchronized void ensureInitialized() {
        if (!isInitialized) {
            try {
                Log.d(TAG, "Initializing CactusModule");
                ConfigManager configManager = ConfigManager.INSTANCE;
                if (configManager != null) {
                    this.backendUrl = configManager.getNestedString("cactus.backend_url", "");
                    this.identity = configManager.getNestedString("cactus.identity", "");
                    this.password = configManager.getNestedString("cactus.password", "");
                    this.domainId = configManager.getNestedString("cactus.domain_id", "");
                    
                    Log.d(TAG, "Config loaded - Backend URL: " + (backendUrl.isEmpty() ? "empty" : "set") + 
                              ", Identity: " + (identity.isEmpty() ? "empty" : "set") + 
                              ", Password: " + (password.isEmpty() ? "empty" : "set") +
                              ", Domain ID: " + (domainId.isEmpty() ? "empty" : "set"));
                    
                    isInitialized = true;
                } else {
                    Log.e(TAG, "ConfigManager is null during initialization");
                }
            } catch (Exception e) {
                Log.e(TAG, "Error in CactusModule initialization: " + e.getMessage());
                e.printStackTrace();
            }
        }
    }

    @Override
    public String getName() {
        return "CactusUtils";
    }

    private JSONObject authWithPassword() {
        try {
            String url = backendUrl + "/api/collections/users/auth-with-password";
            Log.d(TAG, "Authenticating with URL: " + url);

            JSONObject data = new JSONObject()
                .put("identity", identity)
                .put("password", password);

            HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setDoOutput(true);

            try (java.io.OutputStream os = connection.getOutputStream()) {
                byte[] input = data.toString().getBytes("utf-8");
                os.write(input, 0, input.length);
            }

            if (connection.getResponseCode() == HttpURLConnection.HTTP_OK) {
                StringBuilder response = new StringBuilder();
                try (BufferedReader br = new BufferedReader(
                        new InputStreamReader(connection.getInputStream(), "utf-8"))) {
                    String responseLine;
                    while ((responseLine = br.readLine()) != null) {
                        response.append(responseLine.trim());
                    }
                }
                Log.d(TAG, "Authentication successful");
                return new JSONObject(response.toString());
            } else {
                Log.e(TAG, "Auth failed with response code: " + connection.getResponseCode());
                StringBuilder errorResponse = new StringBuilder();
                try (BufferedReader br = new BufferedReader(
                        new InputStreamReader(connection.getErrorStream(), "utf-8"))) {
                    String responseLine;
                    while ((responseLine = br.readLine()) != null) {
                        errorResponse.append(responseLine.trim());
                    }
                }
                Log.e(TAG, "Auth error response: " + errorResponse.toString());
                throw new Exception("Authentication failed: " + errorResponse.toString());
            }
        } catch (Exception e) {
            Log.e(TAG, "Auth error: " + e.getMessage());
            e.printStackTrace();
            return null;
        }
    }

    @ReactMethod
    public void getProducts(Promise promise) {
        Log.d(TAG, "getProducts called");
        ensureInitialized();
        
        if (!isInitialized) {
            promise.reject("INIT_ERROR", "CactusModule not properly initialized");
            return;
        }

        executorService.execute(() -> {
            try {
                // First authenticate
                Log.d(TAG, "Attempting authentication");
                JSONObject auth = authWithPassword();
                if (auth == null) {
                    Log.e(TAG, "Authentication failed - auth object is null");
                    mainHandler.post(() -> promise.reject("AUTH_ERROR", "Authentication failed"));
                    return;
                }
                
                // For now, just return an empty array if auth was successful
                WritableArray products = Arguments.createArray();
                mainHandler.post(() -> promise.resolve(products));
            } catch (Exception e) {
                Log.e(TAG, "Error in getProducts: " + e.getMessage());
                mainHandler.post(() -> promise.reject("PRODUCTS_ERROR", "Error getting products: " + e.getMessage()));
            }
        });
    }
} 
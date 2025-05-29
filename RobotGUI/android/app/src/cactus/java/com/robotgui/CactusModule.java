package com.robotgui;

import android.util.Log;
import com.facebook.react.bridge.*;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import org.json.JSONObject;
import org.json.JSONArray;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import android.os.Handler;
import android.os.Looper;
import java.util.Map;
import java.util.HashMap;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import androidx.annotation.Nullable;

public class CactusModule extends ReactContextBaseJavaModule {
    private static final String TAG = "CactusModule";
    private final ExecutorService executorService = Executors.newCachedThreadPool();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private String backendUrl;
    private String identity;
    private String password;
    private String domainId;
    private String storeBackendUrl;
    private boolean isInitialized = false;
    private static final String DEBUG_LOG_FILENAME = "debug_log.txt";
    private String productNamesJson;
    private String positionsResponse;

    public CactusModule(ReactApplicationContext reactContext) {
        super(reactContext);
        Log.d(TAG, "CactusModule constructor called");
    }

    // Utility method to write debug messages to file
    private void logToFile(String message) {
        try {
            ReactApplicationContext context = getReactApplicationContext();
            if (context != null) {
                FileUtilsModule fileUtils = new FileUtilsModule(context);
                String timestampedMessage = String.format("[CactusModule] %s", message);
                fileUtils.appendToFile(DEBUG_LOG_FILENAME, timestampedMessage, null);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to write to debug log: " + e.getMessage());
        }
    }

    // Add method to write logs to a file
    @ReactMethod
    public void writeLogToFile(String message, Promise promise) {
        executorService.execute(() -> {
            try {
                ReactApplicationContext context = getReactApplicationContext();
                if (context != null) {
                    FileUtilsModule fileUtils = new FileUtilsModule(context);
                    
                    // Create timestamp
                    SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US);
                    String timestamp = dateFormat.format(new Date());
                    
                    // Format log message
                    String logLine = timestamp + " [CactusModule] " + message;
                    
                    // Use FileUtilsModule to append to file
                    fileUtils.appendToFile(DEBUG_LOG_FILENAME, logLine, promise);
                } else {
                    mainHandler.post(() -> promise.reject("CONTEXT_ERROR", "React context is null"));
                }
            } catch (Exception e) {
                Log.e(TAG, "Error writing to log file: " + e.getMessage());
                mainHandler.post(() -> promise.reject("LOG_ERROR", "Failed to write to log file: " + e.getMessage()));
            }
        });
    }

    private synchronized void ensureInitialized() {
        if (!isInitialized) {
            try {
                Log.d(TAG, "Initializing CactusModule");
                logToFile("Initializing CactusModule");
                ConfigManager configManager = ConfigManager.INSTANCE;
                if (configManager != null) {
                    this.backendUrl = configManager.getNestedString("cactus.backend_url", "");
                    this.identity = configManager.getNestedString("cactus.identity", "");
                    this.password = configManager.getNestedString("cactus.password", "");
                    
                    // Get domain ID directly from shared preferences
                    ReactApplicationContext context = getReactApplicationContext();
                    if (context != null) {
                        android.content.SharedPreferences prefs = context.getSharedPreferences("DomainAuth", android.content.Context.MODE_PRIVATE);
                        this.domainId = prefs.getString("domain_id", "");
                        Log.d(TAG, "Got domain ID from shared preferences: " + domainId);
                        logToFile("Got domain ID from shared preferences: " + domainId);
                        
                        if (!domainId.isEmpty()) {
                            storeBackendUrl = configManager.getNestedString("cactus.store_backend_url", "");
                            
                            String configStatus = "Config loaded - Backend URL: " + (backendUrl.isEmpty() ? "empty" : "set") + 
                                      ", Identity: " + (identity.isEmpty() ? "empty" : "set") + 
                                      ", Password: " + (password.isEmpty() ? "empty" : "set") +
                                      ", Domain ID: " + (domainId.isEmpty() ? "empty" : "set") +
                                      ", Store Backend URL: " + (storeBackendUrl.isEmpty() ? "empty" : "set");
                            Log.d(TAG, configStatus);
                            logToFile(configStatus);
                            
                            isInitialized = true;
                        } else {
                            Log.e(TAG, "Domain ID is empty");
                            logToFile("ERROR: Domain ID is empty");
                        }
                    } else {
                        Log.e(TAG, "React context is null");
                        this.domainId = "";
                    }
                } else {
                    Log.e(TAG, "ConfigManager is null during initialization");
                    logToFile("ERROR: ConfigManager is null during initialization");
                }
            } catch (Exception e) {
                Log.e(TAG, "Error in CactusModule initialization: " + e.getMessage());
                logToFile("ERROR in initialization: " + e.getMessage());
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
            logToFile("Authenticating with URL: " + url);

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
                logToFile("Authentication successful");
                return new JSONObject(response.toString());
            } else {
                Log.e(TAG, "Auth failed with response code: " + connection.getResponseCode());
                logToFile("ERROR: Auth failed with response code: " + connection.getResponseCode());
                StringBuilder errorResponse = new StringBuilder();
                try (BufferedReader br = new BufferedReader(
                        new InputStreamReader(connection.getErrorStream(), "utf-8"))) {
                    String responseLine;
                    while ((responseLine = br.readLine()) != null) {
                        errorResponse.append(responseLine.trim());
                    }
                }
                Log.e(TAG, "Auth error response: " + errorResponse.toString());
                logToFile("Auth error response: " + errorResponse.toString());
                throw new Exception("Authentication failed: " + errorResponse.toString());
            }
        } catch (Exception e) {
            Log.e(TAG, "Auth error: " + e.getMessage());
            logToFile("ERROR in authentication: " + e.getMessage());
            e.printStackTrace();
            return null;
        }
    }

    private String getDomainCollectionId(String token) throws Exception {
        String url = backendUrl + "/api/collections/Domains/records?filter=(DomainID='" + domainId + "')";
        Log.d(TAG, "Getting domain collection ID from URL: " + url);
        logToFile("Getting domain collection ID from URL: " + url);

        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestMethod("GET");
        connection.setRequestProperty("Authorization", "Bearer " + token);

        if (connection.getResponseCode() == HttpURLConnection.HTTP_OK) {
            StringBuilder response = new StringBuilder();
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(connection.getInputStream(), "utf-8"))) {
                String responseLine;
                while ((responseLine = br.readLine()) != null) {
                    response.append(responseLine.trim());
                }
            }
            JSONObject jsonResponse = new JSONObject(response.toString());
            JSONArray items = jsonResponse.getJSONArray("items");
            if (items.length() > 0) {
                String collectionId = items.getJSONObject(0).getString("id");
                Log.d(TAG, "Found domain collection ID: " + collectionId);
                logToFile("Found domain collection ID: " + collectionId);
                return collectionId;
            }
            String errorMsg = "No domain found for ID: " + domainId;
            logToFile("ERROR: " + errorMsg);
            throw new Exception(errorMsg);
        }
        String errorMsg = "Failed to get domain collection ID. Response code: " + connection.getResponseCode();
        logToFile("ERROR: " + errorMsg);
        throw new Exception(errorMsg);
    }

    private JSONArray getESLData(String domainCollectionId, String token) throws Exception {
        String url = backendUrl + "/api/collections/ESLDomainData/records?filter=(domain='" + 
                    domainCollectionId + "')&perPage=100000";
        Log.d(TAG, "Getting ESL data from URL: " + url);
        logToFile("Getting ESL data from URL: " + url);

        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestMethod("GET");
        connection.setRequestProperty("Authorization", "Bearer " + token);

        if (connection.getResponseCode() == HttpURLConnection.HTTP_OK) {
            StringBuilder response = new StringBuilder();
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(connection.getInputStream(), "utf-8"))) {
                String responseLine;
                while ((responseLine = br.readLine()) != null) {
                    response.append(responseLine.trim());
                }
            }
            JSONObject jsonResponse = new JSONObject(response.toString());
            JSONArray items = jsonResponse.getJSONArray("items");
            Log.d(TAG, "Retrieved " + items.length() + " ESL items");
            logToFile("Retrieved " + items.length() + " ESL items");
            return items;
        }
        String errorMsg = "Failed to get ESL data. Response code: " + connection.getResponseCode();
        logToFile("ERROR: " + errorMsg);
        throw new Exception(errorMsg);
    }

    private JSONObject getDomainBarcodeNames(String domainCollectionId, String token) throws Exception {
        // First find the record ID for the domain
        String lookupUrl = backendUrl + "/api/collections/DomainBarcodeNames/records?filter=(domain='" + 
                     domainCollectionId + "')";
        Log.d(TAG, "Looking up DomainBarcodeNames record ID from URL: " + lookupUrl);
        logToFile("Looking up DomainBarcodeNames record ID from URL: " + lookupUrl);

        HttpURLConnection lookupConnection = (HttpURLConnection) new URL(lookupUrl).openConnection();
        lookupConnection.setRequestMethod("GET");
        lookupConnection.setRequestProperty("Authorization", "Bearer " + token);

        if (lookupConnection.getResponseCode() == HttpURLConnection.HTTP_OK) {
            StringBuilder response = new StringBuilder();
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(lookupConnection.getInputStream(), "utf-8"))) {
                String responseLine;
                while ((responseLine = br.readLine()) != null) {
                    response.append(responseLine.trim());
                }
            }
            JSONObject jsonResponse = new JSONObject(response.toString());
            JSONArray items = jsonResponse.getJSONArray("items");
            if (items.length() > 0) {
                String recordId = items.getJSONObject(0).getString("id");
                logToFile("Found DomainBarcodeNames record ID: " + recordId);
                
                // Now get the specific record using the correct endpoint format
                String url = backendUrl + "/api/collections/DomainBarcodeNames/records/" + recordId;
                Log.d(TAG, "Getting domain barcode names from URL: " + url);
                logToFile("Getting domain barcode names from URL: " + url);
                
                HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setRequestMethod("GET");
                connection.setRequestProperty("Authorization", "Bearer " + token);
                
                if (connection.getResponseCode() == HttpURLConnection.HTTP_OK) {
                    StringBuilder recordResponse = new StringBuilder();
                    try (BufferedReader br = new BufferedReader(
                            new InputStreamReader(connection.getInputStream(), "utf-8"))) {
                        String recordLine;
                        while ((recordLine = br.readLine()) != null) {
                            recordResponse.append(recordLine.trim());
                        }
                    }
                    JSONObject record = new JSONObject(recordResponse.toString());
                    Log.d(TAG, "Successfully retrieved DomainBarcodeNames record");
                    logToFile("Successfully retrieved DomainBarcodeNames record");
                    return record;
                }
                String errorMsg = "Failed to get DomainBarcodeNames record. Response code: " + connection.getResponseCode();
                logToFile("ERROR: " + errorMsg);
                throw new Exception(errorMsg);
            }
            String errorMsg = "No DomainBarcodeNames found for domain: " + domainCollectionId;
            logToFile("ERROR: " + errorMsg);
            throw new Exception(errorMsg);
        }
        String errorMsg = "Failed to lookup DomainBarcodeNames. Response code: " + lookupConnection.getResponseCode();
        logToFile("ERROR: " + errorMsg);
        throw new Exception(errorMsg);
    }

    private JSONObject getSemanticProductData(String domainCollectionId, String token) throws Exception {
        String url = backendUrl + "/api/collections/SemanticProductData/records?filter=(domain='" + domainCollectionId + "')&perPage=10000";
        Log.d(TAG, "Getting semantic product data from URL: " + url);
        logToFile("Getting semantic product data from URL: " + url);

        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestMethod("GET");
        connection.setRequestProperty("Authorization", "Bearer " + token);

        if (connection.getResponseCode() == HttpURLConnection.HTTP_OK) {
            StringBuilder response = new StringBuilder();
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(connection.getInputStream(), "utf-8"))) {
                String responseLine;
                while ((responseLine = br.readLine()) != null) {
                    response.append(responseLine.trim());
                }
            }
            JSONObject jsonResponse = new JSONObject(response.toString());
            Log.d(TAG, "Successfully retrieved semantic product data");
            logToFile("Successfully retrieved semantic product data");
            
            // Extract codes from items
            JSONArray items = jsonResponse.getJSONArray("items");
            JSONArray codes = new JSONArray();
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.getJSONObject(i);
                codes.put(item.getString("code"));
            }
            
            // Log the codes list
            logToFile("Semantic product codes: " + codes.toString());
            
            // Make API call to get product names
            try {
                String productNameUrl = storeBackendUrl + "/GetProductName";
                logToFile("Making API call to: " + productNameUrl);
                
                HttpURLConnection productNameConnection = (HttpURLConnection) new URL(productNameUrl).openConnection();
                productNameConnection.setRequestMethod("POST");
                productNameConnection.setRequestProperty("Content-Type", "application/json");
                productNameConnection.setDoOutput(true);
                
                // Create request body
                JSONObject requestBody = new JSONObject();
                requestBody.put("skus", codes.toString());
                
                // Send request
                try (java.io.OutputStream os = productNameConnection.getOutputStream()) {
                    byte[] input = requestBody.toString().getBytes("utf-8");
                    os.write(input, 0, input.length);
                }
                
                // Get response
                if (productNameConnection.getResponseCode() == HttpURLConnection.HTTP_OK) {
                    StringBuilder apiResponse = new StringBuilder();
                    try (BufferedReader br = new BufferedReader(
                            new InputStreamReader(productNameConnection.getInputStream(), "utf-8"))) {
                        String responseLine;
                        while ((responseLine = br.readLine()) != null) {
                            apiResponse.append(responseLine.trim());
                        }
                    }
                    // Store the raw response string
                    productNamesJson = apiResponse.toString();
                    logToFile("API Response: " + productNamesJson);
                    Log.d(TAG, "Stored product names response: " + (productNamesJson != null ? "success" : "failed"));
                } else {
                    StringBuilder errorResponse = new StringBuilder();
                    try (BufferedReader br = new BufferedReader(
                            new InputStreamReader(productNameConnection.getErrorStream(), "utf-8"))) {
                        String responseLine;
                        while ((responseLine = br.readLine()) != null) {
                            errorResponse.append(responseLine.trim());
                        }
                    }
                    logToFile("API Error Response: " + errorResponse.toString());
                }
            } catch (Exception e) {
                logToFile("Error making API call: " + e.getMessage());
            }

            // Make API call to get product positions
            try {
                String positionsUrl = backendUrl + "/requestMultipleProductPositions";
                logToFile("Making API call to: " + positionsUrl);
                
                HttpURLConnection positionsConnection = (HttpURLConnection) new URL(positionsUrl).openConnection();
                positionsConnection.setRequestMethod("POST");
                positionsConnection.setRequestProperty("Content-Type", "application/json");
                positionsConnection.setRequestProperty("Authorization", "Bearer " + token);
                positionsConnection.setDoOutput(true);
                
                // Create request body
                JSONObject positionsRequestBody = new JSONObject();
                positionsRequestBody.put("domainId", domainId);
                
                // Convert JSONArray to string array
                String[] skusArray = new String[codes.length()];
                for (int i = 0; i < codes.length(); i++) {
                    skusArray[i] = codes.getString(i);
                }
                positionsRequestBody.put("skus", new JSONArray(skusArray));
                
                // Send request
                try (java.io.OutputStream os = positionsConnection.getOutputStream()) {
                    byte[] input = positionsRequestBody.toString().getBytes("utf-8");
                    os.write(input, 0, input.length);
                }
                
                // Get response
                if (positionsConnection.getResponseCode() == HttpURLConnection.HTTP_OK) {
                    StringBuilder positionsResponseBuilder = new StringBuilder();
                    try (BufferedReader br = new BufferedReader(
                            new InputStreamReader(positionsConnection.getInputStream(), "utf-8"))) {
                        String responseLine;
                        while ((responseLine = br.readLine()) != null) {
                            positionsResponseBuilder.append(responseLine.trim());
                        }
                    }
                    // Store the parsed positions response
                    positionsResponse = new JSONObject(positionsResponseBuilder.toString()).toString();
                    logToFile("Positions API Response: " + positionsResponse);
                    Log.d(TAG, "Stored positions response: " + (positionsResponse != null ? "success" : "failed"));
                } else {
                    StringBuilder errorResponse = new StringBuilder();
                    try (BufferedReader br = new BufferedReader(
                            new InputStreamReader(positionsConnection.getErrorStream(), "utf-8"))) {
                        String responseLine;
                        while ((responseLine = br.readLine()) != null) {
                            errorResponse.append(responseLine.trim());
                        }
                    }
                    logToFile("Positions API Error Response: " + errorResponse.toString());
                }
            } catch (Exception e) {
                logToFile("Error making positions API call: " + e.getMessage());
            }
            
            return jsonResponse;
        }
        String errorMsg = "Failed to get semantic product data. Response code: " + connection.getResponseCode();
        logToFile("ERROR: " + errorMsg);
        throw new Exception(errorMsg);
    }

    private Map<String, String> downloadAndParseCsv(String recordId, String collectionId, String filename, String token) throws Exception {
        String url = backendUrl + "/api/files/" + collectionId + "/" + recordId + "/" + filename;
        Log.d(TAG, "Downloading CSV from URL: " + url);
        logToFile("Downloading CSV from URL: " + url);

        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestMethod("GET");
        connection.setRequestProperty("Authorization", "Bearer " + token);
        connection.setConnectTimeout(30000); // 30 second timeout
        connection.setReadTimeout(30000);

        int responseCode = connection.getResponseCode();
        Log.d(TAG, "CSV HTTP response code: " + responseCode);
        logToFile("CSV HTTP response code: " + responseCode);

        if (responseCode == HttpURLConnection.HTTP_OK) {
            Map<String, String> lookupMap = new HashMap<>();
            StringBuilder csvPreview = new StringBuilder("CSV preview (first 5 lines):\n");
            int lineCount = 0;
            
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(connection.getInputStream(), "utf-8"))) {
                String line;
                // Skip header line
                boolean headerSkipped = false;
                
                while ((line = br.readLine()) != null) {
                    // Log the first few lines to see the structure
                    if (lineCount < 5) {
                        csvPreview.append(line).append("\n");
                        lineCount++;
                    }
                    
                    if (!headerSkipped) {
                        Log.d(TAG, "CSV header: " + line);
                        logToFile("CSV header: " + line);
                        headerSkipped = true;
                        continue;
                    }
                    
                    String[] values = line.split(",");
                    if (values.length < 7) {
                        logToFile("WARNING: CSV line has fewer than 7 columns: " + line);
                    }
                    
                    // Column 1 (index 0) is ESL Code
                    String eslCode = values[0].trim();
                    
                    // Column 4 (index 3) is Product Name, but check bounds first
                    String productName = values.length > 3 ? values[3].trim() : "";
                    
                    // Column 7 (index 6) is Barcode, but check bounds first
                    String barcode = "";
                    if (values.length > 6) {
                        barcode = values[6].trim();
                        // Remove .0 suffix from barcode if present
                        if (barcode.endsWith(".0")) {
                            barcode = barcode.substring(0, barcode.length() - 2);
                        }
                    }
                    
                    // Debug the first few mappings
                    if (lookupMap.size() < 3) {
                        Log.d(TAG, "Mapping example - ESL Code: '" + eslCode + "', Product Name: '" + productName + "', Barcode: '" + barcode + "'");
                        logToFile("Mapping example - ESL Code: '" + eslCode + "', Product Name: '" + productName + "', Barcode: '" + barcode + "'");
                    }
                    
                    if (!eslCode.isEmpty() && !productName.isEmpty()) {
                        // Map ESL code to product name
                        lookupMap.put(eslCode, productName);
                        
                        // Map barcode to product name if available
                        if (!barcode.isEmpty()) {
                            lookupMap.put(barcode, productName);
                        }
                    }
                }
            }
            
            Log.d(TAG, csvPreview.toString());
            logToFile(csvPreview.toString());
            
            Log.d(TAG, "Parsed CSV with " + lookupMap.size() + " entries");
            logToFile("Parsed CSV with " + lookupMap.size() + " entries");
            
            // Log some sample keys
            StringBuilder keys = new StringBuilder("Sample keys in lookup map: ");
            int count = 0;
            for (String key : lookupMap.keySet()) {
                if (count < 5) {
                    keys.append("'").append(key).append("', ");
                    count++;
                } else {
                    break;
                }
            }
            Log.d(TAG, keys.toString());
            logToFile(keys.toString());
            
            return lookupMap;
        }
        
        // Log error details
        String errorMsg = "Failed to download CSV. Response code: " + responseCode;
        if (responseCode != HttpURLConnection.HTTP_OK) {
            StringBuilder errorResponse = new StringBuilder();
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(connection.getErrorStream(), "utf-8"))) {
                String responseLine;
                while ((responseLine = br.readLine()) != null) {
                    errorResponse.append(responseLine.trim());
                }
            } catch (Exception e) {
                Log.e(TAG, "Error reading error stream: " + e.getMessage());
                logToFile("Error reading error stream: " + e.getMessage());
            }
            Log.e(TAG, "Error response: " + errorResponse.toString());
            logToFile("Error response: " + errorResponse.toString());
        }
        
        throw new Exception(errorMsg);
    }

    @ReactMethod
    public void getProducts(Promise promise) {
        Log.d(TAG, "getProducts called");
        logToFile("getProducts called");
        ensureInitialized();
        
        if (!isInitialized) {
            Log.e(TAG, "CactusModule not properly initialized");
            logToFile("ERROR: CactusModule not properly initialized");
            mainHandler.post(() -> promise.reject("INIT_ERROR", "CactusModule not properly initialized"));
            return;
        }

        executorService.execute(() -> {
            try {
                // First authenticate
                Log.d(TAG, "Attempting authentication");
                logToFile("Attempting authentication");
                JSONObject auth = authWithPassword();
                if (auth == null) {
                    Log.e(TAG, "Authentication failed - auth object is null");
                    logToFile("ERROR: Authentication failed - auth object is null");
                    mainHandler.post(() -> promise.reject("AUTH_ERROR", "Authentication failed"));
                    return;
                }
                String token = auth.getString("token");
                Log.d(TAG, "Authentication successful, got token");
                logToFile("Authentication successful, got token");

                // Get domain collection ID
                String domainCollectionId = getDomainCollectionId(token);
                Log.d(TAG, "Got domain collection ID: " + domainCollectionId);
                logToFile("Got domain collection ID: " + domainCollectionId);

                // Get semantic product data which will make the two API calls
                try {
                    JSONObject semanticData = getSemanticProductData(domainCollectionId, token);
                    Log.d(TAG, "Got semantic product data");
                    logToFile("Got semantic product data");

                    // Check if we have valid responses
                    if (productNamesJson == null || positionsResponse == null) {
                        String errorMsg = "Missing API responses - productNamesJson: " + (productNamesJson == null ? "null" : "present") + 
                                        ", positionsResponse: " + (positionsResponse == null ? "null" : "present");
                        Log.e(TAG, errorMsg);
                        logToFile("ERROR: " + errorMsg);
                        mainHandler.post(() -> promise.reject("API_RESPONSE_ERROR", errorMsg));
                        return;
                    }

                    // Parse the stored API responses
                    String unquotedProductNames = productNamesJson.substring(1, productNamesJson.length() - 1); // Remove outer quotes
                    String unescapedProductNames = unquotedProductNames.replace("\\\"", "\""); // Unescape quotes
                    JSONObject productNamesData = new JSONObject(unescapedProductNames);
                    JSONObject positionsData = new JSONObject(positionsResponse);

                    // Create final products array
                    WritableArray products = Arguments.createArray();
                    
                    // Iterate through product names to build products array
                    JSONArray productNames = productNamesData.getJSONArray("data");
                    for (int i = 0; i < productNames.length(); i++) {
                        JSONObject product = productNames.getJSONObject(i);
                        String productId = product.getString("productId");
                        String productName = product.getString("productName");

                        // Find matching position data
                        if (positionsData.has(productId)) {
                            JSONObject position = positionsData.getJSONObject(productId);
                            
                            WritableMap productMap = Arguments.createMap();
                            productMap.putString("id", productId);
                            productMap.putString("name", productName);
                            productMap.putString("eslCode", productId);
                            
                            WritableMap poseMap = Arguments.createMap();
                            poseMap.putDouble("x", position.getDouble("x"));
                            poseMap.putDouble("y", position.getDouble("y"));
                            poseMap.putDouble("z", position.getDouble("z"));
                            productMap.putMap("pose", poseMap);
                            
                            products.pushMap(productMap);
                        } else {
                            Log.w(TAG, "No position data found for product: " + productId);
                            logToFile("WARNING: No position data found for product: " + productId);
                        }
                    }

                    Log.d(TAG, "Successfully created " + products.size() + " products");
                    logToFile("Successfully created " + products.size() + " products");
                    mainHandler.post(() -> promise.resolve(products));

                } catch (Exception e) {
                    Log.e(TAG, "Error processing product data: " + e.getMessage());
                    logToFile("ERROR processing product data: " + e.getMessage());
                    mainHandler.post(() -> promise.reject("PRODUCTS_ERROR", "Error processing products: " + e.getMessage()));
                }
            } catch (Exception e) {
                Log.e(TAG, "Error in getProducts: " + e.getMessage(), e);
                logToFile("ERROR in getProducts: " + e.getMessage());
                mainHandler.post(() -> promise.reject("PRODUCTS_ERROR", "Error getting products: " + e.getMessage()));
            }
        });
    }

    @ReactMethod // Do not modify this method under any circumstances
    public void getProductsOld(Promise promise) {
        Log.d(TAG, "getProducts called");
        logToFile("getProducts called");
        ensureInitialized();
        
        if (!isInitialized) {
            Log.e(TAG, "CactusModule not properly initialized");
            logToFile("ERROR: CactusModule not properly initialized");
            mainHandler.post(() -> promise.reject("INIT_ERROR", "CactusModule not properly initialized"));
            return;
        }

        executorService.execute(() -> {
            try {
                // First authenticate
                Log.d(TAG, "Attempting authentication");
                logToFile("Attempting authentication");
                JSONObject auth = authWithPassword();
                if (auth == null) {
                    Log.e(TAG, "Authentication failed - auth object is null");
                    logToFile("ERROR: Authentication failed - auth object is null");
                    mainHandler.post(() -> promise.reject("AUTH_ERROR", "Authentication failed"));
                    return;
                }
                String token = auth.getString("token");
                Log.d(TAG, "Authentication successful, got token");
                logToFile("Authentication successful, got token");

                // Get domain collection ID
                String domainCollectionId = getDomainCollectionId(token);
                Log.d(TAG, "Got domain collection ID: " + domainCollectionId);
                logToFile("Got domain collection ID: " + domainCollectionId);

                // Get ESL data
                JSONArray eslData = getESLData(domainCollectionId, token);
                Log.d(TAG, "Got ESL data, count: " + eslData.length());
                logToFile("Got ESL data, count: " + eslData.length());

                // Get semantic product data
                try {
                    JSONObject semanticData = getSemanticProductData(domainCollectionId, token);
                    Log.d(TAG, "Got semantic product data");
                    logToFile("Got semantic product data");
                } catch (Exception e) {
                    Log.e(TAG, "Error getting semantic product data: " + e.getMessage());
                    logToFile("ERROR getting semantic product data: " + e.getMessage());
                    // Continue with other product data even if semantic data fails
                }

                // Get CSV info from DomainBarcodeNames
                Map<String, String> barcodeToName;
                try {
                    // Get CSV info for domain
                    logToFile("Getting CSV info from DomainBarcodeNames");
                    JSONObject domainBarcodeNames = getDomainBarcodeNames(domainCollectionId, token);
                    String recordId = domainBarcodeNames.getString("id");
                    String collectionId = domainBarcodeNames.getString("collectionId");
                    String filename = domainBarcodeNames.getString("csv");
                    
                    Log.d(TAG, "Got CSV info - recordId: " + recordId + 
                            ", collectionId: " + collectionId + 
                            ", filename: " + filename);
                    logToFile("Got CSV info - recordId: " + recordId + 
                            ", collectionId: " + collectionId + 
                            ", filename: " + filename);
                    
                    // Download and parse CSV
                    logToFile("Downloading and parsing CSV file");
                    barcodeToName = downloadAndParseCsv(recordId, collectionId, filename, token);
                    Log.d(TAG, "Successfully parsed barcode CSV from DomainBarcodeNames");
                    logToFile("Successfully parsed barcode CSV from DomainBarcodeNames");
                } catch (Exception e) {
                    Log.e(TAG, "Error getting product data from CSV: " + e.getMessage(), e);
                    logToFile("ERROR getting product data from CSV: " + e.getMessage());
                    mainHandler.post(() -> promise.reject("CSV_ERROR", "Error getting product data from CSV: " + e.getMessage()));
                    return;
                }

                // Create final products array
                logToFile("Creating final products array from ESL data and barcode names");
                WritableArray products = Arguments.createArray();
                int matchedProducts = 0;
                int missingProducts = 0;
                
                for (int i = 0; i < eslData.length(); i++) {
                    JSONObject esl = eslData.getJSONObject(i);
                    String eslCode = esl.getString("eslCode");
                    JSONObject pose = esl.getJSONObject("pose");
                    
                    WritableMap product = Arguments.createMap();
                    
                    // First try the ESL code directly
                    String productName = barcodeToName.get(eslCode);
                    
                    // If not found and eslCode might be a barcode with .0 suffix, try removing it
                    if (productName == null && eslCode.endsWith(".0")) {
                        String cleanBarcode = eslCode.substring(0, eslCode.length() - 2);
                        productName = barcodeToName.get(cleanBarcode);
                        logToFile("Trying cleaned barcode: " + eslCode + " -> " + cleanBarcode);
                    }
                    
                    // If still not found, this is a missing product
                    if (productName == null) {
                        productName = "Unknown Product";
                        missingProducts++;
                        
                        // Log the first few missing products for debugging
                        if (missingProducts <= 5) {
                            logToFile("Missing product name for ESL code: " + eslCode);
                        } else if (missingProducts == 6) {
                            logToFile("(additional missing products not logged)");
                        }
                    } else {
                        matchedProducts++;
                    }
                    
                    product.putString("name", productName);
                    product.putString("eslCode", eslCode);
                    
                    WritableMap poseMap = Arguments.createMap();
                    poseMap.putDouble("x", pose.getDouble("px"));
                    poseMap.putDouble("y", pose.getDouble("py"));
                    poseMap.putDouble("z", pose.getDouble("pz"));
                    product.putMap("pose", poseMap);
                    
                    products.pushMap(product);
                }

                Log.d(TAG, "Successfully matched " + matchedProducts + " products, " + missingProducts + " missing");
                logToFile("Successfully matched " + matchedProducts + " products, " + missingProducts + " missing");
                mainHandler.post(() -> promise.resolve(products));
            } catch (Exception e) {
                Log.e(TAG, "Error in getProducts: " + e.getMessage(), e);
                logToFile("ERROR in getProducts: " + e.getMessage());
                mainHandler.post(() -> promise.reject("PRODUCTS_ERROR", "Error getting products: " + e.getMessage()));
            }
        });
    }

    @ReactMethod
    public void requestProductPosition(String productId, Promise promise) {
        Log.d(TAG, "requestProductPosition called for product: " + productId);
        logToFile("requestProductPosition called for product: " + productId);
        ensureInitialized();
        
        if (!isInitialized) {
            Log.e(TAG, "CactusModule not properly initialized");
            logToFile("ERROR: CactusModule not properly initialized");
            mainHandler.post(() -> promise.reject("INIT_ERROR", "CactusModule not properly initialized"));
            return;
        }

        executorService.execute(() -> {
            try {
                // First authenticate
                Log.d(TAG, "Attempting authentication");
                logToFile("Attempting authentication");
                JSONObject auth = authWithPassword();
                if (auth == null) {
                    Log.e(TAG, "Authentication failed - auth object is null");
                    logToFile("ERROR: Authentication failed - auth object is null");
                    mainHandler.post(() -> promise.reject("AUTH_ERROR", "Authentication failed"));
                    return;
                }
                String token = auth.getString("token");
                Log.d(TAG, "Authentication successful, got token");
                logToFile("Authentication successful, got token");

                // Get domain collection ID
                String domainCollectionId = getDomainCollectionId(token);
                Log.d(TAG, "Got domain collection ID: " + domainCollectionId);
                logToFile("Got domain collection ID: " + domainCollectionId);

                // Make API call to get product position
                String positionsUrl = backendUrl + "/api/collections/ProductPositions/records?filter=(domain='" + 
                    domainCollectionId + "' AND sku='" + productId + "')";
                logToFile("Making API call to: " + positionsUrl);
                
                HttpURLConnection positionsConnection = (HttpURLConnection) new URL(positionsUrl).openConnection();
                positionsConnection.setRequestMethod("GET");
                positionsConnection.setRequestProperty("Authorization", "Bearer " + token);
                
                // Get response
                if (positionsConnection.getResponseCode() == HttpURLConnection.HTTP_OK) {
                    StringBuilder positionsResponseBuilder = new StringBuilder();
                    try (BufferedReader br = new BufferedReader(
                            new InputStreamReader(positionsConnection.getInputStream(), "utf-8"))) {
                        String responseLine;
                        while ((responseLine = br.readLine()) != null) {
                            positionsResponseBuilder.append(responseLine.trim());
                        }
                    }
                    JSONObject jsonResponse = new JSONObject(positionsResponseBuilder.toString());
                    JSONArray items = jsonResponse.getJSONArray("items");
                    
                    if (items.length() > 0) {
                        JSONObject positionData = items.getJSONObject(0);
                        logToFile("Got position data: " + positionData.toString());
                        
                        // Create response map
                        WritableMap responseMap = Arguments.createMap();
                        responseMap.putDouble("x", positionData.getDouble("x"));
                        responseMap.putDouble("y", positionData.getDouble("y"));
                        responseMap.putDouble("z", positionData.getDouble("z"));
                        
                        mainHandler.post(() -> promise.resolve(responseMap));
                    } else {
                        String errorMsg = "No position data found for product: " + productId;
                        logToFile("ERROR: " + errorMsg);
                        mainHandler.post(() -> promise.reject("POSITION_ERROR", errorMsg));
                    }
                } else {
                    StringBuilder errorResponse = new StringBuilder();
                    try (BufferedReader br = new BufferedReader(
                            new InputStreamReader(positionsConnection.getErrorStream(), "utf-8"))) {
                        String responseLine;
                        while ((responseLine = br.readLine()) != null) {
                            errorResponse.append(responseLine.trim());
                        }
                    }
                    String errorMsg = "Failed to get product position. Response code: " + positionsConnection.getResponseCode() + 
                                    ", Error: " + errorResponse.toString();
                    logToFile("ERROR: " + errorMsg);
                    mainHandler.post(() -> promise.reject("POSITION_ERROR", errorMsg));
                }
            } catch (Exception e) {
                Log.e(TAG, "Error in requestProductPosition: " + e.getMessage());
                logToFile("ERROR in requestProductPosition: " + e.getMessage());
                mainHandler.post(() -> promise.reject("POSITION_ERROR", "Error getting product position: " + e.getMessage()));
            }
        });
    }
} 
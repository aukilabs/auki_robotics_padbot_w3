package com.robotgui;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.modules.core.PermissionAwareActivity;
import com.facebook.react.modules.core.PermissionListener;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.BufferedReader;
import java.io.FileReader;
import android.os.Environment;
import android.Manifest;
import android.content.pm.PackageManager;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import android.app.Activity;

public class FileUtilsModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    private static final int PERMISSION_REQUEST_CODE = 123;

    public FileUtilsModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "FileUtils";
    }

    private boolean checkAndRequestPermissions() {
        Activity activity = reactContext.getCurrentActivity();
        if (activity == null) {
            return false;
        }

        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                activity,
                new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},
                PERMISSION_REQUEST_CODE
            );
            return false;
        }
        return true;
    }

    @ReactMethod
    public void deleteFile(String filename, Promise promise) {
        try {
            if (!checkAndRequestPermissions()) {
                promise.reject("PERMISSION_ERROR", "Storage permission not granted");
                return;
            }

            // Get app variant and determine directory name
            String appVariant = reactContext.getResources().getString(R.string.app_variant);
            String appDirName = appVariant.equals("gotu") ? "GoTu" : "CactusAssistant";
            
            // Create app-specific directory
            File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            File appDir = new File(downloadsDir, appDirName);
            if (!appDir.exists()) {
                appDir.mkdirs();
            }

            // Delete file from app-specific directory
            File file = new File(appDir, filename);
            if (file.exists()) {
                boolean deleted = file.delete();
                if (deleted) {
                    promise.resolve(true);
                } else {
                    promise.reject("FILE_DELETE_ERROR", "Failed to delete file");
                }
            } else {
                promise.resolve(false);
            }
        } catch (Exception e) {
            promise.reject("FILE_DELETE_ERROR", "Failed to delete file: " + e.getMessage());
        }
    }

    @ReactMethod
    public void appendToFile(String filename, String content, Promise promise) {
        try {
            if (!checkAndRequestPermissions()) {
                promise.reject("PERMISSION_ERROR", "Storage permission not granted");
                return;
            }

            // Get app variant and determine directory name
            String appVariant = reactContext.getResources().getString(R.string.app_variant);
            String appDirName = appVariant.equals("gotu") ? "GoTu" : "CactusAssistant";
            
            // Create app-specific directory
            File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            File appDir = new File(downloadsDir, appDirName);
            if (!appDir.exists()) {
                appDir.mkdirs();
            }

            // Write to file in app-specific directory
            File file = new File(appDir, filename);
            FileWriter writer = new FileWriter(file, true);
            writer.append(content);
            writer.append("\n");
            writer.close();
            promise.resolve(null);
        } catch (IOException e) {
            promise.reject("FILE_WRITE_ERROR", "Failed to write to file: " + e.getMessage());
        }
    }

    @ReactMethod
    public void readFile(String filename, Promise promise) {
        try {
            if (!checkAndRequestPermissions()) {
                promise.reject("PERMISSION_ERROR", "Storage permission not granted");
                return;
            }

            // Get app variant and determine directory name
            String appVariant = reactContext.getResources().getString(R.string.app_variant);
            String appDirName = appVariant.equals("gotu") ? "GoTu" : "CactusAssistant";
            
            // Get app-specific directory
            File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            File appDir = new File(downloadsDir, appDirName);
            
            // Read file from app-specific directory
            File file = new File(appDir, filename);
            if (!file.exists()) {
                promise.resolve(null);
                return;
            }

            StringBuilder content = new StringBuilder();
            BufferedReader reader = new BufferedReader(new FileReader(file));
            String line;
            while ((line = reader.readLine()) != null) {
                content.append(line).append("\n");
            }
            reader.close();
            promise.resolve(content.toString());
        } catch (IOException e) {
            promise.reject("FILE_READ_ERROR", "Failed to read file: " + e.getMessage());
        }
    }
} 
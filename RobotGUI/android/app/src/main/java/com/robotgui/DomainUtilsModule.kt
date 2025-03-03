package com.robotgui

import android.content.Context
import android.util.Log
import com.facebook.react.bridge.*
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import java.io.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.yaml.snakeyaml.Yaml
import android.util.Base64
import android.os.Environment
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import android.app.Activity
import android.content.Intent
import java.util.regex.Pattern

class DomainUtilsModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val TAG = "DomainUtilsModule"
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private val sharedPreferences = reactContext.getSharedPreferences("DomainAuth", Context.MODE_PRIVATE)
    private val STORAGE_PERMISSION_CODE = 1001
    private val baseUrl = "https://dds.posemesh.org/api/v1/domains"

    private var posemeshToken: String?
        get() = sharedPreferences.getString("posemesh_token", null)
        set(value) = sharedPreferences.edit().putString("posemesh_token", value).apply()

    private var ddsToken: String?
        get() = sharedPreferences.getString("dds_token", null)
        set(value) = sharedPreferences.edit().putString("dds_token", value).apply()

    private var domainInfo: String?
        get() = sharedPreferences.getString("domain_info", null)
        set(value) = sharedPreferences.edit().putString("domain_info", value).apply()

    private var pendingMapPromise: Promise? = null
    private var pendingMapParams: Pair<String, Int>? = null

    override fun getName(): String = "DomainUtils"

    override fun initialize() {
        super.initialize()
        reactApplicationContext.addActivityEventListener(object : BaseActivityEventListener() {
            override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
                if (requestCode == STORAGE_PERMISSION_CODE) {
                    if (resultCode == Activity.RESULT_OK) {
                        // Permission granted, proceed with map download
                        pendingMapParams?.let { (format, resolution) ->
                            downloadMap(pendingMapPromise!!)
                        }
                    } else {
                        // Permission denied
                        pendingMapPromise?.reject("PERMISSION_ERROR", "Storage permission denied")
                    }
                    // Clear pending data
                    pendingMapParams = null
                    pendingMapPromise = null
                }
            }
        })
    }

    @ReactMethod
    fun getDomainData(promise: Promise) {
        scope.launch {
            try {
                // Example domain data
                val response = Arguments.createMap().apply {
                    putString("domainId", "example-domain")
                    putString("name", "Example Domain")
                    putString("type", "test")
                }
                promise.resolve(response)
            } catch (e: Exception) {
                promise.reject("DOMAIN_ERROR", "Error getting domain data: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun getStoredCredentials(promise: Promise) {
        val credentials = Arguments.createMap().apply {
            putString("email", sharedPreferences.getString("email", ""))
            putString("password", sharedPreferences.getString("password", ""))
            putString("domainId", sharedPreferences.getString("domain_id", ""))
        }
        promise.resolve(credentials)
    }

    @ReactMethod
    fun saveEmail(email: String, promise: Promise) {
        sharedPreferences.edit().putString("email", email).apply()
        promise.resolve(true)
    }

    @ReactMethod
    fun saveDomainId(domainId: String, promise: Promise) {
        sharedPreferences.edit().putString("domain_id", domainId).apply()
        promise.resolve(true)
    }

    @ReactMethod
    fun savePassword(password: String, promise: Promise) {
        sharedPreferences.edit().putString("password", password).apply()
        promise.resolve(true)
    }

    @ReactMethod
    fun authenticate(email: String?, password: String?, domainId: String?, promise: Promise) {
        scope.launch {
            try {
                val finalEmail = email ?: sharedPreferences.getString("email", "") ?: ""
                val finalPassword = password ?: sharedPreferences.getString("password", "") ?: ""
                val finalDomainId = domainId ?: sharedPreferences.getString("domain_id", "") ?: ""

                if (finalEmail.isEmpty() || finalPassword.isEmpty() || finalDomainId.isEmpty()) {
                    promise.reject("AUTH_ERROR", "Missing credentials")
                    return@launch
                }

                // 1. Auth User Posemesh
                val url1 = URL("https://api.posemesh.org/user/login")
                val connection1 = url1.openConnection() as HttpURLConnection
                
                val body1 = JSONObject().apply {
                    put("email", finalEmail)
                    put("password", finalPassword)
                }

                connection1.apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("Accept", "application/json")
                    doOutput = true
                    outputStream.write(body1.toString().toByteArray())
                }

                if (connection1.responseCode !in 200..299) {
                    promise.reject("AUTH_ERROR", "Failed to authenticate posemesh account")
                    return@launch
                }

                val response1 = connection1.inputStream.bufferedReader().readText()
                val repJson1 = JSONObject(response1)
                posemeshToken = repJson1.getString("access_token")

                // 2. Auth DDS
                val url2 = URL("https://api.posemesh.org/service/domains-access-token")
                val connection2 = url2.openConnection() as HttpURLConnection
                
                connection2.apply {
                    requestMethod = "POST"
                    setRequestProperty("Accept", "application/json")
                    setRequestProperty("Authorization", "Bearer $posemeshToken")
                }

                if (connection2.responseCode !in 200..299) {
                    promise.reject("AUTH_ERROR", "Failed to authenticate domain dds")
                    return@launch
                }

                val response2 = connection2.inputStream.bufferedReader().readText()
                val repJson2 = JSONObject(response2)
                ddsToken = repJson2.getString("access_token")

                // 3. Auth Domain
                val url3 = URL("https://dds.posemesh.org/api/v1/domains/$finalDomainId/auth")
                val connection3 = url3.openConnection() as HttpURLConnection
                
                connection3.apply {
                    requestMethod = "POST"
                    setRequestProperty("Accept", "application/json")
                    setRequestProperty("Authorization", "Bearer $ddsToken")
                }

                if (connection3.responseCode !in 200..299) {
                    promise.reject("AUTH_ERROR", "Failed to authenticate domain access")
                    return@launch
                }

                val response3 = connection3.inputStream.bufferedReader().readText()
                domainInfo = response3

                // Return success response
                val result = Arguments.createMap().apply {
                    putBoolean("success", true)
                    putString("message", "Authentication successful")
                }
                promise.resolve(result)

            } catch (e: Exception) {
                promise.reject("AUTH_ERROR", "Authentication error: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun clearStoredCredentials(promise: Promise) {
        sharedPreferences.edit().clear().apply()
        promise.resolve(null)
    }

    @ReactMethod
    fun getConfig(promise: Promise) {
        val config = Arguments.createMap().apply {
            putString("email", ConfigManager.getString("email"))
            putString("domain_id", ConfigManager.getString("domain_id"))
            putString("slam_ip", ConfigManager.getString("slam_ip"))
            putInt("slam_port", ConfigManager.getInt("slam_port"))
            putInt("timeout_ms", ConfigManager.getInt("timeout_ms"))
        }
        promise.resolve(config)
    }

    @ReactMethod
    fun requestStoragePermission(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("PERMISSION_ERROR", "Activity is null")
            return
        }

        ActivityCompat.requestPermissions(
            activity,
            arrayOf(
                Manifest.permission.WRITE_EXTERNAL_STORAGE,
                Manifest.permission.READ_EXTERNAL_STORAGE
            ),
            STORAGE_PERMISSION_CODE
        )
        promise.resolve(true)
    }

    @ReactMethod
    fun downloadMap(promise: Promise) {
        try {
            val domainId = sharedPreferences.getString("domain_id", null) ?: throw Exception("No domain ID found")
            val domainInfoJson = domainInfo ?: throw Exception("No domain info found")
            val domainInfo = JSONObject(domainInfoJson)
            val domainServerUrl = domainInfo.getString("domain_server")
            
            val client = OkHttpClient()
            
            val requestBody = FormBody.Builder()
                .add("domainId", domainId)
                .add("domainServerUrl", domainServerUrl)
                .add("height", "0.1")
                .add("pixelsPerMeter", "20")
                .add("format", "bmp")

                .build()

            val request = Request.Builder()
                .url("$baseUrl/$domainId/map")
                .addHeader("Authorization", "Bearer $ddsToken")
                .post(requestBody)
                .build()

            val response = client.newCall(request).execute()
            if (!response.isSuccessful) {
                throw Exception("Failed to download map: ${response.code}")
            }

            val responseBody = response.body?.string() ?: throw Exception("Empty response body")
            
            // Split the data using the boundary marker
            val lines = responseBody.split("\n")
            val boundary = lines.firstOrNull()?.trim() ?: throw Exception("No boundary found in response")
            val parts = responseBody.split(boundary)

            var imageData: ByteArray? = null
            var yamlContent: String? = null

            // Process each part of the multipart response
            for (part in parts) {
                if (part.contains("name=\"png\"")) {
                    // Extract and decode the base64 image data
                    val imageDataMatch = Regex("name=\"png\"\\s*\\n([a-zA-Z0-9+/=\\n]+)").find(part)
                    if (imageDataMatch != null) {
                        val encodedImage = imageDataMatch.groupValues[1].replace("\n", "")
                        imageData = Base64.decode(encodedImage, Base64.DEFAULT)
                    }
                } else if (part.contains("name=\"yaml\"")) {
                    // Extract the YAML content
                    val yamlMatch = Regex("name=\"yaml\"\\s*\\n(.+)", RegexOption.DOT_MATCHES_ALL).find(part)
                    if (yamlMatch != null) {
                        yamlContent = yamlMatch.groupValues[1].trim()
                    }
                }
            }

            if (imageData == null || yamlContent == null) {
                throw Exception("Failed to extract image or YAML data from response")
            }

            // Save BMP file
            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            val cactusDir = File(downloadsDir, "CactusAssistant")
            if (!cactusDir.exists()) {
                cactusDir.mkdirs()
            }
            
            val bmpFile = File(cactusDir, "map.bmp")
            bmpFile.writeBytes(imageData)

            // Save YAML file
            val yamlFile = File(cactusDir, "map.yaml")
            yamlFile.writeText(yamlContent)

            val result = Arguments.createMap().apply {
                putString("imagePath", bmpFile.absolutePath)
                putString("yamlPath", yamlFile.absolutePath)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("DOWNLOAD_ERROR", e.message ?: "Unknown error")
        }
    }

    @ReactMethod
    fun getMap(imageFormat: String = "png", resolution: Int = 20, promise: Promise) {
        scope.launch {
            try {
                val domainId = sharedPreferences.getString("domain_id", "") ?: ""
                val domainInfoStr = domainInfo ?: throw Exception("No domain info available")
                val domainInfoObj = JSONObject(domainInfoStr)
                val accessToken = domainInfoObj.getString("access_token")

                val url = ConfigManager.getNestedString("domain.map_endpoint")
                val domainServer = ConfigManager.getNestedString("domain.domain_server")

                val client = OkHttpClient()
                
                val requestBody = JSONObject().apply {
                    put("domainId", domainId)
                    put("domainServerUrl", domainServer)
                    put("height", 0.1)
                    put("pixelsPerMeter", resolution)
                }

                val mediaType = "application/json".toMediaType()
                val request = Request.Builder()
                    .url(url)
                    .post(requestBody.toString().toRequestBody(mediaType))
                    .addHeader("Authorization", "Bearer $accessToken")
                    .build()

                val response = client.newCall(request).execute()
                if (!response.isSuccessful) {
                    throw Exception("Failed to download map: ${response.code}")
                }

                val responseBody = response.body?.string() ?: throw Exception("Empty response body")
                
                // Split the data using the boundary marker
                val lines = responseBody.split("\n")
                val boundary = lines.firstOrNull()?.trim() ?: throw Exception("No boundary found in response")
                val parts = responseBody.split(boundary)

                var imageData: ByteArray? = null
                var yamlContent: String? = null

                // Process each part of the multipart response
                for (part in parts) {
                    if (part.contains("name=\"png\"")) {
                        // Extract and decode the base64 image data
                        val imageDataMatch = Regex("name=\"png\"\\s*\\n([a-zA-Z0-9+/=\\n]+)").find(part)
                        if (imageDataMatch != null) {
                            val encodedImage = imageDataMatch.groupValues[1].replace("\n", "")
                            imageData = Base64.decode(encodedImage, Base64.DEFAULT)
                        }
                    } else if (part.contains("name=\"yaml\"")) {
                        // Extract the YAML content
                        val yamlMatch = Regex("name=\"yaml\"\\s*\\n(.+)", RegexOption.DOT_MATCHES_ALL).find(part)
                        if (yamlMatch != null) {
                            yamlContent = yamlMatch.groupValues[1].trim()
                        }
                    }
                }

                if (imageData == null || yamlContent == null) {
                    throw Exception("Failed to extract image or YAML data from response")
                }

                // Save BMP file
                val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                val cactusDir = File(downloadsDir, "CactusAssistant")
                if (!cactusDir.exists()) {
                    cactusDir.mkdirs()
                }
                
                val bmpFile = File(cactusDir, "map.bmp")
                bmpFile.writeBytes(imageData)

                // Save YAML file
                val yamlFile = File(cactusDir, "map.yaml")
                yamlFile.writeText(yamlContent)

                val result = Arguments.createMap().apply {
                    putString("imagePath", bmpFile.absolutePath)
                    putString("yamlPath", yamlFile.absolutePath)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("DOWNLOAD_ERROR", e.message ?: "Unknown error")
            }
        }
    }

    private fun writeInt(out: FileOutputStream, value: Int) {
        out.write(byteArrayOf(
            (value and 0xFF).toByte(),
            ((value shr 8) and 0xFF).toByte(),
            ((value shr 16) and 0xFF).toByte(),
            ((value shr 24) and 0xFF).toByte()
        ))
    }

    private fun writeShort(out: FileOutputStream, value: Int) {
        out.write(byteArrayOf(
            (value and 0xFF).toByte(),
            ((value shr 8) and 0xFF).toByte()
        ))
    }

    // Add more domain-specific methods here
} 
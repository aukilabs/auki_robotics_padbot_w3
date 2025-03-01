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

class DomainUtilsModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val TAG = "DomainUtilsModule"
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private val sharedPreferences = reactContext.getSharedPreferences("DomainAuth", Context.MODE_PRIVATE)

    private var posemeshToken: String?
        get() = sharedPreferences.getString("posemesh_token", null)
        set(value) = sharedPreferences.edit().putString("posemesh_token", value).apply()

    private var ddsToken: String?
        get() = sharedPreferences.getString("dds_token", null)
        set(value) = sharedPreferences.edit().putString("dds_token", value).apply()

    private var domainInfo: String?
        get() = sharedPreferences.getString("domain_info", null)
        set(value) = sharedPreferences.edit().putString("domain_info", value).apply()

    override fun getName(): String = "DomainUtils"

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
                    throw Exception("Failed to get map: ${response.code}")
                }

                val responseBody = response.body ?: throw Exception("Empty response")
                val responseText = responseBody.string()
                val boundary = responseText.split("\n")[0].trim()
                val parts = responseText.split(boundary)

                var imageData: ByteArray? = null
                var yamlData: String? = null

                for (part in parts) {
                    when {
                        part.contains("name=\"png\"") -> {
                            val base64Match = Regex("name=\"png\"\\s*\\n([a-zA-Z0-9+/=\\n]+)").find(part)
                            if (base64Match != null) {
                                val encodedImage = base64Match.groupValues[1].replace("\\s+".toRegex(), "")
                                imageData = Base64.decode(encodedImage, Base64.DEFAULT)
                            }
                        }
                        part.contains("name=\"yaml\"") -> {
                            val yamlMatch = Regex("name=\"yaml\"\\s*\\n(.+)", RegexOption.DOT_MATCHES_ALL).find(part)
                            if (yamlMatch != null) {
                                yamlData = yamlMatch.groupValues[1].trim()
                            }
                        }
                    }
                }

                if (imageData == null) throw Exception("No image data found")

                val bitmap = BitmapFactory.decodeByteArray(imageData, 0, imageData.size)
                val filesDir = reactApplicationContext.filesDir
                val imageFile = File(filesDir, "map.$imageFormat")

                when (imageFormat.lowercase()) {
                    "png" -> {
                        FileOutputStream(imageFile).use { out ->
                            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                        }
                    }
                    "bmp" -> {
                        FileOutputStream(imageFile).use { out ->
                            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                        }
                    }
                    "pgm" -> {
                        // Convert to grayscale and create PGM
                        val width = bitmap.width
                        val height = bitmap.height
                        val pixels = IntArray(width * height)
                        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
                        
                        FileWriter(imageFile).use { writer ->
                            writer.write("P2\n$width $height\n255\n")
                            for (y in 0 until height) {
                                for (x in 0 until width) {
                                    val pixel = pixels[y * width + x]
                                    val gray = (Color.red(pixel) + Color.green(pixel) + Color.blue(pixel)) / 3
                                    val value = when {
                                        gray > 165 -> "255" // Occupied
                                        gray < 50 -> "0"   // Free
                                        else -> "128"      // Unknown
                                    }
                                    writer.write("$value ")
                                }
                                writer.write("\n")
                            }
                        }
                    }
                }

                // Update and save YAML
                if (yamlData != null) {
                    val yaml = Yaml()
                    @Suppress("UNCHECKED_CAST")
                    val yamlMap = yaml.load<Map<String, Any>>(yamlData) as MutableMap<String, Any>
                    yamlMap["image"] = "map.$imageFormat"
                    
                    File(filesDir, "map.yaml").writer().use { writer ->
                        yaml.dump(yamlMap, writer)
                    }
                }

                val result = Arguments.createMap().apply {
                    putString("imagePath", imageFile.absolutePath)
                    putString("yamlPath", File(filesDir, "map.yaml").absolutePath)
                }
                promise.resolve(result)

            } catch (e: Exception) {
                promise.reject("MAP_ERROR", "Failed to get map: ${e.message}")
            }
        }
    }

    // Add more domain-specific methods here
} 
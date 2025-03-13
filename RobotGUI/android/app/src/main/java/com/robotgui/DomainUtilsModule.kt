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
                            getMap(format, resolution, pendingMapPromise!!)
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

                // Parse domain info to get server URL
                val domainInfoObj = JSONObject(response3)
                val accessToken = domainInfoObj.getString("access_token")
                val domainServer = domainInfoObj.getString("domain_server")

                // Return response with domain server URL
                val result = Arguments.createMap().apply {
                    putBoolean("success", true)
                    putString("message", "Domain Server: $domainServer")
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
            
            // Add patrol points
            val patrolPoints = Arguments.createArray()
            for (i in 1..4) {
                val pointKey = "patrol.point$i"
                ConfigManager.getDoubleArray(pointKey)?.let { coords ->
                    if (coords.size >= 3) {
                        val point = Arguments.createMap().apply {
                            putString("name", "Patrol Point $i")
                            putDouble("x", coords[0])
                            putDouble("y", coords[1])
                            putDouble("yaw", coords[2])
                        }
                        patrolPoints.pushMap(point)
                    }
                }
            }
            putArray("patrol_points", patrolPoints)
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
    fun getMap(imageFormat: String = "png", resolution: Int = 20, promise: Promise) {
        scope.launch {
            try {
                val domainId = sharedPreferences.getString("domain_id", "") ?: ""
                val domainInfoStr = domainInfo ?: throw Exception("No domain info available")
                val domainInfoObj = JSONObject(domainInfoStr)
                val accessToken = domainInfoObj.getString("access_token")
                val domainServerObj = domainInfoObj.getJSONObject("domain_server")
                val domainServerUrl = domainServerObj.getString("url")

                val url = ConfigManager.getNestedString("domain.map_endpoint")

                val client = OkHttpClient()
                
                val requestBody = JSONObject().apply {
                    put("domainId", domainId)
                    put("domainServerUrl", domainServerUrl)
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
                    val errorBody = response.body?.string() ?: "No error body"
                    val error = Exception("Failed to download map: ${response.code}\nRequest Body: ${requestBody.toString()}\nError Body: $errorBody")
                    error.printStackTrace()
                    throw error
                }

                val responseBody = response.body?.string() ?: throw Exception("Empty response body")
                
                // Split the data using the boundary marker
                val boundary = responseBody.split("\n", limit = 2)[0].trim()
                val parts = responseBody.split(boundary)

                var imageData: ByteArray? = null
                var yamlContent: String? = null

                // Process each part of the multipart response
                for (part in parts) {
                    if (part.contains("name=\"png\"")) {
                        val imageDataMatch = Regex("name=\"png\"\\s*\\n([a-zA-Z0-9+/=\\n]+)").find(part)
                        if (imageDataMatch != null) {
                            val encodedImage = imageDataMatch.groupValues[1].replace("\\s+".toRegex(), "")
                            imageData = Base64.decode(encodedImage, Base64.DEFAULT)
                        }
                    } else if (part.contains("name=\"yaml\"")) {
                        val yamlMatch = Regex("name=\"yaml\"\\s*\\n(.+)", RegexOption.DOT_MATCHES_ALL).find(part)
                        if (yamlMatch != null) {
                            yamlContent = yamlMatch.groupValues[1].trim()
                        }
                    }
                }

                if (imageData == null || yamlContent == null) {
                    throw Exception("Failed to extract image or YAML data from response")
                }

                // Convert PNG to requested format
                val bitmap = BitmapFactory.decodeByteArray(imageData, 0, imageData.size)
                if (bitmap == null) {
                    throw Exception("Failed to decode PNG image data")
                }

                val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                val cactusDir = File(downloadsDir, "CactusAssistant")
                if (!cactusDir.exists()) {
                    cactusDir.mkdirs()
                }

                val imageFile = File(cactusDir, "map.${imageFormat.lowercase()}")
                
                when (imageFormat.lowercase()) {
                    "bmp" -> {
                        // Convert PNG to BMP
                        val bitmap = BitmapFactory.decodeByteArray(imageData, 0, imageData.size)
                        if (bitmap != null) {
                            val outputStream = FileOutputStream(imageFile)
                            
                            // BMP Header
                            val width = bitmap.width
                            val height = bitmap.height
                            val bitsPerPixel = 24
                            val rowPadding = (4 - (width * 3) % 4) % 4
                            val imageSize = (width * 3 + rowPadding) * height
                            val fileSize = 54 + imageSize  // 54 = header size
                            
                            // BMP File Header (14 bytes)
                            outputStream.write('B'.code)
                            outputStream.write('M'.code)
                            writeInt(outputStream, fileSize)
                            writeInt(outputStream, 0) // Reserved
                            writeInt(outputStream, 54) // Offset to pixel data
                            
                            // BMP Info Header (40 bytes)
                            writeInt(outputStream, 40) // Info header size
                            writeInt(outputStream, width)
                            writeInt(outputStream, height)
                            writeShort(outputStream, 1) // Planes
                            writeShort(outputStream, bitsPerPixel)
                            writeInt(outputStream, 0) // No compression
                            writeInt(outputStream, imageSize)
                            writeInt(outputStream, 2835) // X pixels per meter
                            writeInt(outputStream, 2835) // Y pixels per meter
                            writeInt(outputStream, 0) // Colors in color table
                            writeInt(outputStream, 0) // Important color count
                            
                            // Pixel data (bottom-up, BGR)
                            val pixels = IntArray(width * height)
                            bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
                            
                            for (y in height - 1 downTo 0) {
                                for (x in 0 until width) {
                                    val pixel = pixels[y * width + x]
                                    outputStream.write(pixel and 0xFF) // Blue
                                    outputStream.write((pixel shr 8) and 0xFF) // Green
                                    outputStream.write((pixel shr 16) and 0xFF) // Red
                                }
                                // Add row padding
                                for (i in 0 until rowPadding) {
                                    outputStream.write(0)
                                }
                            }
                            
                            outputStream.close()
                            bitmap.recycle()
                        }
                    }
                    "png" -> {
                        // Save PNG as-is
                        imageFile.writeBytes(imageData)
                    }
                    "pgm" -> {
                        // Convert to grayscale PGM
                        // TODO: Implement PGM conversion if needed
                        throw Exception("PGM format not yet implemented")
                    }
                }
                bitmap.recycle()

                // Save YAML file and update image reference
                val yamlFile = File(cactusDir, "map.yaml")
                val yaml = Yaml()
                val yamlMap = yaml.load<Map<String, Any>>(yamlContent)
                val updatedYamlMap = yamlMap.toMutableMap()
                updatedYamlMap["image"] = "map.${imageFormat.lowercase()}"
                yamlFile.writeText(yaml.dump(updatedYamlMap))

                val result = Arguments.createMap().apply {
                    putString("imagePath", imageFile.absolutePath)
                    putString("yamlPath", yamlFile.absolutePath)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("DOWNLOAD_ERROR", e.message ?: "Unknown error")
            }
        }
    }

    @ReactMethod
    fun getNavmeshCoord(coords: ReadableMap, promise: Promise) {
        scope.launch {
            try {
                val domainInfoStr = domainInfo ?: throw Exception("Domain info not found")
                val domainInfoObj = JSONObject(domainInfoStr)
                val accessToken = domainInfoObj.getString("access_token")
                val domainServerObj = domainInfoObj.getJSONObject("domain_server")
                val domainServer = domainServerObj.getString("url")
                val domainId = sharedPreferences.getString("domain_id", "") ?: throw Exception("Domain ID not found")

                // Get input coordinates and transform Z
                val inputX = coords.getDouble("x")
                var inputZ = coords.getDouble("z")
                inputZ = if (inputZ > 0) -Math.abs(inputZ) else Math.abs(inputZ)

                val url = URL(ConfigManager.getNestedString("domain.navmesh_endpoint"))
                val connection = url.openConnection() as HttpURLConnection

                val body = JSONObject().apply {
                    put("domainId", domainId)
                    put("domainServerUrl", domainServer)
                    put("target", JSONObject().apply {
                        put("x", inputX)
                        put("y", 0)
                        put("z", inputZ)
                    })
                    put("radius", 0.5)
                }

                connection.apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("Authorization", "Bearer $accessToken")
                    setRequestProperty("Accept", "application/json")
                    doOutput = true
                    outputStream.write(body.toString().toByteArray())
                }

                val responseCode = connection.responseCode
                if (responseCode !in 200..299) {
                    val errorStream = connection.errorStream
                    val errorResponse = errorStream?.bufferedReader()?.readText() ?: "No error details available"
                    throw Exception("Failed to get navmesh coord: $responseCode\nError: $errorResponse")
                }

                val response = connection.inputStream.bufferedReader().readText()
                val responseJson = JSONObject(response)
                val restrictedCoords = responseJson.getJSONObject("restricted")

                // Get coordinates exactly as in Python
                val x1 = inputX
                val z1 = inputZ
                val x2 = restrictedCoords.getDouble("x")
                var z2 = restrictedCoords.getDouble("z")

                // Calculate deltas exactly as in Python
                val deltaX = x1 - x2
                val deltaZ = z1 - z2

                // Transform z2 exactly as in Python
                z2 = if (z2 > 0) -Math.abs(z2) else Math.abs(z2)

                // Calculate yaw exactly as in Python
                var yaw = Math.atan2(deltaZ, deltaX)
                yaw = Math.round(yaw * 100.0) / 100.0  // Round to 2 decimal places first
                yaw = if (yaw > 0) -Math.abs(yaw) else Math.abs(yaw)  // Then negate if positive
                
                // Reverse yaw by 180 degrees (π radians)
                yaw += Math.PI
                // Normalize yaw to [-π, π]
                if (yaw > Math.PI) {
                    yaw -= 2 * Math.PI
                } else if (yaw < -Math.PI) {
                    yaw += 2 * Math.PI
                }

                val result = Arguments.createMap().apply {
                    putDouble("x", x2)
                    putDouble("z", z2)
                    putDouble("yaw", yaw)
                    // Add debug information
                    putMap("debug", Arguments.createMap().apply {
                        putMap("productCoords", Arguments.createMap().apply {
                            putDouble("x", coords.getDouble("x"))
                            putDouble("z", coords.getDouble("z"))
                        })
                        putMap("transformedCoords", Arguments.createMap().apply {
                            putDouble("x", inputX)
                            putDouble("z", inputZ)
                        })
                        putMap("navmeshResult", Arguments.createMap().apply {
                            putDouble("x", x2)
                            putDouble("z", z2)
                            putDouble("yaw", yaw)
                            putDouble("deltaX", deltaX)
                            putDouble("deltaZ", deltaZ)
                        })
                    })
                }
                
                promise.resolve(result)

            } catch (e: Exception) {
                Log.e(TAG, "Error in getNavmeshCoord: ${e.message}", e)
                promise.reject("NAVMESH_ERROR", "Error getting navmesh coord: ${e.message}")
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
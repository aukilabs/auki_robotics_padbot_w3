package com.robotgui

import android.util.Log
import com.facebook.react.bridge.*
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.File
import org.json.JSONArray

class SlamtecUtilsModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val TAG = "SlamtecUtilsModule"
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private val SLAM_IP = ConfigManager.getString("slam_ip", "127.0.0.1")
    private val SLAM_PORT = ConfigManager.getInt("slam_port", 1448)
    private val TIMEOUT_MS = ConfigManager.getInt("timeout_ms", 1000)
    private val BASE_URL get() = "http://$SLAM_IP:$SLAM_PORT"

    override fun getName(): String = "SlamtecUtils"

    @ReactMethod
    fun checkConnection(promise: Promise) {
        scope.launch {
            try {
                val response = Arguments.createMap()
                val url = "$BASE_URL/api/core/system/v1/robot/health"
                
                try {
                    val connection = URL(url).openConnection() as HttpURLConnection
                    connection.apply {
                        connectTimeout = TIMEOUT_MS
                        readTimeout = TIMEOUT_MS
                        requestMethod = "GET"
                    }

                    try {
                        connection.connect()
                        val responseCode = connection.responseCode
                        response.putInt("responseCode", responseCode)
                        
                        if (responseCode == HttpURLConnection.HTTP_OK) {
                            val apiResponse = connection.inputStream.bufferedReader().readText()
                            val health = JSONObject(apiResponse)
                            
                            response.putString("response", apiResponse)
                            response.putString("status", if (!health.optBoolean("hasError", false)) 
                                "Robot health check successful" else "Robot has errors")
                            response.putBoolean("slamApiAvailable", !health.optBoolean("hasError", false))
                        } else {
                            response.putString("error", "Health check failed with code: $responseCode")
                            response.putString("status", "Robot health check failed")
                            response.putBoolean("slamApiAvailable", false)
                        }
                    } finally {
                        connection.disconnect()
                    }
                } catch (e: Exception) {
                    response.putString("error", "Connection error: ${e.message}")
                    response.putString("status", "Cannot connect to robot")
                    response.putBoolean("slamApiAvailable", false)
                }

                response.putBoolean("deviceFound", response.getBoolean("slamApiAvailable"))
                promise.resolve(response)
                
            } catch (e: Exception) {
                promise.reject("SLAM_ERROR", "Fatal error: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun getCurrentPose(promise: Promise) {
        scope.launch {
            try {
                val url = "$BASE_URL/api/core/slam/v1/localization/pose"
                val connection = URL(url).openConnection() as HttpURLConnection
                connection.apply {
                    connectTimeout = TIMEOUT_MS
                    readTimeout = TIMEOUT_MS
                    requestMethod = "GET"
                }

                try {
                    val response = Arguments.createMap()
                    connection.connect()
                    
                    if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                        val pose = JSONObject(connection.inputStream.bufferedReader().readText())
                        response.putDouble("x", pose.optDouble("x", 0.0))
                        response.putDouble("y", pose.optDouble("y", 0.0))
                        response.putDouble("yaw", pose.optDouble("yaw", 0.0))
                        promise.resolve(response)
                    } else {
                        promise.reject("POSE_ERROR", "Failed to get pose: ${connection.responseCode}")
                    }
                } finally {
                    connection.disconnect()
                }
            } catch (e: Exception) {
                promise.reject("POSE_ERROR", "Error getting pose: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun navigate(x: Double, y: Double, yaw: Double, promise: Promise) {
        scope.launch {
            try {
                val url = "$BASE_URL/api/core/motion/v1/actions"
                val connection = URL(url).openConnection() as HttpURLConnection
                
                val actionOptions = JSONObject().apply {
                    put("action_name", "slamtec.agent.actions.MoveToAction")
                    put("options", JSONObject().apply {
                        put("target", JSONObject().apply {
                            put("x", x)
                            put("y", y)
                            put("z", 0)
                        })
                        put("move_options", JSONObject().apply {
                            put("mode", 0)
                            put("flags", JSONArray().apply { put("with_yaw") })
                            put("yaw", yaw)
                            put("acceptable_precision", 0)
                            put("fail_retry_count", 0)
                        })
                    })
                }

                connection.apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json")
                    doOutput = true
                    outputStream.write(actionOptions.toString().toByteArray())
                }

                if (connection.responseCode in 200..204) {
                    val response = JSONObject(connection.inputStream.bufferedReader().readText())
                    monitorAction(response.getString("action_id"), promise)
                } else {
                    promise.reject("NAVIGATION_ERROR", "Navigation failed: ${connection.responseCode}")
                }
            } catch (e: Exception) {
                promise.reject("NAVIGATION_ERROR", "Error during navigation: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun navigateProduct(x: Double, y: Double, yaw: Double, promise: Promise) {
        scope.launch {
            try {
                val url = "$BASE_URL/api/core/motion/v1/actions"
                val connection = URL(url).openConnection() as HttpURLConnection
                
                val actionOptions = JSONObject().apply {
                    put("action_name", "slamtec.agent.actions.MoveToAction")
                    put("options", JSONObject().apply {
                        put("target", JSONObject().apply {
                            put("x", x)
                            put("y", y)
                            put("z", 0)
                        })
                        put("move_options", JSONObject().apply {
                            put("mode", 0)
                            put("flags", JSONArray().apply { 
                                put("with_yaw")
                                put("precise")
                            })
                            put("yaw", yaw)
                            put("acceptable_precision", 0.5)
                            put("fail_retry_count", 3)
                        })
                    })
                }

                connection.apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json")
                    doOutput = true
                    outputStream.write(actionOptions.toString().toByteArray())
                }

                if (connection.responseCode in 200..204) {
                    val response = JSONObject(connection.inputStream.bufferedReader().readText())
                    monitorAction(response.getString("action_id"), promise)
                } else {
                    promise.reject("NAVIGATION_ERROR", "Navigation failed: ${connection.responseCode}")
                }
            } catch (e: Exception) {
                promise.reject("NAVIGATION_ERROR", "Error during navigation: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun navigateToWaypoint(waypoint: ReadableMap, promise: Promise) {
        val pose = waypoint.getMap("pose")
        if (pose != null) {
            navigate(
                pose.getDouble("x"),
                pose.getDouble("y"),
                pose.getDouble("yaw"),
                promise
            )
        } else {
            promise.reject("NAVIGATION_ERROR", "Invalid waypoint format")
        }
    }

    @ReactMethod
    fun navigateToProduct(waypoint: ReadableMap, promise: Promise) {
        val pose = waypoint.getMap("pose")
        if (pose != null) {
            navigateProduct(
                pose.getDouble("x"),
                pose.getDouble("y"),
                pose.getDouble("yaw"),
                promise
            )
        } else {
            promise.reject("NAVIGATION_ERROR", "Invalid waypoint format")
        }
    }

    @ReactMethod
    fun getPOIs(promise: Promise) {
        scope.launch {
            try {
                val url = "$BASE_URL/api/core/artifact/v1/pois"
                val connection = URL(url).openConnection() as HttpURLConnection
                connection.apply {
                    requestMethod = "GET"
                    setRequestProperty("Content-Type", "application/json")
                }

                if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                    val response = connection.inputStream.bufferedReader().readText()
                    promise.resolve(convertJsonToWritableMap(JSONObject(response)))
                } else {
                    promise.reject("POI_ERROR", "Failed to get POIs: ${connection.responseCode}")
                }
            } catch (e: Exception) {
                promise.reject("POI_ERROR", "Error getting POIs: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun goHome(promise: Promise) {
        scope.launch {
            try {
                val url = "$BASE_URL/api/core/motion/v1/actions"
                val connection = URL(url).openConnection() as HttpURLConnection
                
                val actionOptions = JSONObject().apply {
                    put("action_name", "slamtec.agent.actions.GoHomeAction")
                    put("gohome_options", JSONObject().apply {
                        put("flags", "dock")
                        put("back_to_landing", true)
                        put("charging_retry_count", 3)
                    })
                }

                connection.apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json")
                    doOutput = true
                    outputStream.write(actionOptions.toString().toByteArray())
                }

                if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                    val response = JSONObject(connection.inputStream.bufferedReader().readText())
                    monitorAction(response.getString("action_id"), promise)
                } else {
                    promise.reject("HOME_ERROR", "Go home command failed: ${connection.responseCode}")
                }
            } catch (e: Exception) {
                promise.reject("HOME_ERROR", "Error during go home: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun uploadMap(filePath: String, promise: Promise) {
        scope.launch {
            try {
                val file = File(filePath)
                if (!file.exists()) {
                    promise.reject("MAP_ERROR", "Map file does not exist")
                    return@launch
                }

                val url = "$BASE_URL/api/core/slam/v1/maps/stcm"
                val connection = URL(url).openConnection() as HttpURLConnection
                
                connection.apply {
                    requestMethod = "PUT"
                    setRequestProperty("Content-Type", "application/octet-stream")
                    doOutput = true
                    file.inputStream().use { input ->
                        outputStream.use { output ->
                            input.copyTo(output)
                        }
                    }
                }

                if (connection.responseCode in 200..204) {
                    promise.resolve(true)
                } else {
                    promise.reject("MAP_ERROR", "Failed to upload map: ${connection.responseCode}")
                }
            } catch (e: Exception) {
                promise.reject("MAP_ERROR", "Error uploading map: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun setHomeDock(x: Double, y: Double, z: Double, yaw: Double, pitch: Double, roll: Double, promise: Promise) {
        scope.launch {
            try {
                val url = "$BASE_URL/api/core/slam/v1/homepose"
                val connection = URL(url).openConnection() as HttpURLConnection
                
                val body = JSONObject().apply {
                    put("x", x)
                    put("y", y)
                    put("z", z)
                    put("yaw", yaw)
                    put("pitch", pitch)
                    put("roll", roll)
                }

                connection.apply {
                    requestMethod = "PUT"
                    setRequestProperty("Content-Type", "application/json")
                    doOutput = true
                    outputStream.write(body.toString().toByteArray())
                }

                if (connection.responseCode in 200..204) {
                    promise.resolve(true)
                } else {
                    promise.reject("HOMEDOCK_ERROR", "Failed to set home dock: ${connection.responseCode}")
                }
            } catch (e: Exception) {
                promise.reject("HOMEDOCK_ERROR", "Error setting home dock: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun clearMap(promise: Promise) {
        sendDeleteRequest("/api/core/slam/v1/maps", "MAP_CLEAR_ERROR", promise)
    }

    @ReactMethod
    fun clearPOIs(promise: Promise) {
        sendDeleteRequest("/api/core/artifact/v1/pois", "POI_CLEAR_ERROR", promise)
    }

    @ReactMethod
    fun clearHomeDocks(promise: Promise) {
        sendDeleteRequest("/api/core/slam/v1/homedocks", "HOMEDOCK_CLEAR_ERROR", promise)
    }

    @ReactMethod
    fun setPose(x: Double, y: Double, z: Double, yaw: Double, pitch: Double, roll: Double, promise: Promise) {
        scope.launch {
            try {
                val url = "$BASE_URL/api/core/slam/v1/localization/pose"
                val connection = URL(url).openConnection() as HttpURLConnection
                
                val body = JSONObject().apply {
                    put("x", x)
                    put("y", y)
                    put("z", z)
                    put("yaw", yaw)
                    put("pitch", pitch)
                    put("roll", roll)
                }

                connection.apply {
                    requestMethod = "PUT"
                    setRequestProperty("Content-Type", "application/json")
                    doOutput = true
                    outputStream.write(body.toString().toByteArray())
                }

                if (connection.responseCode in 200..204) {
                    promise.resolve(true)
                } else {
                    promise.reject("POSE_ERROR", "Failed to set pose: ${connection.responseCode}")
                }
            } catch (e: Exception) {
                promise.reject("POSE_ERROR", "Error setting pose: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun setMaxLineSpeed(speed: Double, promise: Promise) {
        scope.launch {
            try {
                val url = "$BASE_URL/api/core/system/v1/parameter"
                val connection = URL(url).openConnection() as HttpURLConnection
                
                val body = JSONObject().apply {
                    put("param", "base.max_moving_speed")
                    put("value", speed)
                }

                connection.apply {
                    requestMethod = "PUT"
                    setRequestProperty("Content-Type", "application/json")
                    doOutput = true
                    outputStream.write(body.toString().toByteArray())
                }

                if (connection.responseCode in 200..204) {
                    promise.resolve(true)
                } else {
                    promise.reject("SPEED_ERROR", "Failed to set max speed: ${connection.responseCode}")
                }
            } catch (e: Exception) {
                promise.reject("SPEED_ERROR", "Error setting max speed: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun addPOIFromCSV(filePath: String, promise: Promise) {
        scope.launch {
            try {
                val file = File(filePath)
                if (!file.exists()) {
                    promise.reject("POI_ERROR", "CSV file does not exist")
                    return@launch
                }

                val lines = file.readLines()
                if (lines.isEmpty()) {
                    promise.reject("POI_ERROR", "CSV file is empty")
                    return@launch
                }

                // Parse headers
                val headers = lines[0].split(",").map { it.trim() }
                val requiredColumns = setOf("pose.x", "pose.y", "pose.yaw", "display_name", "type")
                val missingColumns = requiredColumns - headers.toSet()
                
                if (missingColumns.isNotEmpty()) {
                    promise.reject("POI_ERROR", "Missing required columns: $missingColumns")
                    return@launch
                }

                // Process each row
                val url = "$BASE_URL/api/core/artifact/v1/pois"
                var successCount = 0
                var failCount = 0

                for (i in 1 until lines.size) {
                    val row = lines[i].split(",").map { it.trim() }
                    val rowData = headers.zip(row).toMap()

                    try {
                        val body = JSONObject().apply {
                            put("id", java.util.UUID.randomUUID().toString())
                            put("pose", JSONObject().apply {
                                put("x", rowData["pose.x"]?.toDouble() ?: 0.0)
                                put("y", rowData["pose.y"]?.toDouble() ?: 0.0)
                                put("yaw", rowData["pose.yaw"]?.toDouble() ?: 0.0)
                            })
                            put("metadata", JSONObject().apply {
                                put("display_name", rowData["display_name"] ?: "")
                                put("type", rowData["type"] ?: "")
                                put("group", rowData["group"] ?: "")
                            })
                        }

                        val connection = URL(url).openConnection() as HttpURLConnection
                        connection.apply {
                            requestMethod = "POST"
                            setRequestProperty("Content-Type", "application/json")
                            doOutput = true
                            outputStream.write(body.toString().toByteArray())
                        }

                        if (connection.responseCode in 200..204) {
                            successCount++
                        } else {
                            failCount++
                        }
                    } catch (e: Exception) {
                        failCount++
                    }
                }

                val result = Arguments.createMap().apply {
                    putInt("successCount", successCount)
                    putInt("failCount", failCount)
                }
                promise.resolve(result)

            } catch (e: Exception) {
                promise.reject("POI_ERROR", "Error processing CSV: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun savePersistentMap(promise: Promise) {
        scope.launch {
            try {
                val url = "$BASE_URL/api/core/slam/v1/maps/persistent"
                val connection = URL(url).openConnection() as HttpURLConnection
                connection.requestMethod = "PUT"

                if (connection.responseCode in 200..204) {
                    promise.resolve(true)
                } else {
                    promise.reject("MAP_ERROR", "Failed to save persistent map")
                }
            } catch (e: Exception) {
                promise.reject("MAP_ERROR", "Error saving persistent map: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun processAndUploadMap(promise: Promise) {
        scope.launch {
            try {
                val filesDir = reactApplicationContext.filesDir
                val homedock = ConfigManager.getDoubleArray("homedock") 
                    ?: throw Exception("Homedock configuration not found")

                // Clear existing data
                sendDeleteRequest("/api/core/artifact/v1/pois", "POI_CLEAR_ERROR", promise)
                sendDeleteRequest("/api/core/slam/v1/maps", "MAP_CLEAR_ERROR", promise)

                // Upload new map
                val stcmFile = File(filesDir, "map.stcm")
                if (!stcmFile.exists()) {
                    throw Exception("STCM file not found")
                }
                uploadMap(stcmFile.absolutePath, promise)

                // Update homedock
                sendDeleteRequest("/api/core/slam/v1/homedocks", "HOMEDOCK_CLEAR_ERROR", promise)
                
                // Need to handle array differently since Kotlin doesn't support destructuring for DoubleArray
                setHomeDock(
                    homedock[0].toDouble(),
                    homedock[1].toDouble(),
                    homedock[2].toDouble(),
                    homedock[3].toDouble(),
                    homedock[4].toDouble(),
                    homedock[5].toDouble(),
                    promise
                )

                // Calculate and set pose
                val pose = calculatePose(homedock)
                setPose(
                    pose[0], pose[1], pose[2],
                    pose[3], pose[4], pose[5],
                    promise
                )

                // Save persistent map
                savePersistentMap(promise)

                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("MAP_PROCESS_ERROR", "Error processing map: ${e.message}")
            }
        }
    }

    private fun calculatePose(homedock: DoubleArray, distanceInMeters: Double = 0.2): DoubleArray {
        // Can't use destructuring for DoubleArray, need to access by index
        val x = homedock[0]
        val y = homedock[1]
        val z = homedock[2]
        val yaw = homedock[3]
        val pitch = homedock[4]
        val roll = homedock[5]
        
        val dx = distanceInMeters * Math.cos(yaw)
        val dz = distanceInMeters * Math.sin(yaw)
        
        return doubleArrayOf(
            x + dx,  // new x
            y,       // y remains unchanged
            z + dz,  // new z
            yaw,     // yaw remains unchanged
            pitch,   // pitch remains unchanged
            roll     // roll remains unchanged
        )
    }

    private fun sendDeleteRequest(endpoint: String, errorCode: String, promise: Promise) {
        scope.launch {
            try {
                val url = BASE_URL + endpoint
                val connection = URL(url).openConnection() as HttpURLConnection
                connection.apply {
                    requestMethod = "DELETE"
                    setRequestProperty("Content-Type", "application/json")
                }

                if (connection.responseCode in 200..204) {
                    promise.resolve(true)
                } else {
                    promise.reject(errorCode, "Delete request failed: ${connection.responseCode}")
                }
            } catch (e: Exception) {
                promise.reject(errorCode, "Error during delete: ${e.message}")
            }
        }
    }

    private suspend fun monitorAction(actionId: String, promise: Promise) {
        try {
            val url = "$BASE_URL/api/core/motion/v1/actions/$actionId"
            
            while (true) {
                val connection = URL(url).openConnection() as HttpURLConnection
                connection.apply {
                    requestMethod = "GET"
                    setRequestProperty("Content-Type", "application/json")
                }

                if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                    val response = JSONObject(connection.inputStream.bufferedReader().readText())
                    if (!response.has("action_name")) {
                        promise.resolve(true)
                        break
                    }
                } else {
                    promise.reject("ACTION_ERROR", "Action monitoring failed: ${connection.responseCode}")
                    break
                }

                delay(500) // Wait 500ms before next check
            }
        } catch (e: Exception) {
            promise.reject("ACTION_ERROR", "Error monitoring action: ${e.message}")
        }
    }

    private fun convertJsonToWritableMap(jsonObject: JSONObject): WritableMap {
        val map = Arguments.createMap()
        val iterator = jsonObject.keys()
        while (iterator.hasNext()) {
            val key = iterator.next()
            when (val value = jsonObject.get(key)) {
                is JSONObject -> map.putMap(key, convertJsonToWritableMap(value))
                is JSONArray -> map.putArray(key, convertJsonToWritableArray(value))
                is Boolean -> map.putBoolean(key, value)
                is Int -> map.putInt(key, value)
                is Double -> map.putDouble(key, value)
                is String -> map.putString(key, value)
                else -> map.putString(key, value.toString())
            }
        }
        return map
    }

    private fun convertJsonToWritableArray(jsonArray: JSONArray): WritableArray {
        val array = Arguments.createArray()
        for (i in 0 until jsonArray.length()) {
            when (val value = jsonArray.get(i)) {
                is JSONObject -> array.pushMap(convertJsonToWritableMap(value))
                is JSONArray -> array.pushArray(convertJsonToWritableArray(value))
                is Boolean -> array.pushBoolean(value)
                is Int -> array.pushInt(value)
                is Double -> array.pushDouble(value)
                is String -> array.pushString(value)
                else -> array.pushString(value.toString())
            }
        }
        return array
    }
} 
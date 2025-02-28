package com.robotgui

import android.util.Log
import com.facebook.react.bridge.*
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.*

class NetworkModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val TAG = "NetworkModule"
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private val SLAM_IP = "127.0.0.1"  // Local SLAM service
    private val SLAM_PORT = 1448
    private val TIMEOUT_MS = 1000 // 1 second timeout
    private val HEALTH_ENDPOINT = "api/core/system/v1/robot/health"  // New health endpoint

    override fun getName(): String = "NetworkModule"

    @ReactMethod
    fun checkConnection(promise: Promise) {
        scope.launch {
            try {
                val response = Arguments.createMap()
                
                try {
                    val urlString = "http://$SLAM_IP:$SLAM_PORT/$HEALTH_ENDPOINT"
                    val url = URL(urlString)
                    val connection = url.openConnection() as HttpURLConnection
                    
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
                            response.putString("response", apiResponse)
                            response.putString("status", "Robot health check successful")
                            response.putBoolean("slamApiAvailable", true)
                        } else {
                            response.putString("error", "Health check failed with code: $responseCode")
                            response.putString("status", "Robot health check failed")
                            response.putBoolean("slamApiAvailable", false)
                        }
                    } catch (e: Exception) {
                        response.putString("error", "Connection error: ${e.message}")
                        response.putString("status", "Cannot connect to robot")
                        response.putBoolean("slamApiAvailable", false)
                    } finally {
                        connection.disconnect()
                    }
                } catch (e: Exception) {
                    response.putString("error", "Setup error: ${e.message}")
                    response.putString("status", "Cannot setup connection to robot")
                    response.putBoolean("slamApiAvailable", false)
                }

                response.putBoolean("deviceFound", response.getBoolean("slamApiAvailable"))
                promise.resolve(response)
                
            } catch (e: Exception) {
                promise.reject("NETWORK_ERROR", "Fatal error: ${e.message}")
            }
        }
    }
} 
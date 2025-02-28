/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  ScrollView,
  NativeModules,
  TouchableOpacity,
  BackHandler,
} from 'react-native';

interface ConnectionDetails {
  slamApiAvailable: boolean;
  status: string;
  deviceFound: boolean;
  error?: string;
  responseCode?: number;
  response?: string;
}

function App(): React.JSX.Element {
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const addDebugMessage = (message: string) => {
    setDebugLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  useEffect(() => {
    const checkConnection = async () => {
      try {
        if (NativeModules.NetworkModule) {
          const details = await NativeModules.NetworkModule.checkConnection();
          setConnectionDetails(details);
          addDebugMessage(`Connection check: ${details.deviceFound ? 'SLAM service found!' : 'SLAM service not found'}`);
        }
      } catch (error) {
        addDebugMessage(`Connection error: ${error.message}`);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleClose = () => {
    BackHandler.exitApp();
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
        <Text style={styles.closeButtonText}>✕</Text>
      </TouchableOpacity>
      <ScrollView style={styles.scrollView}>
        {connectionDetails && (
          <View style={styles.connectionSection}>
            <Text style={styles.sectionTitle}>SLAM Service Status</Text>
            <Text style={[
              styles.connectionStatus,
              { color: connectionDetails.deviceFound ? '#4CAF50' : '#F44336' }
            ]}>
              {connectionDetails.status}
            </Text>
            <View style={styles.detailsSection}>
              <Text style={styles.detailsTitle}>Connection Details:</Text>
              <Text style={styles.detailsText}>URL: http://127.0.0.1:1448/api/core/system/v1/robot/health</Text>
              {connectionDetails.responseCode && (
                <Text style={styles.detailsText}>
                  Response Code: {connectionDetails.responseCode}
                </Text>
              )}
              {connectionDetails.error && (
                <Text style={styles.errorText}>
                  Error: {connectionDetails.error}
                </Text>
              )}
              {connectionDetails.response && (
                <Text style={styles.detailsText}>
                  Response: {connectionDetails.response}
                </Text>
              )}
            </View>
          </View>
        )}
        <View style={styles.debugSection}>
          <Text style={styles.debugTitle}>Debug Log:</Text>
          {debugLog.map((log, index) => (
            <Text key={index} style={styles.debugText}>{log}</Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    padding: 20,
  },
  connectionSection: {
    padding: 15,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  connectionStatus: {
    fontSize: 16,
    fontWeight: '500',
  },
  debugSection: {
    padding: 15,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  debugTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  debugText: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
  },
  closeButton: {
    padding: 15,
  },
  closeButtonText: {
    fontSize: 20,
    color: '#000',
  },
  detailsSection: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  detailsTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 5,
  },
  detailsText: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
  },
  errorText: {
    fontSize: 12,
    color: '#F44336',
    fontFamily: 'monospace',
  },
});

export default App;

import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  NativeModules,
  DeviceEventEmitter,
} from 'react-native';
import { LogUtils } from '../utils/logging';

// Access the global object in a way that works in React Native
const globalAny: any = global;

interface ConfigScreenProps {
  onClose: () => void;
  restartApp: () => void;
}

interface ConnectionStatus {
  isConnected: boolean;
  message: string;
}

function ConfigScreen({ onClose, restartApp }: ConfigScreenProps): React.JSX.Element {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    isConnected: false,
    message: 'Checking connection...',
  });
  const [lastHealthCheckResponse, setLastHealthCheckResponse] = useState<any>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [domainId, setDomainId] = useState('');
  const [homedockQrId, setHomedockQrId] = useState('');
  const [hasStoredPassword, setHasStoredPassword] = useState(false);
  const [domainServerUrl, setDomainServerUrl] = useState('');
  const [restartEnabled, setRestartEnabled] = useState(false);
  const [authSuccess, setAuthSuccess] = useState(false);

  const [targetX, setTargetX] = useState('');
  const [targetY, setTargetY] = useState('');
  const [targetZ, setTargetZ] = useState('');
  const [targetYaw, setTargetYaw] = useState('');

  const [connectionDetails, setConnectionDetails] = useState('');
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);
  const [powerStatus, setPowerStatus] = useState<{
    batteryPercentage: number;
    isCharging: boolean;
    dockingStatus: string;
    powerStage: string;
  } | null>(null);

  useEffect(() => {
    const loadInitialData = async () => {
      await Promise.all([
        checkConnection(),
        loadStoredCredentials()
      ]);
    };
    
    loadInitialData();

    // Set up an interval to check connection periodically
    const connectionInterval = setInterval(checkConnection, 5000);

    // Set up power status monitoring
    const checkPowerStatus = async () => {
      try {
        const status = await NativeModules.SlamtecUtils.getPowerStatus();
        setPowerStatus(status);
      } catch (error) {
        console.error('Error getting power status:', error);
      }
    };

    // Initial check
    checkPowerStatus();

    // Set up interval for regular checks
    const powerStatusInterval = setInterval(checkPowerStatus, 30000);

    return () => {
      clearInterval(connectionInterval);
      clearInterval(powerStatusInterval);
    };
  }, []);

  const checkConnection = async () => {
    try {
      LogUtils.writeDebugToFile('Starting health check...');
      const response = await NativeModules.SlamtecUtils.checkConnection();
      LogUtils.writeDebugToFile('Health check response: ' + JSON.stringify(response, null, 2));
      setLastHealthCheckResponse(response);

      // Parse the response string if it exists
      let parsedResponse;
      if (response.response) {
        try {
          parsedResponse = JSON.parse(response.response);
          LogUtils.writeDebugToFile('Parsed health check response: ' + JSON.stringify(parsedResponse, null, 2));
        } catch (parseError) {
          LogUtils.writeDebugToFile('Failed to parse health check response: ' + parseError.message);
          throw new Error('Invalid health check response format');
        }
      }

      // Build detailed status message
      let statusMessage = '';
      let isConnected = true;

      // Check base connection status
      if (response.status) {
        statusMessage += `Base Status: ${response.status}\n`;
      }

      // Check SLAM API availability
      if (response.slamApiAvailable !== undefined) {
        statusMessage += `SLAM API: ${response.slamApiAvailable ? 'Available' : 'Not Available'}\n`;
        isConnected = isConnected && response.slamApiAvailable;
      }

      // Check for specific error conditions
      if (response.hasError) {
        statusMessage += 'Error: General error detected\n';
        isConnected = false;
      }
      if (response.hasFatal) {
        statusMessage += 'Error: Fatal error detected\n';
        isConnected = false;
      }
      if (response.hasSystemEmergencyStop) {
        statusMessage += 'Error: System emergency stop active\n';
        isConnected = false;
      }
      if (response.hasLidarDisconnected) {
        statusMessage += 'Error: LiDAR disconnected\n';
        isConnected = false;
      }
      if (response.hasDepthCameraDisconnected) {
        statusMessage += 'Error: Depth camera disconnected\n';
        isConnected = false;
      }
      if (response.hasSdpDisconnected) {
        statusMessage += 'Error: SDP disconnected\n';
        isConnected = false;
      }

      // Check parsed response for additional errors
      if (parsedResponse) {
        if (parsedResponse.hasFatal) {
          statusMessage += 'Error: Fatal error in parsed response\n';
          isConnected = false;
        }
        if (parsedResponse.hasError) {
          statusMessage += 'Error: Error in parsed response\n';
          isConnected = false;
        }
        if (parsedResponse.baseError && parsedResponse.baseError.length > 0) {
          // Check for specific magnetic sensor errors
          const magneticErrors = parsedResponse.baseError.filter((error: number) => 
            error === 67372544 || error === 67372545
          );
          
          if (magneticErrors.length > 0) {
            statusMessage += 'FATAL: Magnetic sensor communication error\n';
            statusMessage += 'Recommended actions:\n';
            statusMessage += '1. Check if the connection cable is reliably connected\n';
            statusMessage += '2. Check if the sensor is damaged\n';
            statusMessage += '3. Manually clear the error\n';
            statusMessage += '4. Restart the chassis if necessary\n';
          } else {
            statusMessage += `Base Errors: ${parsedResponse.baseError.join(', ')}\n`;
          }
          isConnected = false;
        }
      }

      // If no specific issues were found, add a success message
      if (isConnected) {
        statusMessage = 'Health Check OK';
      } else {
        statusMessage = 'Health Check Failed';
      }

      LogUtils.writeDebugToFile('Connection status: ' + (isConnected ? 'Health Check OK' : 'Health Check Failed') + ', Message: ' + statusMessage);
      setConnectionStatus({ isConnected, message: statusMessage });
    } catch (error) {
      LogUtils.writeDebugToFile('Connection error: ' + (error instanceof Error ? error.message : String(error)));
      setConnectionStatus({ 
        isConnected: false, 
        message: 'Health Check Failed'
      });
    }
  };

  const loadStoredCredentials = async () => {
    try {
      const credentials = await NativeModules.DomainUtils.getStoredCredentials();
      if (credentials.email) {
        setEmail(credentials.email);
        NativeModules.DomainUtils.saveEmail(credentials.email);
      }
      if (credentials.password) {
        setPassword('********');
        setHasStoredPassword(true);
        NativeModules.DomainUtils.savePassword(credentials.password);
      }
      if (credentials.domainId) {
        setDomainId(credentials.domainId);
        NativeModules.DomainUtils.saveDomainId(credentials.domainId);
      }
      if (credentials.homedockQrId) {
        setHomedockQrId(credentials.homedockQrId);
        NativeModules.DomainUtils.saveHomedockQrId(credentials.homedockQrId);
      }
    } catch (error) {
      console.error('Failed to load credentials:', error);
    }
  };

  const handleTestAuth = async () => {
    if (!email || !password || !domainId) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    try {
      // Get the actual stored password if using masked password
      const actualPassword = hasStoredPassword ? 
        (await NativeModules.DomainUtils.getStoredCredentials()).password : 
        password;

      const result = await NativeModules.DomainUtils.authenticate(email, actualPassword, domainId);
      console.log('Auth Response:', result);
      
      // Extract the JSON string from the response message
      const jsonStr = result.message.replace('Domain Server: ', '');
      const response = JSON.parse(jsonStr);
      
      // Store the domain server URL
      setDomainServerUrl(response.url);
      setAuthSuccess(true);
      setRestartEnabled(true);
      
      Alert.alert(
        'Test Results', 
        'Connection test successful!\n\n' +
        'Email: ' + email + '\n' +
        'Domain ID: ' + domainId + '\n' +
        'Domain Server URL: ' + response.url + '\n\n' +
        'Full Response:\n' + JSON.stringify(response, null, 2)
      );
    } catch (error: any) {
      setAuthSuccess(false);
      console.error('Auth Error:', error);
      Alert.alert(
        'Test Failed',
        'Error: ' + (error.message || 'Unknown error') + '\n\n' +
        'Please check your credentials and try again.'
      );
    }
  };

  const handlePasswordFocus = () => {
    if (hasStoredPassword) {
      setPassword('');
      setHasStoredPassword(false);
    }
  };

  const handleEmailChange = (text: string) => {
    setEmail(text);
    NativeModules.DomainUtils.saveEmail(text);
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    if (!hasStoredPassword) {
      NativeModules.DomainUtils.savePassword(text);
    }
  };

  const handleDomainIdChange = (text: string) => {
    setDomainId(text);
    NativeModules.DomainUtils.saveDomainId(text);
  };

  const handleHomedockQrIdChange = (text: string) => {
    // Convert to uppercase and filter out non-alphanumeric characters
    const formattedText = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setHomedockQrId(formattedText);
    NativeModules.DomainUtils.saveHomedockQrId(formattedText);
  };

  const showHealthCheckDetails = () => {
    if (lastHealthCheckResponse) {
      Alert.alert(
        'Health Check Details',
        JSON.stringify(lastHealthCheckResponse, null, 2),
        [{ text: 'Close', style: 'cancel' }],
        { cancelable: true }
      );
    } else {
      Alert.alert(
        'Health Check Details',
        'No health check data available yet.',
        [{ text: 'Close', style: 'cancel' }],
        { cancelable: true }
      );
    }
  };

  // Helper to normalize yaw between -π and +π
  const normalizeYaw = (yaw: number) => {
    const pi = Math.PI;
    let normalized = yaw;
    while (normalized > pi) normalized -= 2 * pi;
    while (normalized < -pi) normalized += 2 * pi;
    return Number(normalized.toFixed(2));
  };

  const handleProceedToTarget = async () => {
    const x = parseFloat(targetX);
    const z = parseFloat(targetZ);
    let y = -z;
    let yaw = parseFloat(targetYaw);
    if (isNaN(x) || isNaN(z) || isNaN(yaw)) {
      Alert.alert('Invalid Input', 'Please enter valid numbers for all fields.');
      return;
    }
    yaw = normalizeYaw(yaw);
    setTargetYaw(yaw.toString()); // Update field to normalized value
    try {
      await NativeModules.SlamtecUtils.navigate(x, y, yaw);
      Alert.alert('Navigation Started', `Navigating to x: ${x}, y: ${y}, yaw: ${yaw}`);
    } catch (error) {
      Alert.alert('Navigation Failed', error?.message || 'Unknown error');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={() => {
          // Close the app
          if (onClose) {
            onClose();
          }
        }}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>Slamtec Status</Text>
            <View style={[
              styles.statusIndicator,
              { backgroundColor: connectionStatus.isConnected ? '#4CAF50' : '#F44336' }
            ]} />
            <Text style={styles.statusMessage}>{connectionStatus.message}</Text>
            <TouchableOpacity 
              style={styles.detailsButton}
              onPress={showHealthCheckDetails}
            >
              <Text style={styles.detailsButtonText}>Details</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>Robot Status</Text>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.statusLabel}>Battery:</Text>
                <Text style={styles.statusValue}>{powerStatus ? `${powerStatus.batteryPercentage}%` : 'Unknown'}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.statusLabel}>Docking:</Text>
                <Text style={styles.statusValue}>{powerStatus ? powerStatus.dockingStatus : 'Unknown'}</Text>
              </View>
            </View>
          </View>
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Authentication</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={handleEmailChange}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <TextInput
              style={styles.input}
              placeholder="Password"
              value={password}
              onChangeText={handlePasswordChange}
              onFocus={handlePasswordFocus}
              secureTextEntry={!hasStoredPassword}
            />

            <TextInput
              style={styles.input}
              placeholder="Domain ID"
              value={domainId}
              onChangeText={handleDomainIdChange}
              autoCapitalize="none"
            />

            <TextInput
              style={styles.input}
              placeholder="Homedock QR ID"
              value={homedockQrId}
              onChangeText={handleHomedockQrIdChange}
              autoCapitalize="characters"
              keyboardType="default"
            />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.button, styles.testButton, { flex: 1, marginRight: 5 }]}
                onPress={handleTestAuth}
              >
                <Text style={styles.buttonText}>Test Connection</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.button,
                  { flex: 1, marginLeft: 5, backgroundColor: restartEnabled ? '#FF9800' : '#BDBDBD' }
                ]}
                disabled={!restartEnabled}
                onPress={() => {
                  setRestartEnabled(false);
                  restartApp();
                }}
              >
                <Text style={styles.buttonText}>Restart App</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Robot Control</Text>
            <TouchableOpacity 
              style={[styles.button, styles.homeButton]}
              onPress={async () => {
                try {
                  // Log the action
                  console.log('Going home...');
                  
                  // Call the goHome function directly without showing any alerts
                  await NativeModules.SlamtecUtils.goHome();
                } catch (error: any) {
                  console.error('Error going home:', error);
                  Alert.alert(
                    'Go Home Failed',
                    'Error: ' + (error.message || 'Unknown error')
                  );
                }
              }}
            >
              <Text style={styles.buttonText}>Go Home</Text>
            </TouchableOpacity>
            
            <View style={styles.coordinateContainer}>
              <Text style={styles.coordinateLabel}>X Coordinate:</Text>
              <TextInput
                style={styles.coordinateInput}
                placeholder="0.0"
                value={targetX}
                onChangeText={setTargetX}
                keyboardType="numeric"
                returnKeyType="done"
              />
            </View>
            
            <View style={styles.coordinateContainer}>
              <Text style={styles.coordinateLabel}>Y Coordinate:</Text>
              <TextInput
                style={styles.coordinateInput}
                placeholder="0.0"
                value={targetY}
                onChangeText={setTargetY}
                keyboardType="numeric"
                returnKeyType="done"
              />
            </View>
            
            <TouchableOpacity 
              style={[styles.button, styles.navigateButton]}
              onPress={async () => {
                try {
                  // Validate coordinates
                  const x = parseFloat(targetX);
                  const y = parseFloat(targetY);
                  
                  if (isNaN(x) || isNaN(y)) {
                    Alert.alert('Invalid Coordinates', 'Please enter valid numerical coordinates for X and Y.');
                    return;
                  }
                  
                  // Invert Y coordinate: negative becomes positive, positive becomes negative
                  const invertedY = -y;
                  
                  console.log(`Navigating to x=${x}, y=${invertedY} (original y=${y}), yaw=0`);
                  
                  Alert.alert('Navigation Started', `Robot is navigating to coordinates (${x}, ${invertedY})`);

                  // Call navigateWithSdk with x, inverted y, and yaw=0
                  await NativeModules.SlamtecUtils.navigate(x, invertedY, 0);
                  
                } catch (error: any) {
                  console.error('Error navigating:', error);
                  Alert.alert(
                    'Navigation Failed',
                    'Error: ' + (error.message || 'Unknown error')
                  );
                }
              }}
            >
              <Text style={styles.buttonText}>Navigate to Coordinates</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 50,
  },
  content: {
    padding: 20,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  statusText: {
    fontSize: 16,
    marginRight: 10,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  statusMessage: {
    flex: 1,
    fontSize: 14,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 10,
  },
  testButton: {
    backgroundColor: '#4CAF50',
  },
  promotionButton: {
    backgroundColor: '#9C27B0', // Purple color for promotion button
  },
  homeButton: {
    backgroundColor: '#FF9800', // Orange color for home button
  },
  mapButton: {
    backgroundColor: '#2196F3', // Blue color for map button
    marginTop: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  nullButton: {
    backgroundColor: '#F44336', // Red color for null button
    marginTop: 10,
  },
  emptyButton: {
    backgroundColor: '#FF9800', // Orange color for empty string button
    marginTop: 10,
  },
  dangerButton: {
    backgroundColor: '#F44336', // Red color for danger button
  },
  getPoseButton: {
    backgroundColor: '#2196F3', // Blue color for get pose button
    marginTop: 10,
  },
  detailsButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginLeft: 10,
  },
  detailsButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  statusLabel: {
    fontSize: 16,
    marginRight: 10,
  },
  statusValue: {
    fontSize: 16,
  },
  robotStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectionDetails: {
    marginTop: 10,
    fontSize: 14,
    color: '#333',
  },
  coordinateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    justifyContent: 'space-between',
  },
  coordinateLabel: {
    fontSize: 16,
    marginRight: 10,
    minWidth: 100,
  },
  coordinateInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 10,
    fontSize: 16,
    flex: 1,
    textAlign: 'center',
  },
  navigateButton: {
    backgroundColor: '#2196F3',
    marginTop: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
});

export default ConfigScreen; 
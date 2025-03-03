import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  NativeModules,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Button,
} from 'react-native';

interface ConfigScreenProps {
  onClose: () => void;
}

interface ConnectionStatus {
  isConnected: boolean;
  message: string;
}

interface MapSettings {
  resolution: number;
  originX: number;
  originY: number;
  homeDockX: number;
  homeDockY: number;
  homeDockYaw: number;
}

function ConfigScreen({ onClose }: ConfigScreenProps): React.JSX.Element {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    isConnected: false,
    message: 'Checking connection...',
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [domainId, setDomainId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasStoredPassword, setHasStoredPassword] = useState(false);
  const [mapFiles, setMapFiles] = useState(null);
  const [yamlContent, setYamlContent] = useState('');
  const [mapInfo, setMapInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

    return () => {
      clearInterval(connectionInterval);
    };
  }, []);

  const checkConnection = async () => {
    try {
      const details = await NativeModules.SlamtecUtils.checkConnection();
      setConnectionStatus({
        isConnected: details.slamApiAvailable,
        message: details.status,
      });
    } catch (error) {
      setConnectionStatus({
        isConnected: false,
        message: 'Connection error',
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
      
      Alert.alert(
        'Test Results', 
        'Connection test successful!\n\n' +
        'Email: ' + email + '\n' +
        'Domain ID: ' + domainId + '\n' +
        'Status: ' + result.message
      );
    } catch (error) {
      Alert.alert(
        'Test Failed',
        'Error: ' + (error.message || 'Unknown error') + '\n\n' +
        'Please check your credentials and try again.'
      );
    }
  };

  const handleClearMap = async () => {
    if (!connectionStatus.isConnected) {
      Alert.alert('Error', 'Robot is not connected');
      return;
    }

    try {
      setLoading(true);
      await NativeModules.SlamtecUtils.clearMap();
      Alert.alert('Success', 'Map has been cleared');
    } catch (error) {
      Alert.alert('Error', `Failed to clear map: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadMap = async () => {
    try {
      setLoading(true);
      setError('');
      // Download map files from external source
      const result = await NativeModules.DomainUtils.getMap('bmp', 20);
      setMapFiles(result);
      // Immediately show file info after download
      await handleViewMapInfo();
      await handleViewYaml();
      setError('');
    } catch (err) {
      setError(`Failed to download map: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessMap = async () => {
    if (!connectionStatus.isConnected) {
      Alert.alert('Error', 'Robot is not connected');
      return;
    }

    if (!mapFiles) {
      Alert.alert('Error', 'Please download map files first');
      return;
    }

    setIsProcessing(true);
    try {
      // Process and create STCM map
      await NativeModules.SlamtecUtils.processAndUploadMap({
        mapData: mapFiles,
        usage: 'explore',
        layerName: 'auki_domain_map'
      });
      
      Alert.alert(
        'Success',
        'Map has been processed and uploaded to the robot'
      );
    } catch (error) {
      Alert.alert(
        'Error',
        `Failed to process map: ${error.message}`
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleViewYaml = async () => {
    if (!mapFiles?.yamlPath) {
      setError('No YAML file available');
      return;
    }
    try {
      setLoading(true);
      const result = await NativeModules.SlamtecUtils.readYamlFile(mapFiles.yamlPath);
      setYamlContent(result.content);
      setError('');
    } catch (err) {
      setError(`Failed to read YAML: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleViewMapInfo = async () => {
    if (!mapFiles?.imagePath) {
      setError('No map file available');
      return;
    }
    try {
      setLoading(true);
      const result = await NativeModules.SlamtecUtils.getMapImageInfo(mapFiles.imagePath);
      setMapInfo(result);
    } catch (error) {
      setError('Failed to get map info: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordFocus = () => {
    if (hasStoredPassword) {
      setPassword('');
      setHasStoredPassword(false);
    }
  };

  const handleEmailChange = (email: string) => {
    setEmail(email);
    NativeModules.DomainUtils.saveEmail(email);
  };

  const handleDomainIdChange = (domainId: string) => {
    setDomainId(domainId);
    NativeModules.DomainUtils.saveDomainId(domainId);
  };

  const handlePasswordChange = (password: string) => {
    setPassword(password);
    NativeModules.DomainUtils.savePassword(password);
  };

  const handleReviewMapFile = async () => {
    if (!mapFiles) {
      Alert.alert('Error', 'No map files available');
      return;
    }
    try {
      await handleViewMapInfo();
    } catch (error) {
      Alert.alert('Error', `Failed to review map file: ${error.message}`);
    }
  };

  const handleReviewYamlFile = async () => {
    if (!mapFiles) {
      Alert.alert('Error', 'No map files available');
      return;
    }
    try {
      await handleViewYaml();
    } catch (error) {
      Alert.alert('Error', `Failed to review YAML file: ${error.message}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoid}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
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
              <Text style={styles.statusText}>Connection Status</Text>
              <View style={[
                styles.statusIndicator,
                { backgroundColor: connectionStatus.isConnected ? '#4CAF50' : '#F44336' }
              ]} />
              <Text style={styles.statusMessage}>{connectionStatus.message}</Text>
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

              <TouchableOpacity 
                style={[styles.button, styles.testButton]}
                onPress={handleTestAuth}
              >
                <Text style={styles.buttonText}>Test Connection</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Map Operations</Text>
              
              <TouchableOpacity 
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleClearMap}
                disabled={loading}
              >
                <Text style={styles.buttonText}>
                  {loading ? 'Clearing...' : 'Clear Map'}
                </Text>
              </TouchableOpacity>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Map Download</Text>
              
              <TouchableOpacity 
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleDownloadMap}
                disabled={loading}
              >
                <Text style={styles.buttonText}>
                  {loading ? 'Downloading...' : 'Download Map'}
                </Text>
              </TouchableOpacity>

              {mapFiles && (
                <>
                  <TouchableOpacity 
                    style={[styles.button, styles.secondaryButton]}
                    onPress={handleReviewMapFile}
                  >
                    <Text style={styles.buttonText}>Review Map File</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.button, styles.secondaryButton]}
                    onPress={handleReviewYamlFile}
                  >
                    <Text style={styles.buttonText}>Review YAML File</Text>
                  </TouchableOpacity>
                </>
              )}

              {yamlContent && (
                <ScrollView style={styles.contentContainer}>
                  <Text style={styles.contentText}>{yamlContent}</Text>
                </ScrollView>
              )}

              {mapInfo && (
                <View style={styles.infoContainer}>
                  <Text style={styles.infoText}>File Path: {mapInfo.path}</Text>
                  <Text style={styles.infoText}>Size: {mapInfo.size} bytes</Text>
                  <Text style={styles.infoText}>Last Modified: {mapInfo.lastModified}</Text>
                </View>
              )}

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#000',
  },
  keyboardAvoid: {
    flex: 1,
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
    fontSize: 14,
    color: '#666',
  },
  formContainer: {
    marginTop: 20,
    padding: 20,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    width: '100%',
  },
  formTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  input: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  testButton: {
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 4,
    alignItems: 'center',
    marginTop: 10,
  },
  button: {
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 4,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButton: {
    backgroundColor: '#757575',
    padding: 8,
    borderRadius: 4,
    alignItems: 'center',
    marginTop: 10,
  },
  settingsButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  mapSettings: {
    marginTop: 15,
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  settingsLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  settingsInput: {
    backgroundColor: '#f8f8f8',
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 10,
  },
  coordinateInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  halfInput: {
    width: '48%',
  },
  thirdInput: {
    width: '32%',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  errorText: {
    color: 'red',
    marginTop: 10,
  },
  infoContainer: {
    marginTop: 15,
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  infoText: {
    fontSize: 14,
    marginBottom: 3,
  },
  contentContainer: {
    maxHeight: 200,
  },
  contentText: {
    fontSize: 14,
  },
  secondaryButton: {
    backgroundColor: '#757575',
    padding: 12,
    borderRadius: 4,
    alignItems: 'center',
    marginTop: 10,
  },
});

export default ConfigScreen; 
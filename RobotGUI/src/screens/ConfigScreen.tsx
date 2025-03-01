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
} from 'react-native';

interface ConfigScreenProps {
  onClose: () => void;
}

interface ConnectionStatus {
  isConnected: boolean;
  message: string;
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
      if (credentials.email) setEmail(credentials.email);
      if (credentials.password) {
        setPassword('********');
        setHasStoredPassword(true);
      }
      if (credentials.domainId) setDomainId(credentials.domainId);
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
      const result = await NativeModules.DomainUtils.authenticate(email, password, domainId);
      Alert.alert(
        'Test Results', 
        'Connection test successful!\n\n' +
        'Email: ' + email + '\n' +
        'Domain ID: ' + domainId
      );
    } catch (error) {
      Alert.alert(
        'Test Failed',
        'Error: ' + (error.message || 'Unknown error') + '\n\n' +
        'Please check your credentials and try again.'
      );
    }
  };

  const handleGetMap = async () => {
    if (!connectionStatus.isConnected) {
      Alert.alert('Error', 'Robot is not connected');
      return;
    }

    setIsProcessing(true);
    try {
      // Get map from domain
      const mapResult = await NativeModules.DomainUtils.getMap('png', 20);
      
      // Process and upload map
      await NativeModules.SlamtecUtils.processAndUploadMap();
      
      Alert.alert(
        'Success',
        'Map has been retrieved, processed and uploaded to the robot'
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>Connection Status</Text>
          <View style={[
            styles.statusIndicator,
            { backgroundColor: connectionStatus.isConnected ? '#4CAF50' : '#F44336' }
          ]} />
          <Text style={styles.statusMessage}>{connectionStatus.message}</Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>Domain Authentication</Text>
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
            secureTextEntry
          />
          <TextInput
            style={styles.input}
            placeholder="Domain ID"
            value={domainId}
            onChangeText={handleDomainIdChange}
          />
          <TouchableOpacity 
            style={styles.testButton}
            onPress={handleTestAuth}
          >
            <Text style={styles.buttonText}>Test Credentials</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.button, isProcessing && styles.buttonDisabled]}
            onPress={handleGetMap}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Get and Process Map</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
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
  content: {
    flex: 1,
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
});

export default ConfigScreen; 
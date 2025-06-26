import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Animated,
  Easing,
  NativeModules,
  Modal,
} from 'react-native';
import { LogUtils } from '../utils/logging';

interface SplashScreenProps {
  onFinish: (options?: { goToConfig?: boolean }) => void;
}

const SplashScreen = ({ onFinish }: SplashScreenProps): React.JSX.Element => {
  const [opacity] = useState(new Animated.Value(1));
  const [loadingText, setLoadingText] = useState('Initializing...');
  const [showDockDialog, setShowDockDialog] = useState(false);
  const [isDocked, setIsDocked] = useState(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let pollInterval: NodeJS.Timeout;
    let isMounted = true;

    const checkDockStatus = async () => {
      try {
        const powerStatus = await NativeModules.SlamtecUtils.getPowerStatus();
        if (powerStatus.dockingStatus !== 'on_dock') {
          setShowDockDialog(true);
          setIsDocked(false);
          return false;
        } else {
          setShowDockDialog(false);
          setIsDocked(true);
          return true;
        }
      } catch (e) {
        setShowDockDialog(true);
        setIsDocked(false);
        return false;
      }
    };

    const checkCredentials = async () => {
      try {
        const creds = await NativeModules.DomainUtils.getStoredCredentials();
        const hasCreds = creds && creds.email && creds.password && creds.domainId && creds.email.length > 0 && creds.password.length > 0 && creds.domainId.length > 0;
        if (!hasCreds) {
          // Skip initialization and go to ConfigScreen
          onFinish({ goToConfig: true });
          return false;
        }
        return true;
      } catch (e) {
        onFinish({ goToConfig: true });
        return false;
      }
    };

    const waitForDock = async () => {
      setLoadingText('Checking docking status...');
      let docked = await checkDockStatus();
      if (!docked) {
        pollInterval = setInterval(async () => {
          docked = await checkDockStatus();
          if (docked) {
            clearInterval(pollInterval);
            // After docked, check credentials
            const credsOk = await checkCredentials();
            if (credsOk) initialize();
          }
        }, 5000);
      } else {
        // After docked, check credentials
        const credsOk = await checkCredentials();
        if (credsOk) initialize();
      }
    };

    const initialize = async () => {
      try {
        // Initialize logging first
        await LogUtils.initializeLogging();
        await LogUtils.writeDebugToFile('Starting app initialization...');

        // Get device identifiers early and store them globally
        try {
          if (isMounted) {
            setLoadingText('Initializing device...');
          }
          
          const identifiers = await NativeModules.DomainUtils.getDeviceIdentifiers();
          await LogUtils.writeDebugToFile(`Device identifiers initialized: deviceId=${identifiers.deviceId}, macAddress=${identifiers.macAddress}`);
        } catch (identifierError: any) {
          await LogUtils.writeDebugToFile(`Error initializing device identifiers: ${identifierError.message}`);
        }

        // First authenticate with stored credentials
        if (isMounted) {
          setLoadingText('Authenticating...');
          await LogUtils.writeDebugToFile('Attempting authentication...');
        }
        
        // Use the regular authentication system, not gotu credentials
        let authSuccess = false;
        let authAttempts = 0;
        const maxAuthAttempts = 3;
        
        while (!authSuccess && authAttempts < maxAuthAttempts) {
          try {
            authAttempts++;
            await LogUtils.writeDebugToFile(`Authentication attempt ${authAttempts}/${maxAuthAttempts}`);
            
            // This uses the existing authentication system with stored credentials
            await NativeModules.DomainUtils.authenticate(null, null, null);
            await LogUtils.writeDebugToFile('Authentication successful');
            authSuccess = true;
          } catch (authError: any) {
            await LogUtils.writeDebugToFile(`Authentication error on attempt ${authAttempts}: ${authError.message}`);
            
            // Log more detailed error information
            if (authError.code) {
              await LogUtils.writeDebugToFile(`Error code: ${authError.code}`);
            }
            
            // Implement exponential backoff between retries
            if (authAttempts < maxAuthAttempts) {
              const backoffDelay = Math.pow(2, authAttempts - 1) * 1000; // 1s, 2s, 4s
              await LogUtils.writeDebugToFile(`Retrying authentication in ${backoffDelay}ms...`);
              await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }
          }
        }
        
        if (!authSuccess) {
          await LogUtils.writeDebugToFile('All authentication attempts failed, proceeding with limited functionality');
          if (isMounted) {
            setLoadingText('Authentication failed. Some features may be limited.');
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        // Update map
        try {
          if (isMounted) {
            setLoadingText('Updating map...');
            await LogUtils.writeDebugToFile('Updating map...');
          }
          
          // Only try to update map if authentication was successful
          if (authSuccess) {
            // Check if map is already being downloaded from authenticate
            // The authenticate method already triggers map download, so we'll just wait here
            await LogUtils.writeDebugToFile('Authentication successful - map download was triggered during authentication');
            
            // Wait a reasonable amount of time for the map download to progress
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // No need to explicitly call downloadAndProcessMap() here as it was initiated during authentication
            await LogUtils.writeDebugToFile('Map update complete');
          } else {
            await LogUtils.writeDebugToFile('Skipping map update due to authentication failure');
          }
        } catch (mapError: any) {
          await LogUtils.writeDebugToFile(`Map update error: ${mapError.message}, proceeding anyway`);
          if (isMounted) {
            setLoadingText('Map update failed. Using existing map.');
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }

        if (isMounted) {
          // Add a short delay before transition
          await new Promise(resolve => setTimeout(resolve, 1000));
          await LogUtils.writeDebugToFile('Initialization complete, transitioning to config screen...');
          
          // Create fade-out animation
          Animated.timing(opacity, {
            toValue: 0,
            duration: 500,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(() => {
            onFinish({ goToConfig: true });
          });
        }
      } catch (error: any) {
        if (isMounted) {
          const errorMessage = error.message || 'Error during initialization';
          await LogUtils.writeDebugToFile(`Error during initialization: ${errorMessage}`);
          console.error('Error during initialization:', error);
          setLoadingText(errorMessage);
          // Still finish after error, but with empty products
          setTimeout(() => {
            if (isMounted) {
              Animated.timing(opacity, {
                toValue: 0,
                duration: 500,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }).start(() => {
                onFinish({ goToConfig: true });
              });
            }
          }, 2000);
        }
      }
    };

    waitForDock();

    timeoutId = setTimeout(() => {
      if (isMounted) {
        setLoadingText('Loading timeout reached');
        Animated.timing(opacity, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          onFinish({ goToConfig: true });
        });
      }
    }, 30000);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [opacity, onFinish]);

  return (
    <View style={styles.background}>
      <Animated.View style={[styles.container, { opacity }]}>
        <View style={styles.topContainer}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/Auki Logo Black.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.welcomeText}>Welcome to Auki Robotics</Text>
          <Text style={styles.loadingText}>{loadingText}</Text>
        </View>
        <View style={styles.padbotImageContainer}>
          <Image
            source={require('../assets/padbot.jpg')}
            style={styles.padbotImage}
            resizeMode="contain"
          />
        </View>
      </Animated.View>
      <Modal
        visible={showDockDialog}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {}}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalText}>Please return the robot to its docking station.</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topContainer: {
    alignItems: 'center',
    width: '80%',
    marginBottom: 40,
  },
  logoContainer: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  welcomeText: {
    color: '#101010',
    fontSize: 24,
    textAlign: 'center',
  },
  loadingText: {
    color: '#101010',
    fontSize: 24,
    textAlign: 'center',
  },
  padbotImageContainer: {
    width: '50%',
    aspectRatio: 4,
  },
  padbotImage: {
    width: '100%',
    height: '100%',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 30,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalText: {
    fontSize: 22,
    color: '#101010',
    textAlign: 'center',
  },
});

export default SplashScreen; 
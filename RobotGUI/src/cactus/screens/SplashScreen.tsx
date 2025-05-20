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
import DeviceStorage from '../../utils/deviceStorage';

interface SplashScreenProps {
  onFinish: (products: any[], options?: { goToConfig?: boolean }) => void;
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
          onFinish([], { goToConfig: true });
          return false;
        }
        return true;
      } catch (e) {
        onFinish([], { goToConfig: true });
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
        
        // Load products first
        if (isMounted) {
          setLoadingText('Loading products...');
          await LogUtils.writeDebugToFile('Loading products...');
        }
        const products = await NativeModules.CactusUtils.getProducts();
        const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name));
        await LogUtils.writeDebugToFile(`Loaded ${products.length} products`);
        
        // Then check POIs against config
        if (isMounted) {
          setLoadingText('Validating waypoints...');
          await LogUtils.writeDebugToFile('Validating waypoints...');
        }
        try {
          // Get config first to know what POIs we expect
          const config = await NativeModules.DomainUtils.getConfig();
          await LogUtils.writeDebugToFile(`Config waypoints: ${JSON.stringify(config.patrol_points)}`);
          
          // Get waypoints from config
          const configPatrolPoints = Array.isArray(config.patrol_points) ? config.patrol_points : [];
          
          // Get current POIs
          let pois = await NativeModules.SlamtecUtils.getPOIs();
          await LogUtils.writeDebugToFile(`Initial POIs fetch: ${JSON.stringify(pois)}`);
          
          // If POIs is empty, wait a moment and try again as they might be initializing
          if (Array.isArray(pois) && pois.length === 0) {
            await LogUtils.writeDebugToFile('No POIs found, waiting for initialization...');
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for POIs to initialize
            pois = await NativeModules.SlamtecUtils.getPOIs();
            await LogUtils.writeDebugToFile(`POIs after initialization: ${JSON.stringify(pois)}`);
          }
          
          // POIs response is an array of POI objects with metadata.display_name
          const poiNames = Array.isArray(pois) ? pois.map((poi: any) => poi.metadata?.display_name?.trim()) : [];
          await LogUtils.writeDebugToFile(`Found POI names: ${JSON.stringify(poiNames)}`);
          
          // Filter out any undefined or empty names
          const validPoiNames = poiNames.filter((name): name is string => 
            typeof name === 'string' && name.length > 0
          );
          await LogUtils.writeDebugToFile(`Valid POI names: ${JSON.stringify(validPoiNames)}`);
          
          // Check for mismatches
          const extraPOIs = validPoiNames.filter((name: string) => 
            !configPatrolPoints.find((cp: { name: string }) => cp.name === name)
          );
          const missingPoints = configPatrolPoints.filter((cp: { name: string }) => 
            !validPoiNames.includes(cp.name)
          );
          
          if (extraPOIs.length > 0 || missingPoints.length > 0) {
            let errorMsg = '';
            if (extraPOIs.length > 0) {
              errorMsg += `Unexpected POIs found: ${extraPOIs.join(', ')}\n`;
            }
            if (missingPoints.length > 0) {
              errorMsg += `Missing waypoints: ${missingPoints.map((p: { name: string }) => p.name).join(', ')}`;
            }
            await LogUtils.writeDebugToFile(`POI validation error: ${errorMsg}`);
            
            // Clear and reinitialize POIs
            await LogUtils.writeDebugToFile('Clearing and reinitializing POIs...');
            if (isMounted) setLoadingText('Resetting waypoints...');
            
            await NativeModules.SlamtecUtils.clearAndInitializePOIs();
            await LogUtils.writeDebugToFile('POIs have been reset and reinitialized');
            
            // Verify the POIs again
            pois = await NativeModules.SlamtecUtils.getPOIs();
            await LogUtils.writeDebugToFile(`POIs after reset: ${JSON.stringify(pois)}`);
          } else {
            await LogUtils.writeDebugToFile('POI validation successful - all points match config');
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          await LogUtils.writeDebugToFile(`Waypoint validation error: ${errorMessage}`);
          if (isMounted) {
            setLoadingText(`Error validating waypoints: ${errorMessage}`);
            // Keep error visible for 5 seconds
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }

        if (isMounted) {
          // Add 1 second delay before transition
          await new Promise(resolve => setTimeout(resolve, 1000));
          await LogUtils.writeDebugToFile('Initialization complete, transitioning to main screen...');
          
          // Create fade-out animation
          Animated.timing(opacity, {
            toValue: 0,
            duration: 500,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(() => {
            onFinish(sortedProducts);
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
                onFinish([], { goToConfig: true });
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
          onFinish([], { goToConfig: true });
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
        <View style={styles.contentContainer}>
          <View style={styles.logoContainer}>
            <Image 
              source={require('../assets/app_icon.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.welcomeText}>
            Welcome to{'\n'}Cactus Assistant
          </Text>
          <Text style={styles.loadingText}>{loadingText}</Text>
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
    backgroundColor: '#404040',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    padding: 30,
    alignItems: 'center',
    width: '80%',
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
    color: 'rgb(0, 215, 68)',
    fontSize: 36,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 20,
  },
  loadingText: {
    color: 'rgb(0, 215, 68)',
    fontSize: 24,
    textAlign: 'center',
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
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Animated,
  Easing,
  NativeModules,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { LogUtils } from '../utils/logging';
import DeviceStorage from '../../utils/deviceStorage';

interface SplashScreenProps {
  onFinish: (products: any[], options?: { goToConfig?: boolean }) => void;
  isMainScreenReady?: boolean;
}

const SplashScreen = ({ onFinish, isMainScreenReady = false }: SplashScreenProps): React.JSX.Element => {
  const [loadingText, setLoadingText] = useState('Initializing...');
  const [showDockDialog, setShowDockDialog] = useState(false);
  const [isDocked, setIsDocked] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const isMounted = useRef<boolean>(true);
  const timeoutId = useRef<NodeJS.Timeout | undefined>(undefined);
  const pollInterval = useRef<NodeJS.Timeout | undefined>(undefined);
  const productsRef = useRef<any[]>([]);

  const checkDockStatus = async () => {
    try {
      const dockStatus = await NativeModules.SlamtecUtils.getDockStatus();
      await LogUtils.writeDebugToFile(`Dock status: ${JSON.stringify(dockStatus)}`);
      return dockStatus;
    } catch (error) {
      await LogUtils.writeDebugToFile(`Error checking dock status: ${error}`);
      return null;
    }
  };

  const checkCredentials = async () => {
    try {
      const hasCredentials = await NativeModules.GotuUtils.hasCredentials();
      await LogUtils.writeDebugToFile(`Has credentials: ${hasCredentials}`);
      return hasCredentials;
    } catch (error) {
      await LogUtils.writeDebugToFile(`Error checking credentials: ${error}`);
      return false;
    }
  };

  const waitForDock = async () => {
    let attempts = 0;
    const maxAttempts = 10;
    const checkInterval = 1000;

    while (attempts < maxAttempts && isMounted.current) {
      const dockStatus = await checkDockStatus();
      if (dockStatus?.is_docked) {
        await LogUtils.writeDebugToFile('Robot is docked, proceeding with initialization');
        setIsDocked(true);
        return true;
      }
      attempts++;
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    if (isMounted.current) {
      await LogUtils.writeDebugToFile('Robot not docked after maximum attempts');
      setShowDockDialog(true);
      return false;
    }
    return false;
  };

  const initialize = async () => {
    try {
      // Check credentials first
      const hasCredentials = await checkCredentials();
      if (!hasCredentials) {
        if (isMounted.current) {
          setLoadingText('No credentials found. Please configure the robot.');
          await new Promise(resolve => setTimeout(resolve, 2000));
          Animated.timing(opacity, {
            toValue: 0,
            duration: 500,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(() => {
            onFinish([], { goToConfig: true });
          });
          return;
        }
      }

      // Load and validate map
      if (isMounted.current) {
        setLoadingText('Loading map...');
        await LogUtils.writeDebugToFile('Loading map...');
      }

      try {
        await NativeModules.SlamtecUtils.loadMap();
        await LogUtils.writeDebugToFile('Map loaded successfully');
      } catch (mapError: any) {
        await LogUtils.writeDebugToFile(`Map load error: ${mapError.message}`);
        if (isMounted.current) {
          setLoadingText('Map update failed. Using existing map.');
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      // Load and validate waypoints
      try {
        if (isMounted.current) {
          setLoadingText('Validating waypoints...');
          await LogUtils.writeDebugToFile('Validating waypoints...');
        }
        
        const patrolPointsContent = await NativeModules.FileUtils.readFile('patrol_points.json');
        if (patrolPointsContent) {
          const patrolPoints = JSON.parse(patrolPointsContent);
          const formattedPoints = patrolPoints.patrol_points.map((point: any) => ({
            yaw: point.yaw,
            y: point.y,
            x: point.x,
            name: point.name
          }));
          await LogUtils.writeDebugToFile(`Patrol Points Configuration: ${JSON.stringify(formattedPoints)}`);

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
            !formattedPoints.find((cp: { name: string }) => cp.name === name)
          );
          const missingPoints = formattedPoints.filter((cp: { name: string }) => 
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
            if (isMounted.current) setLoadingText('Resetting waypoints...');
            
            await NativeModules.SlamtecUtils.clearAndInitializePOIs();
            await LogUtils.writeDebugToFile('POIs have been reset and reinitialized');
            
            // Verify the POIs again
            pois = await NativeModules.SlamtecUtils.getPOIs();
            await LogUtils.writeDebugToFile(`POIs after reset: ${JSON.stringify(pois)}`);
          } else {
            await LogUtils.writeDebugToFile('POI validation successful - all points match config');
          }
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await LogUtils.writeDebugToFile(`Waypoint validation error: ${errorMessage}`);
        if (isMounted.current) {
          setLoadingText(`Error validating waypoints: ${errorMessage}`);
          // Keep error visible for 5 seconds
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
       
      // Load items from Gotu endpoint
      if (isMounted.current) {
        setLoadingText('Loading items...');
        await LogUtils.writeDebugToFile('Loading Gotu items...');
      }
      
      try {
        const products = await NativeModules.GotuUtils.getItems();
        const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name));
        productsRef.current = sortedProducts;
        await LogUtils.writeDebugToFile(`Loaded ${products.length} items`);

        if (isMounted.current) {
          setLoadingText('Ready');
          await LogUtils.writeDebugToFile('Initialization complete, waiting for main screen...');
        }
      } catch (itemsError: any) {
        await LogUtils.writeDebugToFile(`Error loading items: ${itemsError.message}`);
        if (isMounted.current) {
          setLoadingText('Error loading items. Please restart the application.');
          setTimeout(() => {
            if (isMounted.current) {
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
    } catch (error: any) {
      if (isMounted.current) {
        const errorMessage = error.message || 'Error during initialization';
        await LogUtils.writeDebugToFile(`Error during initialization: ${errorMessage}`);
        console.error('Error during initialization:', error);
        setLoadingText(errorMessage);
        // Still finish after error, but with empty products
        setTimeout(() => {
          if (isMounted.current) {
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

  useEffect(() => {
    isMounted.current = true;

    waitForDock();

    timeoutId.current = setTimeout(() => {
      if (isMounted.current) {
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
      isMounted.current = false;
      if (timeoutId.current) clearTimeout(timeoutId.current);
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [opacity, onFinish]);

  // Watch for MainScreen ready state
  useEffect(() => {
    if (isMainScreenReady) {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        onFinish(productsRef.current);
      });
    }
  }, [isMainScreenReady, opacity, onFinish]);

  return (
    <View style={styles.background}>
      <Animated.View style={[styles.container, { opacity }]}>
        <View style={styles.contentContainer}>
          <View style={styles.logoContainer}>
            <Image 
              source={require('../assets/AppIcon_Gotu.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.welcomeText}>
            Welcome to{'\n'}Gotu
          </Text>
          <Text style={styles.loadingText}>{loadingText}</Text>
        </View>
      </Animated.View>
      <Modal
        visible={showDockDialog}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {}}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Robot Not Docked</Text>
            <Text style={styles.modalText}>
              Please dock the robot before starting the application.
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                setShowDockDialog(false);
                waitForDock();
              }}>
              <Text style={styles.modalButtonText}>Retry</Text>
            </TouchableOpacity>
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
    color: '#101010',
    fontSize: 36,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 20,
  },
  loadingText: {
    color: '#2670F8',
    fontSize: 24,
    textAlign: 'center',
  },
  modalContainer: {
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
  modalTitle: {
    fontSize: 22,
    color: '#101010',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalText: {
    fontSize: 22,
    color: '#101010',
    textAlign: 'center',
  },
  modalButton: {
    backgroundColor: '#2670F8',
    padding: 15,
    borderRadius: 5,
  },
  modalButtonText: {
    fontSize: 22,
    color: 'white',
    fontWeight: 'bold',
  },
});

export default SplashScreen; 
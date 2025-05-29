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
  const [isMounted, setIsMounted] = useState(true);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let pollInterval: NodeJS.Timeout;

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
        if (isMounted) {
          setLoadingText('Initializing...');
          await LogUtils.writeDebugToFile('Starting initialization...');
        }

        // Then check POIs against config
        if (isMounted) {
          setLoadingText('Validating waypoints...');
          await LogUtils.writeDebugToFile('Validating waypoints...');
          
          let formattedPoints: any[] = [];
          const patrolPointsContent = await NativeModules.FileUtils.readFile('patrol_points.json');
          if (patrolPointsContent) {
            const patrolPoints = JSON.parse(patrolPointsContent);
            formattedPoints = patrolPoints.patrol_points.map((point: any) => ({
              yaw: point.yaw,
              y: point.y,
              x: point.x,
              name: point.name
            }));
            await LogUtils.writeDebugToFile(`Patrol Points Configuration: ${JSON.stringify(formattedPoints)}`);
          }

          try {
            const config = await NativeModules.DomainUtils.getConfig();
            // Use formattedPoints instead of config.patrol_points
            const configPatrolPoints = formattedPoints;
            await LogUtils.writeDebugToFile(`Config waypoints: ${JSON.stringify(configPatrolPoints)}`);
            
            // Get waypoints from config
            const configPatrolPointsArray = Array.isArray(configPatrolPoints) ? configPatrolPoints : [];
            
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
              !configPatrolPointsArray.find((cp: { name: string }) => cp.name === name)
            );
            const missingPoints = configPatrolPointsArray.filter((cp: { name: string }) => 
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
        }

        // Continue with other initialization...
        if (isMounted) {
          setLoadingText('Initialization complete');
          await LogUtils.writeDebugToFile('Initialization complete');
          onFinish();
        }
      } catch (error) {
        if (isMounted) {
          setLoadingText(`Error: ${error instanceof Error ? error.message : String(error)}`);
          await LogUtils.writeDebugToFile(`Initialization error: ${error instanceof Error ? error.message : String(error)}`);
          // Keep error visible for 5 seconds
          await new Promise(resolve => setTimeout(resolve, 5000));
          onFinish();
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
      setIsMounted(false);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [opacity, onFinish]);

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
# Cactus MainScreen Patrol Mode Updates

## 1. Pose Polling System

### Add Refs
```typescript
// Add with other refs at top of component
const posePollingRef = useRef<NodeJS.Timeout | null>(null);
const poseReportingCooldownRef = useRef(false);
let poseUploadInProgress = false;
```

### Add Coordinate Transformation Utilities
```typescript
// Helper function to convert from yaw to quaternion
const yawToQuaternion = (yaw: number) => {
  const halfYaw = yaw / 2;
  return {
    w: Math.cos(halfYaw),
    x: 0,
    y: 0,
    z: Math.sin(halfYaw)
  };
};

// Helper function to transform coordinates
const transformCoordinates = (x: number, y: number, yaw: number) => {
  const z = -y; // Invert y to get z
  const quaternion = yawToQuaternion(yaw);
  return {
    x,
    y: 0,
    z,
    quaternion,
    originalX: x,
    originalY: y,
    originalYaw: yaw
  };
};
```

### Add Pose Polling Functions
```typescript
const startPosePolling = async () => {
  await stopPosePolling();
  posePollingShouldRun = true;
  await LogUtils.writeDebugToFile('[POSE POLLING] Wait-for-completion polling started');
  pollPoseLoop();
};

const stopPosePolling = async () => {
  posePollingShouldRun = false;
  await LogUtils.writeDebugToFile('[POSE POLLING] Wait-for-completion polling stopped');
  return true;
};

const pollPoseLoop = async () => {
  while (posePollingShouldRun) {
    await readRobotPose();
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1s between polls
  }
  await LogUtils.writeDebugToFile('[POSE POLLING] Polling loop exited');
};

const readRobotPose = async () => {
  if (posePollingInProgress) {
    await LogUtils.writeDebugToFile('[POSE POLLING] Overlapping readRobotPose call detected!');
  }
  posePollingInProgress = true;
  await LogUtils.writeDebugToFile('[POSE POLLING] readRobotPose started');
  try {
    if (currentNavigationStatusRef.current !== NavigationStatus.NAVIGATING && 
        currentNavigationStatusRef.current !== NavigationStatus.PATROL) {
      await stopPosePolling();
      await LogUtils.writeDebugToFile(`[POSE POLLING] Auto-stopped polling - not in NAVIGATING/PATROL state`);
      posePollingInProgress = false;
      return;
    }
    if (poseReportingCooldownRef.current) {
      posePollingInProgress = false;
      return;
    }
    if (poseUploadInProgress) {
      await LogUtils.writeDebugToFile('[POSE POLLING] Skipping pose upload: previous upload still in progress');
      posePollingInProgress = false;
      return;
    }
    poseUploadInProgress = true;
    const pose = await NativeModules.SlamtecUtils.getCurrentPose();
    if (pose) {
      const timestamp = Date.now();
      const transformedPose = transformCoordinates(pose.x, pose.y, pose.yaw);
      
      const timestampNano = BigInt(timestamp) * BigInt(1000000);
      const identifiers = DeviceStorage.getIdentifiers();
      
      if (!DeviceStorage.hasIdentifiers()) {
        await LogUtils.writeDebugToFile("[POSE] Error: Device identifiers not found in global storage!");
      }
      
      const poseData = {
        name: "PadBot",
        device_id: identifiers.deviceId || "unknown_device_id",
        device_type: "padbot-robot-w3",
        timestamp: timestampNano.toString(),
        pose: {
          px: transformedPose.x,
          py: transformedPose.y,
          pz: transformedPose.z,
          rx: transformedPose.quaternion.x,
          ry: transformedPose.quaternion.z,
          rz: transformedPose.quaternion.y,
          rw: transformedPose.quaternion.w
        },
        mac_address: identifiers.macAddress || "unknown_mac_address"
      };

      try {
        const robotPoseDataId = DeviceStorage.getIdentifiers().robotPoseDataId;
        if (robotPoseDataId) {
          await NativeModules.DomainUtils.writeRobotPose(JSON.stringify(poseData), "PUT", robotPoseDataId);
        } else {
          const result = await NativeModules.DomainUtils.writeRobotPose(JSON.stringify(poseData), "POST", null);
          if (result.dataId) {
            DeviceStorage.setRobotPoseDataId(result.dataId);
          }
        }
      } catch (error: any) {
        if (!poseReportingCooldownRef.current) {
          poseReportingCooldownRef.current = true;
          setTimeout(() => {
            poseReportingCooldownRef.current = false;
          }, 10000);
          await LogUtils.writeDebugToFile(`[POSE POLLING] Error sending pose data: ${error.message}`);
        }
      }
    }
    poseUploadInProgress = false;
  } catch (error: any) {
    await LogUtils.writeDebugToFile(`[POSE POLLING] Error in readRobotPose: ${error.message}`);
    poseUploadInProgress = false;
  }
  await LogUtils.writeDebugToFile('[POSE POLLING] readRobotPose finished');
  posePollingInProgress = false;
};
```

### Add Navigation Status Effect
```typescript
// Add ref for navigation status
const currentNavigationStatusRef = useRef(NavigationStatus.IDLE);

// Add effect to handle navigation status changes
useEffect(() => {
  const handleNavigationStateChange = async () => {
    await LogUtils.writeDebugToFile(`Navigation state changed to: ${NavigationStatus[navigationStatus]}`);
    
    if (navigationStatus === NavigationStatus.NAVIGATING || 
        navigationStatus === NavigationStatus.PATROL) {
      if (!posePollingRef.current) {
        await LogUtils.writeDebugToFile(`Starting polling in ${NavigationStatus[navigationStatus]} state`);
        await startPosePolling();
      }
    } else {
      await stopPosePolling();
      await LogUtils.writeDebugToFile(`Polling stopped in ${NavigationStatus[navigationStatus]} state`);
    }
  };
  
  handleNavigationStateChange();
  
  return () => {
    if (posePollingRef.current) {
      clearInterval(posePollingRef.current);
      posePollingRef.current = null;
      LogUtils.writeDebugToFile('Robot pose polling stopped on cleanup');
    }
  };
}, [navigationStatus]);

// Update ref when navigation status changes
useEffect(() => {
  currentNavigationStatusRef.current = navigationStatus;
  LogUtils.writeDebugToFile(`Navigation status updated to: ${NavigationStatus[navigationStatus]}`);
}, [navigationStatus]);
```

## 2. Robot Base Error Handling

### Add Error Types and Constants
```typescript
const RobotBaseErrorTypes = {
  NAVIGATION_TIMEOUT: 'navigation_timeout',
  PATH_BLOCKED: 'path_blocked',
  HARDWARE_FAILURE: 'hardware_failure',
  LOCALIZATION_LOST: 'localization_lost',
  COMMUNICATION_ERROR: 'communication_error',
  UNKNOWN_ERROR: 'unknown_error'
};

const MAX_RECOVERY_ATTEMPTS = 3;
```

### Add State
```typescript
const [robotBaseStatus, setRobotBaseStatus] = useState<string>('ok');
const [recoveryAttempts, setRecoveryAttempts] = useState<number>(0);
```

### Add Error Handling Functions
```typescript
const classifyErrorType = (errorMessage: string): string => {
  const lowerCaseError = errorMessage.toLowerCase();
  
  if (lowerCaseError.includes('timeout') || lowerCaseError.includes('timed out')) {
    return RobotBaseErrorTypes.NAVIGATION_TIMEOUT;
  } else if (lowerCaseError.includes('obstacle') || lowerCaseError.includes('blocked') || 
             lowerCaseError.includes('path') || lowerCaseError.includes('cannot find path')) {
    return RobotBaseErrorTypes.PATH_BLOCKED;
  } else if (lowerCaseError.includes('hardware') || lowerCaseError.includes('motor') || 
             lowerCaseError.includes('wheel') || lowerCaseError.includes('lidar')) {
    return RobotBaseErrorTypes.HARDWARE_FAILURE;
  } else if (lowerCaseError.includes('localization') || lowerCaseError.includes('lost') || 
             lowerCaseError.includes('position')) {
    return RobotBaseErrorTypes.LOCALIZATION_LOST;
  } else if (lowerCaseError.includes('communication') || lowerCaseError.includes('connection') || 
             lowerCaseError.includes('disconnected')) {
    return RobotBaseErrorTypes.COMMUNICATION_ERROR;
  } else {
    return RobotBaseErrorTypes.UNKNOWN_ERROR;
  }
};

const checkRobotBaseHealth = async (): Promise<boolean> => {
  try {
    if (NativeModules.SlamtecUtils && typeof NativeModules.SlamtecUtils.checkConnection === 'function') {
      const details = await NativeModules.SlamtecUtils.checkConnection();
      await LogUtils.writeDebugToFile(`Health check - Robot status: ${JSON.stringify(details)}`);
      
      setRobotBaseStatus(details.status || 'unknown');
      return details.slamApiAvailable === true;
    } else {
      await LogUtils.writeDebugToFile(`Health check skipped - checkConnection method not available`);
      setRobotBaseStatus('unknown');
      return true;
    }
  } catch (error: any) {
    await LogUtils.writeDebugToFile(`Health check failed: ${error.message}`);
    setRobotBaseStatus('error');
    return false;
  }
};

const handleRobotBaseError = async (errorMessage: string, errorType: string = RobotBaseErrorTypes.UNKNOWN_ERROR) => {
  await LogUtils.writeDebugToFile(`Robot base error: ${errorMessage} (Type: ${errorType})`);
  await LogUtils.writeDebugToFile(`Current navigation status: ${NavigationStatus[currentNavigationStatusRef.current]}`);
  await LogUtils.writeDebugToFile(`Recovery attempts: ${recoveryAttempts}`);
  
  try {
    const pose = await NativeModules.SlamtecUtils.getCurrentPose();
    await LogUtils.writeDebugToFile(`Robot pose at error: ${JSON.stringify(pose)}`);
    
    const details = await NativeModules.SlamtecUtils.checkConnection();
    await LogUtils.writeDebugToFile(`Robot status at error: ${JSON.stringify(details)}`);
    
    if (NativeModules.SlamtecUtils.getBatteryInfo) {
      const battery = await NativeModules.SlamtecUtils.getBatteryInfo();
      await LogUtils.writeDebugToFile(`Battery info at error: ${JSON.stringify(battery)}`);
    }
  } catch (diagError: any) {
    await LogUtils.writeDebugToFile(`Error collecting diagnostic info: ${diagError.message}`);
  }
  
  if (recoveryAttempts < MAX_RECOVERY_ATTEMPTS) {
    await LogUtils.writeDebugToFile(`Attempting recovery (attempt ${recoveryAttempts + 1}/${MAX_RECOVERY_ATTEMPTS})`);
    
    setRecoveryAttempts(prev => prev + 1);
    
    try {
      await NativeModules.SlamtecUtils.stopNavigation();
      await LogUtils.writeDebugToFile('Stopped current navigation for recovery');
      
      let recoveryStrategy = '';
      
      switch (errorType) {
        case RobotBaseErrorTypes.PATH_BLOCKED:
          recoveryStrategy = 'Wait and retry navigation';
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          if (selectedProduct) {
            await LogUtils.writeDebugToFile('Retrying navigation after path blocked');
            handleProductSelect(selectedProduct);
          } else {
            handleReturnToList();
          }
          break;
          
        case RobotBaseErrorTypes.LOCALIZATION_LOST:
          recoveryStrategy = 'Attempt relocalization';
          if (NativeModules.SlamtecUtils.relocalize) {
            await LogUtils.writeDebugToFile('Attempting relocalization');
            await NativeModules.SlamtecUtils.relocalize();
            
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            if (selectedProduct) {
              await LogUtils.writeDebugToFile('Retrying navigation after relocalization');
              handleProductSelect(selectedProduct);
            } else {
              handleReturnToList();
            }
          } else {
            handleReturnToList();
          }
          break;
          
        case RobotBaseErrorTypes.NAVIGATION_TIMEOUT:
        case RobotBaseErrorTypes.COMMUNICATION_ERROR:
          recoveryStrategy = 'Reset robot connection';
          if (NativeModules.SlamtecUtils.resetConnection) {
            await LogUtils.writeDebugToFile('Resetting robot connection');
            await NativeModules.SlamtecUtils.resetConnection();
            
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            if (selectedProduct) {
              await LogUtils.writeDebugToFile('Retrying navigation after connection reset');
              handleProductSelect(selectedProduct);
            } else {
              handleReturnToList();
            }
          } else {
            handleReturnToList();
          }
          break;
          
        default:
          recoveryStrategy = 'Return to list';
          handleReturnToList();
          break;
      }
      
      await LogUtils.writeDebugToFile(`Applied recovery strategy: ${recoveryStrategy}`);
    } catch (recoveryError: any) {
      await LogUtils.writeDebugToFile(`Recovery attempt failed: ${recoveryError.message}`);
      
      setNavigationStatus(NavigationStatus.ERROR);
      setNavigationError(`Navigation failed: ${errorMessage}. Recovery failed.`);
    }
  } else {
    await LogUtils.writeDebugToFile('Maximum recovery attempts reached, showing error to user');
    setNavigationStatus(NavigationStatus.ERROR);
    setNavigationError(`Navigation failed: ${errorMessage}. Please try again.`);
    
    setRecoveryAttempts(0);
  }
};
```

## 3. Product Interface Updates

### Update Product Interface
```typescript
interface Product {
  id: string;
  name: string;
  eslCode: string;
  description?: string;
  image?: string;
  pose: {
    x: number;
    y: number;
    z: number;
    yaw?: number;
    px?: number;
    py?: number;
    pz?: number;
  };
}
```

### Update Product Rendering
```typescript
const renderProductItem = ({ item }: { item: Product }) => {
  const imageUrl = item.id && item.image ? 
    `https://conference-backend-0.aukiverse.com/api/files/gkzgdbw8bnw0bs7/${item.id}/${item.image}` : null;
  
  return (
    <View style={styles.productItem}>
      <View style={styles.productContent}>
        <View style={styles.productTextContainer}>
          <Text style={styles.productText}>{item.name}</Text>
          <Text style={styles.productDescription}>{item.description || 'No description available'}</Text>
          <TouchableOpacity 
            style={styles.findButton}
            onPress={() => handleProductSelect(item)}
          >
            <Text style={styles.findButtonText}>Find</Text>
            <Text style={{color: '#FFFFFF', fontWeight: 'bold'}}>→</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.productImageContainer}>
          {imageUrl ? (
            <Image 
              source={{ uri: imageUrl }} 
              style={styles.productImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.placeholderImage}>
              <Text style={styles.placeholderText}>{item.name.charAt(0)}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};
```

## 4. Touch Handling

### Add Touch Debouncing
```typescript
const isTouchDebouncedRef = useRef(false);

// Update SafeAreaView onTouchStart
<SafeAreaView 
  style={styles.container}
  onTouchStart={async () => {
    if (isTouchDebouncedRef.current) return;
    isTouchDebouncedRef.current = true;
    setTimeout(() => { isTouchDebouncedRef.current = false; }, 1000);

    if (!isPatrollingRef.current && navigationStatus !== NavigationStatus.PATROL) {
      resetInactivityTimer()
        .catch(err => console.error('Error resetting inactivity timer:', err));
    } else if (isPatrollingRef.current && navigationStatus === NavigationStatus.PATROL) {
      startInactivityTimer();
    }
  }}
>
```

## 5. UI Components

### Add Return to Charger Modal
```typescript
<Modal
  visible={isReturningToCharger}
  transparent={true}
  animationType="fade"
>
  <View style={styles.modalOverlay}>
    <View style={styles.modalContent}>
      <Text style={styles.modalTitle}>Returning to Charger</Text>
      <Text style={styles.modalText}>The robot is returning to the charging dock.</Text>
    </View>
  </View>
</Modal>
```

### Add New Styles
```typescript
const styles = StyleSheet.create({
  // ... existing styles ...
  
  productContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productTextContainer: {
    flex: 3,
    paddingRight: 16,
  },
  productDescription: {
    color: '#596168',
    fontSize: 15,
    marginBottom: 12,
    fontFamily: 'DM Sans',
  },
  findButton: {
    backgroundColor: '#2670F8',
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  findButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    marginRight: 4,
    fontFamily: 'DM Sans',
  },
  productImageContainer: {
    width: 100,
    height: 100,
    borderRadius: 8,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  placeholderText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  modalText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
```

## 6. Battery Monitoring System

### Add Battery State and Refs
```typescript
// Add with other state declarations
const [batteryLevel, setBatteryLevel] = useState<number>(100);
const [isLowBatteryAlertShown, setIsLowBatteryAlertShown] = useState(false);
const [isReturningToCharger, setIsReturningToCharger] = useState(false);
const returnToChargerAlertRef = useRef<{ dismiss: () => void } | null>(null);
const batteryMonitoringInitializedRef = useRef(false);
```

### Add Battery Monitoring Functions
```typescript
// Function to handle battery status updates
const handleBatteryStatusUpdate = async (event: any) => {
  await LogUtils.writeDebugToFile(`[BATTERY] Battery status update event received`);

  // Get power status first as it's our source of truth
  try {
    const powerStatus = await NativeModules.SlamtecUtils.getPowerStatus();
    await LogUtils.writeDebugToFile(`[BATTERY] Power status response: ${JSON.stringify(powerStatus)}`);
    
    // Set battery level from power status immediately
    setBatteryLevel(powerStatus.batteryPercentage);
    await LogUtils.writeDebugToFile(`[BATTERY] Battery level updated to: ${powerStatus.batteryPercentage}%`);
    
    // Only proceed if not on dock AND battery is low
    if (powerStatus.dockingStatus !== 'on_dock' && powerStatus.batteryPercentage <= 20 && !isReturningToCharger) {
      setIsReturningToCharger(true);
      LogUtils.writeDebugToFile('Initiating return to charger due to low battery');
      
      // Cancel any ongoing patrol
      if (isPatrolling) {
        LogUtils.writeDebugToFile('Cancelling ongoing patrol due to low battery');
        await cancelPatrol('battery_return');
      }

      // Reset navigation status and start going home
      setNavigationStatus(NavigationStatus.NAVIGATING);
      await NativeModules.SlamtecUtils.goHome();
      
      // Wait for arrival at dock
      const checkDockStatus = async () => {
        try {
          const powerStatus = await NativeModules.SlamtecUtils.getPowerStatus();
          LogUtils.writeDebugToFile('Checking dock status: ' + JSON.stringify(powerStatus));
          
          if (powerStatus.dockingStatus === 'on_dock') {
            setIsReturningToCharger(false);
            setNavigationStatus(NavigationStatus.IDLE);
            LogUtils.writeDebugToFile('Robot docked successfully');
          } else {
            // Check again in 5 seconds
            setTimeout(checkDockStatus, 5000);
          }
        } catch (error) {
          console.error('Error checking dock status:', error);
          LogUtils.writeDebugToFile('Error checking dock status: ' + error);
        }
      };
      
      // Start checking dock status
      checkDockStatus();
    }
  } catch (error) {
    console.error('Error checking power status:', error);
    LogUtils.writeDebugToFile('Error checking power status: ' + error);
  }
};

// Add effect to start battery monitoring
useEffect(() => {
  const initializeBatteryMonitoring = async () => {
    // Skip if already initialized
    if (batteryMonitoringInitializedRef.current) {
      await LogUtils.writeDebugToFile('Battery monitoring already initialized, skipping');
      return;
    }

    try {
      // Check if BatteryMonitor module exists
      if (!NativeModules.BatteryMonitor) {
        await LogUtils.writeDebugToFile('BatteryMonitor module not found');
        return;
      }

      // Start battery monitoring
      await LogUtils.writeDebugToFile('Starting battery monitoring...');
      NativeModules.BatteryMonitor.startMonitoring();
      
      // Add event listener for battery updates
      const eventEmitter = new NativeEventEmitter(NativeModules.BatteryMonitor);
      const subscription = eventEmitter.addListener('BatteryStatusUpdate', handleBatteryStatusUpdate);
      
      await LogUtils.writeDebugToFile('Battery monitoring initialized successfully');
      batteryMonitoringInitializedRef.current = true;
      
      // Return cleanup function
      return () => {
        // Clean up
        if (NativeModules.BatteryMonitor) {
          NativeModules.BatteryMonitor.stopMonitoring();
        }
        subscription.remove();
        LogUtils.writeDebugToFile('Battery monitoring stopped');
        batteryMonitoringInitializedRef.current = false;
      };
    } catch (error: any) {
      await LogUtils.writeDebugToFile(`Error initializing battery monitoring: ${error.message}`);
    }
  };

  // Call initializeBatteryMonitoring and store the cleanup function
  const cleanup = initializeBatteryMonitoring();
  
  // Return cleanup function from useEffect
  return () => {
    if (cleanup) {
      cleanup.then(cleanupFn => {
        if (cleanupFn) cleanupFn();
      });
    }
  };
}, []);
```

## Implementation Notes
1. Each section should be implemented and tested individually
2. Maintain existing functionality while adding new features
3. Test thoroughly after each change
4. Keep existing battery monitoring and patrol points loading
5. Preserve existing token validation and refresh logic
6. Battery monitoring initialization is now properly tracked with a ref to prevent duplicate initialization
7. Battery status updates are logged with a cleaner format without stack traces
8. Return to charger functionality is integrated with patrol mode
9. All battery-related state changes are properly logged for debugging 
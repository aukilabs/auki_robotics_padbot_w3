import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  NativeModules,
  BackHandler,
  NativeEventEmitter,
} from 'react-native';
import { LogUtils } from '../utils/logging';

interface MainScreenProps {
  onClose: () => void;
  onConfigPress: () => void;
  initialProducts: any[];
}

interface Product {
  name: string;
  eslCode: string;
  pose: {
    x: number;
    y: number;
    z: number;
    yaw?: number;  // Optional yaw value
    px?: number;   // Alternative position format
    py?: number;
    pz?: number;
  };
}

// Navigation status states
enum NavigationStatus {
  IDLE,
  NAVIGATING,
  ARRIVED,
  ERROR
}

const MainScreen = ({ onClose, onConfigPress, initialProducts }: MainScreenProps): React.JSX.Element => {
  const [searchText, setSearchText] = useState('');
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>(initialProducts);
  const [isLoading, setIsLoading] = useState(false);
  const [navigationStatus, setNavigationStatus] = useState<NavigationStatus>(NavigationStatus.IDLE);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [navigationError, setNavigationError] = useState<string>('');
  
  // Add state to track if patrol is active - start with true to ensure patrol begins
  const [isPatrolling, setIsPatrolling] = useState(true);
  
  // Store patrol state in a ref to access in useEffect cleanup
  const isPatrollingRef = useRef(true);
  
  // Add ref to track if navigation has been cancelled
  const navigationCancelledRef = useRef(false);
  
  // Update ref when state changes
  useEffect(() => {
    isPatrollingRef.current = isPatrolling;
    LogUtils.writeDebugToFile(`Patrol state changed to: ${isPatrolling ? 'active' : 'inactive'}`);
  }, [isPatrolling]);

  // Handle hardware back button (Android)
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });

    // Add event listener for SlamtecDebug events
    const eventEmitter = new NativeEventEmitter(NativeModules.SlamtecUtils);
    const subscription = eventEmitter.addListener('SlamtecDebug', (event) => {
      if (event.type === 'debug') {
        LogUtils.writeDebugToFile(event.message);
      }
    });

    return () => {
      backHandler.remove();
      subscription.remove();
    };
  }, []);

  // Add timer to navigate through all patrol points
  useEffect(() => {
    // Log that we're initializing the patrol sequence
    LogUtils.writeDebugToFile('Initializing patrol sequence');
    
    // Ensure patrol is active at the start
    setIsPatrolling(true);
    isPatrollingRef.current = true;
    
    // Reset navigation cancelled flag
    navigationCancelledRef.current = false;
    
    const patrolPoints = [
      { name: "Patrol Point 1", x: -1.14, y: 2.21, yaw: 3.14 },
      { name: "Patrol Point 2", x: -6.11, y: 2.35, yaw: -1.57 },
      { name: "Patrol Point 3", x: -6.08, y: 0.05, yaw: 0 },
      { name: "Patrol Point 4", x: -1.03, y: 0.01, yaw: 1.57 }
    ];

    let currentPointIndex = 0;
    let isMounted = true;

    const navigateToNextPoint = async () => {
      // Don't continue if patrol has been cancelled or component unmounted
      if (!isPatrollingRef.current || !isMounted || navigationCancelledRef.current) {
        await LogUtils.writeDebugToFile('Patrol cancelled or component unmounted, stopping sequence');
        return;
      }
      
      if (currentPointIndex < patrolPoints.length) {
        const point = patrolPoints[currentPointIndex];
        await LogUtils.writeDebugToFile(`Starting navigation to ${point.name}`);
        try {
          // Don't update state if component unmounted or patrol cancelled
          if (!isPatrollingRef.current || !isMounted || navigationCancelledRef.current) return;
          
          setNavigationStatus(NavigationStatus.NAVIGATING);
          setSelectedProduct({
            name: point.name,
            eslCode: `PP${currentPointIndex + 1}`,
            pose: {
              x: point.x,
              y: point.y,
              z: 0,
              yaw: point.yaw
            }
          });
          
          await NativeModules.SlamtecUtils.navigate(
            point.x,
            point.y,
            point.yaw
          );
          
          // Don't update state if component unmounted or patrol cancelled
          if (!isPatrollingRef.current || !isMounted || navigationCancelledRef.current) return;
          
          await LogUtils.writeDebugToFile(`Navigation to ${point.name} completed`);
          setNavigationStatus(NavigationStatus.ARRIVED);
          currentPointIndex++;
          
          // Move to next point immediately - no timer needed
          // This will only happen after the previous navigation completes
          navigateToNextPoint();
        } catch (error: any) {
          // Don't update state if component unmounted or patrol cancelled
          if (!isPatrollingRef.current || !isMounted || navigationCancelledRef.current) return;
          
          await LogUtils.writeDebugToFile(`Error during navigation to ${point.name}: ${error.message}`);
          setNavigationStatus(NavigationStatus.ERROR);
          setNavigationError(error.message || 'Navigation failed');
        }
      } else {
        // All points visited, return home
        if (isPatrollingRef.current && isMounted && !navigationCancelledRef.current) {
          await LogUtils.writeDebugToFile('All patrol points visited, returning home');
          await handleGoHome();
        }
      }
    };

    // Start patrolling after 5 seconds
    const startupTimer = setTimeout(() => {
      LogUtils.writeDebugToFile(`Starting patrol sequence, isPatrolling: ${isPatrollingRef.current}, isMounted: ${isMounted}`);
      if (isPatrollingRef.current && isMounted && !navigationCancelledRef.current) {
        LogUtils.writeDebugToFile('Patrol conditions met, initiating navigation sequence');
        navigateToNextPoint();
      } else {
        LogUtils.writeDebugToFile(`Patrol sequence not started: isPatrolling=${isPatrollingRef.current}, isMounted=${isMounted}, navigationCancelled=${navigationCancelledRef.current}`);
      }
    }, 5000);

    return () => {
      isMounted = false;
      clearTimeout(startupTimer);
      LogUtils.writeDebugToFile('Component unmounted, patrol cancelled');
    };
  }, []);

  // Filter products when search text changes
  useEffect(() => {
    if (searchText) {
      const filtered = products.filter(product => 
        product.name.toLowerCase().includes(searchText.toLowerCase()) ||
        product.eslCode.toLowerCase().includes(searchText.toLowerCase())
      ).sort((a, b) => a.name.localeCompare(b.name));
      setFilteredProducts(filtered);
    } else {
      setFilteredProducts([...products].sort((a, b) => a.name.localeCompare(b.name)));
    }
  }, [searchText, products]);

  const handleProductSelect = async (product: Product) => {
    // Cancel any ongoing patrol
    setIsPatrolling(false);
    await LogUtils.writeDebugToFile('Patrol sequence cancelled due to product selection');
    
    // Reset navigation cancelled flag
    navigationCancelledRef.current = false;
    
    await LogUtils.writeDebugToFile(`Starting navigation to: ${product.name}`);
    setSelectedProduct(product);
    setNavigationStatus(NavigationStatus.NAVIGATING);
    
    try {
      // Get product coordinates
      const poseZ = product.pose.pz || product.pose.z;  // Try pz first, then fall back to z
      const coords = {
        x: product.pose.px || product.pose.x,  // Try px first, then fall back to x
        y: 0,  // Keep robot at ground level
        z: poseZ
      };

      await LogUtils.writeDebugToFile(`Requesting navmesh coordinates for: ${JSON.stringify(coords)}`);
      const navTarget = await NativeModules.DomainUtils.getNavmeshCoord(coords);
      
      // Log the full structure of navTarget
      await LogUtils.writeDebugToFile(`Received navTarget: ${JSON.stringify(navTarget)}`);

      // Detailed validation
      if (!navTarget) {
        throw new Error('No navTarget received');
      }
      
      // Check if we're getting the expected structure or direct coordinates
      const targetCoords = navTarget.transformedCoords || navTarget;
      
      if (typeof targetCoords.x === 'undefined' || typeof targetCoords.z === 'undefined') {
        throw new Error(`Invalid coordinates: ${JSON.stringify(targetCoords)}`);
      }

      await LogUtils.writeDebugToFile(`Raw targetCoords: ${JSON.stringify(targetCoords, null, 2)}`);
      const navigationParams = {
        x: targetCoords.x,
        y: targetCoords.z,  // z is passed as y
        yaw: targetCoords.yaw || -Math.PI
      };
      await LogUtils.writeDebugToFile(`Calling navigateProduct with exact params: ${JSON.stringify(navigationParams, null, 2)}`);
      
      try {
        await LogUtils.writeDebugToFile('Starting navigation command...');
        await NativeModules.SlamtecUtils.navigateProduct(
          targetCoords.x,
          targetCoords.z,  // Pass z as y since the API expects (x,y) plane movement
          targetCoords.yaw || -Math.PI
        );
        
        // Check if navigation was cancelled during the process
        if (navigationCancelledRef.current) {
          await LogUtils.writeDebugToFile('Navigation was cancelled during product navigation, not updating status');
          return;
        }
        
        await LogUtils.writeDebugToFile('Navigation command completed');
        await LogUtils.writeDebugToFile('Setting navigation status to ARRIVED');
        setNavigationStatus(NavigationStatus.ARRIVED);
      } catch (error: any) {
        // Only update error state if navigation wasn't cancelled
        if (!navigationCancelledRef.current) {
          await LogUtils.writeDebugToFile('Navigation command failed');
          const errorMsg = error.message || 'Navigation failed. Please try again.';
          await LogUtils.writeDebugToFile(`Navigation API Error: ${JSON.stringify({
            code: error.code || 'unknown',
            message: errorMsg,
            raw: error
          }, null, 2)}`);
          setNavigationStatus(NavigationStatus.ERROR);
          setNavigationError(errorMsg);
        }
      }
    } catch (error: any) {
      // Only update error state if navigation wasn't cancelled
      if (!navigationCancelledRef.current) {
        const errorMsg = error.message || 'Navigation failed. Please try again.';
        await LogUtils.writeDebugToFile(`Error: ${errorMsg}`);
        setNavigationStatus(NavigationStatus.ERROR);
        setNavigationError(errorMsg);
      }
    }
  };

  const handleGoHome = async () => {
    // Cancel any ongoing patrol unless it's the final step of patrol
    setIsPatrolling(false);
    await LogUtils.writeDebugToFile('Patrol sequence cancelled due to manual Go Home');
    
    // Reset navigation cancelled flag
    navigationCancelledRef.current = false;
    
    setNavigationStatus(NavigationStatus.NAVIGATING);
    setSelectedProduct(null);
    
    try {
      await NativeModules.SlamtecUtils.goHome();
      
      // Only update state if navigation wasn't cancelled
      if (!navigationCancelledRef.current) {
        setNavigationStatus(NavigationStatus.IDLE);
      }
    } catch (error: any) {
      // Only update error state if navigation wasn't cancelled
      if (!navigationCancelledRef.current) {
        const errorMsg = error.message || 'Navigation to home failed. Please try again.';
        await LogUtils.writeDebugToFile(`Go Home error: ${errorMsg}`);
        setNavigationStatus(NavigationStatus.ERROR);
        setNavigationError(errorMsg);
      }
    }
  };

  const handleClose = () => {
    Alert.alert(
      'Exit App',
      'Are you sure you want to exit?',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Exit',
          onPress: async () => {
            await LogUtils.writeDebugToFile('User confirmed app exit');
            BackHandler.exitApp();
          }
        }
      ],
      { cancelable: true }
    );
  };

  const handleReturnToList = async () => {
    try {
      // Mark navigation as cancelled
      navigationCancelledRef.current = true;
      
      // Cancel patrol sequence
      setIsPatrolling(false);
      await LogUtils.writeDebugToFile('Patrol sequence cancelled');
      
      // Stop the robot's movement
      await NativeModules.SlamtecUtils.stopNavigation();
      await LogUtils.writeDebugToFile('Robot movement stopped');
      
      // Reset UI state
      setSelectedProduct(null);
      setNavigationStatus(NavigationStatus.IDLE);
    } catch (error) {
      // Even if stopping fails, still cancel patrol and return to list
      navigationCancelledRef.current = true;
      setIsPatrolling(false);
      setSelectedProduct(null);
      setNavigationStatus(NavigationStatus.IDLE);
      await LogUtils.writeDebugToFile('Error stopping navigation, but returned to list anyway');
    }
  };

  const renderProductItem = ({ item }: { item: Product }) => (
    <TouchableOpacity 
      style={styles.productItem}
      onPress={() => handleProductSelect(item)}
    >
      <Text style={styles.productText}>{item.name} ({item.eslCode})</Text>
    </TouchableOpacity>
  );

  // Render different views based on navigation status
  const renderContent = () => {
    switch (navigationStatus) {
      case NavigationStatus.IDLE:
        return (
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search products..."
              placeholderTextColor="#999"
              value={searchText}
              onChangeText={setSearchText}
            />
            
            {isLoading ? (
              <ActivityIndicator size="large" color="rgb(0, 215, 68)" />
            ) : (
              <FlatList
                data={filteredProducts}
                renderItem={renderProductItem}
                keyExtractor={item => item.eslCode}
                style={styles.productList}
                contentContainerStyle={styles.productListContent}
              />
            )}
            
            <TouchableOpacity 
              style={styles.homeButton}
              onPress={handleGoHome}
            >
              <Text style={styles.homeButtonText}>Go Home</Text>
            </TouchableOpacity>
          </View>
        );
        
      case NavigationStatus.NAVIGATING:
        return (
          <View style={styles.navigationContainer}>
            <View style={styles.navigationDialog}>
              <Text style={styles.navigationTitle}>Navigating to:</Text>
              <Text style={styles.navigationProductName}>
                {selectedProduct ? selectedProduct.name : "Home"}
              </Text>
              <ActivityIndicator size="large" color="rgb(0, 215, 68)" style={styles.navigationSpinner} />
              
              <TouchableOpacity 
                style={[styles.navigationButton, styles.cancelButton, { marginTop: 30 }]}
                onPress={handleReturnToList}
              >
                <Text style={styles.navigationButtonText}>Cancel Navigation</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
        
      case NavigationStatus.ARRIVED:
        return (
          <View style={styles.navigationContainer}>
            <View style={styles.navigationDialog}>
              <Text style={styles.navigationTitle}>We have arrived!</Text>
              <Text style={styles.navigationProductName}>{selectedProduct?.name}</Text>
              
              <View style={styles.navigationButtonContainer}>
                <TouchableOpacity 
                  style={styles.navigationButton}
                  onPress={handleReturnToList}
                >
                  <Text style={styles.navigationButtonText}>Back to List</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.navigationButton, styles.navigationHomeButton]}
                  onPress={handleGoHome}
                >
                  <Text style={[styles.navigationButtonText, styles.navigationHomeButtonText]}>Go Home</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
        
      case NavigationStatus.ERROR:
        return (
          <View style={styles.navigationContainer}>
            <View style={styles.navigationDialog}>
              <Text style={styles.navigationTitle}>Navigation Error</Text>
              <Text style={styles.navigationErrorText}>{navigationError}</Text>
              
              <TouchableOpacity 
                style={styles.navigationButton}
                onPress={handleReturnToList}
              >
                <Text style={styles.navigationButtonText}>Back to List</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>Cactus Assistant</Text>
        
        <TouchableOpacity 
          style={styles.configButton}
          onPress={onConfigPress}
        >
          <Text style={styles.configButtonText}>⚙</Text>
        </TouchableOpacity>
      </View>
      
      {renderContent()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#404040',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'rgb(0, 215, 68)',
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    padding: 5,
    width: 40,
  },
  closeButtonText: {
    fontSize: 24,
    color: 'rgb(0, 215, 68)',
  },
  configButton: {
    padding: 5,
    width: 40,
  },
  configButtonText: {
    fontSize: 32,
    color: 'rgb(0, 215, 68)',
    textAlign: 'right',
  },
  searchContainer: {
    flex: 1,
    padding: 20,
  },
  searchInput: {
    backgroundColor: '#303030',
    color: 'white',
    borderWidth: 2,
    borderColor: 'rgb(0, 215, 68)',
    borderRadius: 5,
    padding: 15,
    fontSize: 22,
    marginBottom: 20,
    minHeight: 60,
  },
  productList: {
    flex: 1,
    backgroundColor: '#303030',
    borderRadius: 5,
  },
  productListContent: {
    paddingVertical: 5,
  },
  productItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#505050',
    minHeight: 60,
  },
  productText: {
    color: 'white',
    fontSize: 18,
  },
  homeButton: {
    backgroundColor: 'rgb(0, 215, 68)',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 20,
    minHeight: 50,
  },
  homeButtonText: {
    color: '#404040',
    fontSize: 18,
    fontWeight: 'bold',
  },
  navigationContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  navigationDialog: {
    backgroundColor: '#404040',
    borderRadius: 10,
    padding: 30,
    width: '80%',
    maxWidth: 500,
    alignItems: 'center',
  },
  navigationTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'rgb(0, 215, 68)',
    marginBottom: 20,
    textAlign: 'center',
  },
  navigationProductName: {
    fontSize: 28,
    color: 'white',
    textAlign: 'center',
    marginBottom: 30,
  },
  navigationSpinner: {
    marginTop: 20,
  },
  navigationErrorText: {
    fontSize: 24,
    color: '#F44336',
    textAlign: 'center',
    marginVertical: 20,
  },
  navigationButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
  navigationButton: {
    backgroundColor: '#666',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 5,
    minWidth: 150,
    marginHorizontal: 10,
  },
  navigationButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  navigationHomeButton: {
    backgroundColor: 'rgb(0, 215, 68)',
  },
  navigationHomeButtonText: {
    color: '#404040',
  },
  cancelButton: {
    backgroundColor: '#F44336',
  },
});

export default MainScreen; 
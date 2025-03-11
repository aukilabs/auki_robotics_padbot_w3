import React, { useState, useEffect } from 'react';
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
} from 'react-native';

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
  const [navmeshCoords, setNavmeshCoords] = useState<any>(null);

  // Handle hardware back button (Android)
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });

    return () => {
      backHandler.remove();
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
    setSelectedProduct(product);
    setNavigationStatus(NavigationStatus.NAVIGATING);
    setNavmeshCoords(null); // Reset navmesh coordinates
    
    try {
      console.log('Starting navigation for product:', product);
      
      // Get product coordinates
      const poseZ = product.pose.pz || product.pose.z;  // Try pz first, then fall back to z
      
      // Get navmesh coordinates
      const coords = {
        x: product.pose.px || product.pose.x,  // Try px first, then fall back to x
        y: 0,  // Keep robot at ground level
        z: poseZ
      };
      console.log('Requesting navmesh coordinates for:', coords);

      const navTarget = await NativeModules.DomainUtils.getNavmeshCoord(coords);
      console.log('Received navmesh target:', navTarget);
      
      setNavmeshCoords(navTarget); // Store all debug information

      // Navigate to the calculated position using the navmesh result
      await NativeModules.SlamtecUtils.navigateProduct(
        navTarget.debug.navmeshResult.x,
        navTarget.debug.navmeshResult.z,
        navTarget.debug.navmeshResult.yaw
      );
      console.log('Navigation command sent successfully');
      
      setNavigationStatus(NavigationStatus.ARRIVED);
    } catch (error) {
      console.error('Navigation error:', error);
      console.error('Error details:', error.message);
      setNavigationStatus(NavigationStatus.ERROR);
      setNavigationError(error.message || 'Navigation failed. Please try again.');
    }
  };

  const handleGoHome = async () => {
    setNavigationStatus(NavigationStatus.NAVIGATING);
    setSelectedProduct(null);
    
    try {
      await NativeModules.SlamtecUtils.goHome();
      setNavigationStatus(NavigationStatus.IDLE);
    } catch (error) {
      console.error('Navigation error:', error);
      setNavigationStatus(NavigationStatus.ERROR);
      setNavigationError(error.message || 'Navigation to home failed. Please try again.');
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
          onPress: () => BackHandler.exitApp()
        }
      ],
      { cancelable: true }
    );
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
            <Text style={styles.navigationText}>
              Navigating to:
              {'\n\n'}
              {selectedProduct?.name}
              {'\n\n'}
              Original Product Coordinates:
              {'\n'}
              X: {selectedProduct ? (selectedProduct.pose.px || selectedProduct.pose.x).toFixed(2) : ''}
              {'\n'}
              Z: {selectedProduct ? (selectedProduct.pose.pz || selectedProduct.pose.z).toFixed(2) : ''}
              {'\n\n'}
              {navmeshCoords ? (
                <>
                  Product Coordinates:
                  {'\n'}
                  X: {navmeshCoords.debug?.productCoords?.x.toFixed(2)}
                  {'\n'}
                  Z: {navmeshCoords.debug?.productCoords?.z.toFixed(2)}
                  {'\n\n'}
                  Transformed Coordinates:
                  {'\n'}
                  X: {navmeshCoords.debug?.transformedCoords?.x.toFixed(2)}
                  {'\n'}
                  Z: {navmeshCoords.debug?.transformedCoords?.z.toFixed(2)}
                  {'\n\n'}
                  Navmesh Result:
                  {'\n'}
                  X: {navmeshCoords.debug?.navmeshResult?.x.toFixed(2)}
                  {'\n'}
                  Z: {navmeshCoords.debug?.navmeshResult?.z.toFixed(2)}
                  {'\n'}
                  Yaw: {navmeshCoords.debug?.navmeshResult?.yaw.toFixed(2)}
                  {'\n'}
                  Delta X: {navmeshCoords.debug?.navmeshResult?.deltaX.toFixed(2)}
                  {'\n'}
                  Delta Z: {navmeshCoords.debug?.navmeshResult?.deltaZ.toFixed(2)}
                </>
              ) : (
                'Calculating navmesh coordinates...'
              )}
            </Text>
          </View>
        );
        
      case NavigationStatus.ARRIVED:
        return (
          <View style={styles.arrivalContainer}>
            <Text style={styles.arrivalTitle}>We have arrived!</Text>
            
            <View style={styles.arrivalButtonContainer}>
              <TouchableOpacity 
                style={styles.arrivalBackButton}
                onPress={() => setNavigationStatus(NavigationStatus.IDLE)}
              >
                <Text style={styles.arrivalBackButtonText}>Back to List</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.arrivalHomeButton}
                onPress={handleGoHome}
              >
                <Text style={styles.arrivalHomeButtonText}>Go Home</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
        
      case NavigationStatus.ERROR:
        return (
          <View style={styles.navigationContainer}>
            <Text style={styles.navigationErrorText}>
              Navigation error:
              {'\n\n'}
              {navigationError}
            </Text>
            
            <TouchableOpacity 
              style={styles.errorBackButton}
              onPress={() => setNavigationStatus(NavigationStatus.IDLE)}
            >
              <Text style={styles.errorBackButtonText}>Back to List</Text>
            </TouchableOpacity>
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
    backgroundColor: '#9C9C9C',
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
    color: '#404040',
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    padding: 5,
    width: 40,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#000',
  },
  configButton: {
    padding: 5,
    width: 40,
  },
  configButtonText: {
    fontSize: 32,
    color: '#404040',
    textAlign: 'right',
  },
  searchContainer: {
    flex: 1,
    padding: 20,
  },
  searchInput: {
    backgroundColor: '#404040',
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
    backgroundColor: '#404040',
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  navigationText: {
    fontSize: 18,
    textAlign: 'center',
    color: '#333',
    fontFamily: 'System',
    lineHeight: 24,
  },
  navigationErrorText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#F44336',
    textAlign: 'center',
    marginBottom: 30,
  },
  errorBackButton: {
    backgroundColor: '#404040',
    padding: 20,
    borderRadius: 5,
    alignItems: 'center',
    width: '50%',
  },
  errorBackButtonText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  arrivalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  arrivalTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'rgb(0, 215, 68)',
    marginBottom: 40,
  },
  arrivalButtonContainer: {
    width: '25%',
  },
  arrivalBackButton: {
    backgroundColor: '#404040',
    padding: 20,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 120,
    minHeight: 80,
  },
  arrivalBackButtonText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  arrivalHomeButton: {
    backgroundColor: 'rgb(0, 215, 68)',
    padding: 20,
    borderRadius: 5,
    alignItems: 'center',
    minHeight: 80,
  },
  arrivalHomeButtonText: {
    color: '#404040',
    fontSize: 24,
    fontWeight: 'bold',
  },
});

export default MainScreen; 
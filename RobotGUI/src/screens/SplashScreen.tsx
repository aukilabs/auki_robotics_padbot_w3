import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Animated,
  Easing,
  NativeModules,
} from 'react-native';

interface SplashScreenProps {
  onFinish: (products: any[]) => void;
}

const SplashScreen = ({ onFinish }: SplashScreenProps): React.JSX.Element => {
  const [opacity] = useState(new Animated.Value(1));
  const [loadingText, setLoadingText] = useState('Initializing...');

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let isMounted = true;

    const loadProducts = async () => {
      try {
        if (isMounted) setLoadingText('Loading products...');
        const products = await NativeModules.CactusUtils.getProducts();
        if (isMounted) {
          setLoadingText('Products loaded successfully');
          // Create fade-out animation
          Animated.timing(opacity, {
            toValue: 0,
            duration: 500,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(() => {
            onFinish(products);
          });
        }
      } catch (error) {
        if (isMounted) {
          console.error('Error loading products:', error);
          setLoadingText('Error loading products');
          // Still finish after error, but with empty products
          setTimeout(() => {
            if (isMounted) {
              Animated.timing(opacity, {
                toValue: 0,
                duration: 500,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }).start(() => {
                onFinish([]);
              });
            }
          }, 2000);
        }
      }
    };

    // Start loading products
    loadProducts();

    // Set 30 second timeout
    timeoutId = setTimeout(() => {
      if (isMounted) {
        setLoadingText('Loading timeout reached');
        Animated.timing(opacity, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          onFinish([]);
        });
      }
    }, 30000);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [opacity, onFinish]);

  return (
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
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  contentContainer: {
    backgroundColor: '#404040',
    borderRadius: 10,
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
});

export default SplashScreen; 
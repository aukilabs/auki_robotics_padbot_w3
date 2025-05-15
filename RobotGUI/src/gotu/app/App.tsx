/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import SplashScreen from '../screens/SplashScreen';
import MainScreen from '../screens/MainScreen';
import ConfigScreen from '../screens/ConfigScreen';

enum AppScreen {
  SPLASH,
  MAIN,
  CONFIG
}

interface Product {
  name: string;
  eslCode: string;
  pose: {
    x: number;
    y: number;
    z: number;
  };
}

const App = () => {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.SPLASH);
  const [products, setProducts] = useState<Product[]>([]);

  const handleSplashFinish = (loadedProducts: Product[]) => {
    setProducts(loadedProducts);
    setCurrentScreen(AppScreen.MAIN);
  };

  const handleConfigPress = () => {
    setCurrentScreen(AppScreen.CONFIG);
  };

  const handleClose = () => {
    setCurrentScreen(AppScreen.MAIN);
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case AppScreen.SPLASH:
        return <SplashScreen onFinish={handleSplashFinish} />;
      case AppScreen.MAIN:
        return <MainScreen onClose={handleClose} onConfigPress={handleConfigPress} initialProducts={products} />;
      case AppScreen.CONFIG:
        return <ConfigScreen onClose={handleClose} />;
    }
  };

  return (
    <View style={styles.container}>
      {renderScreen()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#9C9C9C',
  },
});

export default App;

/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import SplashScreen from './src/screens/SplashScreen';
import MainScreen from './src/screens/MainScreen';
import ConfigScreen from './src/screens/ConfigScreen';

enum AppScreen {
  SPLASH,
  MAIN,
  CONFIG
}

const App = () => {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.SPLASH);

  const handleSplashFinish = () => {
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
        return <MainScreen onClose={handleClose} onConfigPress={handleConfigPress} />;
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

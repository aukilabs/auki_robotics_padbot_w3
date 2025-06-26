/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useState } from 'react';
import { View, StyleSheet, BackHandler } from 'react-native';
import SplashScreen from '../screens/SplashScreen';
import ConfigScreen from '../screens/ConfigScreen';

enum AppScreen {
  SPLASH,
  CONFIG
}

interface ConfigScreenProps {
  onClose: () => void;
  restartApp: () => void;
}

const App = () => {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.SPLASH);

  const handleSplashFinish = (options?: { goToConfig?: boolean }) => {
    setCurrentScreen(AppScreen.CONFIG);
  };

  const handleClose = () => {
    // Exit the app
    BackHandler.exitApp();
  };

  const restartApp = () => {
    setCurrentScreen(AppScreen.SPLASH);
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case AppScreen.SPLASH:
        return <SplashScreen onFinish={handleSplashFinish} />;
      case AppScreen.CONFIG:
        return <ConfigScreen onClose={handleClose} restartApp={restartApp} />;
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

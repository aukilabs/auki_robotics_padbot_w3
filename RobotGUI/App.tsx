/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  BackHandler,
} from 'react-native';

import Icon from 'react-native-vector-icons/Ionicons';
import ConfigScreen from './src/screens/ConfigScreen';

function App(): React.JSX.Element {
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    // Add error boundary for initialization
    try {
      // Your initialization code
    } catch (error) {
      console.error('App initialization error:', error);
    }
  }, []);

  const handleClose = () => {
    BackHandler.exitApp();
  };

  if (showConfig) {
    return <ConfigScreen onClose={() => setShowConfig(false)} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.configButton} onPress={() => setShowConfig(true)}>
          <Icon name="settings-outline" size={24} color="#000" />
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>Auki Labs</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#000',
  },
  configButton: {
    padding: 5,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000',
  },
});

export default App;

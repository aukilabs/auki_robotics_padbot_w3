import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface SplashScreenProps {
  onFinish: (products: any[]) => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  useEffect(() => {
    // Placeholder for GoTu implementation
    // This is just a minimal implementation to allow Cactus builds to work
    setTimeout(() => {
      onFinish([]);
    }, 2000);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>GoTu - Coming Soon</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  text: {
    fontSize: 24,
    color: 'white',
  },
});

export default SplashScreen; 
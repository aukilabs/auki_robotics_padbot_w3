import {AppRegistry, NativeModules} from 'react-native';
import {name as appName} from './app.json';

// Import both app variants
import CactusApp from './src/cactus/app/App';
import GoTuApp from './src/gotu/app/App';

// Get the app variant from native code
// Default to CactusApp if not specified
const getAppVariant = () => {
  try {
    // This requires adding a native module that exposes the app variant
    const appVariant = NativeModules.AppInfo?.getAppVariant?.() || 'cactus';
    console.log('App variant:', appVariant);
    return appVariant;
  } catch (error) {
    console.error('Error getting app variant:', error);
    return 'cactus'; // Default to CactusApp
  }
};

// Select the app based on the variant
const getApp = () => {
  const variant = getAppVariant();
  switch (variant) {
    case 'gotu':
      return GoTuApp;
    case 'cactus':
    default:
      return CactusApp;
  }
};

// Register the appropriate component
AppRegistry.registerComponent(appName, () => getApp()); 
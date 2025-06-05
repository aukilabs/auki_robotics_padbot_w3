import {AppRegistry, NativeModules} from 'react-native';
import {name as appName} from './app.json';

// Import Auki Padbot W3 app
import AukiPadbotW3App from './src/auki_padbot_w3/app/App';

// Get the app variant from native code
const getAppVariant = () => {
  try {
    // This requires adding a native module that exposes the app variant
    const appVariant = NativeModules.AppInfo?.getAppVariant?.() || 'auki_padbot_w3';
    console.log('App variant:', appVariant);
    return appVariant;
  } catch (error) {
    console.error('Error getting app variant:', error);
    return 'auki_padbot_w3'; // Default to AukiPadbotW3App
  }
};

// Select the app based on the variant
const getApp = () => {
  const variant = getAppVariant();
  switch (variant) {
    case 'auki_padbot_w3':
    default:
      return AukiPadbotW3App;
  }
};

// Register the appropriate component
AppRegistry.registerComponent(appName, () => getApp()); 
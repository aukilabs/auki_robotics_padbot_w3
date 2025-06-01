import React, { useState } from 'react';
import SplashScreen from './SplashScreen';
import ConfigScreen from './ConfigScreen';
import MainScreen from './MainScreen';

const App = (): React.JSX.Element => {
  const [isLoading, setIsLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [goToConfig, setGoToConfig] = useState(false);
  const [isMainScreenReady, setIsMainScreenReady] = useState(false);

  const handleSplashFinish = (loadedProducts: any[], options?: { goToConfig?: boolean }) => {
    setProducts(loadedProducts);
    if (options?.goToConfig) {
      setGoToConfig(true);
    }
    setIsLoading(false);
  };

  const handleMainScreenReady = () => {
    setIsMainScreenReady(true);
  };

  if (isLoading) {
    return <SplashScreen onFinish={handleSplashFinish} isMainScreenReady={isMainScreenReady} />;
  }

  if (goToConfig) {
    return <ConfigScreen onFinish={() => setGoToConfig(false)} />;
  }

  return <MainScreen products={products} onReady={handleMainScreenReady} />;
};

export default App; 
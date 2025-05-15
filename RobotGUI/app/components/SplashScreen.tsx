// Update map
try {
  if (isMounted) {
    setLoadingText('Updating map...');
    await LogUtils.writeDebugToFile('Updating map...');
  }
  
  // Only try to update map if authentication was successful
  if (authSuccess) {
    try {
      // First try the regular method
      await LogUtils.writeDebugToFile('Attempting to download map via DomainUtils...');
      await NativeModules.DomainUtils.downloadAndProcessMap();
      await LogUtils.writeDebugToFile('Map update complete via DomainUtils');
    } catch (initialMapError: any) {
      // If the primary method fails, use our robust fallback
      await LogUtils.writeDebugToFile(`DomainUtils map download failed: ${initialMapError.message}, trying fallback method...`);
      
      if (isMounted) {
        setLoadingText('Retrying map download...');
      }
      
      try {
        // Use SlamtecUtils fallback with 3 retries
        await LogUtils.writeDebugToFile('Using SlamtecUtils fallback for map download');
        const result = await NativeModules.SlamtecUtils.ensureMapDownload(3);
        
        if (result && typeof result === 'object' && result.status === 'partial') {
          await LogUtils.writeDebugToFile(`Partial map success: ${result.message}`);
        } else {
          await LogUtils.writeDebugToFile('Map fallback method succeeded');
        }
      } catch (fallbackError: any) {
        await LogUtils.writeDebugToFile(`Map fallback method also failed: ${fallbackError.message}`);
        throw fallbackError; // Re-throw to be caught by the outer catch
      }
    }
  } else {
    await LogUtils.writeDebugToFile('Skipping map update due to authentication failure');
  }
} catch (mapError: any) {
  await LogUtils.writeDebugToFile(`Map update error: ${mapError.message}, proceeding anyway`);
  if (isMounted) {
    setLoadingText('Map update failed. Using existing map.');
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
} 
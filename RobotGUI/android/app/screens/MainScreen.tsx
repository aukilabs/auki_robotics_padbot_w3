// Add a flag to ensure only one polling loop runs
let isPollingActive = false;

const startPosePolling = async () => {
  if (isPollingActive) {
    await LogUtils.writeDebugToFile('[POSE POLLING] Polling already active, skipping start');
    return;
  }
  isPollingActive = true;
  await LogUtils.writeDebugToFile('[POSE POLLING] Wait-for-completion polling started');
  pollPoseLoop();
};

const stopPosePolling = async () => {
  isPollingActive = false;
  await LogUtils.writeDebugToFile('[POSE POLLING] Wait-for-completion polling stopped');
  return true;
};

const pollPoseLoop = async () => {
  while (isPollingActive) {
    await readRobotPose();
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1s between polls
  }
  await LogUtils.writeDebugToFile('[POSE POLLING] Polling loop exited');
}; 
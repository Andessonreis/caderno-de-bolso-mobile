// Dublê do expo-camera para os testes.
export const CameraView = () => null;
export const useCameraPermissions = () => [
  { granted: false, canAskAgain: true, status: 'undetermined' },
  () => Promise.resolve({ granted: false, canAskAgain: false, status: 'denied' }),
];

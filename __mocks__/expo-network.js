// Dublê do expo-network para os testes: sempre sem internet.
const state = { isConnected: false, isInternetReachable: false, type: 'NONE' };

export const NetworkStateType = { NONE: 'NONE', WIFI: 'WIFI', CELLULAR: 'CELLULAR', UNKNOWN: 'UNKNOWN' };
export const getNetworkStateAsync = () => Promise.resolve(state);
export const addNetworkStateListener = () => ({ remove() {} });
export const useNetworkState = () => state;

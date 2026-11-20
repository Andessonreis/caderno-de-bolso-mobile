// Dublê do expo-audio para os testes (o módulo nativo não existe no Node).
const player = {
  play() {},
  pause() {},
  seekTo() {
    return Promise.resolve();
  },
};

const recorder = {
  isRecording: false,
  currentTime: 0,
  uri: null,
  prepareToRecordAsync() {
    return Promise.resolve();
  },
  record() {},
  stop() {
    return Promise.resolve();
  },
};

export const RecordingPresets = { HIGH_QUALITY: {}, LOW_QUALITY: {} };
export const useAudioPlayer = () => player;
export const useAudioPlayerStatus = () => ({ playing: false, currentTime: 0, duration: 0, didJustFinish: false });
export const useAudioRecorder = () => recorder;
export const useAudioRecorderState = () => ({ isRecording: false, durationMillis: 0 });
export const requestRecordingPermissionsAsync = () => Promise.resolve({ granted: false });
export const setAudioModeAsync = () => Promise.resolve();

import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { hapticSuccess, hapticTap, saveRecording } from '@/lib/device';
import { colors, radius, space } from '@/theme';

import { AppText } from './AppText';
import { AudioNote, formatClock } from './AudioNote';
import { Button } from './Button';
import { ProgressBar } from './StepProgress';

/** Limite de cada recado, em segundos. */
export const MAX_RECORDING_SECONDS = 60;

interface VoiceRecorderProps {
  /** Recado atual (caminho relativo), se houver. */
  value?: string;
  seconds?: number;
  /** Gravou um recado novo. Quem chama decide o que fazer com o anterior. */
  onRecorded: (file: string, seconds: number) => void;
  onRemove: () => void;
}

/** Gravar (tocar para começar e para parar), ouvir, apagar e regravar um recado de voz. */
export function VoiceRecorder({ value, seconds, onRecorded, onRemove }: VoiceRecorderProps) {
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const finishing = useRef(false);
  /** Já vimos o gravador rodando nesta gravação (evita confundir com o estado da anterior). */
  const sawRecording = useRef(false);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    setBusy(true);
    try {
      const elapsed = Math.min(MAX_RECORDING_SECONDS, Math.round(recorder.currentTime || state.durationMillis / 1000));
      if (recorder.isRecording) await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      const temp = recorder.uri;
      if (!temp) throw new Error('sem arquivo');
      const file = await saveRecording(temp);
      hapticSuccess();
      onRecorded(file, Math.max(1, elapsed));
    } catch {
      Alert.alert('Recado de voz', 'Não deu para guardar a gravação. Tente de novo.');
    } finally {
      setActive(false);
      setBusy(false);
      finishing.current = false;
      sawRecording.current = false;
    }
  }, [recorder, state.durationMillis, onRecorded]);

  // O gravador para sozinho ao chegar no limite: guarda o que foi gravado.
  useEffect(() => {
    if (!active) return;
    if (state.isRecording) sawRecording.current = true;
    else if (sawRecording.current && !busy) finish();
  }, [active, busy, state.isRecording, finish]);

  const start = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Recado de voz', 'Gravar recado só funciona no celular.');
      return;
    }
    setBusy(true);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Recado de voz',
          'Para gravar, o app precisa da permissão do microfone. Libere nas configurações do celular.',
        );
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: MAX_RECORDING_SECONDS });
      hapticTap();
      setActive(true);
    } catch {
      Alert.alert('Recado de voz', 'Não deu para começar a gravar. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  if (active) {
    const elapsed = state.durationMillis / 1000;
    return (
      <View style={styles.box} accessibilityLiveRegion="polite">
        <View style={styles.row}>
          <View style={styles.dot} />
          <AppText variant="bodyStrong">
            Gravando {formatClock(elapsed)} de {formatClock(MAX_RECORDING_SECONDS)}
          </AppText>
        </View>
        <ProgressBar value={elapsed / MAX_RECORDING_SECONDS} label="Tempo de gravação" />
        <Button label="Parar e guardar" icon="stop" size="xl" busy={busy} onPress={finish} />
      </View>
    );
  }

  if (value) {
    return (
      <View style={styles.box}>
        <AudioNote file={value} seconds={seconds} />
        <View style={styles.row}>
          <Button label="Regravar" icon="microphone" variant="secondary" style={styles.flex} disabled={busy} onPress={start} />
          <Button label="Apagar" icon="trash-can-outline" variant="danger" style={styles.flex} onPress={onRemove} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Button label="Gravar recado de voz" icon="microphone" size="xl" variant="secondary" busy={busy} onPress={start} />
      <AppText variant="small" color={colors.inkMuted}>
        Toque para começar e toque de novo para parar. Até {MAX_RECORDING_SECONDS} segundos.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  dot: { width: 16, height: 16, borderRadius: radius.pill, backgroundColor: colors.danger },
});

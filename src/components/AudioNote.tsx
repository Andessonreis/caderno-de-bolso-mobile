import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { mediaExists, mediaUri } from '@/lib/device';
import { colors, space } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';

/** "0:07", "1:00" */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface AudioNoteProps {
  /** Caminho relativo do recado ("audios/arquivo.m4a"). */
  file: string;
  /** Duração conhecida (segundos), mostrada antes de o áudio carregar. */
  seconds?: number;
  variant?: 'primary' | 'secondary';
}

const PLAY_ERROR =
  'Não deu para tocar este recado neste celular. Se foi gravado numa versão antiga do app, grave de novo.';

/**
 * Botão para ouvir e pausar um recado de voz. O tocador só é criado no primeiro
 * toque: numa lista com muitos recados, criar um para cada item esgota os
 * decodificadores do celular e nenhum toca.
 */
export function AudioNote({ file, seconds, variant = 'secondary' }: AudioNoteProps) {
  const uri = mediaUri(file);
  const [started, setStarted] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (started && uri) {
    return <Playing key={uri} uri={uri} seconds={seconds} variant={variant} />;
  }

  const start = () => {
    if (!mediaExists(file)) {
      setProblem('Este recado ainda não chegou neste celular. Ele baixa sozinho quando houver internet.');
      return;
    }
    setProblem(null);
    setStarted(true);
  };

  return (
    <View style={{ gap: space.xs }}>
      <Button
        label={`Ouvir recado de voz${seconds ? ` (${formatClock(seconds)})` : ''}`}
        icon="play"
        variant={variant}
        disabled={!uri}
        onPress={start}
      />
      {problem ? (
        <AppText variant="small" color={colors.danger} accessibilityRole="alert">
          {problem}
        </AppText>
      ) : null}
    </View>
  );
}

function Playing({ uri, seconds, variant }: { uri: string; seconds?: number; variant: 'primary' | 'secondary' }) {
  const player = useAudioPlayer({ uri }, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const total = status.duration > 0 ? status.duration : (seconds ?? 0);
  const [failed, setFailed] = useState(false);

  // O toque que criou o tocador já foi o "ouvir": começa a tocar na hora.
  // O tocador guarda o pedido e toca assim que o arquivo carrega.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true })
      .catch(() => undefined)
      .then(() => player.play());
  }, [player]);

  // Ao terminar, volta para o começo para poder ouvir de novo.
  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      player.seekTo(0).catch(() => undefined);
    }
  }, [status.didJustFinish, player]);

  // Falha do tocador (arquivo que o celular não decodifica) chega depois, pelo evento.
  useEffect(() => {
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      if ((s as { error?: unknown }).error) setFailed(true);
    });
    return () => sub.remove();
  }, [player]);

  const toggle = async () => {
    if (status.playing) {
      player.pause();
      return;
    }
    setFailed(false);
    try {
      if (status.duration > 0 && status.currentTime >= status.duration - 0.2) await player.seekTo(0);
      player.play();
    } catch {
      setFailed(true);
    }
  };

  const label = status.playing
    ? `Pausar recado (${formatClock(status.currentTime)} de ${formatClock(total)})`
    : `Ouvir recado de voz${total ? ` (${formatClock(total)})` : ''}`;

  return (
    <View style={{ gap: space.xs }}>
      <Button label={label} icon={status.playing ? 'pause' : 'play'} variant={variant} onPress={toggle} />
      {failed ? (
        <AppText variant="small" color={colors.danger} accessibilityRole="alert">
          {PLAY_ERROR}
        </AppText>
      ) : null}
    </View>
  );
}

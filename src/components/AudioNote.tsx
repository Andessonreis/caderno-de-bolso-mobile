import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect } from 'react';

import { mediaUri } from '@/lib/device';

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

/** Botão para ouvir e pausar um recado de voz. */
export function AudioNote({ file, seconds, variant = 'secondary' }: AudioNoteProps) {
  const uri = mediaUri(file);
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);
  const total = status.duration > 0 ? status.duration : (seconds ?? 0);

  // Ao terminar, volta para o começo para poder ouvir de novo.
  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      player.seekTo(0).catch(() => undefined);
    }
  }, [status.didJustFinish, player]);

  const label = status.playing
    ? `Pausar recado (${formatClock(status.currentTime)} de ${formatClock(total)})`
    : `Ouvir recado de voz${total ? ` (${formatClock(total)})` : ''}`;

  return (
    <Button
      label={label}
      icon={status.playing ? 'pause' : 'play'}
      variant={variant}
      disabled={!uri}
      onPress={() => (status.playing ? player.pause() : player.play())}
    />
  );
}

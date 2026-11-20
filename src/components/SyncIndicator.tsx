import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { mediaExists } from '@/lib/device';
import { SYNC_AVAILABLE } from '@/sync/device';
import { pendingCount } from '@/sync/engine';
import { syncLabel } from '@/sync/label';
import { useSyncStatus } from '@/sync/service';
import { useApp } from '@/store';
import { TOUCH_MIN, colors, radius, space } from '@/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

/** Linha pequena que diz se os dados estão guardados na internet. Toque abre "Cópia na internet". */
export function SyncIndicator() {
  const ligado = useApp((s) => s.sync.ligado);
  const exemplo = useApp((s) => Boolean(s.profile?.exemplo));
  const pending = useApp((s) => pendingCount(s, mediaExists));
  const fase = useSyncStatus((s) => s.fase);
  const online = useSyncStatus((s) => s.online);
  const label = syncLabel({ available: SYNC_AVAILABLE, ligado, fase, online, pending, exemplo });
  const tone = label.tone === 'ok' ? colors.leaf : label.tone === 'aviso' ? colors.warn : colors.inkMuted;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label.text}. Abrir cópia na internet`}
      accessibilityLiveRegion="polite"
      onPress={() => router.push(fase === 'chave' ? '/ligar' : '/copia-internet')}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceSunk }]}>
      <Icon name={label.icon} size={24} color={tone} />
      <AppText variant="label" color={tone} style={styles.text}>
        {label.text}
      </AppText>
      <Icon name="chevron-right" size={22} color={colors.lineStrong} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: TOUCH_MIN,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  text: { flex: 1 },
});

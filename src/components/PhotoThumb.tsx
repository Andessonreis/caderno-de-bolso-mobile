import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { mediaUri } from '@/lib/device';
import { colors, radius, space } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { Icon } from './Icon';

interface PhotoThumbProps {
  /** Caminho relativo da foto. */
  file: string;
  /** Tamanho e cantos da miniatura. */
  style?: StyleProp<ViewStyle>;
  /** Texto lido pelo leitor de tela e mostrado como título na tela cheia. */
  label?: string;
}

/**
 * Miniatura de foto que abre em tela cheia ao tocar. A lupa no canto mostra
 * que dá para ampliar. Na tela cheia, tocar na foto ou em "Fechar" volta.
 */
export function PhotoThumb({ file, style, label = 'Foto da anotação' }: PhotoThumbProps) {
  const [open, setOpen] = useState(false);
  const uri = mediaUri(file);

  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={label}
        accessibilityHint="Abre a foto em tela cheia"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.thumb, style, pressed && { opacity: 0.8 }]}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={styles.zoom}>
          <Icon name="magnify-plus-outline" size={20} color={colors.white} />
        </View>
      </Pressable>

      <Modal visible={open} animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.viewer}>
          <AppText variant="label" color={colors.white} center style={styles.title}>
            {label}
          </AppText>
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={label}
            accessibilityHint="Toque para fechar"
            onPress={() => setOpen(false)}
            style={styles.full}>
            <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
          </Pressable>
          <View style={styles.footer}>
            <Button label="Fechar" icon="close" variant="secondary" size="xl" onPress={() => setOpen(false)} />
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumb: { overflow: 'hidden', borderRadius: radius.sm, backgroundColor: colors.surfaceSunk },
  zoom: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  viewer: { flex: 1, backgroundColor: colors.ink },
  title: { padding: space.md },
  full: { flex: 1 },
  footer: { padding: space.lg },
});

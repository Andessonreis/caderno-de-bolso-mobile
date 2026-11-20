import { Modal, StyleSheet, View } from 'react-native';

import { colors, radius, space } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** null esconde o botão de cancelar (aviso com um botão só). */
  cancelLabel?: string | null;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Pergunta de confirmação com botões grandes, no visual do app. */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Não, voltar',
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.box} accessibilityViewIsModal>
          <AppText variant="heading">{title}</AppText>
          <AppText variant="body" color={colors.inkMuted}>
            {message}
          </AppText>
          <View style={styles.actions}>
            <Button
              label={confirmLabel}
              variant={danger ? 'danger' : 'primary'}
              icon={danger ? 'trash-can-outline' : 'check'}
              onPress={onConfirm}
            />
            {cancelLabel ? <Button label={cancelLabel} variant="secondary" onPress={onCancel} /> : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(31,26,20,0.55)',
    justifyContent: 'center',
    padding: space.lg,
  },
  box: { backgroundColor: colors.paper, borderRadius: radius.lg, padding: space.xl, gap: space.md },
  actions: { gap: space.sm, marginTop: space.sm },
});

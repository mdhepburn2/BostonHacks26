import { useSyncExternalStore, type ComponentRef } from 'react';
import { Modal, Pressable, StyleSheet, View, type AlertButton } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { currentAlert, removeAlert, subscribeToAlerts } from '@/utils/alert-queue';

/** Draws whatever showAlert() asked for. Escape and clicking outside count as Cancel. */
export function AlertHost() {
  const theme = useTheme();
  const alert = useSyncExternalStore(subscribeToAlerts, currentAlert, () => null);
  if (!alert) return null;

  const close = (button?: AlertButton) => {
    removeAlert(alert);
    button?.onPress?.();
  };
  const dismiss = () => close(alert.buttons.find((button) => button.style === 'cancel'));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.container}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          onPress={dismiss}
          // Escape and the Cancel button already do this for keyboards and screen readers.
          tabIndex={-1}
          aria-hidden
        />
        <View
          // Start here, so a screen reader reads the alert and Tab goes to its buttons.
          key={alert.title}
          ref={focus}
          tabIndex={-1}
          role="alertdialog"
          aria-modal
          aria-label={alert.title}
          style={[styles.dialog, { backgroundColor: theme.background }]}>
          <View style={styles.text}>
            <ThemedText type="subtitle">{alert.title}</ThemedText>
            {alert.message ? (
              <ThemedText themeColor="textSecondary">{alert.message}</ThemedText>
            ) : null}
          </View>
          <View style={styles.actions}>
            {alert.buttons.map((button, i) => (
              <Button
                key={i}
                variant={button.style === 'cancel' ? 'plain' : 'primary'}
                label={button.text ?? 'OK'}
                onPress={() => close(button)}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function focus(view: ComponentRef<typeof View> | null) {
  view?.focus();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    gap: Spacing.four,
    padding: Spacing.four,
    borderRadius: Spacing.four,
    outlineWidth: 0,
  },
  text: {
    gap: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
});

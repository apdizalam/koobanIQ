import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Accessible label for the dimmed backdrop that closes the sheet, e.g. "Close". */
  closeLabel: string;
  children: ReactNode;
  testID?: string;
}

/** Modal sheet from the bottom edge · Figma sheet radius 28 · surface color · drag handle. */
export function BottomSheet({
  visible,
  onClose,
  title,
  closeLabel,
  children,
  testID,
}: BottomSheetProps) {
  const { colors, typography, radius, spacing } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.root}>
        <Pressable
          testID={testID ? `${testID}-backdrop` : undefined}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.sheet,
              borderTopRightRadius: radius.sheet,
              padding: spacing.xl,
              gap: spacing.lg,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          {title ? (
            <Text style={[typography.h2, { color: colors.text }]} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: { paddingBottom: 32 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2 },
});

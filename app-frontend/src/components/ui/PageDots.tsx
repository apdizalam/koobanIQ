import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme';

interface PageDotsProps {
  count: number;
  active: number;
  /** Spoken text, e.g. "Step 1 of 3". */
  label: string;
}

/** Figma onboarding dots: the active one is a wide navy pill, the others small grey dots. */
export function PageDots({ count, active, label }: PageDotsProps) {
  const { colors, radius } = useTheme();
  return (
    <View style={styles.row} accessible accessibilityRole="progressbar" accessibilityLabel={label}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            width: i === active ? 24 : 8,
            height: 8,
            borderRadius: radius.pill,
            backgroundColor: i === active ? colors.primary : colors.border,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
});

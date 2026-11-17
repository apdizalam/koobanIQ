import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../theme';

interface AppLogoProps {
  /** Tile size in px (Figma Welcome: 88). */
  size?: number;
}

/** App mark from the Figma Welcome screen: a target on a steel-blue rounded tile. */
export function AppLogo({ size = 88 }: AppLogoProps) {
  const { colors, radius } = useTheme();
  const ring = size * 0.42;
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: radius.card + 4,
        backgroundColor: colors.secondary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={ring} height={ring} viewBox="0 0 36 36">
        <Circle cx={18} cy={18} r={15.5} stroke="#FFFFFF" strokeWidth={3} fill="none" />
        <Circle cx={18} cy={18} r={9} stroke="#FFFFFF" strokeWidth={3} fill="none" />
        <Circle cx={18} cy={18} r={3.5} fill="#FFFFFF" />
      </Svg>
    </View>
  );
}

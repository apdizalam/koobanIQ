import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type TabName = 'home' | 'cv' | 'jobs' | 'reports' | 'profile';

interface TabIconProps {
  name: TabName;
  color: ColorValue;
  /** Design system: icons 24px, 2px stroke. */
  size?: number;
}

const stroke = {
  fill: 'none',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Line icons for the five bottom tabs (24px grid, 2px stroke, tinted per theme). */
export function TabIcon({ name, color, size = 24 }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {name === 'home' ? (
        <Path
          {...stroke}
          stroke={color}
          d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"
        />
      ) : null}
      {name === 'cv' ? (
        <>
          <Path
            {...stroke}
            stroke={color}
            d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"
          />
          <Path {...stroke} stroke={color} d="M14 3v6h6M8 13h8M8 17h5" />
        </>
      ) : null}
      {name === 'jobs' ? (
        <>
          <Rect {...stroke} stroke={color} x={3} y={7} width={18} height={13} rx={2} />
          <Path {...stroke} stroke={color} d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
        </>
      ) : null}
      {name === 'reports' ? (
        <Path {...stroke} stroke={color} d="M4 20h16M7 16v-5M12 16V6M17 16V9" />
      ) : null}
      {name === 'profile' ? (
        <>
          <Circle {...stroke} stroke={color} cx={12} cy={8} r={4} />
          <Path {...stroke} stroke={color} d="M4 21a8 8 0 0 1 16 0" />
        </>
      ) : null}
    </Svg>
  );
}

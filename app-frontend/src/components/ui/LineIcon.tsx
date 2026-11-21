import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** The five bottom tabs. */
export type TabName = 'home' | 'cv' | 'jobs' | 'reports' | 'profile';

export type LineIconName = TabName | 'search' | 'target' | 'mic' | 'chevron-right' | 'bell';

interface LineIconProps {
  name: LineIconName;
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

/**
 * Line icons drawn in code (24px grid, 2px stroke, tinted per theme), as in the
 * design's bottom tabs and Home quick actions.
 */
export function LineIcon({ name, color, size = 24 }: LineIconProps) {
  const p = { ...stroke, stroke: color };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {name === 'home' ? (
        <Path {...p} d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
      ) : null}
      {name === 'cv' ? (
        <>
          <Path {...p} d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <Path {...p} d="M14 3v6h6M8 13h8M8 17h5" />
        </>
      ) : null}
      {name === 'jobs' ? (
        <>
          <Rect {...p} x={3} y={7} width={18} height={13} rx={2} />
          <Path {...p} d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
        </>
      ) : null}
      {name === 'reports' ? <Path {...p} d="M4 20h16M7 16v-5M12 16V6M17 16V9" /> : null}
      {name === 'profile' ? (
        <>
          <Circle {...p} cx={12} cy={8} r={4} />
          <Path {...p} d="M4 21a8 8 0 0 1 16 0" />
        </>
      ) : null}
      {name === 'search' ? (
        <>
          <Circle {...p} cx={11} cy={11} r={7} />
          <Path {...p} d="m20 20-3.5-3.5" />
        </>
      ) : null}
      {name === 'target' ? (
        <>
          <Circle {...p} cx={12} cy={12} r={9} />
          <Circle {...p} cx={12} cy={12} r={5} />
          <Circle {...p} cx={12} cy={12} r={1} />
        </>
      ) : null}
      {name === 'mic' ? (
        <>
          <Rect {...p} x={9} y={3} width={6} height={11} rx={3} />
          <Path {...p} d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </>
      ) : null}
      {name === 'chevron-right' ? <Path {...p} d="m9 6 6 6-6 6" /> : null}
      {name === 'bell' ? (
        <Path {...p} d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16ZM10 20.5a2 2 0 0 0 4 0" />
      ) : null}
    </Svg>
  );
}

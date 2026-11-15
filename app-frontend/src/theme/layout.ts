import type { Insets } from 'react-native';
import { sizes } from './tokens';

/**
 * Extra touch area so a visually smaller control still has a
 * touch target of at least 44 × 44 (Figma: "touch ≥ 44px").
 */
export function hitSlopFor(visualHeight: number, visualWidth = sizes.minTouchTarget): Insets {
  const vertical = Math.max(0, Math.ceil((sizes.minTouchTarget - visualHeight) / 2));
  const horizontal = Math.max(0, Math.ceil((sizes.minTouchTarget - visualWidth) / 2));
  return { top: vertical, bottom: vertical, left: horizontal, right: horizontal };
}

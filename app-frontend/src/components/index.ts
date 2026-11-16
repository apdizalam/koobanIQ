// Reusable UI building blocks. Each component lives in its own file under ui/.
export { BottomSheet, type BottomSheetProps } from './ui/BottomSheet';
export { Button, type ButtonProps, type ButtonVariant } from './ui/Button';
export { Chip, CHIP_VISUAL_HEIGHT, type ChipProps } from './ui/Chip';
export { Icon, type IconName } from './ui/Icon';
export { Input, type InputProps } from './ui/Input';
export { JobCard, type JobCardProps } from './ui/JobCard';
export { MatchBadge, type MatchBadgeProps } from './ui/MatchBadge';
export { ScoreRing, type ScoreRingProps } from './ui/ScoreRing';
export { SkillChip, type SkillChipProps } from './ui/SkillChip';
// Kept for older imports: these types now live in src/types/match.ts.
export type { JobMatch, MatchCategory, SkillStatus } from '../types/match';

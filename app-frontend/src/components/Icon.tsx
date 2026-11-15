import { Image } from 'expo-image';

/** Icons exported from Figma (Design System → Icons, 2px stroke). */
const icons = {
  check: require('../../assets/icons/check.svg'),
  mail: require('../../assets/icons/mail.svg'),
} as const;

export type IconName = keyof typeof icons;

interface IconProps {
  name: IconName;
  /** Rendered size in px (Figma sizes: check 14 in chips, mail 20 in inputs). */
  size: number;
  /** Tint so icons follow the light/dark theme. */
  color: string;
}

export function Icon({ name, size, color }: IconProps) {
  return (
    <Image
      source={icons[name]}
      style={{ width: size, height: size }}
      tintColor={color}
      contentFit="contain"
      accessible={false}
    />
  );
}

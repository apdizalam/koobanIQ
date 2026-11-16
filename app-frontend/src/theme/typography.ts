/** KOBANIQ type tokens — Figma "Design System" → Foundations → Typography. */

/** Font families loaded by useAppFonts (expo-google-fonts). Manrope = headings, Inter = UI. */
export const fontFamilies = {
  manropeSemiBold: 'Manrope_600SemiBold',
  manropeBold: 'Manrope_700Bold',
  manropeExtraBold: 'Manrope_800ExtraBold',
  interRegular: 'Inter_400Regular',
  interMedium: 'Inter_500Medium',
  interSemiBold: 'Inter_600SemiBold',
} as const;

export interface TextStyleToken {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
}

/** Figma "Typography" (size / line height). */
export const typography = {
  display: { fontFamily: fontFamilies.manropeExtraBold, fontSize: 28, lineHeight: 36 },
  h1: { fontFamily: fontFamilies.manropeBold, fontSize: 22, lineHeight: 30 },
  h2: { fontFamily: fontFamilies.manropeBold, fontSize: 18, lineHeight: 26 },
  h3: { fontFamily: fontFamilies.manropeSemiBold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fontFamilies.interRegular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamilies.interSemiBold, fontSize: 15, lineHeight: 22 },
  bodySmall: { fontFamily: fontFamilies.interRegular, fontSize: 13, lineHeight: 18 },
  labelMedium: { fontFamily: fontFamilies.interSemiBold, fontSize: 13, lineHeight: 18 },
  labelSmall: { fontFamily: fontFamilies.interMedium, fontSize: 11, lineHeight: 14 },
  button: { fontFamily: fontFamilies.interSemiBold, fontSize: 15, lineHeight: 20 },
} satisfies Record<string, TextStyleToken>;

export type TypographyToken = keyof typeof typography;

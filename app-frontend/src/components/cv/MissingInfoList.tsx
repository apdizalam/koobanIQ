import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { MissingInfo } from '../../types/cv';
import { useTheme } from '../../theme';
import { ListRow } from '../ui/ListRow';

/** Where the user adds each missing item (Profile screens). */
export function missingInfoHref(info: MissingInfo): Href {
  switch (info.type) {
    case 'fullName':
    case 'headline':
    case 'phone':
      return '/profile-edit/personal';
    case 'experience':
    case 'education':
    case 'languages':
      return { pathname: '/profile-edit/[section]', params: { section: info.type } };
    case 'skills':
    case 'requiredSkill':
    case 'preferredSkill':
      return { pathname: '/skills-edit/[id]', params: { id: 'new' } };
  }
}

/**
 * What the profile lacks for this job (computed by the server, never guessed).
 * Each row opens the screen where it is added; then the user generates again.
 */
export function MissingInfoList({ items }: { items: MissingInfo[] }) {
  const { t } = useTranslation();
  const { colors, typography, spacing, radius } = useTheme();
  if (items.length === 0) return null;
  return (
    <View
      testID="cv-missing"
      style={{
        backgroundColor: colors.warningSoft,
        borderRadius: radius.card,
        padding: spacing.card,
        gap: spacing.sm,
      }}
    >
      <Text accessibilityRole="header" style={[typography.h3, { color: colors.text }]}>
        {t('mobile.cv.missing.title')}
      </Text>
      <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
        {t('mobile.cv.missing.hint')}
      </Text>
      {items.map((info, index) => (
        <ListRow
          key={`${info.type}-${info.item ?? index}`}
          testID={`cv-missing-${info.type}${info.item ? `-${info.item}` : ''}`}
          title={t(`mobile.cv.missing.items.${info.type}`, { item: info.item ?? '' })}
          onPress={() => router.push(missingInfoHref(info))}
        />
      ))}
    </View>
  );
}

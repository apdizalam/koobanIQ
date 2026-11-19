import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { CvContent } from '../../types/cv';
import { useTheme } from '../../theme';

/**
 * The CV as text (TIQ-9). Headings, "present" and level names follow the CV's
 * language, not the app language. Every fact comes from the profile (copied by
 * the server); the AI wrote only the headline, summary and bullet points.
 */
export function CvPreview({ content }: { content: CvContent }) {
  const { i18n } = useTranslation();
  const cvT = i18n.getFixedT(content.language);
  const { colors, typography, spacing, radius } = useTheme();
  const h = content.header;
  const place = [
    h.city,
    h.region ? cvT(`common.region.${h.region}` as 'common.region.somalia') : null,
  ]
    .filter(Boolean)
    .join(', ');
  const contact = [place, h.email, h.phone].filter(Boolean).join(' · ');
  const years = (a: number | null, b: number | null) => (a || b ? `${a ?? ''}–${b ?? ''}` : null);

  const section = (key: string, items: number, children: ReactNode) =>
    items === 0 ? null : (
      <View key={key} testID={`cv-section-${key}`} style={{ gap: spacing.sm }}>
        <Text
          accessibilityRole="header"
          style={[
            typography.labelMedium,
            { color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.6 },
          ]}
        >
          {cvT(`mobile.cv.preview.${key}` as 'mobile.cv.preview.summary')}
        </Text>
        {children}
      </View>
    );
  const muted = [typography.bodySmall, { color: colors.textMuted }];
  const bullet = (text: string, key: string) => (
    <Text key={key} style={[typography.body, { color: colors.text }]}>
      • {text}
    </Text>
  );

  return (
    <View
      testID="cv-preview"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.card,
        padding: spacing.card,
        gap: spacing.lg,
      }}
    >
      <View style={{ gap: spacing.xxs }}>
        {h.fullName ? (
          <Text style={[typography.h2, { color: colors.text }]}>{h.fullName}</Text>
        ) : null}
        <Text style={[typography.bodyStrong, { color: colors.text }]}>{h.headline}</Text>
        <Text testID="cv-contact" style={muted}>
          {contact}
        </Text>
      </View>

      {section(
        'summary',
        1,
        <Text style={[typography.body, { color: colors.text }]}>{content.summary}</Text>,
      )}

      {section(
        'experience',
        content.experience.length,
        content.experience.map((e) => (
          <View key={e.id} style={{ gap: spacing.xxs }}>
            <Text style={[typography.bodyStrong, { color: colors.text }]}>
              {e.title} · {e.employer}
            </Text>
            <Text style={muted}>
              {[e.city, `${e.startDate} – ${e.endDate ?? cvT('mobile.cv.preview.present')}`]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {e.bullets.map((b, i) => bullet(b, `${e.id}-${i}`))}
          </View>
        )),
      )}

      {section(
        'education',
        content.education.length,
        content.education.map((e) => (
          <View key={e.id} style={{ gap: spacing.xxs }}>
            <Text style={[typography.bodyStrong, { color: colors.text }]}>{e.school}</Text>
            <Text style={muted}>
              {[e.degree, e.field, years(e.startYear, e.endYear)].filter(Boolean).join(' · ')}
            </Text>
          </View>
        )),
      )}

      {section(
        'skills',
        content.skills.length,
        <Text style={[typography.body, { color: colors.text }]}>
          {content.skills
            .map(
              (s) =>
                `${s.name} (${cvT(`mobile.skills.levels.${s.level}` as 'mobile.skills.levels.mid')}${s.assessed ? `, ${cvT('mobile.cv.preview.assessed')}` : ''})`,
            )
            .join(' · ')}
        </Text>,
      )}

      {section(
        'projects',
        content.projects.length,
        content.projects.map((p) => (
          <View key={p.id} style={{ gap: spacing.xxs }}>
            <Text style={[typography.bodyStrong, { color: colors.text }]}>{p.name}</Text>
            {p.url ? <Text style={muted}>{p.url}</Text> : null}
            {p.bullets.map((b, i) => bullet(b, `${p.id}-${i}`))}
          </View>
        )),
      )}

      {section(
        'certifications',
        content.certifications.length,
        content.certifications.map((c) => (
          <Text key={c.id} style={[typography.body, { color: colors.text }]}>
            {[c.name, c.issuer, c.issuedOn].filter(Boolean).join(' · ')}
          </Text>
        )),
      )}

      {section(
        'languages',
        content.languages.length,
        <Text style={[typography.body, { color: colors.text }]}>
          {content.languages
            .map(
              (l) =>
                `${l.language} (${cvT(`mobile.profile.levels.${l.level}` as 'mobile.profile.levels.basic')})`,
            )
            .join(' · ')}
        </Text>,
      )}
    </View>
  );
}

import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState, type ComponentRef, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  CvIllustration,
  JobsIllustration,
  SkillsIllustration,
} from '../../components/onboarding/Illustrations';
import { Screen } from '../../components/layout/Screen';
import { Button } from '../../components/ui/Button';
import { PageDots } from '../../components/ui/PageDots';
import { TextLink } from '../../components/ui/TextLink';
import { useTheme } from '../../theme';

const SLIDES: { key: 'skills' | 'jobs' | 'cv'; Illustration: ComponentType }[] = [
  { key: 'skills', Illustration: SkillsIllustration },
  { key: 'jobs', Illustration: JobsIllustration },
  { key: 'cv', Illustration: CvIllustration },
];

/** Figma "02 · Onboarding": three slides (swipe or Next), Skip, page dots. */
export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { colors, typography, spacing } = useTheme();
  const { width } = useWindowDimensions();
  const slideWidth = width - spacing.screen * 2;
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  const finish = () => router.replace('/sign-up');

  function goTo(next: number) {
    scroller.current?.scrollTo({ x: next * slideWidth, animated: true });
    setIndex(next);
  }

  function onSwipe(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(Math.round(event.nativeEvent.contentOffset.x / slideWidth));
  }

  return (
    <Screen gap={spacing.lg}>
      <StatusBar style="auto" />
      <View style={styles.skipRow}>
        {last ? null : (
          <TextLink
            label={t('mobile.auth.onboarding.skip')}
            onPress={finish}
            align="flex-end"
            testID="onboarding-skip"
          />
        )}
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onSwipe}
        style={styles.slides}
      >
        {SLIDES.map(({ key, Illustration }) => (
          <View key={key} style={{ width: slideWidth, gap: spacing.xxl }} testID={`slide-${key}`}>
            <Illustration />
            <View style={{ gap: spacing.md }}>
              <Text style={[typography.display, { color: colors.text }]}>
                {t(`mobile.auth.onboarding.${key}.title`)}
              </Text>
              <Text style={[typography.body, { color: colors.textMuted }]}>
                {t(`mobile.auth.onboarding.${key}.body`)}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <PageDots
        count={SLIDES.length}
        active={index}
        label={t('mobile.auth.onboarding.step', { current: index + 1, total: SLIDES.length })}
      />
      <Button
        label={last ? t('mobile.auth.onboarding.start') : t('mobile.auth.onboarding.next')}
        onPress={() => (last ? finish() : goTo(index + 1))}
        testID="onboarding-next"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  skipRow: { minHeight: 24, alignItems: 'flex-end' },
  slides: { flex: 1 },
});

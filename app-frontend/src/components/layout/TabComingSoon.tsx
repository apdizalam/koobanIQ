import { useTranslation } from 'react-i18next';
import { DashboardCard } from '../ui/DashboardCard';
import { TabScreen } from './TabScreen';

type Area = 'cv' | 'jobs' | 'reports';

/**
 * A tab whose feature is built by a later task (CV: TIQ-8/9, Jobs: TIQ-16/18,
 * Reports: TIQ-20). Says plainly what will be here; shows no sample data.
 */
export function TabComingSoon({ area }: { area: Area }) {
  const { t } = useTranslation();
  return (
    <TabScreen testID={`${area}-screen`} title={t(`mobile.tabs.${area}`)}>
      <DashboardCard title={t(`mobile.soon.${area}.title`)} body={t(`mobile.soon.${area}.body`)} />
    </TabScreen>
  );
}

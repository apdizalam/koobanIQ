import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ADMIN_BASE } from './constants/routes';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAdmin } from './auth/RequireAdmin';
import { AdminLayout } from './components/layout/AdminLayout';
import { LoginPage } from './pages/LoginPage';
import { AiPrivacyPage } from './pages/AiPrivacyPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { AssessmentDetailPage } from './pages/AssessmentDetailPage';
import { AssessmentsPage } from './pages/AssessmentsPage';
import { CvsPage } from './pages/CvsPage';
import { JobDetailPage } from './pages/JobDetailPage';
import { JobsPage } from './pages/JobsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ReportsPage } from './pages/ReportsPage';
import { ResearchRunDetailPage } from './pages/ResearchRunDetailPage';
import { ResearchRunsPage } from './pages/ResearchRunsPage';
import { UsagePage } from './pages/UsagePage';
import { JobSourcesPage } from './pages/JobSourcesPage';
import { OverviewPage } from './pages/OverviewPage';
import { UserDetailPage } from './pages/UserDetailPage';
import { UsersPage } from './pages/UsersPage';

export default function App() {
  return (
    <AuthProvider>
      {/* All admin addresses start with /admin (the landing page is the site's home). */}
      <BrowserRouter basename={ADMIN_BASE}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<OverviewPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="users/:id" element={<UserDetailPage />} />
            <Route path="skills" element={<AssessmentsPage />} />
            <Route path="skills/:id" element={<AssessmentDetailPage />} />
            <Route path="cvs" element={<CvsPage />} />
            <Route path="jobs" element={<JobsPage />} />
            <Route path="jobs/:id" element={<JobDetailPage />} />
            <Route path="job-sources" element={<JobSourcesPage />} />
            <Route path="research-runs" element={<ResearchRunsPage />} />
            <Route path="research-runs/:id" element={<ResearchRunDetailPage />} />
            <Route path="usage" element={<UsagePage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="ai-privacy" element={<AiPrivacyPage />} />
            <Route path="audit-log" element={<AuditLogPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

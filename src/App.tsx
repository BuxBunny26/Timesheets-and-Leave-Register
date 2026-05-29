import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import TimesheetsPage from './pages/TimesheetsPage'
import LeavePage from './pages/LeavePage'
import ApprovalsPage from './pages/ApprovalsPage'
import NotificationsPage from './pages/NotificationsPage'
import ProfilePage from './pages/ProfilePage'
import ReportsPage from './pages/ReportsPage'
import DocumentsPage from './pages/DocumentsPage'
import EmployeeDirectoryPage from './pages/EmployeeDirectoryPage'
import EmployeeDetailPage from './pages/EmployeeDetailPage'
import BirthdaysPage from './pages/BirthdaysPage'
import WorkAnniversariesPage from './pages/WorkAnniversariesPage'
import CertificationsDashboardPage from './pages/CertificationsDashboardPage'
import TrainingPage from './pages/TrainingPage'
import MyVerificationPage from './pages/MyVerificationPage'
import Layout from './components/Layout'
import ResetPasswordPage from './pages/ResetPasswordPage'
import { NotificationsProvider } from './contexts/NotificationsContext'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { session, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )
  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="timesheets" element={<TimesheetsPage />} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="my-verification" element={<MyVerificationPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="employees" element={<EmployeeDirectoryPage />} />
        <Route path="employees/birthdays" element={<BirthdaysPage />} />
        <Route path="employees/anniversaries" element={<WorkAnniversariesPage />} />
        <Route path="employees/certifications" element={<CertificationsDashboardPage />} />
        <Route path="employees/:id" element={<EmployeeDetailPage />} />
        <Route path="training" element={<TrainingPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationsProvider>
          <AppRoutes />
        </NotificationsProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

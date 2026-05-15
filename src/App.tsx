import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import Layout from './components/Layout'
import { NotificationsProvider } from './contexts/NotificationsContext'

const DashboardPage     = lazy(() => import('./pages/DashboardPage'))
const TimesheetsPage    = lazy(() => import('./pages/TimesheetsPage'))
const LeavePage         = lazy(() => import('./pages/LeavePage'))
const ApprovalsPage     = lazy(() => import('./pages/ApprovalsPage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const ProfilePage       = lazy(() => import('./pages/ProfilePage'))
const ReportsPage       = lazy(() => import('./pages/ReportsPage'))
const AdminPage         = lazy(() => import('./pages/AdminPage'))
const VerificationPage  = lazy(() => import('./pages/VerificationPage'))

function PageLoader() {
  return (
    <div className="flex justify-center py-16">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#1B5EA6]" />
    </div>
  )
}

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
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="timesheets" element={<TimesheetsPage />} />
          <Route path="leave" element={<LeavePage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="verify" element={<VerificationPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
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

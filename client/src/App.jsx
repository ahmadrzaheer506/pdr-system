import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { PageLoading } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import StaffLayout from './components/StaffLayout.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inbox from './pages/Inbox.jsx';
import Pipeline from './pages/Pipeline.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import Quotes from './pages/Quotes.jsx';
import Schedule from './pages/Schedule.jsx';
import Invoices from './pages/Invoices.jsx';
import Holidays from './pages/Holidays.jsx';
import Tasks from './pages/Tasks.jsx';
import Timesheets from './pages/Timesheets.jsx';
import TeamChat from './pages/TeamChat.jsx';
import Settings from './pages/Settings.jsx';

import StaffJobs from './pages/staff/StaffJobs.jsx';
import StaffJobDetail from './pages/staff/StaffJobDetail.jsx';
import StaffHolidays from './pages/staff/StaffHolidays.jsx';
import StaffHours from './pages/staff/StaffHours.jsx';
import StaffChat from './pages/staff/StaffChat.jsx';

function OfficeRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'STAFF') return <Navigate to="/staff" replace />;
  return <Layout>{children}</Layout>;
}

function StaffRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'STAFF') return <Navigate to="/" replace />;
  return <StaffLayout>{children}</StaffLayout>;
}

export default function App() {
  const { loading } = useAuth();
  if (loading) return <PageLoading />;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={<OfficeRoute><Dashboard /></OfficeRoute>} />
      <Route path="/inbox" element={<OfficeRoute><Inbox /></OfficeRoute>} />
      <Route path="/pipeline" element={<OfficeRoute><Pipeline /></OfficeRoute>} />
      <Route path="/customers/:id" element={<OfficeRoute><CustomerDetail /></OfficeRoute>} />
      <Route path="/quotes" element={<OfficeRoute><Quotes /></OfficeRoute>} />
      <Route path="/schedule" element={<OfficeRoute><Schedule /></OfficeRoute>} />
      <Route path="/invoices" element={<OfficeRoute><Invoices /></OfficeRoute>} />
      <Route path="/holidays" element={<OfficeRoute><Holidays /></OfficeRoute>} />
      <Route path="/tasks" element={<OfficeRoute><Tasks /></OfficeRoute>} />
      <Route path="/timesheets" element={<OfficeRoute><Timesheets /></OfficeRoute>} />
      <Route path="/chat" element={<OfficeRoute><TeamChat /></OfficeRoute>} />
      <Route path="/settings" element={<OfficeRoute><Settings /></OfficeRoute>} />

      <Route path="/staff" element={<StaffRoute><StaffJobs /></StaffRoute>} />
      <Route path="/staff/jobs/:id" element={<StaffRoute><StaffJobDetail /></StaffRoute>} />
      <Route path="/staff/hours" element={<StaffRoute><StaffHours /></StaffRoute>} />
      <Route path="/staff/holidays" element={<StaffRoute><StaffHolidays /></StaffRoute>} />
      <Route path="/staff/chat" element={<StaffRoute><StaffChat /></StaffRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

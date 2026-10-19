import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './context';
import Layout from './components/Layout';
import { Loading } from './components/common';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Expenses from './pages/Expenses';
import Income from './pages/Income';
import Investments from './pages/Investments';
import Cards from './pages/Cards';
import Insights from './pages/Insights';
import Settings from './pages/Settings';
import People from './pages/People';

export default function App() {
  const { user, isAdmin } = useApp();
  if (user === undefined) return <Loading />;
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="income" element={<Income />} />
        <Route path="investments" element={<Investments />} />
        <Route path="cards" element={<Cards />} />
        <Route path="insights" element={<Insights />} />
        <Route path="settings" element={<Settings />} />
        {isAdmin && <Route path="people" element={<People />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

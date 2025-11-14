import React from 'react';
import { Routes, Route } from 'react-router-dom';
import RequireAuth from './auth/RequireAuth';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import NotesPage from './pages/NotesPage';
import ArenaPage from './pages/ArenaPage';
import EvalPage from './pages/EvalPage';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><><Navbar /><Dashboard /></></RequireAuth>} />
      <Route path="/notes" element={<RequireAuth><><Navbar /><NotesPage /></></RequireAuth>} />
      <Route path="/arena" element={<RequireAuth><><Navbar /><ArenaPage /></></RequireAuth>} />
      <Route path="/eval" element={<RequireAuth><><Navbar /><EvalPage /></></RequireAuth>} />
    </Routes>
  );
};

export default App;

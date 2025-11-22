import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const Navbar: React.FC = () => {
  const { user, logout, loading } = useAuth();
  const nav = useNavigate();
  return (
    <div className="navbar">
      <div className="brand">
        <span className="brand-pip" />
        StrategicInteractionLab
      </div>
      {user && (
        <div className="right">
          <Link to="/arena" className="nav-link">Arena</Link>
          <Link to="/notes" className="nav-link">Notes</Link>
          <Link to="/eval" className="nav-link">Eval</Link>
          <span className="nav-user">{user.email}</span>
          <button onClick={async () => { await logout(); nav('/login'); }} disabled={loading}>Logout</button>
        </div>
      )}
    </div>
  );
};

export default Navbar;

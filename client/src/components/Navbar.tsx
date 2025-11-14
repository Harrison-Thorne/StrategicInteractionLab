import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const Navbar: React.FC = () => {
  const { user, logout, loading } = useAuth();
  const nav = useNavigate();
  return (
    <div className="navbar">
      <div className="brand">StrategicInteractionLab</div>
      {user && (
        <div className="right">
          <Link to="/arena" style={{ color: 'inherit', textDecoration: 'none' }}>Arena</Link>
          <Link to="/notes" style={{ color: 'inherit', textDecoration: 'none' }}>Notes</Link>
          <Link to="/eval" style={{ color: 'inherit', textDecoration: 'none' }}>Eval</Link>
          <span>{user.email}</span>
          <button onClick={async () => { await logout(); nav('/login'); }} disabled={loading}>Logout</button>
        </div>
      )}
    </div>
  );
};

export default Navbar;

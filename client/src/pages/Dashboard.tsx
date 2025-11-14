import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../auth/AuthContext';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    async function run() {
      try {
        const res = await api.get('/api/hello');
        setMessage(res.data?.message || '');
      } catch (e) {
        setMessage('');
      }
    }
    run();
  }, []);

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Hi, {user?.email}</h2>
        <p className="muted">{message || '...'}</p>
      </div>
    </div>
  );
};

export default Dashboard;


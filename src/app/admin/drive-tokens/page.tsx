'use client';

import React from 'react';

export default function DriveTokensAdminPage() {
  const [uid, setUid] = React.useState('');
  const [info, setInfo] = React.useState<any | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [adminToken, setAdminToken] = React.useState('');

  React.useEffect(() => {
    const stored = window.localStorage.getItem('admin_api_token');
    if (stored) setAdminToken(stored);
  }, []);

  const fetchInfo = async () => {
    setError(null);
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (adminToken) headers['x-admin-token'] = adminToken;
      const res = await fetch(`/api/admin/drive-tokens?uid=${encodeURIComponent(uid)}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');
      setInfo(data);
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const clearToken = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/drive-tokens', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { 'x-admin-token': adminToken } : {}),
        },
        body: JSON.stringify({ uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to clear');
      setInfo(null);
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: '2rem auto', padding: 16 }}>
      <h1>Drive Tokens Admin</h1>
      <p style={{ color: '#666' }}>Provide your admin API token to authorize requests. The token is stored locally in your browser.</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          type="password"
          value={adminToken}
          onChange={(e) => setAdminToken(e.target.value)}
          placeholder="Admin API Token"
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={() => window.localStorage.setItem('admin_api_token', adminToken)}>Save Token</button>
      </div>
      <p>Enter a UID to view/clear the stored Google Drive refresh token.</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          value={uid}
          onChange={(e) => setUid(e.target.value)}
          placeholder="User UID"
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={fetchInfo} disabled={!uid || loading}>
          {loading ? 'Loading...' : 'Fetch'}
        </button>
      </div>
      {error && (
        <div style={{ marginTop: 12, color: 'crimson' }}>Error: {error}</div>
      )}
      {info && (
        <div style={{ marginTop: 12 }}>
          <div>UID: {info.uid}</div>
          <div>Has Token: {String(info.hasToken)}</div>
          {info.updatedAt && <div>Updated: {String(info.updatedAt)}</div>}
          <button onClick={clearToken} style={{ marginTop: 12 }}>
            Clear Token
          </button>
        </div>
      )}
    </div>
  );
}

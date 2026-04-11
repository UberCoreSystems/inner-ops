import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { handleOAuthCallback } from '../utils/ouraService';
import logger from '../utils/logger';

const OuraCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const errParam = params.get('error');

    if (errParam) {
      setStatus('error');
      setError(errParam === 'access_denied' ? 'Authorization denied.' : `Oura auth error: ${errParam}`);
      return;
    }

    if (!code) {
      setStatus('error');
      setError('No authorization code received.');
      return;
    }

    handleOAuthCallback(code, state)
      .then(() => {
        setStatus('success');
        setTimeout(() => navigate('/relapse'), 1500);
      })
      .catch((err) => {
        logger.error('Oura callback error:', err);
        setStatus('error');
        setError(err.message || 'Connection failed.');
      });
  }, [navigate]);

  return (
    <div className="flex items-center justify-center h-screen bg-black text-white">
      <div className="text-center max-w-sm px-6">
        {status === 'processing' && (
          <>
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-red-500 mx-auto mb-6" />
            <p className="text-gray-400 text-sm">Connecting Oura Ring...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="text-green-400 text-5xl mb-4">✓</div>
            <p className="text-white text-sm">Oura Ring connected. Redirecting...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-red-400 text-5xl mb-4">✗</div>
            <p className="text-red-400 text-sm mb-4">{error}</p>
            <button
              onClick={() => navigate('/relapse')}
              className="text-gray-500 text-xs hover:text-gray-300 transition-colors"
            >
              Return to Relapse Radar
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default OuraCallback;

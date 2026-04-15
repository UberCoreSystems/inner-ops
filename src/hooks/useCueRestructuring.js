import { useState, useEffect, useCallback } from 'react';
import { readUserData } from '../utils/firebaseUtils';
import logger from '../utils/logger';

const useCueRestructuring = () => {
  const [restructurings, setRestructurings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await readUserData('cueRestructurings');
      setRestructurings(data || []);
    } catch (err) {
      logger.error('useCueRestructuring: fetch failed', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { restructurings, loading, error, refetch };
};

export default useCueRestructuring;

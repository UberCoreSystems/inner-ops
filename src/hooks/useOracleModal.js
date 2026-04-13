import { useState, useCallback } from 'react';

const INITIAL_STATE = { isOpen: false, content: '', isLoading: false, entryCount: null, metacognitiveDepth: null, entryText: '', entryModuleName: '' };

export const useOracleModal = () => {
  const [oracleModal, setOracleModal] = useState(INITIAL_STATE);

  const openLoading = useCallback(() => {
    setOracleModal({ isOpen: true, content: '', isLoading: true, entryCount: null, metacognitiveDepth: null, entryText: '', entryModuleName: '' });
  }, []);

  // BER-197: entryCount threads the low-data calibration constraint to OracleModal regen
  // BER-225: metacognitiveDepth passes journal depth classification through to OracleModal
  // BER-238: entryText + entryModuleName enable regen and follow-up buttons (canRegen/canFollowUp gate on !!entryText)
  const openWithContent = useCallback((content, entryCount = null, metacognitiveDepth = null, entryText = '', entryModuleName = '') => {
    setOracleModal({ isOpen: true, content, isLoading: false, entryCount, metacognitiveDepth, entryText, entryModuleName });
  }, []);

  const close = useCallback(() => {
    setOracleModal(INITIAL_STATE);
  }, []);

  return { oracleModal, openLoading, openWithContent, close };
};

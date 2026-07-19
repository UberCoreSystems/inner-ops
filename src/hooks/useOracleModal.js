import { useState, useCallback } from 'react';

const INITIAL_STATE = {
  isOpen: false,
  content: '',
  isLoading: false,
  entryCount: null,
  metacognitiveDepth: null,
  entryText: '',
  entryModuleName: '',
  // Whether `content` came from Claude or from the local template composer.
  // null means "not Oracle output at all" — system messages such as a save
  // failure go through this modal too and must not be labeled either way.
  provenance: null,
  fallbackReason: null,
};

export const useOracleModal = () => {
  const [oracleModal, setOracleModal] = useState(INITIAL_STATE);

  const openLoading = useCallback(() => {
    setOracleModal({ ...INITIAL_STATE, isOpen: true, isLoading: true });
  }, []);

  // BER-197: entryCount threads the low-data calibration constraint to OracleModal regen
  // BER-225: metacognitiveDepth passes journal depth classification through to OracleModal
  // BER-238: entryText + entryModuleName enable regen and follow-up buttons (canRegen/canFollowUp gate on !!entryText)
  //
  // Options object rather than positional args: this had already reached five
  // parameters, and callers were passing `null, null, ''` to reach the last one.
  const openWithContent = useCallback(({ content = '', ...rest } = {}) => {
    setOracleModal({ ...INITIAL_STATE, ...rest, isOpen: true, isLoading: false, content });
  }, []);

  const close = useCallback(() => {
    setOracleModal(INITIAL_STATE);
  }, []);

  return { oracleModal, openLoading, openWithContent, close };
};

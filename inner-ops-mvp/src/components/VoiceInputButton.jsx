
import React from 'react';
import { useVoiceInput } from '../utils/useVoiceInput';

const VoiceInputButton = ({ onTranscript, disabled = false }) => {
  const { isListening, isSupported, startListening, stopListening } = useVoiceInput();

  const handleClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening((transcript) => {
        onTranscript(transcript);
      });
    }
  };

  if (!isSupported) {
    return null; // Hide button if not supported
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`p-2 rounded-lg transition-colors ${
        isListening 
          ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse' 
          : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
      title={isListening ? 'Stop recording' : 'Start voice input'}
    >
      {isListening ? '🔴' : '🎤'}
    </button>
  );
};

export default VoiceInputButton;

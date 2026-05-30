import { useVoiceInput } from '../hooks/useVoiceInput';
import ouraToast from '../utils/toast';

const VoiceInputButton = ({ onTranscript, disabled = false }) => {
  const { isListening, isSupported, startListening, stopListening } = useVoiceInput();

  const handleClick = () => {
    if (isListening) {
      stopListening();
    } else {
      // Pass 3 New Finding 4 remediation: surface mic permission failures
      // to the user via a toast instead of failing silently.
      startListening(
        (transcript) => onTranscript(transcript),
        undefined,
        (err) => ouraToast.error(err?.message || 'Voice input unavailable.')
      );
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

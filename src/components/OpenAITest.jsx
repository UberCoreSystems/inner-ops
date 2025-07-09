import React, { useState } from 'react';
import { generateAIFeedback } from '../utils/aiFeedback';

const OpenAITest = () => {
  const [testInput, setTestInput] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState('');

  const checkApiKey = () => {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      setApiKeyStatus('❌ No API key found');
    } else if (apiKey === 'your_openai_api_key_here') {
      setApiKeyStatus('⚠️ Placeholder API key detected - needs to be replaced');
    } else if (apiKey.startsWith('sk-')) {
      setApiKeyStatus('✅ Valid API key format detected');
    } else {
      setApiKeyStatus('⚠️ API key format may be invalid (should start with "sk-")');
    }
  };

  React.useEffect(() => {
    checkApiKey();
  }, []);

  const testAIFeedback = async () => {
    if (!testInput.trim()) {
      setFeedback('Please enter some test input');
      return;
    }

    setLoading(true);
    try {
      const result = await generateAIFeedback(
        'Journal', 
        testInput, 
        ['Previous entry 1', 'Previous entry 2']
      );
      setFeedback(result);
    } catch (error) {
      setFeedback(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const quickTests = [
    { 
      label: 'Test Journal Entry', 
      input: 'I had a challenging day at work today. Feeling overwhelmed with deadlines.' 
    },
    { 
      label: 'Test BlackMirror Entry', 
      input: 'Spent 4 hours mindlessly scrolling social media instead of working on my goals.' 
    },
    { 
      label: 'Test Relapse Entry', 
      input: 'I broke my promise to myself again and fell back into old habits.' 
    }
  ];

  return (
    <div className="p-6 bg-gray-800 rounded-lg shadow-lg max-w-4xl mx-auto mt-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">🤖 OpenAI API Connection Test</h2>
        <p className="text-gray-300">
          Test your OpenAI API integration for AI feedback functionality.
        </p>
      </div>

      {/* API Key Status */}
      <div className="mb-6 p-4 bg-gray-700 rounded-lg">
        <h3 className="text-lg font-semibold text-white mb-2">🔑 API Key Status</h3>
        <div className="text-sm">
          <span className="text-gray-400">Status: </span>
          <span className={`${
            apiKeyStatus.includes('✅') ? 'text-green-400' : 
            apiKeyStatus.includes('⚠️') ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {apiKeyStatus}
          </span>
        </div>
        
        {apiKeyStatus.includes('⚠️') || apiKeyStatus.includes('❌') ? (
          <div className="mt-3 p-3 bg-yellow-900 border border-yellow-700 rounded">
            <h4 className="text-yellow-200 font-semibold mb-2">🛠️ How to Fix:</h4>
            <ol className="text-yellow-100 text-sm space-y-1">
              <li>1. Get your OpenAI API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">OpenAI Platform</a></li>
              <li>2. Open your <code className="bg-gray-800 px-1 rounded">.env</code> file</li>
              <li>3. Replace <code className="bg-gray-800 px-1 rounded">your_openai_api_key_here</code> with your actual API key</li>
              <li>4. Make sure your API key starts with <code className="bg-gray-800 px-1 rounded">sk-</code></li>
              <li>5. Restart your development server</li>
            </ol>
          </div>
        ) : null}
      </div>

      {/* Quick Test Buttons */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-3">⚡ Quick Tests</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {quickTests.map((test, index) => (
            <button
              key={index}
              onClick={() => setTestInput(test.input)}
              className="p-3 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >
              {test.label}
            </button>
          ))}
        </div>
      </div>

      {/* Test Input */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-3">📝 Test Input</h3>
        <textarea
          value={testInput}
          onChange={(e) => setTestInput(e.target.value)}
          placeholder="Enter some text to test AI feedback (e.g., journal entry, thoughts, experiences)..."
          className="w-full h-32 p-3 bg-gray-700 text-white border border-gray-600 rounded-lg resize-none focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={testAIFeedback}
          disabled={loading || !testInput.trim()}
          className="mt-3 px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '🤔 Generating AI Feedback...' : '🧠 Generate AI Feedback'}
        </button>
      </div>

      {/* AI Response */}
      {feedback && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">🔮 AI Response</h3>
          <div className="p-4 bg-gray-700 rounded-lg">
            <pre className="text-gray-200 whitespace-pre-wrap text-sm leading-relaxed">
              {feedback}
            </pre>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 p-4 bg-blue-900 rounded-lg border border-blue-700">
        <h4 className="text-white font-semibold mb-2">📋 Setup Instructions</h4>
        <div className="text-blue-100 text-sm space-y-2">
          <p><strong>1. Get OpenAI API Key:</strong></p>
          <ul className="ml-4 space-y-1">
            <li>• Go to <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">OpenAI Platform</a></li>
            <li>• Create a new API key</li>
            <li>• Copy the key (starts with "sk-")</li>
          </ul>
          
          <p><strong>2. Add to Environment:</strong></p>
          <ul className="ml-4 space-y-1">
            <li>• Open <code className="bg-gray-800 px-1 rounded">.env</code> file in your project root</li>
            <li>• Replace <code className="bg-gray-800 px-1 rounded">your_openai_api_key_here</code> with your actual key</li>
            <li>• Save the file</li>
          </ul>
          
          <p><strong>3. Restart Development Server:</strong></p>
          <ul className="ml-4 space-y-1">
            <li>• Stop your current server (Ctrl+C)</li>
            <li>• Run <code className="bg-gray-800 px-1 rounded">npm run dev</code> again</li>
            <li>• Test the AI feedback functionality</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default OpenAITest;

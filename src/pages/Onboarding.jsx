
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Onboarding() {
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();

  const steps = [
    {
      title: 'Welcome to Inner Operations',
      content: 'This is your personal command center for growth, recovery, and self-improvement. Here you can track your progress, reflect on your journey, and stay accountable to your goals.'
    },
    {
      title: 'Your Journal',
      content: 'Daily reflection is key to growth. Use the journal to capture your thoughts, feelings, and insights. Regular writing helps you process experiences and track patterns.'
    },
    {
      title: 'Kill List',
      content: 'Set clear targets and goals. The Kill List helps you focus on what needs to be eliminated or achieved in your life. Stay focused, stay determined.'
    },
    {
      title: 'Compass Check',
      content: 'Regular self-assessment keeps you on track. Use the Compass Check to evaluate your direction and make course corrections when needed.'
    },
    {
      title: 'Relapse Radar',
      content: 'Stay vigilant about warning signs. The Relapse Radar helps you identify triggers and high-risk situations before they become problems.'
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      navigate('/dashboard');
    }
  };

  const handleSkip = () => {
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4">
      <div className="max-w-2xl w-full">
        <div className="bg-gray-800 rounded-lg p-8">
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm text-gray-400">
                Step {currentStep + 1} of {steps.length}
              </span>
              <div className="flex space-x-1">
                {steps.map((_, index) => (
                  <div
                    key={index}
                    className={`w-2 h-2 rounded-full ${
                      index <= currentStep ? 'bg-blue-500' : 'bg-gray-600'
                    }`}
                  />
                ))}
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">
              {steps[currentStep].title}
            </h1>
            <p className="text-gray-300 text-lg leading-relaxed">
              {steps[currentStep].content}
            </p>
          </div>

          <div className="flex justify-between">
            <button
              onClick={handleSkip}
              className="text-gray-400 hover:text-white transition-colors"
            >
              Skip Tour
            </button>
            <button
              onClick={handleNext}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded transition-colors"
            >
              {currentStep < steps.length - 1 ? 'Next' : 'Get Started'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

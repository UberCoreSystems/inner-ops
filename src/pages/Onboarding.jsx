
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
    <div className="min-h-screen flex items-center justify-center bg-black text-white py-12 px-6">
      <div className="max-w-2xl w-full">
        <div className="bg-gradient-to-br from-gray-900/80 to-gray-950/80 backdrop-blur-sm rounded-3xl p-8 border border-gray-800/50 oura-card">
          <div className="mb-8">
            <div className="flex justify-between items-center mb-6">
              <span className="text-sm text-gray-400 font-light tracking-wide">
                Step {currentStep + 1} of {steps.length}
              </span>
              <div className="flex space-x-2">
                {steps.map((_, index) => (
                  <div
                    key={index}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      index <= currentStep ? 'bg-blue-500 shadow-lg shadow-blue-500/50' : 'bg-gray-600'
                    }`}
                  />
                ))}
              </div>
            </div>
            <h1 className="text-2xl font-light text-white mb-6 tracking-wide">
              {steps[currentStep].title}
            </h1>
            <p className="text-gray-300 text-base leading-relaxed font-light">
              {steps[currentStep].content}
            </p>
          </div>

          <div className="flex justify-between items-center">
            <button
              onClick={handleSkip}
              className="text-gray-400 hover:text-white transition-all duration-300 font-light tracking-wide"
            >
              Skip Tour
            </button>
            <button
              onClick={handleNext}
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white px-8 py-3 rounded-2xl transition-all duration-300 font-light tracking-wide shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
            >
              {currentStep < steps.length - 1 ? 'Next' : 'Get Started'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

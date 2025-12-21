
import React from 'react';
import RelapseRadar from '../components/RelapseRadar';

export default function Relapse() {
  return (
    <div className="min-h-screen bg-black py-8">
      <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8">
        <h1 className="text-4xl md:text-5xl font-light text-white mb-8 tracking-tight animate-fade-in-up">
          Relapse Radar
        </h1>
        <RelapseRadar />
      </div>
    </div>
  );
}

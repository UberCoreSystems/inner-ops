
import React from 'react';
import RelapseRadar from '../components/RelapseRadar';

export default function Relapse() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-12 fade-in">
          <h1 className="text-2xl font-light text-white mb-2 tracking-wide">Relapse Radar</h1>
        </div>
        <RelapseRadar />
      </div>
    </div>
  );
}

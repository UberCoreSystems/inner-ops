
import React from 'react';
import RelapseRadar from '../components/RelapseRadar';

export default function Relapse() {
  return (
    <div className="min-h-screen bg-gray-900 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-white mb-8">Relapse Radar</h1>
        <RelapseRadar />
      </div>
    </div>
  );
}


import { useState } from 'react';
import RelapseRadar from '../components/RelapseRadar';
import QuickSignalLog from '../components/QuickSignalLog';
import { AppIcon } from '../components/AppIcons';
import ModuleIntro from '../components/help/ModuleIntro';

// This page owns no data. RelapseRadar fetches its own entries and renders its
// own skeleton while it does, so there is no page-level loading state here — an
// earlier fixed 50ms timer showed a skeleton unrelated to any real fetch.
export default function Relapse() {
  // Bumped after a quick-log so RelapseRadar remounts and re-reads its pattern
  // data (it loads on mount). Cheap and keeps the wizard component untouched.
  const [radarKey, setRadarKey] = useState(0);

  return (
    <div className="min-h-screen bg-black py-8">
      <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="mb-8 animate-fade-in-up">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-[#00d4aa]/10 border border-[#00d4aa]/20 flex items-center justify-center shrink-0">
              <AppIcon name="relapse" size={22} color="#00d4aa" glow={false} />
            </div>
            <h1 className="text-4xl md:text-5xl font-light text-white tracking-tight">
              The Signal
            </h1>
          </div>
          <div className="border-l-4 border-[#00d4aa] pl-4 py-1">
            <p className="text-[#ababab]">Catch the drift before it compounds.</p>
          </div>
          <div className="mt-4">
            <QuickSignalLog onLogged={() => setRadarKey((k) => k + 1)} />
          </div>
        </div>

        <ModuleIntro
          moduleId="relapse"
          onAction={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            document.querySelector('#quick-signal-input')?.focus();
          }}
        />

        <RelapseRadar key={radarKey} />
      </div>
    </div>
  );
}

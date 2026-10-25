
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import RelapseRadar from '../components/RelapseRadar';
import GroundingProtocol from '../components/GroundingProtocol';
import { AppIcon } from '../components/AppIcons';
import ModuleIntro from '../components/help/ModuleIntro';
import { getModuleIntro } from '../config/moduleIntros';

// This page owns no data. RelapseRadar fetches its own entries and renders its
// own skeleton while it does, so there is no page-level loading state here — an
// earlier fixed 50ms timer showed a skeleton unrelated to any real fetch.
export default function Relapse() {
  // Bumped after a protocol run logs an entry so RelapseRadar remounts and
  // re-reads its pattern data (it loads on mount).
  const [radarKey, setRadarKey] = useState(0);

  // `/relapse?protocol=1` is the Dashboard Early Warning deep link: land with
  // the Protocol already open. Cleared on close so a reload stays closed.
  const [searchParams, setSearchParams] = useSearchParams();
  const arrivedForProtocol = searchParams.get('protocol') === '1';
  const [protocolOpen, setProtocolOpen] = useState(arrivedForProtocol);
  const [protocolSource, setProtocolSource] = useState(arrivedForProtocol ? 'early_warning' : 'signal');

  const openProtocol = () => {
    setProtocolSource('signal');
    setProtocolOpen(true);
  };

  const closeProtocol = () => {
    setProtocolOpen(false);
    if (searchParams.has('protocol')) setSearchParams({}, { replace: true });
  };

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
            <p className="text-[#ababab]">{getModuleIntro('relapse').definition}</p>
          </div>
          <div className="mt-4">
            {protocolOpen ? (
              <GroundingProtocol
                mode="full"
                source={protocolSource}
                onLogged={() => setRadarKey((k) => k + 1)}
                onClose={closeProtocol}
              />
            ) : (
              <button
                id="protocol-launch"
                type="button"
                onClick={openProtocol}
                className="text-sm text-[#00d4aa] border border-[#00d4aa]/30 hover:border-[#00d4aa]/60 rounded-xl px-4 py-2 min-h-11 transition-colors"
              >
                Run protocol
              </button>
            )}
          </div>
        </div>

        <ModuleIntro moduleId="relapse" />

        <RelapseRadar key={radarKey} />
      </div>
    </div>
  );
}

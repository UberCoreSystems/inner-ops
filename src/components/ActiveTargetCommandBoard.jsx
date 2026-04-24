import React from 'react';
import { Link } from 'react-router-dom';

export default function ActiveTargetCommandBoard({ killTargets = [] }) {
  const active = (killTargets || [])
    .filter(t => t?.status === 'active')
    .sort((a, b) => (b.streak || 0) - (a.streak || 0))
    .slice(0, 3);

  if (active.length === 0) return null;

  return (
    <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.03s' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[#858585] text-xs uppercase tracking-widest">Active Targets</h3>
        <Link to="/ledger" className="text-[#858585] text-xs hover:text-[#ef4444] transition-colors">
          View all
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {active.map(target => {
          const streak = target.streak || 0;
          const required = target.consecutiveDaysRequired || 21;
          const intention = target.implementationIntention;
          const intentionArmed = !!(
            intention?.trigger &&
            intention?.response &&
            intention.trigger.trim().length >= 20 &&
            intention.response.trim().length >= 20
          );

          return (
            <Link
              key={target.id}
              to="/ledger"
              className="oura-card-active p-5 block hover:shadow-[0_0_32px_rgba(239,68,68,0.15)]"
            >
              <p className="text-white text-sm font-medium mb-3 line-clamp-2 min-h-[2.5rem]">
                {target.title}
              </p>
              <p className="oura-gradient-text text-2xl font-light tabular-nums mb-1">
                Day {streak}
              </p>
              <p className="text-[#858585] text-xs mb-3">
                held. {streak} of {required} required.
              </p>
              <p className={`text-xs ${intentionArmed ? 'text-[#ef4444]/70' : 'text-[#6a6a6a]'}`}>
                Intention {intentionArmed ? 'armed' : 'not set'}.
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

# Inner Ops — Clarity Scoring System

## Philosophy

Clarity score is not a wellness metric. It is a measure of behavioral self-command — the degree to which you are actively governing your mind, eliminating weakness, and converting suffering into structure.

The scoring system is designed to reflect product philosophy:
- **Kill List execution outweighs passive habits.** Naming and killing a behavioral pattern is harder and more valuable than journaling streaks.
- **Action beats documentation.** Completing a target earns more than logging one.
- **Honesty over gaming.** Relapse entries require reflection. Black Mirror entries require commitment. No empty logging.

---

## Scoring Weights

### Journal (`JOURNAL_ENTRY`)
- **2 pts** per entry with ≥50 characters (temporal decay applied)
- Streak bonuses (cumulative):
  - 7-day streak: +15 pts
  - 30-day streak: +40 pts (cumulative: +55)
  - 90-day streak: +75 pts (cumulative: +130)

> Streaks reward consistency but are capped — journaling alone cannot carry a score. Kill List execution must dominate.

### Kill List

| Event | Points |
|---|---|
| Target added | 2 pts |
| Surface completion (7-day streak) | 20 pts |
| Deep completion (21-day streak) | 50 pts |
| Core completion (60-day streak) | 100 pts |
| Streak milestone (per 7-day on active) | 5 pts |

**Completion Rate Multiplier:**
- Baseline: 1.0× (no penalty for having incomplete targets — adding targets is never punished)
- 60%+ completion rate: 1.2×
- 80%+ completion rate: 1.5×

**Temporal Decay:** Not applied to Kill targets. A behavioral conquest is permanent. Killing a pattern at any point in your history represents lasting structural change — unlike insights (which fade in urgency), victories don't decay.

**Difficulty Resolution:** `target.difficulty` → `DIFF_MAP[target.priority]` → `'deep'` (fallback logs a console warning if triggered).

### Hard Lessons

| Event | Points |
|---|---|
| Lesson extracted (≥30 chars) | 15 pts × temporal weight |
| Finalized with rule going forward (≥20 chars) | +25 pts × temporal weight |

**Temporal Decay:**
- ≤30 days: 1.0×
- 31–90 days: 0.6×
- 91–180 days: 0.3×
- >180 days: 0.1×

### Black Mirror

| Event | Points |
|---|---|
| Weekly check completed | 8 pts |
| Low index bonus (index < 10) | +5 pts |

One bonus awarded per week per user. Week boundaries are calculated in UTC to prevent timezone misbucketing.

### Relapse Radar

| Event | Points |
|---|---|
| Check-in with reflection (≥20 chars) | 10 pts |
| Detailed reflection (>100 chars) | +8 pts |

**Scoring cap: 20 entries.** Entries beyond 20 earn nothing. The cap prevents gaming and forces real engagement rather than volume logging.

---

## Rank Thresholds

| Score | Rank |
|---|---|
| 0–24 | Clarity Novice |
| 25–74 | Clarity Beginner |
| 75–149 | Clarity Apprentice |
| 150–299 | Clarity Student |
| 300–499 | Clarity Practitioner |
| 500–749 | Clarity Seeker |
| 750–1099 | Clarity Expert |
| 1100+ | Clarity Master |

The Expert→Master stretch (350 pts) is intentionally harder than all prior tier gaps (~250 pts each). Master requires sustained multi-module execution over an extended period — not a single sprint.

---

## Scoring Integrity Rules

1. Minimum content thresholds are enforced (journal ≥50 chars, lesson ≥30 chars, reflection ≥20 chars). Empty or trivial entries earn nothing.
2. Kill List difficulty defaults are logged as warnings — silent fallbacks are flagged.
3. Temporal decay is module-specific and intentional. See per-module notes above.
4. All scoring is read-only from user data — no server-side mutations in score calculation.

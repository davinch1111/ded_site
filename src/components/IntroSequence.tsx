import { useEffect, useState } from 'react';

/**
 * IntroSequence — deterministic, timer-driven intro.
 *
 * Timeline (clock-driven, no animation/transition callbacks):
 *
 *   0 ms        mount, overlay full-cover, text starts CSS fade-in
 *   ~1400 ms    text fully visible (CSS keyframe completes on its own)
 *   3500 ms     wipe starts (CSS transition on clip-path, 800 ms duration)
 *   4300 ms     overlay unmounted, 'ded-intro-done' event dispatched,
 *               sessionStorage.hasSeenIntro set
 *
 * The previous version used framer-motion's onAnimationComplete to detect
 * the wipe end. Some Chromium-based browsers (notably Brave with shields
 * enabled) short-circuited the clip-path animation and fired the callback
 * almost immediately, collapsing the intro to ~0.5s. This rebuild uses
 * pure setTimeout for all phase changes, so the timeline is identical
 * regardless of how the browser handles the underlying CSS transition.
 *
 * Session guard preserved: if sessionStorage.hasSeenIntro is set, the
 * overlay is skipped entirely and 'ded-intro-done' fires on next frame so
 * downstream listeners attached after mount still catch it.
 */

const HOLD_MS = 3500; // text holds visible after fade-in completes
const WIPE_MS = 800;  // clip-path wipe duration

export default function IntroSequence() {
  const [phase, setPhase] = useState<'init' | 'showing' | 'wiping' | 'done'>('init');

  useEffect(() => {
    const seenIntro =
      typeof sessionStorage !== 'undefined' && sessionStorage.getItem('hasSeenIntro');
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Repeat visit OR reduced-motion preference: skip the intro entirely
    // and fire the done event on next frame so downstream hero-reveal
    // listeners still trigger.
    if (seenIntro || prefersReducedMotion) {
      setPhase('done');
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('ded-intro-done', { detail: { skipped: true } }));
      });
      return;
    }

    document.body.style.overflow = 'hidden';
    setPhase('showing');

    const wipeTimer = window.setTimeout(() => setPhase('wiping'), HOLD_MS);
    const doneTimer = window.setTimeout(() => {
      sessionStorage.setItem('hasSeenIntro', '1');
      document.body.style.overflow = '';
      setPhase('done');
      window.dispatchEvent(new CustomEvent('ded-intro-done', { detail: { skipped: false } }));
    }, HOLD_MS + WIPE_MS);

    return () => {
      window.clearTimeout(wipeTimer);
      window.clearTimeout(doneTimer);
      document.body.style.overflow = '';
    };
  }, []);

  if (phase === 'done' || phase === 'init') return null;

  return (
    <>
      <style>{`
        .intro-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          /* Wipe uses a plain CSS transition. Browsers must paint a 0→100%
             inset on clip-path; if any browser short-circuits that paint,
             the visual is cut off but the surrounding setTimeout still
             keeps the timeline correct. */
          clip-path: inset(0 0% 0 0%);
          transition: clip-path ${WIPE_MS}ms cubic-bezier(0.76, 0, 0.24, 1);
        }
        .intro-overlay.intro-wiping {
          clip-path: inset(0 0% 0 100%);
        }
        .intro-text {
          color: #fff;
          font-family: 'Montserrat', sans-serif;
          font-size: clamp(14px, 2.4vw, 28px);
          font-weight: 300;
          text-transform: uppercase;
          letter-spacing: 0.5em;
          opacity: 0;
          filter: blur(12px);
          animation: introTextIn 1.2s ease-out 0.2s forwards;
        }
        @keyframes introTextIn {
          to {
            letter-spacing: 0.15em;
            filter: blur(0px);
            opacity: 1;
          }
        }
        .intro-badge {
          position: absolute;
          bottom: 40px;
          left: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 34px;
          border: 2px solid #fff;
          border-radius: 5px 5px 12px 12px;
          font-family: 'Montserrat', sans-serif;
          font-weight: 700;
          font-size: 11px;
          letter-spacing: 0.08em;
          color: #fff;
          opacity: 0;
          animation: introBadgeIn 0.6s ease-out 0.6s forwards;
        }
        @keyframes introBadgeIn {
          to { opacity: 0.9; }
        }
      `}</style>
      <div
        className={`intro-overlay${phase === 'wiping' ? ' intro-wiping' : ''}`}
        aria-hidden="true"
      >
        <div className="intro-text">DAVID EDIGER DESIGN</div>
        <div className="intro-badge">DED</div>
      </div>
    </>
  );
}

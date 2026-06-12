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

  // Styles for the overlay live in Base.astro's global stylesheet
  // (.intro-overlay / .intro-text / .intro-badge). A JSX <style> tag would
  // be a runtime-injected inline style element, which the strict CSP
  // (style-src without 'unsafe-inline') blocks. The wipe duration there
  // must match WIPE_MS above.
  return (
    <div
      className={`intro-overlay${phase === 'wiping' ? ' intro-wiping' : ''}`}
      aria-hidden="true"
    >
      <div className="intro-text">DAVID EDIGER DESIGN</div>
      <div className="intro-badge">DED</div>
    </div>
  );
}

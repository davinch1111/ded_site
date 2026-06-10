import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function IntroSequence() {
  const [show, setShow] = useState(true);
  const [wiping, setWiping] = useState(false);

  useEffect(() => {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('hasSeenIntro')) {
      setShow(false);
      // Fire on next frame so listeners attached after mount still catch it.
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('ded-intro-done', { detail: { skipped: true } }));
      });
      return;
    }
    document.body.style.overflow = 'hidden';
    // Hold the wordmark visible for ~4s after it finishes fading in (at ~1.4s),
    // then trigger the clip-path wipe.
    const timer = setTimeout(() => setWiping(true), 5500);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

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
      <motion.div
        className="intro-overlay"
        animate={
          wiping
            ? { clipPath: 'inset(0 0% 0 100%)' }
            : { clipPath: 'inset(0 0% 0 0%)' }
        }
        transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
        onAnimationComplete={() => {
          if (wiping) {
            sessionStorage.setItem('hasSeenIntro', '1');
            document.body.style.overflow = '';
            setShow(false);
            window.dispatchEvent(new CustomEvent('ded-intro-done', { detail: { skipped: false } }));
          }
        }}
      >
        <div className="intro-text">DAVID EDIGER DESIGN</div>
        <div className="intro-badge">DED</div>
      </motion.div>
    </>
  );
}

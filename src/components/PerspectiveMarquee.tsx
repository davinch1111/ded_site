export default function PerspectiveMarquee() {
  const text = 'PRINT | WEB | VIDEO | PHOTO | AUDIO | ';
  const repeated = text.repeat(4);

  return (
    <>
      <style>{`
        .pm-wrapper {
          perspective: 300px;
          overflow: hidden;
          width: 100%;
          transform-style: preserve-3d;
        }
        .pm-track {
          display: inline-block;
          white-space: nowrap;
          transform: rotateX(20deg);
          transform-origin: top center;
          animation: pmScroll 22s linear infinite;
          font-family: 'Montserrat', sans-serif;
          font-weight: 300;
          font-size: 28px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.72);
          padding: 6px 0;
        }
        .pm-pipe {
          color: #3457C6;
          padding: 0 4px;
          font-weight: 400;
        }
        @keyframes pmScroll {
          from { transform: rotateX(20deg) translateX(0); }
          to   { transform: rotateX(20deg) translateX(-50%); }
        }
        @media (max-width: 680px) {
          .pm-track { font-size: 20px; }
        }
      `}</style>
      <div className="pm-wrapper">
        <div className="pm-track">
          {[0, 1].map(rep =>
            ['PRINT', 'WEB', 'VIDEO', 'PHOTO', 'AUDIO'].map((word, i, arr) => (
              <span key={`${rep}-${i}`}>
                {word}
                {i < arr.length - 1 && <span className="pm-pipe">|</span>}
                {i === arr.length - 1 && <span className="pm-pipe" style={{ paddingRight: 16 }}>|</span>}
              </span>
            ))
          )}
        </div>
      </div>
    </>
  );
}

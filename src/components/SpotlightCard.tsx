import { useRef, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export default function SpotlightCard({ children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  }

  function handleMouseLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--mx', '-200px');
    el.style.setProperty('--my', '-200px');
  }

  return (
    <div
      ref={ref}
      className="spotlight-card"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ '--mx': '-200px', '--my': '-200px' } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

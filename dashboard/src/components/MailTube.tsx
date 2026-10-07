import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

export interface Flight {
  key: string;
  from: string;
  to: string;
}

/** Room centre, in px from the tube's left edge. Null when that room is not on screen. */
function roomCentre(tube: HTMLElement, id: string): number | null {
  const room = tube.parentElement?.querySelector<HTMLElement>(`[data-agent="${CSS.escape(id)}"]`);
  if (!room) return null;
  const r = room.getBoundingClientRect();
  return r.left + r.width / 2 - tube.getBoundingClientRect().left;
}

/**
 * The mail tube along the ceiling. While `flight` is set, a folder travels once from the
 * sender's room to the receiver's. The animation lives in office.css, inside the
 * reduced-motion guard, so with reduced motion nothing moves.
 */
export function MailTube({ flight }: { flight: Flight | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState<{ key: string; from: number; to: number } | null>(null);

  useLayoutEffect(() => {
    const tube = ref.current;
    if (!tube || !flight) { setPath(null); return; }
    const from = roomCentre(tube, flight.from);
    const to = roomCentre(tube, flight.to);
    setPath(from === null || to === null ? null : { key: flight.key, from, to });
  }, [flight]);

  return (
    <div className="mail-tube" ref={ref} aria-hidden="true">
      {path && (
        <div
          key={path.key}
          className="mail-folder"
          style={{ '--from': `${path.from - 11}px`, '--to': `${path.to - 11}px` } as CSSProperties}
        />
      )}
    </div>
  );
}

import { useEffect, useState, type ReactNode } from 'react';

export interface TooltipState {
  x: number;
  y: number;
  content: ReactNode;
}

/**
 * A fixed-position tooltip that flips before it can leave the viewport, so a
 * mark near the right or bottom edge still shows its full label.
 */
export function Tooltip({ state }: { state: TooltipState | null }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [node, setNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setSize({ width: rect.width, height: rect.height });
  }, [node, state?.content]);

  if (!state) return null;

  const margin = 12;
  const flipX = state.x + size.width + margin > window.innerWidth;
  const flipY = state.y + size.height + margin > window.innerHeight;

  return (
    <div
      ref={setNode}
      className="tooltip"
      role="tooltip"
      style={{
        left: flipX ? state.x - size.width - margin : state.x + margin,
        top: flipY ? state.y - size.height - margin : state.y + margin,
      }}
    >
      {state.content}
    </div>
  );
}

export type ChartPoint = { label: string; position: number; tooltip: string };

const W = 640;
const H = 240;
const PAD = { top: 16, right: 20, bottom: 36, left: 40 };

// Position per regatta; 1st place at the top.
export function ProgressChart({ points }: { points: ChartPoint[] }) {
  const maxPos = Math.max(2, ...points.map((p) => p.position));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (pos: number) => PAD.top + ((pos - 1) / (maxPos - 1)) * innerH;

  const step = Math.max(1, Math.ceil(maxPos / 5));
  const ticks = [1];
  for (let t = step; t < maxPos; t += step) if (t > 1) ticks.push(t);
  ticks.push(maxPos);
  const uniqueTicks = [...new Set(ticks)];

  const labelEvery = Math.ceil(points.length / 8);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.position).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Progresión de puestos por campeonato">
      {uniqueTicks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
          <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{t}°</text>
        </g>
      ))}
      {points.length > 1 && <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.position)} r="4.5" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2">
            <title>{p.tooltip}</title>
          </circle>
          {i % labelEvery === 0 && (
            <text x={x(i)} y={H - 12} textAnchor="middle" fontSize="11" fill="var(--muted)">{p.label}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

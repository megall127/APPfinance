/** Anel de progresso SVG puro (usa tokens da marca via CSS vars). */
export function ProgressRing({ pct, size = 96 }: { pct: number; size?: number }) {
  const stroke = 10
  const c = size / 2
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const clamped = Math.min(Math.max(pct, 0), 100)
  const filled = circ * (clamped / 100)
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ transform: 'rotate(-90deg)' }}
      aria-hidden="true"
    >
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={stroke}
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
      />
    </svg>
  )
}

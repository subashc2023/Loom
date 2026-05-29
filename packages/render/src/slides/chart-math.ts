/**
 * Pure geometry for the `chart` layout. Framework-free on purpose (no react or
 * remotion imports) so the scale and path math is unit-testable offline and the
 * React component stays a thin shell over functions whose behaviour is locked by
 * tests. Charts are hand-rolled SVG rather than a charting library: it keeps the
 * renderer dependency-free (matching the pipeline's no-SDK ethos) and fully
 * deterministic under Remotion's frame-by-frame headless render.
 */

export type Point = { x: number; y: number };

/** Round a positive value up to a "nice" axis bound (1, 2, 2.5, 5 × 10ⁿ). */
export function niceCeil(value: number): number {
  if (value <= 0) return 0;
  const exp = Math.floor(Math.log10(value));
  const pow = 10 ** exp;
  const frac = value / pow; // in [1, 10)
  const niceFrac = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10;
  return niceFrac * pow;
}

/**
 * The value domain for a bar/line/area chart across every series. The axis always
 * includes zero (a bar baseline must be meaningful) and the positive/negative
 * extents are rounded outward to a nice bound so tick labels read cleanly. An
 * empty or all-non-numeric dataset falls back to [0, 1] so the axis still draws.
 */
export function yDomain(
  rows: ReadonlyArray<Record<string, string | number>>,
  yKeys: ReadonlyArray<string>,
): { min: number; max: number } {
  let rawMin = 0;
  let rawMax = 0;
  let seen = false;
  for (const row of rows) {
    for (const k of yKeys) {
      const v = row[k];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      if (!seen) {
        rawMin = v;
        rawMax = v;
        seen = true;
      } else {
        if (v < rawMin) rawMin = v;
        if (v > rawMax) rawMax = v;
      }
    }
  }
  if (!seen) return { min: 0, max: 1 };
  const min = rawMin >= 0 ? 0 : -niceCeil(-rawMin);
  const max = rawMax <= 0 ? 0 : niceCeil(rawMax);
  if (min === 0 && max === 0) return { min: 0, max: 1 };
  return { min, max };
}

/** Linear value→pixel scale. Larger values map nearer the top (smaller y). */
export function makeYScale(
  domain: { min: number; max: number },
  topY: number,
  bottomY: number,
): (v: number) => number {
  const span = domain.max - domain.min || 1;
  return (v) => bottomY - ((v - domain.min) / span) * (bottomY - topY);
}

export type BandScale = {
  /** Distance between adjacent band centers. */
  step: number;
  /** Drawable width of one band's group (step minus inner padding). */
  bandWidth: number;
  /** Left edge of band i's drawable group. */
  start: (i: number) => number;
  /** Center x of band i. */
  center: (i: number) => number;
};

/** Evenly spaced bands across [leftX, rightX], for categorical bar charts. */
export function makeBandScale(count: number, leftX: number, rightX: number, innerPad = 0.2): BandScale {
  const n = Math.max(1, count);
  const step = (rightX - leftX) / n;
  const bandWidth = step * (1 - innerPad);
  const pad = (step - bandWidth) / 2;
  return {
    step,
    bandWidth,
    start: (i) => leftX + i * step + pad,
    center: (i) => leftX + i * step + step / 2,
  };
}

/** Point positions for line/area: first sits at leftX, last at rightX. */
export function makePointScale(count: number, leftX: number, rightX: number): (i: number) => number {
  if (count <= 1) return () => (leftX + rightX) / 2;
  return (i) => leftX + (i / (count - 1)) * (rightX - leftX);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A polyline through the points as an SVG path string. */
export function linePath(points: ReadonlyArray<Point>): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${round(p.x)} ${round(p.y)}`).join(" ");
}

/** A filled area: the polyline dropped to `baselineY` and closed. */
export function areaPath(points: ReadonlyArray<Point>, baselineY: number): string {
  if (points.length === 0) return "";
  const top = points.map((p, i) => `${i === 0 ? "M" : "L"} ${round(p.x)} ${round(p.y)}`).join(" ");
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return `${top} L ${round(last.x)} ${round(baselineY)} L ${round(first.x)} ${round(baselineY)} Z`;
}

export type PieSlice = { value: number; fraction: number; startAngle: number; endAngle: number };

/**
 * Wedge angles for a pie chart, starting at the top (−π/2) and sweeping
 * clockwise. Negative values are treated as zero; fractions sum to 1 (and the
 * sweep to 2π) when at least one value is positive.
 */
export function pieSlices(values: ReadonlyArray<number>, startAt = -Math.PI / 2): PieSlice[] {
  const total = values.reduce((s, v) => s + (v > 0 ? v : 0), 0);
  const slices: PieSlice[] = [];
  let angle = startAt;
  for (const v of values) {
    const value = v > 0 ? v : 0;
    const fraction = total > 0 ? value / total : 0;
    const sweep = fraction * Math.PI * 2;
    slices.push({ value, fraction, startAngle: angle, endAngle: angle + sweep });
    angle += sweep;
  }
  return slices;
}

/** Point on a circle at `angle` (radians) from center (cx, cy). */
export function polar(cx: number, cy: number, r: number, angle: number): Point {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

/** SVG path for a pie wedge from the center out to radius `r`. */
export function wedgePath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polar(cx, cy, r, startAngle);
  const end = polar(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${round(cx)} ${round(cy)} L ${round(start.x)} ${round(start.y)} A ${round(r)} ${round(r)} 0 ${largeArc} 1 ${round(end.x)} ${round(end.y)} Z`;
}

/** A categorical palette layered over the theme accent for multi-series charts. */
export const SERIES_COLORS = [
  "var(--accent)",
  "#22d3ee",
  "#f59e0b",
  "#ef4444",
  "#10b981",
  "#e879f9",
] as const;

export function seriesColor(i: number): string {
  return SERIES_COLORS[i % SERIES_COLORS.length]!;
}

/** Compact tick/label formatting: 12000 → "12k", 3.5 → "3.5", 4 → "4". */
export function formatNumber(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) {
    const k = v / 1000;
    return `${Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

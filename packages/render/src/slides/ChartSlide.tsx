import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { Slide } from "@loom/spec";
import { easedEnter } from "../anim";
import {
  areaPath,
  formatNumber,
  linePath,
  makeBandScale,
  makePointScale,
  makeYScale,
  pieSlices,
  polar,
  seriesColor,
  wedgePath,
  yDomain,
  type Point,
} from "./chart-math";

type ChartContent = Extract<Slide, { layout: "chart" }>["content"];

/** Safely coerce a cell to a finite number (missing / string cells read as 0). */
function num(v: string | number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Render the `chart` layout: data + chart type baked straight into the slide as
 * hand-rolled SVG. Bars/lines/areas share a value axis with grid lines and
 * labels; pie gets a legend. Everything animates on over the first ~0.8s
 * (bars grow from the baseline, line/area wipe in, pie sweeps), driven purely by
 * the frame so it's deterministic.
 */
export function ChartSlide({ content }: { content: ChartContent }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  // Entrance: fade the whole chart, then "grow" the data in (eased + fps-aware).
  const fade = easedEnter(frame, fps, 400);
  const grow = easedEnter(frame, fps, 800, 200);

  const rows = content.data;
  const labels = rows.map((r) => String(r[content.xKey] ?? ""));

  const margin = {
    top: content.title ? Math.round(height * 0.17) : Math.round(height * 0.1),
    right: Math.round(width * 0.06),
    bottom: Math.round(height * 0.13),
    left: Math.round(width * 0.085),
  };
  const plot = {
    left: margin.left,
    right: width - margin.right,
    top: margin.top,
    bottom: height - margin.bottom,
  };

  const titleSize = height * 0.058;
  const labelSize = height * 0.026;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ opacity: fade, display: "block" }}
      >
        {content.title ? (
          <text
            x={width / 2}
            y={margin.top * 0.58}
            textAnchor="middle"
            style={{
              fill: "var(--fg)",
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: titleSize,
              letterSpacing: "-0.02em",
            }}
          >
            {content.title}
          </text>
        ) : null}

        {content.chartType === "pie" ? (
          <PieChart
            content={content}
            labels={labels}
            plot={plot}
            grow={grow}
            labelSize={labelSize}
          />
        ) : (
          <CartesianChart
            content={content}
            rows={rows}
            labels={labels}
            plot={plot}
            grow={grow}
            labelSize={labelSize}
            width={width}
            height={height}
          />
        )}
      </svg>
    </AbsoluteFill>
  );
}

type PlotBox = { left: number; right: number; top: number; bottom: number };

/** Bar, line, and area charts: a shared value axis with grid + category labels. */
function CartesianChart({
  content,
  rows,
  labels,
  plot,
  grow,
  labelSize,
  width,
  height,
}: {
  content: ChartContent;
  rows: ChartContent["data"];
  labels: string[];
  plot: PlotBox;
  grow: number;
  labelSize: number;
  width: number;
  height: number;
}) {
  const { yKeys, chartType } = content;
  const domain = yDomain(rows, yKeys);
  const yScale = makeYScale(domain, plot.top, plot.bottom);
  const baseY = yScale(0);

  const TICKS = 4;
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => domain.min + (i / TICKS) * (domain.max - domain.min));

  const band = makeBandScale(rows.length, plot.left, plot.right, 0.3);
  const point = makePointScale(rows.length, plot.left, plot.right);

  // Left-to-right reveal for line/area, keyed off content so concurrent chart
  // slides (e.g. during a crossfade) don't share a clip id.
  const clipId = `chart-clip-${content.xKey}-${chartType}`;
  const lineWidth = Math.max(2, height * 0.0045);

  return (
    <>
      {/* gridlines + value labels */}
      {ticks.map((t, i) => {
        const y = yScale(t);
        return (
          <g key={`tick-${i}`}>
            <line
              x1={plot.left}
              x2={plot.right}
              y1={y}
              y2={y}
              stroke="var(--fg)"
              strokeOpacity={t === 0 ? 0.35 : 0.12}
              strokeWidth={1}
            />
            <text
              x={plot.left - 14}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              style={{ fill: "var(--fg)", fillOpacity: 0.6, fontFamily: "var(--font-body)", fontSize: labelSize }}
            >
              {formatNumber(t)}
            </text>
          </g>
        );
      })}

      {/* category (x) labels */}
      {labels.map((label, i) => (
        <text
          key={`xl-${i}`}
          x={chartType === "bar" ? band.center(i) : point(i)}
          y={plot.bottom + labelSize * 1.7}
          textAnchor="middle"
          style={{ fill: "var(--fg)", fillOpacity: 0.75, fontFamily: "var(--font-body)", fontSize: labelSize }}
        >
          {label}
        </text>
      ))}

      {chartType === "bar"
        ? rows.map((row, i) => {
            const groupLeft = band.start(i);
            const barW = band.bandWidth / yKeys.length;
            return yKeys.map((k, si) => {
              const v = num(row[k]);
              const vy = yScale(v);
              const fullH = Math.abs(baseY - vy);
              const h = fullH * grow;
              const top = v >= 0 ? baseY - h : baseY;
              const x = groupLeft + si * barW;
              return (
                <rect
                  key={`bar-${i}-${si}`}
                  x={x}
                  y={top}
                  width={barW * 0.86}
                  height={Math.max(0, h)}
                  rx={Math.min(8, barW * 0.16)}
                  fill={seriesColor(si)}
                />
              );
            });
          })
        : (
            <>
              <defs>
                <clipPath id={clipId}>
                  <rect
                    x={plot.left}
                    y={plot.top - lineWidth}
                    width={(plot.right - plot.left) * grow}
                    height={plot.bottom - plot.top + lineWidth * 2}
                  />
                </clipPath>
              </defs>
              <g clipPath={`url(#${clipId})`}>
                {yKeys.map((k, si) => {
                  const pts: Point[] = rows.map((row, i) => ({ x: point(i), y: yScale(num(row[k])) }));
                  return (
                    <g key={`series-${si}`}>
                      {chartType === "area" ? (
                        <path d={areaPath(pts, baseY)} fill={seriesColor(si)} fillOpacity={0.18} />
                      ) : null}
                      <path
                        d={linePath(pts)}
                        fill="none"
                        stroke={seriesColor(si)}
                        strokeWidth={lineWidth}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                      {pts.map((p, i) => (
                        <circle key={`pt-${si}-${i}`} cx={p.x} cy={p.y} r={lineWidth * 1.4} fill={seriesColor(si)} />
                      ))}
                    </g>
                  );
                })}
              </g>
            </>
          )}

      {/* multi-series legend (top-right of the plot) */}
      {yKeys.length > 1 ? (
        <Legend keys={yKeys} x={plot.right} y={plot.top} labelSize={labelSize} align="end" />
      ) : null}
    </>
  );
}

/** Pie chart: wedges sweep on clockwise from the top, with a labelled legend. */
function PieChart({
  content,
  labels,
  plot,
  grow,
  labelSize,
}: {
  content: ChartContent;
  labels: string[];
  plot: PlotBox;
  grow: number;
  labelSize: number;
}) {
  const key0 = content.yKeys[0]!;
  const values = content.data.map((r) => num(r[key0]));
  const slices = pieSlices(values);

  // Leave room on the right for the legend; center the pie in the rest.
  const legendW = (plot.right - plot.left) * 0.32;
  const areaRight = plot.right - legendW;
  const cx = (plot.left + areaRight) / 2;
  const cy = (plot.top + plot.bottom) / 2;
  const r = Math.min(areaRight - plot.left, plot.bottom - plot.top) * 0.45;

  const revealEnd = -Math.PI / 2 + grow * Math.PI * 2;

  return (
    <>
      {slices.map((s, i) => {
        if (s.fraction <= 0) return null;
        const end = Math.min(s.endAngle, revealEnd);
        if (end <= s.startAngle) return null;
        return (
          <path
            key={`slice-${i}`}
            d={wedgePath(cx, cy, r, s.startAngle, end)}
            fill={seriesColor(i)}
            stroke="var(--bg)"
            strokeWidth={Math.max(2, r * 0.012)}
          />
        );
      })}

      {/* percentage labels on settled slices */}
      {grow >= 1
        ? slices.map((s, i) => {
            if (s.fraction < 0.06) return null; // skip slivers
            const mid = (s.startAngle + s.endAngle) / 2;
            const p = polar(cx, cy, r * 0.62, mid);
            return (
              <text
                key={`pl-${i}`}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fill: "#fff", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: labelSize }}
              >
                {Math.round(s.fraction * 100)}%
              </text>
            );
          })
        : null}

      <Legend keys={labels} x={areaRight + legendW * 0.18} y={cy - labels.length * labelSize} labelSize={labelSize} align="start" />
    </>
  );
}

/** A vertical color-swatch legend used by both chart families. */
function Legend({
  keys,
  x,
  y,
  labelSize,
  align,
}: {
  keys: string[];
  x: number;
  y: number;
  labelSize: number;
  align: "start" | "end";
}) {
  const rowH = labelSize * 1.9;
  const sw = labelSize * 0.95;
  return (
    <g>
      {keys.map((k, i) => {
        const ry = y + i * rowH;
        const swatchX = align === "end" ? x - sw : x;
        const textX = align === "end" ? x - sw - 10 : x + sw + 10;
        return (
          <g key={`lg-${i}`}>
            <rect x={swatchX} y={ry} width={sw} height={sw} rx={3} fill={seriesColor(i)} />
            <text
              x={textX}
              y={ry + sw * 0.5}
              textAnchor={align === "end" ? "end" : "start"}
              dominantBaseline="middle"
              style={{ fill: "var(--fg)", fillOpacity: 0.85, fontFamily: "var(--font-body)", fontSize: labelSize }}
            >
              {k}
            </text>
          </g>
        );
      })}
    </g>
  );
}

import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useApp } from '../context';
import { chartTheme, MODE_SLOT } from '../lib/palette';
import { inr, inrShort, niceDate, shortMonth } from '../lib/format';

function useTheme() {
  return chartTheme(useApp().dark);
}

function TooltipBox({ active, payload, label, labelFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs shadow-lg dark:border-white/10 dark:bg-ink-850">
      {label !== undefined && <div className="mb-1 font-semibold">{labelFormatter ? labelFormatter(label) : label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey ?? p.name} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.payload?.fill || p.color }} />
          <span className="muted">{p.name}</span>
          <span className="tabular ml-auto pl-3 font-semibold">{inr(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function LegendRow({ payload }) {
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-4 text-xs">
      {payload.map((p) => (
        <span key={p.value} className="muted inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
          {p.value}
        </span>
      ))}
    </div>
  );
}

/** Income vs spending vs invested per month. */
export function TrendChart({ data, height = 260 }) {
  const t = useTheme();
  const series = [
    { key: 'income', name: 'Earned', color: t.series[0] },
    { key: 'expenses', name: 'Spent', color: t.series[1] },
    { key: 'investments', name: 'Invested', color: t.series[2] },
  ];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={t.grid} />
        <XAxis dataKey="month" tickFormatter={shortMonth} tickLine={false} axisLine={{ stroke: t.axis }} tick={{ fill: t.muted, fontSize: 12 }} />
        <YAxis tickFormatter={inrShort} tickLine={false} axisLine={false} tick={{ fill: t.muted, fontSize: 12 }} width={52} />
        <Tooltip content={<TooltipBox labelFormatter={(m) => shortMonth(m) + ' ' + m.slice(0, 4)} />} cursor={{ fill: t.grid, opacity: 0.5 }} />
        <Legend content={<LegendRow />} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={22} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Spend per day for the month, single series. */
export function DailyChart({ data, height = 180 }) {
  const t = useTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={t.grid} />
        <XAxis dataKey="date" tickFormatter={(d) => Number(d.slice(8))} tickLine={false} axisLine={{ stroke: t.axis }} tick={{ fill: t.muted, fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tickFormatter={inrShort} tickLine={false} axisLine={false} tick={{ fill: t.muted, fontSize: 11 }} width={52} />
        <Tooltip content={<TooltipBox labelFormatter={(d) => niceDate(d, { weekday: 'short', day: 'numeric', month: 'short' })} />} cursor={{ fill: t.grid, opacity: 0.5 }} />
        <Bar dataKey="total" name="Spent" fill={t.series[0]} radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Donut with a legend that also carries the values, so identity is never colour-only. */
export function Donut({ data, colorFor, height = 190, centerLabel, centerValue }) {
  const t = useTheme();
  const total = data.reduce((s, d) => s + d.total, 0);
  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="total" nameKey="key" innerRadius="64%" outerRadius="100%" paddingAngle={data.length > 1 ? 2 : 0} stroke={t.surface} strokeWidth={2}>
              {data.map((d, i) => (
                <Cell key={d.key} fill={colorFor ? colorFor(d, i, t) : t.series[i]} />
              ))}
            </Pie>
            <Tooltip content={<TooltipBox />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="muted text-xs">{centerLabel}</span>
          <span className="text-lg font-bold">{centerValue ?? inrShort(total)}</span>
        </div>
      </div>
      <ul className="min-w-[13rem] flex-1 space-y-2 text-sm">
        {data.map((d, i) => (
          <li key={d.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorFor ? colorFor(d, i, t) : t.series[i] }} />
            <span className="truncate">{d.key}</span>
            <span className="muted ml-auto shrink-0 text-xs">{total ? Math.round((d.total / total) * 100) : 0}%</span>
            <span className="tabular shrink-0 text-right font-semibold">{inr(d.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const modeColor = (d, i, t) => t.series[MODE_SLOT[d.key] ?? i];

/** Folds a long list into the top N plus "Other" (categorical palettes stop at 8). */
export function foldOther(rows, n = 6) {
  if (rows.length <= n + 1) return rows;
  const head = rows.slice(0, n);
  const rest = rows.slice(n).reduce((s, r) => s + r.total, 0);
  return [...head, { key: 'Other', total: rest }];
}

/** Horizontal magnitude bars as plain HTML: one hue, value labels in text ink. */
export function BarList({ rows, max, onSelect, color }) {
  const t = useTheme();
  const top = max ?? Math.max(...rows.map((r) => r.total), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <button type="button" onClick={() => onSelect?.(r)} className="group block w-full text-left" title={`${r.key}: ${inr(r.total)}`}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate font-medium group-hover:underline">{r.key}</span>
              <span className="tabular shrink-0 font-semibold">
                {inr(r.total)}
                {r.count !== undefined && <span className="muted ml-1.5 text-xs font-normal">{r.count}×</span>}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-ink-800">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(2, (r.total / top) * 100)}%`, background: color || t.series[0] }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

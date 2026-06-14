// Dependency-free infographic primitives, styled with Tailwind theme tokens so
// they match the shadcn monochrome theme. Simple by design (each bar is a
// width/height %) — easy to explain in the live session.

export function money(str, cur = "INR", decimals = false) {
  const n = Number(str);
  const sym = cur === "INR" ? "₹" : cur === "USD" ? "$" : "";
  const sign = n < 0 ? "-" : "";
  return (
    sign + sym +
    Math.abs(n).toLocaleString("en-IN", {
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
    })
  );
}

export function Initial({ name, size = 28 }) {
  const ch = (name || "?").trim()[0]?.toUpperCase() || "?";
  return (
    <span
      className="inline-grid place-items-center rounded-full bg-primary font-bold text-primary-foreground shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {ch}
    </span>
  );
}

export function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// Horizontal bar (top contributors).
export function HBar({ name, valueLabel, pct }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          <Initial name={name} size={22} /> {name}
        </span>
        <span className="font-semibold tabular-nums">{valueLabel}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
}

// Vertical column chart (spending by month).
export function ColumnChart({ data, currency }) {
  const max = Math.max(...data.map((d) => d.amount_minor), 1);
  return (
    <div className="flex items-end gap-3 pt-2" style={{ height: 200 }}>
      {data.map((d) => (
        <div key={d.key} className="flex flex-1 flex-col items-center gap-2">
          <div className="text-xs font-semibold tabular-nums text-muted-foreground">
            {money(d.amount, currency)}
          </div>
          <div className="flex w-full flex-1 items-end justify-center">
            <div
              className="w-full max-w-[56px] rounded-t-md bg-gradient-to-t from-muted-foreground/40 to-foreground transition-all"
              style={{ height: `${(d.amount_minor / max) * 100}%` }}
            />
          </div>
          <div className="text-xs text-muted-foreground">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

// Diverging net-balance bar: owes -> left, is owed -> right, centered axis.
export function NetBar({ name, netMinor, netLabel, maxAbs, currency, open, onClick }) {
  const pct = Math.min((Math.abs(netMinor) / maxAbs) * 50, 50);
  const owes = netMinor < 0;
  const settled = netMinor === 0;
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/50"
    >
      <div className="flex w-36 items-center gap-2 shrink-0">
        <Initial name={name} size={26} />
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="text-muted-foreground">{open ? "▾" : "▸"}</span>
      </div>
      <div className="relative h-7 flex-1">
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border" />
        {!settled && (
          <div
            className={`absolute top-1/2 h-4 -translate-y-1/2 rounded-sm ${owes ? "bg-neg" : "bg-foreground"}`}
            style={owes ? { right: "50%", width: `${pct}%` } : { left: "50%", width: `${pct}%` }}
          />
        )}
      </div>
      <div
        className={`w-28 text-right text-sm font-bold tabular-nums shrink-0 ${
          settled ? "text-muted-foreground" : owes ? "text-neg" : "text-pos"
        }`}
      >
        {settled ? "settled" : money(netLabel, currency)}
      </div>
    </button>
  );
}

// Proportional severity meter (import report).
export function SeverityBars({ error, warning, info }) {
  const total = Math.max(error + warning + info, 1);
  const seg = [
    { k: "error", n: error, cls: "bg-foreground" },
    { k: "warning", n: warning, cls: "bg-muted-foreground" },
    { k: "info", n: info, cls: "bg-muted-foreground/40" },
  ];
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
      {seg.map((s) => (
        <div key={s.k} className={s.cls} style={{ width: `${(s.n / total) * 100}%` }} title={`${s.n} ${s.k}`} />
      ))}
    </div>
  );
}

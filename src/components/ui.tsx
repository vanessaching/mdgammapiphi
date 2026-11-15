export function Badge({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "green" | "red" | "yellow" | "wine" | "blue" }) {
  const tones = {
    gray: "bg-light-blue/70 text-ink",
    green: "bg-green-100 text-green-800",
    red: "bg-red-100 text-red-800",
    yellow: "bg-yellow-100 text-yellow-800",
    wine: "bg-pink-light text-wine",
    blue: "bg-light-blue text-navy",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: "pending" | "approved" | "rejected" }) {
  const tone = status === "approved" ? "green" : status === "rejected" ? "red" : "yellow";
  return <Badge tone={tone}>{status[0].toUpperCase() + status.slice(1)}</Badge>;
}

export function Card({ title, children, actions }: { title?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-light-blue bg-white p-5 shadow-sm">
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-lg font-semibold text-berry-dark">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold text-berry-dark">{title}</h1>
        {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-light-blue border-t-4 border-t-wine bg-white p-4">
      <div className="text-sm text-gray-600">{label}</div>
      <div className="mt-1 font-serif text-3xl font-semibold text-berry-dark">{value}</div>
      {hint && <div className="text-xs text-gray-500">{hint}</div>}
    </div>
  );
}

export const inputCls = "w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy";
export const labelCls = "block text-sm font-medium text-gray-700 mb-1";

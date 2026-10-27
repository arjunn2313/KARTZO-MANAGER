/** Grey placeholder shapes shown while a page loads (shaped like the real page). */

function Bone({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`skeleton rounded-md ${className}`} style={style} />;
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl bg-white p-5 ring-1 ring-stone-200 ${className}`}
    >
      {children}
    </div>
  );
}

function Header({ button = true }: { button?: boolean }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="space-y-2.5">
        <Bone className="h-7 w-44" />
        <Bone className="h-4 w-64 max-w-[70vw]" />
      </div>
      {button && <Bone className="h-10 w-32 rounded-lg" />}
    </div>
  );
}

function Chips({ n = 5 }: { n?: number }) {
  return (
    <div className="flex gap-2 overflow-hidden">
      {Array.from({ length: n }, (_, i) => (
        <Bone
          key={i}
          className={`h-8 shrink-0 rounded-full ${i % 2 ? "w-24" : "w-20"}`}
        />
      ))}
    </div>
  );
}

function Kpis({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <Card key={i} className="space-y-3 !p-4">
          <Bone className="h-3.5 w-20" />
          <Bone className="h-7 w-28" />
          <Bone className="h-3 w-16" />
        </Card>
      ))}
    </div>
  );
}

function List({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
      <div className="border-b border-stone-100 px-5 py-4">
        <Bone className="h-5 w-36" />
      </div>
      <div className="divide-y divide-stone-100">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <Bone className="size-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Bone
                className={`h-4 ${i % 3 === 0 ? "w-48" : i % 3 === 1 ? "w-40" : "w-56"} max-w-full`}
              />
              <Bone className="h-3 w-32" />
            </div>
            <Bone className="h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Chart() {
  return (
    <Card className="space-y-4">
      <Bone className="h-5 w-40" />
      <div className="flex h-48 items-end gap-2">
        {[40, 65, 50, 80, 60, 90, 70, 55, 85, 75, 95, 68].map((h, i) => (
          <Bone
            key={i}
            className="flex-1 rounded-t-md rounded-b-none"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </Card>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-5">
      {children}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Dashboard (its title is already on screen). */
export function DashboardSkeleton() {
  return (
    <Wrap>
      <Chips n={7} />
      <div className="grid gap-4 xl:grid-cols-[minmax(280px,1fr)_3fr]">
        <div className="space-y-4 rounded-2xl bg-stone-900 p-6">
          <div className="h-4 w-24 rounded-md bg-white/10 motion-safe:animate-pulse" />
          <div className="h-12 w-48 rounded-md bg-white/10 motion-safe:animate-pulse" />
          <div className="h-3 w-40 rounded-md bg-white/10 motion-safe:animate-pulse" />
        </div>
        <Kpis n={8} />
      </div>
      <Chart />
    </Wrap>
  );
}

/** Orders list (title already on screen). */
export function OrdersSkeleton() {
  return (
    <Wrap>
      <Card className="space-y-3">
        <Chips n={6} />
        <Bone className="h-10 w-full rounded-lg" />
      </Card>
      <Kpis n={4} />
      <List rows={8} />
    </Wrap>
  );
}

/** Pages with a title, a row of numbers and a list (Expenses, Staff, COD, Ad wallet, Dispatch). */
export function PageSkeleton({
  kpis = 4,
  chart = false,
  rows = 6,
}: {
  kpis?: number;
  chart?: boolean;
  rows?: number;
}) {
  return (
    <Wrap>
      <Header />
      {kpis > 0 && <Kpis n={kpis} />}
      {chart && <Chart />}
      <List rows={rows} />
    </Wrap>
  );
}

/** Products / Stock: a grid of product cards. */
export function CardsSkeleton({
  cards = 3,
  list = true,
}: {
  cards?: number;
  list?: boolean;
}) {
  return (
    <Wrap>
      <Header />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => (
          <Card key={i} className="space-y-4">
            <div className="flex gap-3">
              <Bone className="size-14 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2.5">
                <Bone className="h-4 w-3/4" />
                <Bone className="h-8 w-20" />
              </div>
            </div>
            <Bone className="h-10 w-full rounded-lg" />
          </Card>
        ))}
      </div>
      {list && <List rows={5} />}
    </Wrap>
  );
}

/** A form (Add order, Settings sections). */
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <Wrap>
      <Card className="space-y-4">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="space-y-2">
            <Bone className="h-3.5 w-24" />
            <Bone className="h-10 w-full rounded-lg" />
          </div>
        ))}
        <div className="flex justify-end">
          <Bone className="h-10 w-28 rounded-lg" />
        </div>
      </Card>
    </Wrap>
  );
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
      {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
    </div>
  );
}

export function ComingSoon({
  title,
  description,
  when,
  features,
}: {
  title: string;
  description: string;
  when: string;
  features: string[];
}) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <div className="rounded-xl border border-dashed border-stone-300 bg-white p-6">
        <span className="inline-block rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
          Coming in {when}
        </span>
        <ul className="mt-4 space-y-2 text-sm text-stone-600">
          {features.map((f) => (
            <li key={f} className="flex gap-2">
              <span className="text-emerald-600">•</span>
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

export default function InterimLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6" aria-label="Chargement des missions d'intérim">
      <Skeleton className="h-3 w-48" />
      <Skeleton className="mt-2 h-9 w-72" />
      <Skeleton className="mt-2 h-4 w-80" />
      <Skeleton className="mt-5 h-20 w-full rounded-xl" />
      <Skeleton className="mt-4 h-11 w-full rounded-lg" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

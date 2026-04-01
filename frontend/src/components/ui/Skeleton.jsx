// Skeleton loading component — Paytm style
export function Skeleton({ className = '', rounded = 'rounded-lg' }) {
  return (
    <div
      className={`skeleton ${rounded} ${className}`}
      style={{
        background: 'linear-gradient(90deg, #F0F0F5 25%, #E4E4EC 50%, #F0F0F5 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.8s linear infinite',
      }}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-card mx-3 mb-3">
      <Skeleton className="h-4 w-2/3 mb-3" />
      <Skeleton className="h-3 w-1/2 mb-2" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

export function TxRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" rounded="rounded-full" />
      <div className="flex-1">
        <Skeleton className="h-3.5 w-1/2 mb-2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-4 w-16" />
    </div>
  );
}
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Bar className="h-4 w-24" />

      <Card>
        <CardHeader className="space-y-3">
          <Bar className="h-3 w-40" />
          <Bar className="h-7 w-3/4 sm:w-1/2" />
          <Bar className="h-4 w-1/2" />
        </CardHeader>
        <CardContent>
          <Bar className="h-4 w-1/3" />
        </CardContent>
      </Card>

      <Bar className="h-8 w-72" />

      <Card>
        <CardHeader>
          <Bar className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-2 pb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Bar key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Bar({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-md bg-muted ${className}`}
    />
  );
}

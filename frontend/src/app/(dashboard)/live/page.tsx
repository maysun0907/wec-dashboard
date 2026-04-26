import { format, parseISO } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getNextEvent, getCircuit } from "@/lib/mock-data";

export const metadata = { title: "Live" };

export default function LivePage() {
  const next = getNextEvent();
  const circuit = next ? getCircuit(next.circuitId) : undefined;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Live</h1>
        <p className="text-muted-foreground">
          Real-time session data appears here during race weekends.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>No session active</CardTitle>
          <CardDescription>
            {next
              ? `Next session: ${next.name}, ${format(parseISO(next.startDate), "EEEE, MMMM d, yyyy")}${
                  circuit ? ` — ${circuit.name}` : ""
                }`
              : "No upcoming session scheduled."}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Live timing will be embedded from Al Kamel during sessions. This page
          is a placeholder until the integration ships.
        </CardContent>
      </Card>
    </div>
  );
}

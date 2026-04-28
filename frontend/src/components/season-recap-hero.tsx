import Link from "next/link";
import { Trophy } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DriverPhoto } from "@/components/driver-photo";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import {
  type DriverEntry,
  type StandingDriver,
  type StandingManufacturer,
} from "@/lib/api";

type Props = {
  year: number;
  rounds: number;
  champions: StandingDriver[];
  manufacturerChamp: StandingManufacturer | null;
  driverEntries: DriverEntry[];
};

/** Replaces the NextRaceHero on past seasons. Highlights who won —
 *  drivers (Hypercar) and manufacturer (Hypercar) — over a banner that
 *  signals the season is decided rather than upcoming. */
export function SeasonRecapHero({
  year,
  rounds,
  champions,
  manufacturerChamp,
  driverEntries,
}: Props) {
  const photoById = new Map(driverEntries.map((d) => [d.id, d.photoUrl]));

  return (
    <Card className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(800px circle at 100% 0%, var(--racing-yellow) 0%, transparent 50%)",
        }}
      />
      <CardHeader className="relative">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-[var(--racing-yellow)] uppercase">
          <Trophy className="size-3" fill="currentColor" />
          {year} season recap
        </div>
        <CardTitle className="mt-2 text-2xl sm:text-3xl">
          {year} FIA World Endurance Championship
        </CardTitle>
        <CardDescription>
          {rounds} rounds completed.
        </CardDescription>
      </CardHeader>
      <CardContent className="relative grid gap-6 sm:grid-cols-2">
        {champions.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Drivers&rsquo; champion (Hypercar)
            </div>
            <ul className="space-y-2">
              {champions.map((c) => (
                <li
                  key={c.driverId}
                  className="flex items-center gap-3 text-sm"
                >
                  <DriverPhoto
                    src={photoById.get(c.driverId) ?? null}
                    name={c.driverName}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/drivers/${c.driverId}`}
                      className="block truncate font-semibold hover:text-[var(--racing-red)]"
                    >
                      {c.driverName}
                    </Link>
                    {c.team && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.team}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-sm tabular-nums">
                    {c.points}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {manufacturerChamp && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Manufacturers&rsquo; champion (Hypercar)
            </div>
            <Link
              href={`/manufacturers/${manufacturerChamp.manufacturerId}`}
              className="flex items-center gap-3 text-sm hover:text-[var(--racing-red)]"
            >
              <ManufacturerLogo
                src={manufacturerChamp.manufacturerLogoUrl}
                name={manufacturerChamp.manufacturerName}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {manufacturerChamp.manufacturerName}
                </span>
                <span className="block text-xs text-muted-foreground">
                  P1 · {manufacturerChamp.points} points
                </span>
              </div>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { notFound } from "next/navigation";
import { isSeasonYear } from "@/lib/public-routing";

export type SeasonPageProps<T = object> = {
  params: Promise<T & { year: string }>;
};

export function requireSeasonYear(year: string): number {
  if (!isSeasonYear(year)) notFound();
  return Number(year);
}

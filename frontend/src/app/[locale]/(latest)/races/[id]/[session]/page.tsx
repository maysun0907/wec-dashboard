import { notFound } from "next/navigation";
import { RACE_SESSION_TYPES } from "@/lib/public-routing";
import { raceMetadata, RaceDetail } from "../race-detail";

type Props = { params: Promise<{ id: string; session: string }> };

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props) {
  const metadata = await raceMetadata({ params });
  return { ...metadata, robots: { index: false, follow: true } };
}

export default async function RaceSessionPage({ params }: Props) {
  const { id, session } = await params;
  if (!RACE_SESSION_TYPES.some((type) => type === session)) notFound();
  return <RaceDetail id={id} sessionType={session} />;
}

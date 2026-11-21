import { RaceDetail } from "./race-detail";

export { raceMetadata as generateMetadata } from "./race-detail";

export function generateStaticParams() {
  return [];
}

export default async function RaceDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  return <RaceDetail id={(await params).id} />;
}

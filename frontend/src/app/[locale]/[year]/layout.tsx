import DashboardLayout from "@/components/dashboard-layout";
import { requireSeasonYear, type SeasonPageProps } from "@/lib/season";

export function generateStaticParams() {
  return [];
}

export default async function SeasonLayout({
  children,
  params,
}: SeasonPageProps & { children: React.ReactNode }) {
  return <DashboardLayout year={requireSeasonYear((await params).year)}>{children}</DashboardLayout>;
}

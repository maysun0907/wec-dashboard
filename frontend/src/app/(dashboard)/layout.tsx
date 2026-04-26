import { SiteHeader } from "@/components/site-header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
      <footer className="border-t border-border py-6">
        <div className="mx-auto max-w-7xl px-4 text-xs text-muted-foreground sm:px-6 lg:px-8">
          Unofficial fan dashboard. Not affiliated with FIA WEC or Al Kamel
          Systems.
        </div>
      </footer>
    </>
  );
}

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
        <div className="mx-auto max-w-7xl space-y-1 px-4 text-xs text-muted-foreground sm:px-6 lg:px-8">
          <p>
            Unofficial fan dashboard. Not affiliated with FIA WEC or Al Kamel
            Systems.
          </p>
          <p>
            Schedule, entry list, results, and standings sourced from{" "}
            <a
              href="https://en.wikipedia.org/wiki/2026_FIA_World_Endurance_Championship"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline"
            >
              Wikipedia
            </a>{" "}
            under{" "}
            <a
              href="https://creativecommons.org/licenses/by-sa/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline"
            >
              CC BY-SA 4.0
            </a>
            .
          </p>
        </div>
      </footer>
    </>
  );
}

import { SiteHeader } from "@/components/site-header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="dashboard-main flex-1">
        <div className="mx-auto w-full max-w-[96rem] px-3 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          {children}
        </div>
      </main>
      <footer className="mt-8 border-t border-border/60 bg-background/70 py-6 text-center text-[10px] uppercase tracking-[0.12em] text-muted-foreground/55">
        <div className="mx-auto max-w-[96rem] px-4 sm:px-6 lg:px-8">
          Unofficial fan dashboard · Not affiliated with FIA WEC or Al Kamel
          Systems · Data from{" "}
          <a
            href="https://en.wikipedia.org/wiki/2026_FIA_World_Endurance_Championship"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-muted-foreground hover:underline"
          >
            Wikipedia
          </a>{" "}
          (
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-muted-foreground hover:underline"
          >
            CC BY-SA 4.0
          </a>
          )
        </div>
      </footer>
    </>
  );
}

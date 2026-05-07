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
      <footer className="mt-8 py-6 text-center text-[10px] text-muted-foreground/40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
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

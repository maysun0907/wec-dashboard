"use client";

import type { ReactNode } from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildRaceSessionHref } from "./race-session";

type SessionTab = {
  id: number;
  type: string;
  label: string;
  shortLabel: string;
};

export function RaceSessionTabs({
  sessions,
  selectedType,
  ariaLabel,
  children,
}: {
  sessions: readonly SessionTab[];
  selectedType: string;
  ariaLabel: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Tabs
      value={selectedType}
      onValueChange={(nextType) => {
        if (nextType === selectedType) return;
        const href = buildRaceSessionHref(window.location.href, nextType);
        startTransition(() => router.replace(href, { scroll: false }));
      }}
      aria-busy={isPending}
    >
      <TabsList
        aria-label={ariaLabel}
        className="flex w-full max-w-full overflow-x-auto overflow-y-hidden sm:w-fit"
      >
        {sessions.map((session) => (
          <TabsTrigger
            key={session.id}
            value={session.type}
            disabled={isPending}
          >
            <span className="sm:hidden">{session.shortLabel}</span>
            <span className="hidden sm:inline">{session.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={selectedType} className="mt-4 space-y-4">
        {children}
      </TabsContent>
    </Tabs>
  );
}

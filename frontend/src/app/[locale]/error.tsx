"use client";

import { useEffect } from "react";
import { PublicLink } from "@/components/public-link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");
  useEffect(() => {
    console.error("dashboard render error", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>{t("somethingWrong")}</CardTitle>
          <CardDescription>{t("renderError")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error.digest && (
            <p className="font-mono text-xs text-muted-foreground">
              {t("ref")}: {error.digest}
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={() => reset()}>{t("tryAgain")}</Button>
            <Button asChild variant="outline">
              <PublicLink href="/">{t("goHome")}</PublicLink>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

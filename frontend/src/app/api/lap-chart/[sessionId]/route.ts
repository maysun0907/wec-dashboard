import { ApiError, getLapChart } from "@/lib/api";

const ALLOWED_REVALIDATE_SECONDS = new Set([60, 3_600, 86_400]);

function parseRevalidate(value: string | null): number | null {
  if (value === null || !/^[0-9]+$/.test(value)) return null;
  const seconds = Number(value);
  return ALLOWED_REVALIDATE_SECONDS.has(seconds) ? seconds : null;
}

function errorResponse(detail: string, status: number): Response {
  return Response.json(
    { detail },
    {
      status,
      headers: { "cache-control": "no-store" },
    },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId: rawSessionId } = await params;
  const sessionId = Number(rawSessionId);
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
    return errorResponse("Invalid session ID", 400);
  }

  const revalidate = parseRevalidate(
    new URL(request.url).searchParams.get("revalidate"),
  );
  if (revalidate === null) {
    return errorResponse("Invalid revalidate value", 400);
  }

  try {
    const chart = await getLapChart(sessionId, { revalidate });
    return Response.json(chart);
  } catch (error) {
    if (error instanceof ApiError) {
      return errorResponse("Lap chart unavailable", error.status);
    }
    return errorResponse("Lap chart upstream unavailable", 502);
  }
}

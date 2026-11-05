import { waitUntil } from "@vercel/functions";

/**
 * Keep serverless work running after the HTTP response is sent.
 * Required on Vercel: a bare `void promise` is frozen when the handler returns.
 */
export function keepFunctionAlive(task: Promise<unknown>): void {
  const guarded = task.catch((error) => {
    console.error("Background task failed:", error);
  });

  try {
    waitUntil(guarded);
  } catch {
    void guarded;
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

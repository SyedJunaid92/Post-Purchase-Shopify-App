/**
 * Vercel Cron sends x-vercel-cron: 1. If CRON_SECRET is set, Vercel also
 * sends Authorization: Bearer <CRON_SECRET>.
 */
export function authorizeCron(request: Request): boolean {
  if (request.headers.get("x-vercel-cron") === "1") return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

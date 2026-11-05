type Props = {
  dbReady: boolean;
  dbError?: string | null;
};

export function DatabaseSetupBanner({ dbReady, dbError }: Props) {
  if (dbReady && !dbError) return null;

  if (!dbReady) {
    return (
      <s-banner tone="critical" heading="Database not connected">
        <s-paragraph>
          Funnels and analytics are stored in Supabase. Set{" "}
          <code>DATABASE_URL</code> on your app host (Vercel → Settings →
          Environment Variables), then redeploy. Until then, the dashboard will
          show zero funnels and no analytics.
        </s-paragraph>
      </s-banner>
    );
  }

  return (
    <s-banner tone="warning" heading="Database connection failed">
      <s-paragraph>
        Could not load funnels or analytics from the database
        {dbError ? `: ${dbError}` : "."} Check that{" "}
        <code>DATABASE_URL</code> is correct and the Supabase project is
        reachable.
      </s-paragraph>
    </s-banner>
  );
}

import { AnimatedLogo } from "./AnimatedLogo";

export function SkeletonBlock({
  height = 16,
  width = "100%",
  radius = 8,
}: {
  height?: number | string;
  width?: number | string;
  radius?: number;
}) {
  return (
    <div
      aria-hidden
      className="pp-skeleton"
      style={{ height, width, borderRadius: radius }}
    />
  );
}

export function AnalyticsPageSkeletonLayout() {
  return (
    <s-stack direction="block" gap="base">
      <s-box padding="base" border="base" borderRadius="base" background="base">
        <s-stack direction="block" gap="base">
          <SkeletonBlock height={36} width="100%" />
          <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
            <SkeletonBlock height={72} />
            <SkeletonBlock height={72} />
            <SkeletonBlock height={72} />
            <SkeletonBlock height={72} />
          </s-grid>
        </s-stack>
      </s-box>
      <s-grid gridTemplateColumns="1fr 1fr" gap="base">
        <SkeletonBlock height={220} radius={12} />
        <SkeletonBlock height={220} radius={12} />
      </s-grid>
      <s-grid gridTemplateColumns="1fr 1fr" gap="base">
        <SkeletonBlock height={200} radius={12} />
        <SkeletonBlock height={200} radius={12} />
      </s-grid>
      <SkeletonBlock height={280} radius={12} />
    </s-stack>
  );
}

/** Centered inline loader for Suspense fallbacks — does not block the page. */
export function InlineLoadingState({
  label = "Loading",
  minHeight = 160,
}: {
  label?: string;
  minHeight?: number;
}) {
  return (
    <div className="pp-inline-loading" style={{ minHeight }}>
      <AnimatedLogo size={48} label={label} variant="minimal" />
    </div>
  );
}

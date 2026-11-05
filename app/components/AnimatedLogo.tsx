type AnimatedLogoProps = {
  size?: number;
  label?: string;
  halo?: boolean;
  variant?: "default" | "minimal";
};

export function AnimatedLogo({
  size = 56,
  label,
  halo = true,
  variant = "default",
}: AnimatedLogoProps) {
  const haloSize = Math.round(size * 1.55);
  const showRing = variant === "default";

  return (
    <div className="pp-animated-logo">
      <div
        className="pp-animated-logo__stage"
        style={{ width: haloSize, height: haloSize }}
      >
        {halo ? (
          <span
            aria-hidden
            className="pp-animated-logo__halo"
            style={{ width: haloSize, height: haloSize }}
          />
        ) : null}
        {showRing ? (
          <span
            aria-hidden
            className="pp-animated-logo__ring"
            style={{ width: size + 10, height: size + 10 }}
          />
        ) : null}
        <img
          src="/app-logo.png"
          alt="Post-Purchase App"
          width={size}
          height={size}
          decoding="async"
          fetchPriority="high"
          className="pp-animated-logo__mark"
          style={{ width: size, height: size }}
        />
      </div>
      {label ? (
        <span className="pp-animated-logo__label" role="status" aria-live="polite">
          {label}
        </span>
      ) : null}
    </div>
  );
}

/** @deprecated Use InlineLoadingState from PageLoadingOverlay */
export function LogoLoadingState({
  label = "Loading",
  minHeight = 160,
}: {
  label?: string;
  minHeight?: number;
}) {
  return (
    <div className="pp-inline-loading" style={{ minHeight }}>
      <AnimatedLogo label={label} variant="minimal" />
    </div>
  );
}

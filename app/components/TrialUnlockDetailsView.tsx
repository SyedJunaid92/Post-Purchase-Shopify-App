import type { TrialUnlockConfig } from "../lib/test-config.types";
import {
  featureHasContent,
  getFeatureTitle,
  getTrialFeatureIconLabel,
  socialProofItemHasContent,
} from "../lib/test-config.types";
import { resolveTrialFeatureIcon } from "../lib/polaris-icons";

type Props = {
  config: TrialUnlockConfig;
};

function Field({ label, value }: { label: string; value: string }) {
  if (!value?.trim()) return null;
  return (
    <s-stack direction="inline" gap="base" alignItems="start">
      <s-box inlineSize="160px">
        <s-text type="strong">{label}</s-text>
      </s-box>
      <s-text>{value}</s-text>
    </s-stack>
  );
}

export function TrialUnlockDetailsView({ config }: Props) {
  const features = config.features.filter(featureHasContent);
  const socialItems = config.socialProofItems.filter(socialProofItemHasContent);

  return (
    <s-stack direction="block" gap="base">
      <Field label="Loading text" value={config.loadingText} />
      <Field label="Celebration headline" value={config.celebrationHeadline} />
      <Field label="Celebration subheadline" value={config.celebrationSubheadline} />
      <Field label="Features title" value={config.featuresTitle} />
      {features.length > 0 ? (
        <s-stack direction="block" gap="small">
          <s-text type="strong">Features ({features.length})</s-text>
          {features.map((feature) => (
            <s-box
              key={feature.id}
              padding="small"
              border="base"
              borderRadius="base"
              background="base"
            >
              <s-stack direction="block" gap="small">
                <s-stack direction="inline" gap="base" alignItems="center">
                  {feature.imageUrl ? (
                    <s-thumbnail
                      src={feature.imageUrl}
                      alt={getFeatureTitle(feature) || "Feature"}
                      size="small"
                    />
                  ) : null}
                  <s-text type="strong">{getFeatureTitle(feature) || "(Image only)"}</s-text>
                </s-stack>
                {feature.description ? <s-text>{feature.description}</s-text> : null}
                {feature.icon ? (() => {
                  const iconType = resolveTrialFeatureIcon(feature.icon);
                  return (
                    <s-stack direction="inline" gap="base" alignItems="center">
                      {iconType ? (
                        <s-icon type={iconType} tone="neutral" />
                      ) : null}
                      <s-text tone="neutral" color="subdued">
                        Icon: {getTrialFeatureIconLabel(feature.icon)}
                      </s-text>
                    </s-stack>
                  );
                })() : null}
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      ) : null}
      <Field label="Social proof title" value={config.socialProofTitle} />
      <Field label="Social proof subtitle" value={config.socialProofSubtitle} />
      <Field label="Social proof rating" value={config.socialProofRating} />
      {socialItems.length > 0 ? (
        <s-stack direction="block" gap="small">
          <s-text type="strong">Social proof items</s-text>
          {socialItems.map((item) => (
            <s-box
              key={item.id}
              padding="small"
              border="base"
              borderRadius="base"
              background="base"
            >
              <s-stack direction="inline" gap="base" alignItems="center">
                {item.imageUrl ? (
                  <s-thumbnail
                    src={item.imageUrl}
                    alt={item.text || "Social proof"}
                    size="small"
                  />
                ) : null}
                <s-text>{item.text || "(Image only)"}</s-text>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      ) : null}
      <Field label="Email capture label" value={config.emailCaptureLabel} />
      <Field label="Signup commitment 1" value={config.signupCommitment1} />
      <Field label="Signup commitment 2" value={config.signupCommitment2} />
      <Field label="Terms title" value={config.termsTitle} />
      <Field label="Terms content" value={config.termsContent} />
      <Field label="Terms checkbox" value={config.termsCheckboxLabel} />
      <Field label="CTA text" value={config.ctaText} />
      <Field label="Confirmation headline" value={config.confirmationHeadline} />
      <Field
        label="Confirmation subheadline"
        value={config.confirmationSubheadline}
      />
      <Field label="Confirmation status" value={config.confirmationStatusText} />
      <Field label="Trial days" value={String(config.trialDays)} />
    </s-stack>
  );
}

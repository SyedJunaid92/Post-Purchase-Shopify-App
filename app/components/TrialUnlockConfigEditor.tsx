import type { TrialUnlockConfig } from "../lib/test-config.types";
import { TrialFeaturesEditor } from "./TrialFeaturesEditor";
import { TrialSocialProofEditor } from "./TrialSocialProofEditor";

type Props = {
  config: TrialUnlockConfig;
  onChange: (config: TrialUnlockConfig) => void;
};

export function TrialUnlockConfigEditor({ config, onChange }: Props) {
  const set = (patch: Partial<TrialUnlockConfig>) =>
    onChange({ ...config, ...patch });

  return (
    <s-stack direction="block" gap="base">
      <s-text type="strong">Offer page</s-text>
      <s-paragraph color="subdued">
        These fields map directly to the post-purchase trial screen. Product
        image and description are set in the subscription product section below.
      </s-paragraph>
      <s-text-field
        label="Loading screen text (optional)"
        value={config.loadingText}
        onChange={(e: Event) =>
          set({ loadingText: (e.currentTarget as HTMLInputElement).value })
        }
      />
      <s-text-field
        label="Headline"
        value={config.celebrationHeadline}
        onChange={(e: Event) =>
          set({ celebrationHeadline: (e.currentTarget as HTMLInputElement).value })
        }
      />
      <s-text-field
        label="Subheadline"
        value={config.celebrationSubheadline}
        onChange={(e: Event) =>
          set({
            celebrationSubheadline: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
      <s-number-field
        label="Trial length (days)"
        value={String(config.trialDays)}
        min={1}
        max={90}
        onChange={(e: Event) =>
          set({
            trialDays:
              parseInt((e.currentTarget as HTMLInputElement).value, 10) || 14,
          })
        }
      />

      <s-text type="strong">Features</s-text>
      <s-text-field
        label="Section title"
        value={config.featuresTitle}
        onChange={(e: Event) =>
          set({ featuresTitle: (e.currentTarget as HTMLInputElement).value })
        }
      />
      <TrialFeaturesEditor
        features={config.features}
        onChange={(features) => set({ features })}
      />

      <s-text type="strong">Social proof</s-text>
      <s-text-field
        label="Section title"
        value={config.socialProofTitle}
        onChange={(e: Event) =>
          set({ socialProofTitle: (e.currentTarget as HTMLInputElement).value })
        }
      />
      <s-text-field
        label="Subtitle"
        value={config.socialProofSubtitle}
        onChange={(e: Event) =>
          set({
            socialProofSubtitle: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
      <s-text-field
        label="Rating (e.g. 4.9)"
        value={config.socialProofRating}
        onChange={(e: Event) =>
          set({
            socialProofRating: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
      <s-text-field
        label="Rating label"
        value={config.socialProofRatingLabel}
        onChange={(e: Event) =>
          set({
            socialProofRatingLabel: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
      <TrialSocialProofEditor
        items={config.socialProofItems}
        onChange={(socialProofItems) => set({ socialProofItems })}
      />

      <s-text type="strong">Signup & terms</s-text>
      <s-text-field
        label="Commitment line 1"
        value={config.signupCommitment1}
        onChange={(e: Event) =>
          set({
            signupCommitment1: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
      <s-text-field
        label="Commitment line 2"
        value={config.signupCommitment2}
        onChange={(e: Event) =>
          set({
            signupCommitment2: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
      <s-text-field
        label="Terms section title"
        value={config.termsTitle}
        onChange={(e: Event) =>
          set({ termsTitle: (e.currentTarget as HTMLInputElement).value })
        }
      />
      <s-text-area
        label="Terms content"
        value={config.termsContent}
        rows={4}
        onChange={(e: Event) =>
          set({ termsContent: (e.currentTarget as HTMLTextAreaElement).value })
        }
      />
      <s-text-field
        label="Terms checkbox label"
        value={config.termsCheckboxLabel}
        onChange={(e: Event) =>
          set({
            termsCheckboxLabel: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
      <s-text-field
        label="Primary button"
        value={config.ctaText}
        onChange={(e: Event) =>
          set({ ctaText: (e.currentTarget as HTMLInputElement).value })
        }
      />
      <s-text-field
        label="Decline button"
        value={config.signupSkipCta}
        onChange={(e: Event) =>
          set({ signupSkipCta: (e.currentTarget as HTMLInputElement).value })
        }
      />

      <s-text type="strong">Confirmation</s-text>
      <s-text-field
        label="Headline"
        value={config.confirmationHeadline}
        onChange={(e: Event) =>
          set({
            confirmationHeadline: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
      <s-text-area
        label="Subheadline"
        value={config.confirmationSubheadline}
        rows={2}
        onChange={(e: Event) =>
          set({
            confirmationSubheadline: (e.currentTarget as HTMLTextAreaElement)
              .value,
          })
        }
      />
      <s-text-field
        label="Status text"
        value={config.confirmationStatusText}
        onChange={(e: Event) =>
          set({
            confirmationStatusText: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
    </s-stack>
  );
}

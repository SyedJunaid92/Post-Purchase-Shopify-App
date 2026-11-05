import {
  SURVEY_REWARD_CTA_DEFAULTS,
  type SurveyRewardConfig,
} from "../lib/test-config.types";
import type { SelectedProduct } from "./ProductPickerField";
import { FunnelImagesEditor } from "./FunnelImagesEditor";
import { ProductPickerField } from "./ProductPickerField";
import { RichTextField } from "./RichTextField";

type Props = {
  config: SurveyRewardConfig;
  onChange: (config: SurveyRewardConfig) => void;
  product: SelectedProduct | null;
  onProductChange: (product: SelectedProduct | null) => void;
  productLabel?: string;
};

export function SurveyRewardFields({
  config,
  onChange,
  product,
  onProductChange,
  productLabel = "Reward product",
}: Props) {
  return (
    <s-stack direction="block" gap="base">
      <RichTextField
        label="Reward headline"
        value={config.rewardHeadline}
        onChange={(rewardHeadline) => onChange({ ...config, rewardHeadline })}
        minHeight={72}
      />
      <RichTextField
        label="Reward description"
        value={config.rewardDescription}
        onChange={(rewardDescription) =>
          onChange({ ...config, rewardDescription })
        }
      />
      <FunnelImagesEditor
        label="Reward images"
        images={config.rewardImages}
        onChange={(rewardImages) => onChange({ ...config, rewardImages })}
      />
      <ProductPickerField
        label={productLabel}
        product={product}
        onChange={onProductChange}
        allowSubscription
      />
      <RichTextField
        label="Product description"
        value={config.rewardProduct.customDescription ?? ""}
        onChange={(customDescription) =>
          onChange({
            ...config,
            rewardProduct: { ...config.rewardProduct, customDescription },
          })
        }
      />
      <s-divider />
      <s-heading>Button labels</s-heading>
      <s-text tone="neutral" color="subdued">
        Optional. Leave blank to use the default checkout text shown in each
        field.
      </s-text>
      <s-text-field
        label="Claim reward button"
        placeholder={SURVEY_REWARD_CTA_DEFAULTS.rewardAddToOrderCta}
        value={config.rewardAddToOrderCta}
        onChange={(e: Event) =>
          onChange({
            ...config,
            rewardAddToOrderCta: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
      <s-text-field
        label="Consent required button"
        placeholder={SURVEY_REWARD_CTA_DEFAULTS.rewardConsentRequiredCta}
        value={config.rewardConsentRequiredCta}
        onChange={(e: Event) =>
          onChange({
            ...config,
            rewardConsentRequiredCta: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
      <s-text-field
        label="Continue button"
        placeholder={SURVEY_REWARD_CTA_DEFAULTS.rewardContinueCta}
        value={config.rewardContinueCta}
        onChange={(e: Event) =>
          onChange({
            ...config,
            rewardContinueCta: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
    </s-stack>
  );
}

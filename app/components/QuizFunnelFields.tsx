import {
  SCORED_QUIZ_CTA_DEFAULTS,
  type ScoredQuizConfig,
} from "../lib/test-config.types";
import type { SelectedProduct } from "./ProductPickerField";
import { FunnelImagesEditor } from "./FunnelImagesEditor";
import { ProductPickerField } from "./ProductPickerField";
import { RichTextField } from "./RichTextField";

type Props = {
  config: ScoredQuizConfig;
  onChange: (config: ScoredQuizConfig) => void;
  product: SelectedProduct | null;
  onProductChange: (product: SelectedProduct | null) => void;
  showThreshold?: boolean;
  productLabel?: string;
};

function QuizButtonLabelsIntro() {
  return (
    <>
      <s-divider />
      <s-heading>Button labels</s-heading>
      <s-text tone="neutral" color="subdued">
        Optional. Leave blank to use the default checkout text shown in each
        field.
      </s-text>
    </>
  );
}

export function QuizIntroFields({
  config,
  onChange,
  showThreshold = true,
}: Pick<Props, "config" | "onChange" | "showThreshold">) {
  return (
    <s-stack direction="block" gap="base">
      <RichTextField
        label="Intro headline"
        value={config.introHeadline}
        onChange={(introHeadline) => onChange({ ...config, introHeadline })}
        minHeight={72}
      />
      <RichTextField
        label="Intro subheadline"
        value={config.introSubheadline}
        onChange={(introSubheadline) => onChange({ ...config, introSubheadline })}
      />
      <RichTextField
        label="Body"
        value={config.introBody}
        onChange={(introBody) => onChange({ ...config, introBody })}
      />
      <FunnelImagesEditor
        label="Intro images"
        images={config.introImages}
        onChange={(introImages) => onChange({ ...config, introImages })}
      />
      {showThreshold ? (
        <s-number-field
          label="Pass threshold (%)"
          value={String(config.passThresholdPercent)}
          min={1}
          max={100}
          onChange={(e: Event) =>
            onChange({
              ...config,
              passThresholdPercent:
                parseInt((e.currentTarget as HTMLInputElement).value, 10) || 50,
            })
          }
        />
      ) : null}
    </s-stack>
  );
}

export function QuizPassFields({
  config,
  onChange,
  product,
  onProductChange,
  productLabel = "Reward product",
}: Pick<Props, "config" | "onChange" | "product" | "onProductChange" | "productLabel">) {
  return (
    <s-stack direction="block" gap="base">
      <RichTextField
        label="Pass headline"
        value={config.passHeadline}
        onChange={(passHeadline) => onChange({ ...config, passHeadline })}
        minHeight={72}
      />
      <RichTextField
        label="Pass subheadline"
        value={config.passSubheadline}
        onChange={(passSubheadline) => onChange({ ...config, passSubheadline })}
      />
      <FunnelImagesEditor
        label="Pass reward images"
        images={config.passImages}
        onChange={(passImages) => onChange({ ...config, passImages })}
      />
      <ProductPickerField
        label={productLabel}
        product={product}
        onChange={onProductChange}
        allowSubscription
      />
      <RichTextField
        label="Product description"
        value={config.passProduct.customDescription ?? ""}
        onChange={(customDescription) =>
          onChange({
            ...config,
            passProduct: { ...config.passProduct, customDescription },
          })
        }
      />
      <QuizButtonLabelsIntro />
      <s-text-field
        label="Add to order button"
        placeholder={SCORED_QUIZ_CTA_DEFAULTS.passAddToOrderCta}
        value={config.passAddToOrderCta}
        onChange={(e: Event) =>
          onChange({
            ...config,
            passAddToOrderCta: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
      <s-text-field
        label="Consent required button"
        placeholder={SCORED_QUIZ_CTA_DEFAULTS.passConsentRequiredCta}
        value={config.passConsentRequiredCta}
        onChange={(e: Event) =>
          onChange({
            ...config,
            passConsentRequiredCta: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
      <s-text-field
        label="Continue button"
        placeholder={SCORED_QUIZ_CTA_DEFAULTS.passContinueCta}
        value={config.passContinueCta}
        onChange={(e: Event) =>
          onChange({
            ...config,
            passContinueCta: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
    </s-stack>
  );
}

export function QuizFailFields({
  config,
  onChange,
}: Pick<Props, "config" | "onChange">) {
  return (
    <s-stack direction="block" gap="base">
      <RichTextField
        label="Fail headline"
        value={config.failHeadline}
        onChange={(failHeadline) => onChange({ ...config, failHeadline })}
        minHeight={72}
      />
      <RichTextField
        label="Fail message"
        value={config.failMessage}
        onChange={(failMessage) => onChange({ ...config, failMessage })}
      />
      <FunnelImagesEditor
        label="Fail screen images"
        images={config.failImages}
        onChange={(failImages) => onChange({ ...config, failImages })}
      />
      <QuizButtonLabelsIntro />
      <s-text-field
        label="Status message"
        placeholder={SCORED_QUIZ_CTA_DEFAULTS.failStatusMessage}
        value={config.failStatusMessage}
        onChange={(e: Event) =>
          onChange({
            ...config,
            failStatusMessage: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
      <s-text-field
        label="Continue button"
        placeholder={SCORED_QUIZ_CTA_DEFAULTS.failContinueCta}
        value={config.failContinueCta}
        onChange={(e: Event) =>
          onChange({
            ...config,
            failContinueCta: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
    </s-stack>
  );
}

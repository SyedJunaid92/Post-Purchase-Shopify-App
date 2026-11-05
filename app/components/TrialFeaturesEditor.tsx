import type { TrialFeature } from "../lib/test-config.types";
import { getFeatureTitle } from "../lib/test-config.types";
import {
  formatPolarisIconLabel,
  POLARIS_ICON_GROUPS,
  resolveTrialFeatureIcon,
} from "../lib/polaris-icons";

type Props = {
  features: TrialFeature[];
  onChange: (features: TrialFeature[]) => void;
};

function newFeature(): TrialFeature {
  return {
    id: `f_${Date.now()}`,
    title: "",
    description: "",
    imageUrl: null,
    icon: null,
  };
}

export function TrialFeaturesEditor({ features, onChange }: Props) {
  const updateFeature = (index: number, feature: TrialFeature) => {
    onChange(features.map((item, i) => (i === index ? feature : item)));
  };

  const removeFeature = (index: number) => {
    onChange(features.filter((_, i) => i !== index));
  };

  const moveFeature = (index: number, direction: "up" | "down") => {
    const next = [...features];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <s-stack direction="block" gap="base">
      <s-text tone="neutral" color="subdued">
        All fields are optional. Leave a feature blank to hide it on the customer
        screen. Icons use the same Polaris library as Shopify admin.
      </s-text>
      {features.map((feature, index) => {
        const selectedIcon = resolveTrialFeatureIcon(feature.icon);

        return (
          <s-box
            key={feature.id}
            padding="base"
            border="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" gap="base" alignItems="center">
                <s-text type="strong">Feature {index + 1}</s-text>
                <s-stack direction="inline" gap="base">
                  {index > 0 ? (
                    <s-button
                      variant="tertiary"
                      onClick={() => moveFeature(index, "up")}
                    >
                      ↑
                    </s-button>
                  ) : null}
                  {index < features.length - 1 ? (
                    <s-button
                      variant="tertiary"
                      onClick={() => moveFeature(index, "down")}
                    >
                      ↓
                    </s-button>
                  ) : null}
                  <s-button
                    variant="tertiary"
                    tone="critical"
                    onClick={() => removeFeature(index)}
                  >
                    Remove
                  </s-button>
                </s-stack>
              </s-stack>
              <s-text-field
                label="Title (optional)"
                value={getFeatureTitle(feature)}
                onChange={(e: Event) =>
                  updateFeature(index, {
                    ...feature,
                    title: (e.currentTarget as HTMLInputElement).value,
                    text: (e.currentTarget as HTMLInputElement).value,
                  })
                }
              />
              <s-text-area
                label="Description (optional)"
                value={feature.description ?? ""}
                rows={2}
                onChange={(e: Event) =>
                  updateFeature(index, {
                    ...feature,
                    description: (e.currentTarget as HTMLTextAreaElement).value,
                  })
                }
              />
              <s-select
                label="Icon (optional)"
                icon={selectedIcon ?? undefined}
                value={selectedIcon ?? ""}
                onChange={(e: Event) =>
                  updateFeature(index, {
                    ...feature,
                    icon:
                      (e.currentTarget as HTMLSelectElement).value.trim() ||
                      null,
                  })
                }
              >
                <s-option value="">None</s-option>
                {POLARIS_ICON_GROUPS.map((group) => (
                  <s-option-group key={group.label} label={group.label}>
                    {group.icons.map((icon) => (
                      <s-option key={icon} value={icon}>
                        {formatPolarisIconLabel(icon)}
                      </s-option>
                    ))}
                  </s-option-group>
                ))}
              </s-select>
              {selectedIcon ? (
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-icon type={selectedIcon} tone="neutral" />
                  <s-text tone="neutral" color="subdued">
                    {formatPolarisIconLabel(selectedIcon)}
                  </s-text>
                </s-stack>
              ) : null}
              <s-text-field
                label="Image URL (optional)"
                value={feature.imageUrl ?? ""}
                onChange={(e: Event) =>
                  updateFeature(index, {
                    ...feature,
                    imageUrl:
                      (e.currentTarget as HTMLInputElement).value.trim() || null,
                  })
                }
              />
              {feature.imageUrl ? (
                <s-thumbnail
                  src={feature.imageUrl}
                  alt={getFeatureTitle(feature) || `Feature ${index + 1}`}
                  size="small"
                />
              ) : null}
            </s-stack>
          </s-box>
        );
      })}
      <s-button variant="secondary" onClick={() => onChange([...features, newFeature()])}>
        Add feature
      </s-button>
    </s-stack>
  );
}

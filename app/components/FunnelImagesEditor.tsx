import type { FunnelImage, FunnelImagePlacement } from "../lib/test-config.types";
import { newFunnelImage } from "../lib/test-config.types";

type Props = {
  label: string;
  images: FunnelImage[];
  onChange: (images: FunnelImage[]) => void;
  helpText?: string;
};

const PLACEMENT_OPTIONS: { value: FunnelImagePlacement; label: string }[] = [
  { value: "top", label: "Above content" },
  { value: "bottom", label: "Below content" },
];

export function FunnelImagesEditor({
  label,
  images,
  onChange,
  helpText,
}: Props) {
  const updateImage = (index: number, patch: Partial<FunnelImage>) => {
    onChange(images.map((image, i) => (i === index ? { ...image, ...patch } : image)));
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  const moveImage = (index: number, direction: "up" | "down") => {
    const next = [...images];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <s-stack direction="block" gap="base">
      <s-text type="strong">{label}</s-text>
      {helpText ? (
        <s-text tone="neutral" color="subdued">
          {helpText}
        </s-text>
      ) : (
        <s-text tone="neutral" color="subdued">
          Add one or more image URLs. Multiple images at the same placement appear
          as a swipeable gallery in checkout.
        </s-text>
      )}

      {images.map((image, index) => (
        <s-box
          key={image.id}
          padding="base"
          border="base"
          borderRadius="base"
          background="subdued"
        >
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-text type="strong">Image {index + 1}</s-text>
              <s-stack direction="inline" gap="base">
                {index > 0 ? (
                  <s-button variant="tertiary" onClick={() => moveImage(index, "up")}>
                    ↑
                  </s-button>
                ) : null}
                {index < images.length - 1 ? (
                  <s-button variant="tertiary" onClick={() => moveImage(index, "down")}>
                    ↓
                  </s-button>
                ) : null}
                <s-button
                  variant="tertiary"
                  tone="critical"
                  onClick={() => removeImage(index)}
                >
                  Remove
                </s-button>
              </s-stack>
            </s-stack>

            <s-text-field
              label="Image URL"
              value={image.url}
              onChange={(e: Event) =>
                updateImage(index, {
                  url: (e.currentTarget as HTMLInputElement).value,
                })
              }
            />

            <s-text-field
              label="Alt text (optional)"
              value={image.alt ?? ""}
              onChange={(e: Event) =>
                updateImage(index, {
                  alt: (e.currentTarget as HTMLInputElement).value || undefined,
                })
              }
            />

            <s-select
              label="Placement"
              value={image.placement}
              onChange={(e: Event) =>
                updateImage(index, {
                  placement: (e.currentTarget as HTMLSelectElement)
                    .value as FunnelImagePlacement,
                })
              }
            >
              {PLACEMENT_OPTIONS.map((option) => (
                <s-option key={option.value} value={option.value}>
                  {option.label}
                </s-option>
              ))}
            </s-select>

            {image.url.trim() ? (
              <s-thumbnail
                src={image.url.trim()}
                alt={image.alt || `Image ${index + 1}`}
                size="small"
              />
            ) : null}
          </s-stack>
        </s-box>
      ))}

      <s-button
        variant="secondary"
        onClick={() => onChange([...images, newFunnelImage()])}
      >
        Add image
      </s-button>
    </s-stack>
  );
}

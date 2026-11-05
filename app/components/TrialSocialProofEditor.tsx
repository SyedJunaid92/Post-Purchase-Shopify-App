import type { SocialProofItem } from "../lib/test-config.types";

type Props = {
  items: SocialProofItem[];
  onChange: (items: SocialProofItem[]) => void;
};

function newItem(): SocialProofItem {
  return {
    id: `sp_${Date.now()}`,
    text: "",
    imageUrl: null,
  };
}

export function TrialSocialProofEditor({ items, onChange }: Props) {
  const updateItem = (index: number, item: SocialProofItem) => {
    onChange(items.map((entry, i) => (i === index ? item : entry)));
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    const next = [...items];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <s-stack direction="block" gap="base">
      <s-text tone="neutral" color="subdued">
        Add customer avatars or proof images. All fields are optional — leave blank
        to hide an item.
      </s-text>
      {items.map((item, index) => (
        <s-box
          key={item.id}
          padding="base"
          border="base"
          borderRadius="base"
          background="subdued"
        >
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-text type="strong">Avatar / item {index + 1}</s-text>
              <s-stack direction="inline" gap="base">
                {index > 0 ? (
                  <s-button
                    variant="tertiary"
                    onClick={() => moveItem(index, "up")}
                  >
                    ↑
                  </s-button>
                ) : null}
                {index < items.length - 1 ? (
                  <s-button
                    variant="tertiary"
                    onClick={() => moveItem(index, "down")}
                  >
                    ↓
                  </s-button>
                ) : null}
                <s-button
                  variant="tertiary"
                  tone="critical"
                  onClick={() => removeItem(index)}
                >
                  Remove
                </s-button>
              </s-stack>
            </s-stack>
            <s-text-field
              label="Caption (optional)"
              value={item.text ?? ""}
              onChange={(e: Event) =>
                updateItem(index, {
                  ...item,
                  text: (e.currentTarget as HTMLInputElement).value,
                })
              }
            />
            <s-text-field
              label="Avatar image URL (optional)"
              value={item.imageUrl ?? ""}
              onChange={(e: Event) =>
                updateItem(index, {
                  ...item,
                  imageUrl:
                    (e.currentTarget as HTMLInputElement).value.trim() || null,
                })
              }
            />
            {item.imageUrl ? (
              <s-thumbnail
                src={item.imageUrl}
                alt={item.text || `Social proof ${index + 1}`}
                size="small"
              />
            ) : null}
          </s-stack>
        </s-box>
      ))}
      <s-button variant="secondary" onClick={() => onChange([...items, newItem()])}>
        Add avatar / item
      </s-button>
    </s-stack>
  );
}

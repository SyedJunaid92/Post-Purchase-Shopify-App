import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onInsert: (url: string, alt: string) => void;
};

export function RichTextImageModal({ open, onClose, onInsert }: Props) {
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setUrl("");
    setAlt("");
    setError("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const previewUrl = url.trim();
  const canPreview = /^https?:\/\//i.test(previewUrl);

  const handleInsert = () => {
    const nextUrl = url.trim();
    if (!nextUrl) {
      setError("Enter an image URL.");
      return;
    }
    if (!/^https?:\/\//i.test(nextUrl)) {
      setError("URL must start with http:// or https://");
      return;
    }
    onInsert(nextUrl, alt.trim());
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rich-text-image-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          border: "none",
          background: "rgba(17, 24, 39, 0.55)",
          cursor: "pointer",
        }}
      />
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 520,
          borderRadius: 16,
          background: "var(--p-color-bg-surface, #fff)",
          boxShadow:
            "0 20px 50px rgba(17, 24, 39, 0.18), 0 0 0 1px rgba(17, 24, 39, 0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "20px 24px 12px",
            borderBottom: "1px solid var(--p-color-border, #e1e3e5)",
          }}
        >
          <s-text id="rich-text-image-modal-title" type="strong">
            Insert image
          </s-text>
        </div>
        <div style={{ padding: "20px 24px" }}>
          <s-stack direction="block" gap="base">
            <s-text tone="neutral" color="subdued">
              Paste a public image URL. The image will appear inline at your
              cursor position in the rich text field.
            </s-text>
            <s-text-field
              label="Image URL"
              value={url}
              placeholder="https://cdn.shopify.com/..."
              onChange={(e: Event) => {
                setUrl((e.currentTarget as HTMLInputElement).value);
                setError("");
              }}
            />
            <s-text-field
              label="Alt text (optional)"
              value={alt}
              placeholder="Describe the image for accessibility"
              onChange={(e: Event) =>
                setAlt((e.currentTarget as HTMLInputElement).value)
              }
            />
            {error ? (
              <s-banner tone="critical">
                <s-text>{error}</s-text>
              </s-banner>
            ) : null}
            {canPreview ? (
              <s-box
                padding="base"
                border="base"
                borderRadius="base"
                background="subdued"
              >
                <s-stack direction="block" gap="small">
                  <s-text tone="neutral" color="subdued">
                    Preview
                  </s-text>
                  <img
                    src={previewUrl}
                    alt={alt.trim() || "Image preview"}
                    style={{
                      maxWidth: "100%",
                      maxHeight: 220,
                      borderRadius: 8,
                      display: "block",
                      objectFit: "contain",
                    }}
                  />
                </s-stack>
              </s-box>
            ) : null}
          </s-stack>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "16px 24px 20px",
            borderTop: "1px solid var(--p-color-border, #e1e3e5)",
            background: "var(--p-color-bg-surface-secondary, #f6f6f7)",
          }}
        >
          <s-button variant="secondary" onClick={onClose}>
            Cancel
          </s-button>
          <s-button variant="primary" onClick={handleInsert}>
            Insert image
          </s-button>
        </div>
      </div>
    </div>
  );
}

import { sanitizeRichHtml } from "../lib/rich-text.utils";

type Props = {
  value: string;
};

export function RichTextPreview({ value }: Props) {
  const html = sanitizeRichHtml(value);
  if (!html) return null;

  return (
    <>
      <style>{`
        .rich-text-preview img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 8px 0;
          display: block;
        }
      `}</style>
      <div
        className="rich-text-preview"
        style={{ lineHeight: 1.5 }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}

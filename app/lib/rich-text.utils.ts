export type RichTextSpan = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

export type RichTextBlock =
  | { type: "paragraph"; spans: RichTextSpan[] }
  | { type: "list"; items: RichTextSpan[][] }
  | { type: "image"; url: string; alt?: string };

export function looksLikeRichTextHtml(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

export function plainTextToRichHtml(value: string | null | undefined): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (looksLikeRichTextHtml(text)) return text;
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function stripRichTextToPlain(value: string | null | undefined): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!looksLikeRichTextHtml(text)) return text;
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<img\b[^>]*>/gi, "[image]")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractAttr(attrs: string, name: string): string {
  const match = attrs.match(
    new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return (match?.[2] ?? match?.[3] ?? match?.[4] ?? "").trim();
}

function sanitizeImgTags(html: string): string {
  return html.replace(/<img\b([^>]*)>/gi, (_, attrs: string) => {
    const src = decodeHtmlEntities(extractAttr(attrs, "src"));
    const alt = decodeHtmlEntities(extractAttr(attrs, "alt"));
    if (!src || !/^https?:\/\//i.test(src)) return "";
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`;
  });
}

export function sanitizeRichHtml(value: string | null | undefined): string {
  const html = plainTextToRichHtml(value);
  if (!html) return "";

  return sanitizeImgTags(html)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/ on\w+="[^"]*"/gi, "")
    .replace(/ on\w+='[^']*'/gi, "")
    .replace(/<(?!(\/)?(p|br|strong|b|em|i|u|ul|ol|li|a|img)\b)[^>]+>/gi, "");
}

export function parseRichTextBlocks(
  value: string | null | undefined,
): RichTextBlock[] {
  const html = sanitizeRichHtml(value);
  if (!html) return [];

  const blocks: RichTextBlock[] = [];
  const listMatch = html.match(/<ul[\s\S]*?<\/ul>/gi);
  if (listMatch?.length) {
    let remainder = html;
    for (const listHtml of listMatch) {
      const [before, after] = remainder.split(listHtml);
      blocks.push(...parseParagraphHtml(before));
      blocks.push(parseListHtml(listHtml));
      remainder = after ?? "";
    }
    blocks.push(...parseParagraphHtml(remainder));
    return blocks.filter(hasBlockContent);
  }

  return parseParagraphHtml(html).filter(hasBlockContent);
}

function hasBlockContent(block: RichTextBlock): boolean {
  if (block.type === "image") {
    return Boolean(block.url);
  }
  if (block.type === "paragraph") {
    return block.spans.some((span) => span.text.trim());
  }
  return block.items.some((item) => item.some((span) => span.text.trim()));
}

function parseParagraphHtml(html: string): RichTextBlock[] {
  const chunks = html
    .split(/<\/p>/gi)
    .map((chunk) => chunk.replace(/^[\s\S]*?<p[^>]*>/i, "").trim())
    .filter(Boolean);

  if (!chunks.length) {
    const trimmed = html.trim();
    if (!trimmed) return [];
    return parseMixedContent(trimmed);
  }

  return chunks.flatMap((chunk) => parseMixedContent(chunk));
}

function parseMixedContent(html: string): RichTextBlock[] {
  const blocks: RichTextBlock[] = [];
  const regex = /<img\b[^>]*>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html))) {
    pushParagraphFromSpans(blocks, parseInlineSpans(html.slice(lastIndex, match.index)));
    const image = parseImgTag(match[0]);
    if (image) blocks.push(image);
    lastIndex = match.index + match[0].length;
  }

  pushParagraphFromSpans(blocks, parseInlineSpans(html.slice(lastIndex)));
  return blocks;
}

function pushParagraphFromSpans(
  blocks: RichTextBlock[],
  spans: RichTextSpan[],
) {
  if (spans.some((span) => span.text.trim())) {
    blocks.push({ type: "paragraph", spans });
  }
}

function parseImgTag(tagHtml: string): RichTextBlock | null {
  const match = tagHtml.match(/<img\b([^>]*)>/i);
  if (!match) return null;

  const src = decodeHtmlEntities(extractAttr(match[1], "src"));
  const alt = decodeHtmlEntities(extractAttr(match[1], "alt"));
  if (!src || !/^https?:\/\//i.test(src)) return null;

  return { type: "image", url: src, alt: alt || undefined };
}

function parseListHtml(listHtml: string): RichTextBlock {
  const items = [...listHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(
    (match) => parseInlineSpans(match[1] ?? ""),
  );
  return { type: "list", items };
}

function parseInlineSpans(html: string): RichTextSpan[] {
  const spans: RichTextSpan[] = [];
  const regex = /<\/?(strong|b|em|i|u|br)\s*\/?>|([^<]+)/gi;
  const styleStack: Array<"bold" | "italic" | "underline"> = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html))) {
    if (match[1]) {
      const tag = match[1].toLowerCase();
      const closing = match[0].startsWith("</");
      if (tag === "br" && !closing) {
        spans.push({ text: "\n" });
        continue;
      }
      const style =
        tag === "strong" || tag === "b"
          ? "bold"
          : tag === "em" || tag === "i"
            ? "italic"
            : tag === "u"
              ? "underline"
              : null;
      if (!style) continue;
      if (closing) {
        const index = styleStack.lastIndexOf(style);
        if (index >= 0) styleStack.splice(index, 1);
      } else {
        styleStack.push(style);
      }
      continue;
    }

    const text = decodeHtmlEntities(match[2] ?? "");
    if (!text) continue;

    spans.push({
      text,
      bold: styleStack.includes("bold") || undefined,
      italic: styleStack.includes("italic") || undefined,
      underline: styleStack.includes("underline") || undefined,
    });
  }

  return mergeAdjacentSpans(spans);
}

function mergeAdjacentSpans(spans: RichTextSpan[]): RichTextSpan[] {
  const merged: RichTextSpan[] = [];
  for (const span of spans) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.bold === span.bold &&
      previous.italic === span.italic &&
      previous.underline === span.underline
    ) {
      previous.text += span.text;
    } else {
      merged.push({ ...span });
    }
  }
  return merged.filter((span) => span.text);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function parseDescriptionLines(
  value: string | null | undefined,
): string[] {
  const plain = stripRichTextToPlain(value);
  if (!plain) return [];
  return plain
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

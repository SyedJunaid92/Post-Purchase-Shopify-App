import { useCallback, useEffect, useRef, useState } from "react";
import { plainTextToRichHtml, sanitizeRichHtml } from "../lib/rich-text.utils";
import { RichTextImageModal } from "./RichTextImageModal";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minHeight?: number;
  helpText?: string;
};

const TOOLBAR_BUTTONS = [
  { command: "bold", label: "B", title: "Bold" },
  { command: "italic", label: "I", title: "Italic" },
  { command: "underline", label: "U", title: "Underline" },
  { command: "insertUnorderedList", label: "• List", title: "Bullet list" },
] as const;

type ToolbarCommand = (typeof TOOLBAR_BUTTONS)[number]["command"];

function selectionInEditor(editor: HTMLDivElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
  const node = selection.anchorNode;
  return node ? editor.contains(node) : false;
}

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function RichTextField({
  label,
  value,
  onChange,
  minHeight = 96,
  helpText,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [activeCommands, setActiveCommands] = useState<
    Partial<Record<ToolbarCommand, boolean>>
  >({});

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const normalized = sanitizeRichHtml(plainTextToRichHtml(value));
    if (normalized !== editor.innerHTML) {
      editor.innerHTML = normalized;
    }
    lastEmitted.current = normalized;
  }, [value]);

  const refreshActiveCommands = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || !selectionInEditor(editor)) {
      setActiveCommands({});
      return;
    }

    setActiveCommands({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      insertUnorderedList: document.queryCommandState("insertUnorderedList"),
    });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", refreshActiveCommands);
    return () =>
      document.removeEventListener("selectionchange", refreshActiveCommands);
  }, [refreshActiveCommands]);

  const emitChange = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = sanitizeRichHtml(editor.innerHTML);
    if (next === lastEmitted.current) return;
    lastEmitted.current = next;
    onChange(next);
  };

  const runCommand = (command: ToolbarCommand) => {
    editorRef.current?.focus();
    document.execCommand(command, false);
    emitChange();
    refreshActiveCommands();
  };

  const openImageModal = () => {
    editorRef.current?.focus();
    setImageModalOpen(true);
  };

  const insertImage = (url: string, alt: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(
      "insertHTML",
      false,
      `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}">`,
    );
    emitChange();
  };

  return (
    <s-stack direction="block" gap="small">
      <s-text type="strong">{label}</s-text>
      {helpText ? (
        <s-text tone="neutral" color="subdued">
          {helpText}
        </s-text>
      ) : null}
      <div
        style={{
          border: "1px solid var(--p-color-border, #c9cccf)",
          borderRadius: "8px",
          overflow: "hidden",
          background: "var(--p-color-bg-surface, #fff)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px",
            padding: "8px",
            borderBottom: "1px solid var(--p-color-border, #e1e3e5)",
            background: "var(--p-color-bg-surface-secondary, #f6f6f7)",
          }}
        >
          {TOOLBAR_BUTTONS.map((button) => {
            const isActive = Boolean(activeCommands[button.command]);

            return (
              <button
                key={button.command}
                type="button"
                title={button.title}
                aria-pressed={isActive}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => runCommand(button.command)}
                style={{
                  border: isActive
                    ? "1px solid var(--p-color-border-interactive, #2c6ecb)"
                    : "1px solid var(--p-color-border, #c9cccf)",
                  borderRadius: "6px",
                  background: isActive
                    ? "var(--p-color-bg-fill-active, #e3e5e7)"
                    : "#fff",
                  padding: "4px 8px",
                  fontSize: "12px",
                  cursor: "pointer",
                  minWidth: "32px",
                  fontWeight:
                    button.command === "bold" && isActive ? "bold" : "normal",
                  fontStyle:
                    button.command === "italic" && isActive
                      ? "italic"
                      : "normal",
                  textDecoration:
                    button.command === "underline" && isActive
                      ? "underline"
                      : "none",
                  boxShadow: isActive
                    ? "inset 0 0 0 1px rgba(44, 110, 203, 0.25)"
                    : "none",
                }}
              >
                {button.label}
              </button>
            );
          })}
          <button
            type="button"
            title="Insert image"
            onMouseDown={(event) => event.preventDefault()}
            onClick={openImageModal}
            style={{
              border: "1px solid var(--p-color-border, #c9cccf)",
              borderRadius: "6px",
              background: "#fff",
              padding: "4px 8px",
              fontSize: "12px",
              cursor: "pointer",
              minWidth: "32px",
            }}
          >
            Image
          </button>
        </div>
        <style>{`
          .rich-text-editor img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            margin: 8px 0;
            display: block;
          }
        `}</style>
        <div
          ref={editorRef}
          className="rich-text-editor"
          contentEditable
          suppressContentEditableWarning
          onInput={emitChange}
          onBlur={emitChange}
          onFocus={refreshActiveCommands}
          onKeyUp={refreshActiveCommands}
          onMouseUp={refreshActiveCommands}
          style={{
            minHeight,
            padding: "12px",
            outline: "none",
            fontSize: "14px",
            lineHeight: 1.5,
            color: "var(--p-color-text, #202223)",
          }}
        />
      </div>

      <RichTextImageModal
        open={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
        onInsert={insertImage}
      />
    </s-stack>
  );
}

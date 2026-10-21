import { useRef, useState, type ComponentProps } from "react";

/** Copies text, falling back to execCommand where the Clipboard API is missing (plain http on a LAN). */
export async function copyText(text: string) {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  return ok;
}

/** Markdown `pre` with a copy button (shown on hover, always on touch screens). */
export function CodeBlock(markdownProps: ComponentProps<"pre"> & { node?: unknown }) {
  const props = { ...markdownProps };
  delete props.node; // react-markdown's AST node, not a DOM attribute
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (await copyText(ref.current?.innerText.replace(/\n$/, "") ?? "")) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div className="group relative">
      <pre ref={ref} {...props} />
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label="Copy code"
        className="absolute right-2 top-2 rounded-md bg-white/10 px-2 py-1 text-[0.7rem] font-medium text-white/80 opacity-0 backdrop-blur transition-opacity duration-150 hover:bg-white/20 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

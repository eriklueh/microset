import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown renderer for coach replies, in Manifiesto styling. Split into its own module so
 * `react-markdown` + `remark-gfm` (heavy) land in a lazily-loaded chunk — only fetched when a
 * coach conversation actually renders an assistant bubble (see CoachView's lazy import).
 */
const MD: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-4 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="mb-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a href={href} className="text-[var(--acc)] underline">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="bg-[var(--bar1)] px-1 py-0.5 font-mono text-[12px]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto bg-[var(--bar1)] p-2 font-mono text-[12px] leading-[1.4] last:mb-0">
      {children}
    </pre>
  ),
  h1: ({ children }) => <div className="mt-2 mb-1 text-[14px] font-bold first:mt-0">{children}</div>,
  h2: ({ children }) => <div className="mt-2 mb-1 text-[13.5px] font-bold first:mt-0">{children}</div>,
  h3: ({ children }) => <div className="mt-2 mb-1 text-[13px] font-semibold first:mt-0">{children}</div>,
  hr: () => <hr className="my-2 border-[var(--rule2)]" />,
};

export default function MarkdownBody({ text }: { text: string }) {
  return (
    <div className="text-[13px] leading-[1.5]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

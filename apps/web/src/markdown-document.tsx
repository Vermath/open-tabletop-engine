import type { ReactNode } from "react";

export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "blockquote"; text: string }
  | { kind: "code"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

export function markdownBlocks(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: Extract<MarkdownBlock, { kind: "list" }> | undefined;
  let code: string[] | undefined;

  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ kind: "paragraph", text });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = undefined;
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      flushParagraph();
      flushList();
      if (code) {
        blocks.push({ kind: "code", text: code.join("\n") });
        code = undefined;
      } else {
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", level: heading[1]!.length as 1 | 2 | 3, text: heading[2]!.trim() });
      continue;
    }
    const listItem = /^\s*(?:(\d+)\.|[-*])\s+(.+)$/.exec(line);
    if (listItem) {
      flushParagraph();
      const ordered = Boolean(listItem[1]);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { kind: "list", ordered, items: [] };
      }
      list.items.push(listItem[2]!.trim());
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "blockquote", text: quote[1]!.trim() });
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  if (code) blocks.push({ kind: "code", text: code.join("\n") });
  flushParagraph();
  flushList();
  return blocks;
}

export function safeMarkdownHref(value: string): string | undefined {
  const href = value.trim();
  if (/^(https?:|mailto:)/i.test(href) || href.startsWith("/") || href.startsWith("#")) return href;
  return undefined;
}

export function MarkdownDocument({ source, label }: { source: string; label?: string }) {
  const blocks = markdownBlocks(source);
  if (blocks.length === 0) return <p className="markdown-empty">No content.</p>;
  return (
    <article className="markdown-document" aria-label={label}>
      {blocks.map((block, index) => {
        const key = `${block.kind}:${index}`;
        if (block.kind === "heading") {
          if (block.level === 1) return <h2 key={key}>{inlineMarkdown(block.text)}</h2>;
          if (block.level === 2) return <h3 key={key}>{inlineMarkdown(block.text)}</h3>;
          return <h4 key={key}>{inlineMarkdown(block.text)}</h4>;
        }
        if (block.kind === "blockquote") return <blockquote key={key}>{inlineMarkdown(block.text)}</blockquote>;
        if (block.kind === "code") return <pre key={key}><code>{block.text}</code></pre>;
        if (block.kind === "list") {
          const items = block.items.map((item, itemIndex) => <li key={`${key}:${itemIndex}`}>{inlineMarkdown(item)}</li>);
          return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
        }
        return <p key={key}>{inlineMarkdown(block.text)}</p>;
      })}
    </article>
  );
}

function inlineMarkdown(source: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const token = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^\s)]+\))/g;
  let cursor = 0;
  for (const match of source.matchAll(token)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(source.slice(cursor, index));
    const value = match[0];
    if (value.startsWith("**")) nodes.push(<strong key={`${index}:strong`}>{value.slice(2, -2)}</strong>);
    else if (value.startsWith("*")) nodes.push(<em key={`${index}:em`}>{value.slice(1, -1)}</em>);
    else if (value.startsWith("`")) nodes.push(<code key={`${index}:code`}>{value.slice(1, -1)}</code>);
    else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(value)!;
      const href = safeMarkdownHref(link[2]!);
      nodes.push(href
        ? <a key={`${index}:link`} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined}>{link[1]}</a>
        : <span key={`${index}:unsafe`}>{link[1]}</span>);
    }
    cursor = index + value.length;
  }
  if (cursor < source.length) nodes.push(source.slice(cursor));
  return nodes;
}

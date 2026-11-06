// Converts Asana rich text (`html_notes`, `html_text`) to Markdown for bb's
// Markdown renderer, so the frontend never renders Asana HTML directly.
//
// Asana emits a small, well-formed XML subset: body, strong, em, u, s, code,
// pre, a, ul, ol, li, h1, h2, blockquote, hr, img, and tables. Unknown tags
// are dropped and their text kept.

interface ElementNode {
  kind: "element";
  tag: string;
  attrs: Record<string, string>;
  children: RichNode[];
}
type RichNode = ElementNode | { kind: "text"; text: string };

const VOID_TAGS = new Set(["br", "hr", "img"]);

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[lower] ?? "";
  });
}

function parse(html: string): RichNode[] {
  const root: ElementNode = { kind: "element", tag: "#root", attrs: {}, children: [] };
  const stack: ElementNode[] = [root];
  const tokens = /<(\/?)([a-z][a-z0-9]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)|</gi;
  for (const match of html.matchAll(tokens)) {
    const parent = stack[stack.length - 1]!;
    const [whole, closing, rawTag, rawAttrs, selfClosing, text] = match;
    if (text !== undefined || rawTag === undefined) {
      parent.children.push({ kind: "text", text: decodeEntities(text ?? whole) });
      continue;
    }
    const tag = rawTag.toLowerCase();
    if (closing === "/") {
      const index = stack.map((node) => node.tag).lastIndexOf(tag);
      if (index > 0) stack.length = index;
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const attr of (rawAttrs ?? "").matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) {
      attrs[attr[1]!.toLowerCase()] = decodeEntities(attr[2] ?? "");
    }
    const node: ElementNode = { kind: "element", tag, attrs, children: [] };
    parent.children.push(node);
    if (selfClosing !== "/" && !VOID_TAGS.has(tag)) stack.push(node);
  }
  return root.children;
}

/** Escapes characters Markdown would otherwise treat as syntax. */
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]<>|~]/g, "\\$&");
}

export interface RichTextOptions {
  /** Markdown for a link to an Asana asset (attachment), or null to keep the link. */
  assetLink?(assetGid: string, label: string): string | null;
}

const ASSET_LINK = /[?&]asset_id=(\d+)/;

function textOf(nodes: RichNode[]): string {
  return nodes
    .map((node) => (node.kind === "text" ? node.text : textOf(node.children)))
    .join("");
}

function renderInline(nodes: RichNode[], options: RichTextOptions): string {
  return nodes.map((node) => renderNode(node, options, 0)).join("");
}

function prefixLines(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => (line === "" ? prefix.trimEnd() : prefix + line))
    .join("\n");
}

function renderList(node: ElementNode, options: RichTextOptions, depth: number): string {
  const ordered = node.tag === "ol";
  let index = 0;
  const items = node.children.flatMap((child) => {
    if (child.kind !== "element" || child.tag !== "li") return [];
    index += 1;
    const marker = ordered ? `${index}. ` : "- ";
    const nested = child.children
      .filter((item): item is ElementNode => item.kind === "element" && (item.tag === "ul" || item.tag === "ol"))
      .map((list) => renderList(list, options, depth + 1));
    const body = renderInline(
      child.children.filter((item) => !(item.kind === "element" && (item.tag === "ul" || item.tag === "ol"))),
      options,
    ).trim().replace(/\n+/g, " ");
    return [`${"  ".repeat(depth)}${marker}${body}`, ...nested];
  });
  return items.join("\n");
}

function renderNode(node: RichNode, options: RichTextOptions, depth: number): string {
  if (node.kind === "text") return escapeMarkdown(node.text);
  const inner = () => renderInline(node.children, options);
  switch (node.tag) {
    case "strong":
    case "b": {
      const text = inner();
      return text.trim() === "" ? text : `**${text}**`;
    }
    case "em":
    case "i": {
      const text = inner();
      return text.trim() === "" ? text : `*${text}*`;
    }
    case "s":
    case "strike":
    case "del":
      return `~~${inner()}~~`;
    case "code":
      return "`" + textOf(node.children).replace(/`/g, "'") + "`";
    case "pre":
      return "\n\n```\n" + textOf(node.children).replace(/```/g, "'''") + "\n```\n\n";
    case "br":
      return "\n";
    case "hr":
      return "\n\n---\n\n";
    case "h1":
      return `\n\n## ${inner().trim()}\n\n`;
    case "h2":
    case "h3":
      return `\n\n### ${inner().trim()}\n\n`;
    case "blockquote":
      return `\n\n${prefixLines(inner().trim(), "> ")}\n\n`;
    case "ul":
    case "ol":
      return `\n\n${renderList(node, options, depth)}\n\n`;
    case "img": {
      const gid = node.attrs["data-asana-gid"];
      const label = node.attrs.alt || "image";
      return gid === undefined ? "" : (options.assetLink?.(gid, label) ?? "");
    }
    case "a": {
      const label = textOf(node.children).trim();
      const href = node.attrs.href ?? "";
      if (node.attrs["data-asana-type"] === "user") return `**${escapeMarkdown(label)}**`;
      const asset = ASSET_LINK.exec(href)?.[1];
      if (asset !== undefined) {
        const replaced = options.assetLink?.(asset, label);
        if (replaced != null) return replaced;
      }
      if (!/^https?:\/\//i.test(href)) return escapeMarkdown(label);
      const text = label === "" || label === href ? href : label;
      return `[${escapeMarkdown(text)}](<${href.replace(/[<>]/g, encodeURIComponent)}>)`;
    }
    case "tr":
      return `\n${node.children
        .filter((cell): cell is ElementNode => cell.kind === "element")
        .map((cell) => renderInline(cell.children, options).trim().replace(/\n+/g, " "))
        .join(" · ")}`;
    case "table":
      return `\n\n${inner().trim()}\n\n`;
    default:
      return inner();
  }
}

/** Asana rich text as Markdown. Newlines in text become hard line breaks. */
export function richTextToMarkdown(html: string, options: RichTextOptions = {}): string {
  const markdown = parse(html)
    .map((node) => renderNode(node, options, 0))
    .join("");
  return markdown
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .split("\n\n")
    .map((block) =>
      /^(```|- |\d+\. |> |\s)/m.test(block) ? block : block.replace(/\n/g, "  \n"),
    )
    .join("\n\n");
}

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { releaseEvidenceGates } from "./v1-release-gates.mjs";

const root = process.cwd();
const outputDir = join(root, "dist", "docs-site");
const markdownRoots = [join(root, "README.md"), join(root, "CHANGELOG.md"), join(root, "docs")];
const excludedPublicSources = new Set(
  [
    "docs/verification/mvp-acceptance-audit.md",
    "docs/verification/mvp-progress.md",
    "docs/verification/v0.3-dogfood-acceptance.md",
    "docs/verification/v0.3-dogfood-progress.md"
  ].map((file) => file.toLowerCase())
);

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const markdownFiles = markdownRoots.flatMap((entry) => collectMarkdown(entry));
const rendered = new Set();

for (const file of markdownFiles) {
  const relativePath = relative(root, file);
  const outputPath = htmlOutputPath(relativePath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderPage(relativePath, readFileSync(file, "utf8")));
  rendered.add(relativePath.replaceAll("\\", "/"));
}

const siteIndex = join(outputDir, "index.html");
const publicIndex = join(outputDir, "docs", "site", "index.html");
if (existsSync(publicIndex)) {
  writeFileSync(siteIndex, renderLandingPage());
}

const manifest = {
  generatedAt: new Date().toISOString(),
  sourceCount: rendered.size,
  sources: Array.from(rendered).sort()
};
writeFileSync(join(outputDir, "site-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

if (process.argv.includes("--check")) {
  const requiredReleaseEvidenceOutputs = Array.from(
    new Set(releaseEvidenceGates.map((gate) => gate.evidence.replace(/\.md$/i, ".html")))
  );
  const required = [
    "index.html",
    "CHANGELOG.html",
    "docs/site/index.html",
    "docs/release/v1.0.html",
    "docs/release/v1-release-checklist.html",
    "docs/deployment/hosted-deployment-recipes.html",
    "docs/prd-v1-gap-closure.html",
    "docs/verification/v1-gap-closure-completion-audit.html",
    "docs/verification/v1-release-owner-handoff.html",
    ...requiredReleaseEvidenceOutputs
  ];
  const missing = required.filter((file) => !existsSync(join(outputDir, file)));
  if (missing.length > 0) {
    console.error(`Docs site build missing required outputs: ${missing.join(", ")}`);
    process.exit(1);
  }
  const brokenLinks = markdownFiles.flatMap((file) => findBrokenMarkdownLinks(file));
  if (brokenLinks.length > 0) {
    console.error(`Docs site build found broken markdown links:\n${brokenLinks.join("\n")}`);
    process.exit(1);
  }
  const localPathLeaks = markdownFiles.flatMap((file) => findLocalPathLeaks(file));
  if (localPathLeaks.length > 0) {
    console.error(`Docs site build found local filesystem paths in public docs:\n${localPathLeaks.join("\n")}`);
    process.exit(1);
  }
  const releaseGateGaps = findReleaseGateGaps();
  if (releaseGateGaps.length > 0) {
    console.error(`Docs site build found missing release-gate references:\n${releaseGateGaps.join("\n")}`);
    process.exit(1);
  }
}

function collectMarkdown(entry) {
  if (!existsSync(entry)) return [];
  const stats = statSync(entry);
  if (stats.isFile()) {
    const relativePath = relative(root, entry).replaceAll("\\", "/").toLowerCase();
    return extname(entry).toLowerCase() === ".md" && !excludedPublicSources.has(relativePath) ? [entry] : [];
  }
  return readdirSync(entry, { withFileTypes: true }).flatMap((item) => collectMarkdown(join(entry, item.name)));
}

function htmlOutputPath(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/").replace(/\.md$/i, ".html");
  return join(outputDir, normalized);
}

function findBrokenMarkdownLinks(file) {
  const markdown = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
  const sourceRelative = relative(root, file).replaceAll("\\", "/");
  const broken = [];
  for (const match of markdown.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
    const href = match[2].trim();
    if (!href || /^[a-z]+:/i.test(href) || href.startsWith("#")) continue;
    const [path] = href.split("#");
    if (!path || !path.endsWith(".md")) continue;
    const target = join(dirname(file), path);
    if (!existsSync(target)) {
      broken.push(`${sourceRelative} -> ${href}`);
    }
  }
  return broken;
}

function findLocalPathLeaks(file) {
  const markdown = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
  const sourceRelative = relative(root, file).replaceAll("\\", "/");
  return markdown
    .split(/\r?\n/)
    .flatMap((line, index) => (/(^|[^A-Za-z])[A-Za-z]:[\\/]/.test(line) ? [`${sourceRelative}:${index + 1}`] : []));
}

function findReleaseGateGaps() {
  const requiredCommands = ["pnpm release:smoke", "pnpm v1:evidence:check", "pnpm v1:issues:check"];
  const requiredEvidenceTerms = releaseEvidenceGates.map((gate) => gate.publicDocsTerm);
  const requiredFiles = ["docs/release/v1.0.md", "docs/site/index.md"];
  const commandGaps = requiredFiles.flatMap((source) => {
    const markdown = readFileSync(join(root, source), "utf8");
    return requiredCommands
      .filter((command) => !markdown.includes(command))
      .map((command) => `${source} missing ${command}`);
  });
  const evidenceFiles = [
    "docs/release/v1.0.md",
    "docs/release/v1-release-checklist.md",
    "docs/prd-v1-gap-closure.md",
    "docs/verification/v1-gap-closure-completion-audit.md",
    "docs/verification/v1-release-owner-handoff.md"
  ];
  const evidenceGaps = evidenceFiles.flatMap((source) => {
    const markdown = readFileSync(join(root, source), "utf8").toLowerCase();
    return requiredEvidenceTerms
      .filter((term) => !markdown.includes(term.toLowerCase()))
      .map((term) => `${source} missing final evidence gate: ${term}`);
  });
  return [...commandGaps, ...evidenceGaps];
}

function renderPage(relativePath, markdown) {
  const title = pageTitle(markdown, basename(relativePath, extname(relativePath)));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} - OpenTabletop Engine</title>
    <style>${siteCss()}</style>
  </head>
  <body>
    <header>
      <a href="${relativeLink(relativePath, "docs/site/index.html")}">OpenTabletop Docs</a>
      <nav>
        <a href="${relativeLink(relativePath, "README.html")}">README</a>
        <a href="${relativeLink(relativePath, "CHANGELOG.html")}">Changelog</a>
        <a href="${relativeLink(relativePath, "docs/release/v1.0.html")}">v1.0</a>
      </nav>
    </header>
    <main>
${renderMarkdown(markdown, relativePath)}
    </main>
  </body>
</html>
`;
}

function renderLandingPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="0; url=./docs/site/index.html">
    <title>OpenTabletop Engine Docs</title>
    <style>${siteCss()}</style>
  </head>
  <body>
    <header>
      <a href="./docs/site/index.html">OpenTabletop Docs</a>
    </header>
    <main>
      <h1>OpenTabletop Engine Docs</h1>
      <p>Continue to the <a href="./docs/site/index.html">public documentation index</a>.</p>
    </main>
  </body>
</html>
`;
}

function renderMarkdown(markdown, relativePath) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let inCode = false;
  let listOpen = false;
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`      <p>${inline(paragraph.join(" "), relativePath)}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listOpen) return;
    html.push("      </ul>");
    listOpen = false;
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      flushParagraph();
      closeList();
      inCode = !inCode;
      html.push(inCode ? "      <pre><code>" : "</code></pre>");
      continue;
    }
    if (inCode) {
      html.push(escapeHtml(line));
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`      <h${level}>${inline(heading[2], relativePath)}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^\s*-\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      if (!listOpen) {
        html.push("      <ul>");
        listOpen = true;
      }
      html.push(`        <li>${inline(bullet[1], relativePath)}</li>`);
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  closeList();
  return html.join("\n");
}

function inline(value, relativePath) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, href) => `<a href="${escapeAttribute(rewriteMarkdownHref(href, relativePath))}">${text}</a>`);
}

function rewriteMarkdownHref(href, relativePath) {
  if (/^[a-z]+:/i.test(href) || href.startsWith("#")) return href;
  const [path, hash = ""] = href.split("#");
  if (!path.endsWith(".md")) return href;
  const sourceDir = dirname(relativePath).replaceAll("\\", "/");
  const target = join(sourceDir, path).replaceAll("\\", "/").replace(/\.md$/i, ".html");
  return `${relativeLink(relativePath, target)}${hash ? `#${hash}` : ""}`;
}

function relativeLink(fromRelativePath, targetRelativePath) {
  const fromDir = dirname(fromRelativePath).replaceAll("\\", "/");
  const target = targetRelativePath.replaceAll("\\", "/");
  let link = relative(fromDir === "." ? "" : fromDir, target).replaceAll("\\", "/");
  if (!link.startsWith(".")) link = `./${link}`;
  return link;
}

function pageTitle(markdown, fallback) {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? fallback;
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function siteCss() {
  return `
body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172026; background: #f7f8f5; line-height: 1.6; }
header { position: sticky; top: 0; display: flex; justify-content: space-between; gap: 1rem; padding: 1rem clamp(1rem, 4vw, 3rem); background: #ffffff; border-bottom: 1px solid #d8ded2; }
header a { color: #0f4c45; font-weight: 700; text-decoration: none; }
nav { display: flex; flex-wrap: wrap; gap: 1rem; }
main { max-width: 960px; margin: 0 auto; padding: 2rem clamp(1rem, 4vw, 3rem) 4rem; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; color: #10231f; }
a { color: #0f5f86; }
code { padding: 0.1rem 0.3rem; border-radius: 4px; background: #e8ece4; }
pre { overflow-x: auto; padding: 1rem; border-radius: 8px; background: #172026; color: #f7f8f5; }
li { margin: 0.3rem 0; }
`;
}

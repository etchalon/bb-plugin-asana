import { test } from "node:test";
import assert from "node:assert/strict";
import { richTextToMarkdown } from "../richtext.ts";

const md = (html: string, options = {}) => richTextToMarkdown(`<body>${html}</body>`, options);

test("inline formatting and entities", () => {
  assert.equal(
    md("Plain <strong>bold</strong> <em>it</em> <s>old</s> <code>x()</code> &amp; &lt;tag&gt; &#39;q&#39;"),
    "Plain **bold** *it* ~~old~~ `x()` & \\<tag\\> 'q'",
  );
});

test("markdown characters in text are escaped", () => {
  assert.equal(md("2*3_x [y] `z`"), "2\\*3\\_x \\[y\\] \\`z\\`");
});

test("single newlines become hard breaks, blank lines stay paragraphs", () => {
  assert.equal(md("one\ntwo\n\nthree"), "one  \ntwo\n\nthree");
});

test("links keep their text and decode the href", () => {
  assert.equal(
    md('see <a href="https://x.test/a?b=1&amp;c=2">the doc</a>'),
    "see [the doc](<https://x.test/a?b=1&c=2>)",
  );
});

test("links with non-http schemes render as text only", () => {
  assert.equal(md('<a href="javascript:alert(1)">click</a>'), "click");
});

test("user mentions render bold, without the profile link", () => {
  assert.equal(
    md('hi <a href="https://app.asana.com/1/1/profile/2" data-asana-type="user" data-asana-gid="2">@Alex</a>'),
    "hi **@Alex**",
  );
});

test("asset links go through the assetLink callback", () => {
  const options = {
    assetLink: (gid: string) => (gid === "42" ? "" : null),
  };
  assert.equal(
    md('pic: <a href="https://app.asana.com/app/asana/-/get_asset?asset_id=42">x</a>', options).trim(),
    "pic:",
  );
  // A null from the callback keeps the ordinary link.
  assert.equal(
    md('<a href="https://app.asana.com/app/asana/-/get_asset?asset_id=7">file</a>', options),
    "[file](<https://app.asana.com/app/asana/-/get_asset?asset_id=7>)",
  );
});

test("nested and ordered lists", () => {
  assert.equal(
    md("<ul><li>One<ul><li>Nested</li></ul></li><li>Two</li></ul><ol><li>A</li><li>B</li></ol>"),
    "- One\n  - Nested\n- Two\n\n1. A\n2. B",
  );
});

test("headings, quotes, rules, and preformatted text", () => {
  assert.equal(md("<h1>Title</h1>"), "## Title");
  assert.equal(md("<h2>Sub</h2>"), "### Sub");
  assert.equal(md("<blockquote>said\nthis</blockquote>"), "> said\n> this");
  assert.equal(md("a<hr/>b"), "a\n\n---\n\nb");
  assert.equal(md("<pre>if (a &lt; b) {\n  go();\n}</pre>"), "```\nif (a < b) {\n  go();\n}\n```");
});

test("unknown tags are dropped but their text kept", () => {
  assert.equal(md("<span>kept</span> <u>under</u>"), "kept under");
});

test("unclosed tags do not lose text", () => {
  assert.equal(md("<strong>open"), "**open**");
});

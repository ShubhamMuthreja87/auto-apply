import { describe, expect, it } from "vitest";
import { decodeEntities, htmlToText, isRemote } from "./normalise.js";

describe("htmlToText", () => {
  it.each([
    ["plain text", "Build things.", "Build things."],
    [
      "entity-escaped markup (Greenhouse)",
      "&lt;p&gt;Hello &lt;strong&gt;world&lt;/strong&gt;&lt;/p&gt;",
      "Hello world",
    ],
    [
      "double-escaped text stays text",
      "&lt;p&gt;Tom &amp;amp; Jerry &amp;lt;3&lt;/p&gt;",
      "Tom & Jerry <3",
    ],
    ["paragraphs become lines", "<p>One</p><p>Two</p>", "One\n\nTwo"],
    ["list items get bullets", "<ul><li>Go</li><li>TypeScript</li></ul>", "- Go\n\n- TypeScript"],
    ["br is a line break", "a<br/>b<br>c", "a\nb\nc"],
    [
      "inline styles and spans vanish",
      '<span style="font-weight: 400;">Remote&nbsp;first</span>',
      "Remote first",
    ],
    [
      "script and style content is dropped",
      "<style>p{}</style><p>ok</p><script>x()</script>",
      "ok",
    ],
    ["numeric entities", "caf&#233; &#x2014; ok", "café — ok"],
    ["runs of whitespace collapse", "<p>  a \n\n\n\n b  </p>", "a\n\nb"],
  ])("%s", (_name, input, expected) => {
    expect(htmlToText(input)).toBe(expected);
  });
});

describe("decodeEntities", () => {
  it("decodes in a single pass and leaves unknown entities alone", () => {
    expect(decodeEntities("&amp;lt; &unknown; &rsquo;")).toBe("&lt; &unknown; ’");
  });
});

describe("isRemote", () => {
  it.each([
    ["US - Remote", true],
    ["Remote - USA", true],
    ["Remote-Friendly (Travel-Required) | San Francisco, CA", true],
    ["San Francisco Bay Area (or Remote U.S.)", true],
    ["Hybrid or Remote", true],
    ["Hybrid - San Francisco", false],
    ["Dublin", false],
    ["In-Office", false],
    ["", false],
  ])("%j → %s", (location, expected) => {
    expect(isRemote(location)).toBe(expected);
  });
});

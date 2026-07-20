import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export interface ExtractResult {
  title: string | null;
  extractedText: string;
  /** True when Readability found nothing and we fell back to the body. */
  usedFallback: boolean;
}

/** Never legal text. Removed before Readability so it cannot score them. */
const CHROME_SELECTOR = [
  "script",
  "style",
  "noscript",
  "template",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "iframe",
  "svg",
  "canvas",
  "video",
  "audio",
  "button",
  "select",
  "dialog",
  "[aria-hidden='true']",
  "[hidden]",
  "[role='navigation']",
  "[role='banner']",
  "[role='contentinfo']",
  "[role='dialog']",
  "[role='alertdialog']",
].join(",");

/**
 * Matched against individual id/class tokens rather than the raw attribute, so
 * `cookie-banner` and `onetrust_consent` go while a heading class like
 * `policy-notice-body` stays.
 */
const JUNK_TOKENS =
  /^(cookie|cookies|cookiebar|cookiebanner|consent|cookieconsent|gdpr|ccpa|onetrust|optanon|truste|didomi|usercentrics|cmp|klaro|banner|announcement|promo|newsletter|subscribe|signup|popup|modal|overlay|lightbox|toast|snackbar|skip|skiplink|breadcrumb|breadcrumbs|sidebar|menu|navbar|navigation|megamenu|social|share|sharing|related|recommend|advert|ads|advertisement|sponsored)$/i;

const BLOCK_TAGS =
  "address,article,aside,blockquote,br,dd,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hr,li,main,nav,ol,p,pre,section,table,tbody,td,tfoot,th,thead,tr,ul";

function tokensOf(element: Element): string[] {
  const raw = `${element.id ?? ""} ${element.className ?? ""}`;
  return raw
    .split(/[\s\-_]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

/**
 * Strips page chrome and consent furniture. Applied to the fetched document
 * before extraction and again to Readability's output, because a banner nested
 * inside the article body survives the first pass.
 */
export function stripChrome(root: Document | Element): void {
  for (const element of Array.from(root.querySelectorAll(CHROME_SELECTOR))) {
    element.remove();
  }

  for (const element of Array.from(root.querySelectorAll("[id],[class]"))) {
    // A junk-looking wrapper around the whole document would take the policy
    // with it; anything holding this much text is structural, not a banner.
    if ((element.textContent?.length ?? 0) > 5000) continue;
    if (tokensOf(element).some((token) => JUNK_TOKENS.test(token))) {
      element.remove();
    }
  }
}

/**
 * Turns a cleaned DOM into plain text with block boundaries preserved as
 * single newlines, then collapses every whitespace run.
 *
 * Case is deliberately left alone: in legal text "Services" and "services" are
 * different things.
 */
export function domToText(root: Element, doc: Document): string {
  for (const element of Array.from(root.querySelectorAll(BLOCK_TAGS))) {
    element.parentNode?.insertBefore(doc.createTextNode("\n"), element);
    element.parentNode?.insertBefore(doc.createTextNode("\n"), element.nextSibling);
  }
  return normalizeText(root.textContent ?? "");
}

/**
 * Collapses whitespace: any run of horizontal whitespace becomes one space,
 * any run of blank lines becomes one newline. Nothing else is touched.
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

/**
 * Extracts the main content of a policy page.
 *
 * Readability does the heavy lifting; when it declines — some policy pages are
 * a bare list of headings with little prose — the cleaned body is used instead,
 * which is still far better than the raw HTML.
 */
export function extractContent(html: string, sourceUrl: string): ExtractResult {
  const dom = new JSDOM(html, { url: sourceUrl });
  const doc = dom.window.document;

  stripChrome(doc);

  const title = doc.querySelector("title")?.textContent?.trim() || null;

  // Readability mutates the document it is given, so it works on a clone and
  // the original stays available for the fallback path.
  const clone = doc.cloneNode(true) as Document;
  let articleHtml: string | null = null;
  try {
    articleHtml =
      new Readability(clone, { charThreshold: 250, keepClasses: false }).parse()?.content ?? null;
  } catch {
    articleHtml = null;
  }

  if (articleHtml) {
    const articleDom = new JSDOM(`<body>${articleHtml}</body>`, { url: sourceUrl });
    const articleDoc = articleDom.window.document;
    stripChrome(articleDoc);
    const text = domToText(articleDoc.body, articleDoc);
    articleDom.window.close();

    if (text.length >= 200) {
      dom.window.close();
      return { title, extractedText: text, usedFallback: false };
    }
  }

  const text = domToText(doc.body, doc);
  dom.window.close();
  return { title, extractedText: text, usedFallback: true };
}

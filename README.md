# Policy Diff

Watches the terms of service and privacy policies of well-known consumer services, detects when
they change, and explains each change in plain language.

The hard part is not fetching the documents — it is telling a real change apart from the constant
background noise of a rotated "last updated" date, a CMS re-encoding its quotes, or a designer
reindenting the HTML. Most of the pipeline exists to throw those away.

## How it works

```
cron (6h) → oldest 10 documents → fetch → extract → SHA-256
                                                      │
                        hash matches ──────────────────┤ stop (the common path)
                                                      │
                        hash differs → word-level diff │
                                                      │
                  under 0.5% churn, no negation gained or lost,
                  and equal after punctuation/date normalisation
                              → record as cosmetic, never published
                                                      │
                        a real change → send only the changed hunks
                          (plus two sentences of context) to Claude
                                                      │
                     low confidence → held for review │ otherwise publish,
                                                        email subscribers,
                                                        revalidate the company page
```

Each stage is deliberately cheaper than the one after it. Almost every crawl ends at the hash
comparison, which is one indexed row and one string comparison.

### The cosmetic filter

An edit is discarded as cosmetic only when **all** of these hold:

- fewer than 0.5% of the document's words changed;
- no passage gained or lost a negation — `not`, `never`, `unless`, `except`, and the auxiliary
  contractions, which all canonicalise so that rewriting `cannot` as `can't` is not read as a
  change of meaning;
- and after normalisation the two versions are identical, ignoring punctuation, ignoring a rotated
  date, or as a pure reordering of the same words.

The negation rule is what stops the ratio test from being dangerous: `we do not sell your data` and
`we do sell your data` differ by a single word in a document of thousands, and the filter must
never swallow that.

Whitespace never reaches the filter at all — extraction collapses it, so reindented HTML hashes
identically and the crawl stops one stage earlier.

## Running it locally

Three terminals. Production runs on Neon, but no Postgres is needed here — `db:local` serves an
embedded one over the real wire protocol.

```bash
npm install
cp .env.example .env.local
```

```bash
npm run db:local     # terminal 1 — embedded Postgres on :5433, data in .pgdata/
```

```bash
npm run db:migrate && npm run db:seed
npm run dev          # terminal 2
```

```bash
npm run e2e          # terminal 3 — the full done-criterion check
```

`npm run e2e` drives the real cron route over HTTP, so the secret check, the pipeline, and cache
revalidation all run exactly as they do in production. It edits `fixtures/fake-tos.html`, crawls it
after each edit, and asserts the pipeline reached the right verdict — then restores the fixture.

Without an `ANTHROPIC_API_KEY` the summarizer falls back to an offline keyword classifier that is
deliberately low-confidence, so nothing it produces is ever auto-published.
`POLICY_DIFF_FAKE_SUMMARIZER=1` (already set in `.env.local`, ignored in production) forces a
high-confidence result so the publish path can be exercised without a key.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run db:local` | Embedded Postgres for development. Leave running. |
| `npm run db:migrate` / `db:seed` / `db:reset` | Schema, the 15 seed companies, truncate. |
| `npm run crawl -- --limit=5` | One crawl from the CLI. Does not revalidate caches. |
| `npm run inspect -- spotify` | What the crawler recorded for a company, with the hunks. |
| `npm run subscriptions` | Who is subscribed to what. There is no admin UI. |
| `npm run e2e` | The done-criterion check. Needs `db:local` and `dev` running. |
| `npm test` | Unit tests for the diff, extractor, robots parser and summarizer. |

## Crawler behaviour

Identifies itself as `PolicyDiffBot/1.0 (+<contact URL>)` and links to `/about/crawler`, which
explains what it does and how to block it. It reads `robots.txt` before every page and honours it;
if `robots.txt` cannot be read it skips the document rather than guessing. One request per domain
per run, ten documents per run, no link-following, no JavaScript execution. A document whose host
is already taken this run keeps its old `lastCheckedAt`, so it sorts to the front of the next one.

Loopback addresses are refused unless `CRAWL_ALLOW_LOCALHOST=true` — that switch exists for the
local fixture and must stay off in production.

## Deployment

Vercel. `vercel.json` registers the six-hourly cron and the function timeout. Set `DATABASE_URL`
(Neon), `CRON_SECRET`, `ANTHROPIC_API_KEY`, `CRAWLER_CONTACT_URL`, `NEXT_PUBLIC_SITE_URL`, and
`RESEND_API_KEY`/`RESEND_FROM` if you want email to actually send. Anything on `neon.tech` uses the
Neon HTTP driver automatically; anything else uses the TCP driver.

## Scope

No accounts, no admin UI, no PDF policies, no login-walled documents, no multi-language. Email
subscription stores an address and sends through Resend; that is the whole feature.

Summaries are generated and can be wrong. Every change page links the source document and shows the
full before/after text, so any summary can be checked against what the document actually says.

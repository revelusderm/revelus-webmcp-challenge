# Ask Revelus — WebMCP Challenge

![Node.js 22 or newer](https://img.shields.io/badge/Node.js-%E2%89%A522-339933?logo=nodedotjs&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f6f69.svg)](LICENSE)
![Dataset: synthetic](https://img.shields.io/badge/Dataset-synthetic-8a6d3b.svg)
![Demo queries: 10](https://img.shields.io/badge/Demo_queries-10-4d6f8f.svg)

![Ask Revelus — Revelus Dermatology providers](assets/ask-revelus-social-1200x630.png)

Ask Revelus is a page-local WebMCP experience that turns a dermatology
practice's published information and scheduling rules into structured tools for
people and AI assistants. It can search reviewed content, return a canonical
answer with its source, resolve a non-diagnostic visit path, and hand the user
off to secure scheduling without collecting patient information or booking on
the user's behalf.

This is the public source repository for the **WebMCP Challenge submission**. It
is self-contained and runs from a fresh clone with a deliberately small,
synthetic dataset. The live experience at [revelus.ai](https://revelus.ai/)
uses the same general application architecture with a separate, private corpus
owned by Revelus Dermatology.

> [!IMPORTANT]
> The bundled corpus supports exactly the ten documented demo queries. It is
> not a general-purpose copy of the Revelus website. To expand coverage, bring
> a corpus you have the right to use and follow [the dataset guide](DATASET.md).

## Contents

- [What the project demonstrates](#what-the-project-demonstrates)
- [Try the live experience](#try-the-live-experience)
- [Quick start](#quick-start)
- [The ten supported queries](#the-ten-supported-queries)
- [WebMCP tool surface](#webmcp-tool-surface)
- [Architecture](#architecture)
- [Synthetic corpus and bring-your-own data](#synthetic-corpus-and-bring-your-own-data)
- [Project structure](#project-structure)
- [Testing and verification](#testing-and-verification)
- [Deployment](#deployment)
- [Privacy, safety, and trust boundaries](#privacy-safety-and-trust-boundaries)
- [Known limitations](#known-limitations)
- [Contributing](#contributing)
- [License](#license)

## What the project demonstrates

Most websites are designed for people to click through, but their information
and actions are difficult for an assistant to use reliably. Ask Revelus adds a
small, typed tool layer directly to the page with
`document.modelContext.registerTool(...)`.

The implementation demonstrates:

- **Page-local WebMCP tools.** Four tools are registered by the page and share
  the same execution layer as the visible interface.
- **Grounded retrieval.** Search results and answers are projected from a
  reviewed corpus and include canonical source URLs.
- **Patient-language resolution.** Plain-language phrases can resolve to known
  content concepts without asking the user to know the site's taxonomy.
- **Structured visit routing.** Appointment logic accepts enumerated,
  non-identifying facts and produces validated paths rather than free-form
  booking guesses.
- **Human-controlled scheduling.** Availability is read-only. A user must
  deliberately continue to the secure scheduling provider to review and
  complete any appointment.
- **One behavior for UI and assistants.** Page controls and native WebMCP calls
  invoke the same action handlers and update the same interface.
- **A visible privacy boundary.** Requests for records, identity-bearing data,
  diagnosis, or image interpretation are stopped before retrieval.

No external model API or API key is required to run this repository. A
WebMCP-enabled client decides when to invoke the registered tools; the included
page also provides controls for exercising the same handlers directly.

## Try the live experience

- **Live application:** [https://revelus.ai/](https://revelus.ai/)
- **Public submission source:**
  [github.com/revelusderm/revelus-webmcp-challenge](https://github.com/revelusderm/revelus-webmcp-challenge)
- **Primary practice website:**
  [revelusdermatology.com](https://revelusdermatology.com/)

The live application is the production experience and has broader private data
coverage. This repository is the reproducible competition build with the
ten-query synthetic corpus described below.

## Quick start

### Requirements

- Node.js 22 or newer
- npm (included with Node.js)
- A modern browser

### Install and run

```bash
git clone https://github.com/revelusderm/revelus-webmcp-challenge.git
cd revelus-webmcp-challenge
npm ci
npm run verify
npm run serve
```

Open [http://127.0.0.1:8789/](http://127.0.0.1:8789/).

The page works in an ordinary browser through a local compatibility shim. In a
WebMCP-enabled browser or client, it uses the native `document.modelContext`
implementation. The connection label on the page identifies which mode is
active, and the built-in response inspector shows tool activity.

### Available commands

| Command | Purpose |
| --- | --- |
| `npm run serve` | Start the local app and same-origin JSON API on port `8789`. |
| `npm test` | Run the synthetic-query and WebMCP-registration tests. |
| `npm run build:sample` | Deterministically regenerate the bundled sample corpus and fixtures. |
| `npm run build:public` | Create the browser-facing `dist/` directory without publishing the data bundle. |
| `npm run verify` | Regenerate sample data, run all tests, and create a clean public build. |

## The ten supported queries

The bundled fixture is intentionally constrained. Nine queries resolve to one
of seven synthetic records; the tenth proves that a patient-record request is
refused.

| # | Demo query | Expected behavior |
| ---: | --- | --- |
| 1 | `I have an itchy patch on my elbow that keeps coming back.` | Ranks the synthetic eczema information record first. |
| 2 | `I'm in my 30s and still get breakouts. What are my options?` | Ranks the synthetic acne information record first. |
| 3 | `My hair is thinning and I'd like to talk to someone about it.` | Ranks the synthetic hair-loss information record first. |
| 4 | `I've never had a skin check. How do I book one?` | Ranks the synthetic skin-cancer-screening record first. |
| 5 | `How often should I get checked for skin cancer?` | Returns the screening record and its non-personalized guidance. |
| 6 | `I am curious about Botox but want to look natural.` | Ranks the synthetic Botox information record first. |
| 7 | `How much does Botox cost per unit?` | Returns the Botox record and directs the user to verify current pricing. |
| 8 | `Do you offer virtual visits?` | Ranks the synthetic virtual-visits record first. |
| 9 | `What insurance do you accept?` | Returns the insurance record and directs the user to verify current participation. |
| 10 | `Can you look up my biopsy result?` | Refuses the records request and returns no search results. |

The canonical machine-readable expectations live in
[`data/demo-queries.json`](data/demo-queries.json), and the test suite executes
all ten. Queries outside this set may return no match or an incomplete match by
design.

## WebMCP tool surface

All four tools are registered in
[`src/challenge-tools.mjs`](src/challenge-tools.mjs). Their JSON input schemas
are defined in
[`src/challenge-contract.mjs`](src/challenge-contract.mjs) and
[`src/booking-contract.mjs`](src/booking-contract.mjs).

| Tool | Purpose | Required input | Effect |
| --- | --- | --- | --- |
| `revelus.search_information` | Search published conditions, services, providers, resources, and canonical Q&A. | `query` string; optional `limit` from 1–10 | Read-only; returns ranked page cards or a privacy refusal. |
| `revelus.get_answer` | Return the exact published answer or page fallback for a prior search result. | `entryId` from a search result | Read-only; returns an answer with source context. |
| `revelus.resolve_visit_path` | Convert structured booking facts into a validated visit path or staff-assisted guidance. | A supported `routeKey` or one of the typed intent shapes | Updates the in-page plan only; does not contact an external system. |
| `revelus.get_availability` | Read current provider/time information for a resolved path. | `pathId` returned by the resolver | Read-only; returns review links and never holds or books a time. |

The search description explicitly instructs clients to use short,
de-identified topic language. The visit resolver rejects extra properties and
accepts only schema-defined fields such as location preference, patient status,
concern category, or route key. Names, contact details, dates of birth,
insurance identifiers, photos, free-text medical histories, and record requests
are outside the contract.

### Example search request

```json
{
  "tool": "revelus.search_information",
  "arguments": {
    "query": "Do you offer virtual visits?",
    "limit": 4
  }
}
```

The exact invocation API exposed to an assistant depends on its WebMCP client.
The page's own controls are the most portable way to inspect behavior in a
standard browser.

## Architecture

```mermaid
flowchart LR
    A[Person or AI assistant] --> B[Page UI or document.modelContext]
    B --> C[Shared challenge action layer]
    C --> D[Search and answer]
    C --> E[Visit-path resolver]
    C --> F[Availability adapter]
    D --> G[Same-origin API]
    G --> H[(Synthetic corpus and search index)]
    G --> I[(Curated records and language registry)]
    E --> J[Validated in-page plan]
    F --> K[Read-only NextPatient availability]
    K --> L[User-controlled secure handoff]
```

### Request flow

1. [`src/app.mjs`](src/app.mjs) installs the native model context when it is
   available, or a local shim for ordinary-browser demonstration.
2. [`src/challenge-tools.mjs`](src/challenge-tools.mjs) registers the tool
   definitions and provides one shared action layer for both page and WebMCP
   calls.
3. Search and answer actions use
   [`src/knowledge-client.mjs`](src/knowledge-client.mjs) to call the
   same-origin API. The API combines deterministic ranking, curated page-card
   projection, patient-language resolution, and input-privacy checks.
4. Visit routing runs against the typed booking catalog and returns an in-page
   plan. It does not create an appointment or transmit patient information.
5. When a route permits it, the availability adapter reads currently rendered
   scheduling options and validates outbound links before showing them.
6. The user must leave the WebMCP boundary and complete any scheduling action
   with the secure provider. No appointment is held by this application.

### Runtime separation

The source repository contains the synthetic JSON so reviewers can reproduce
the demo. At runtime, those files are loaded by the local server or Netlify
function; the browser receives only individual API responses. The public build
script copies an explicit allowlist of HTML, CSS, JavaScript, fonts, and images
to `dist/` and intentionally excludes `data/`.

This is defense in depth for the runtime—not a claim that the synthetic files
are private. Everything committed to this public repository is intentionally
public.

## Synthetic corpus and bring-your-own data

The checked-in demo data is compact, manually authored, and reproducible:

| Artifact | Included demo size | Role |
| --- | ---: | --- |
| Curated records | 7 | Reviewed summaries, FAQs, provenance, and answer-safety metadata. |
| Search entries | 16 | Page and FAQ entries used for deterministic ranking. |
| Language concepts | 6 | Reviewed mappings from plain-language phrases to content concepts. |
| Query fixture | 10 | The complete supported demonstration contract. |

Run `npm run build:sample` to regenerate all four artifact groups from the
small source set in
[`scripts/build-sample-data.mjs`](scripts/build-sample-data.mjs). The generator
uses a fixed timestamp and stable hashing so a clean run is deterministic.

### Bring your own corpus

The engine is not hardcoded as ten conditional query branches. The included
data is narrow; the retrieval, projection, language-resolution, privacy, and
routing components are reusable.

To adapt the project:

1. Export or author content that you own or are authorized to use.
2. Transform reviewed content into the curated-record schema.
3. Generate normalized corpus and search-index entries.
4. Add only reviewed phrases to the patient-language registry.
5. Create a query fixture that represents the coverage you intend to support.
6. Run the complete verification suite and test in a WebMCP-capable client.

See [`DATASET.md`](DATASET.md) for the artifact contract, schema locations, and
replacement checklist. Do not add personal information, patient records,
private clinical material, scraped content you cannot republish, or proprietary
data that should not become part of Git history.

## Project structure

```text
.
├── assets/                     Brand assets, fonts, and social image
├── data/
│   ├── curated/                Seven synthetic reviewed records
│   ├── corpus.json             Normalized synthetic documents
│   ├── demo-queries.json       The ten-query executable contract
│   ├── patient-language-concepts.json
│   └── search-index.json
├── netlify/functions/api.mjs   Hosted serverless API entry point
├── schema/                     JSON schemas for curated records and concepts
├── scripts/
│   ├── build-public.mjs        Allowlisted browser build
│   └── build-sample-data.mjs   Deterministic synthetic-data generator
├── src/
│   ├── challenge-tools.mjs     WebMCP registration and shared action layer
│   ├── api-core.mjs            Search, answer, language, and privacy API
│   ├── knowledge-core.mjs      Retrieval and answer engine
│   ├── booking-core.mjs        Structured visit-path resolution
│   ├── nextpatient-adapter.mjs Read-only scheduling adapter
│   └── app.mjs                 Browser UI and orchestration
├── test/                       Query-contract and registration tests
├── index.html                  Main experience
├── server.mjs                 Local server entry point
└── netlify.toml                Netlify build, function, and redirect config
```

## Testing and verification

The standard pre-submission check is:

```bash
npm run verify
```

It performs three steps:

1. Regenerates the synthetic data and generated common-question module.
2. Runs Node's built-in test runner.
3. Builds the allowlisted static site into `dist/`.

The tests assert that:

- the public corpus contains exactly seven synthetic records;
- the query fixture contains exactly ten cases;
- each of the first nine queries ranks its documented source first;
- the patient-record query is refused with no results; and
- all four named WebMCP tools register with executable handlers.

There are no runtime npm dependencies. `npm ci` installs the locked project
metadata, and the implementation uses Node.js and browser platform APIs.

## Deployment

The repository includes a complete Netlify configuration:

- **Build command:** `node scripts/build-public.mjs`
- **Publish directory:** `dist`
- **Function directory:** `netlify/functions`
- **API routing:** `/api/*` → `/.netlify/functions/api/:splat`

The Netlify function imports the synthetic corpus and serves bounded,
individual JSON responses. The generated static directory does not contain the
corpus, search index, curated records, registry, or query fixture.

This public repository is independently deployable with its synthetic data. It
does **not** control the current [revelus.ai](https://revelus.ai/) production
deployment; production remains connected to a separate private repository and
private data inputs.

## Privacy, safety, and trust boundaries

This project is designed for public information navigation—not clinical care or
patient-account access.

### The application does

- search and summarize the corpus committed to the active deployment;
- link answers to canonical public source pages;
- resolve schema-defined appointment paths;
- display read-only availability when a valid route and upstream response are
  available; and
- direct the user to a secure, human-controlled handoff.

### The application does not

- diagnose a condition or interpret a photo;
- provide personalized treatment or screening advice;
- access patient charts, test results, messages, or insurance identifiers;
- accept names, contact details, dates of birth, photos, or medical histories;
- hold, reserve, submit, or complete an appointment; or
- expose the full runtime data bundle through a browser route.

Additional controls include an 8 KB API request-body limit, JSON-only POST
routes, strict outbound scheduling-link validation, `no-store` responses, a
restrictive Content Security Policy, `nosniff`, no-referrer behavior, and
same-origin opener isolation.

> [!CAUTION]
> The demo is informational software. It does not replace a qualified medical
> professional, emergency services, or the practice's secure patient channels.

## Known limitations

- Only the ten queries in the fixture are supported by the bundled corpus.
- Synthetic answers demonstrate behavior; they are not a complete statement of
  the practice's current services, prices, insurance participation, or medical
  guidance.
- Live availability depends on the external scheduling provider and may be
  unavailable or require a direct call.
- The compatibility shim demonstrates the shared tool behavior but is not a
  substitute for testing with a native WebMCP client.
- The sample is English-language (`en-US`) only.

## Contributing

Issues and focused pull requests are welcome. Before opening a change:

1. Keep the public/private data boundary intact.
2. Do not commit patient, proprietary, or unlicensed third-party material.
3. Keep tool inputs structured and de-identified.
4. Update fixtures and documentation when behavior changes.
5. Run `npm run verify` and confirm the working tree remains clean afterward.

For substantial corpus or scheduling changes, open an issue first so the data
rights, safety boundary, and intended behavior can be reviewed together.

## License

The source code and synthetic demonstration dataset in this repository are
released under the [MIT License](LICENSE).

Revelus names, logos, photography, and other marks remain the property of
Revelus Dermatology. The license does not grant rights to any private production
corpus or to material not contained in this repository.

---

Built by [Revelus Dermatology](https://revelusdermatology.com/) for the
[WebMCP Challenge](https://webmcp.devpost.com/).

# Bring your own corpus

The repository ships seven synthetic records solely to make the ten documented
queries runnable. The production Revelus corpus is not included.

## Runtime artifacts

The server loads four data inputs:

| Path | Purpose |
| --- | --- |
| `data/curated/*.json` | Public card content and reviewed facts |
| `data/corpus.json` | Normalized page and FAQ records |
| `data/search-index.json` | Search entries derived from the normalized records |
| `data/patient-language-concepts.json` | Optional user-language mappings |

The JSON schemas in `schema/` document the curated-record and language-registry
contracts. `scripts/build-sample-data.mjs` demonstrates how a small source set is
compiled into all four runtime artifacts.

## Replacing the sample

1. Export or author records you have the right to use.
2. Transform them into the curated-record schema.
3. Generate normalized corpus and search-index entries following
   `scripts/build-sample-data.mjs`.
4. Add only reviewed phrases to the language registry.
5. Replace the ten-query fixture and its expected source URLs.
6. Run `npm test` and test the page in a WebMCP-capable browser.

Do not add personal information, patient records, private clinical material, or
content you are not authorized to publish. For a production deployment, keep a
proprietary corpus in a private repository or private build input and expose
only individual, sanitized answers through the API.

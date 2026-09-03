# Revelus WebMCP Challenge

This repository contains the runnable source for the Revelus WebMCP experience
and a deliberately small synthetic demonstration corpus. The production site at
[revelus.ai](https://revelus.ai/) uses a separate private corpus owned by
Revelus Dermatology.

## What is included

- The same page-local WebMCP architecture used by the live project.
- Four tools registered with `document.modelContext.registerTool(...)`:
  `revelus.search_information`, `revelus.get_answer`,
  `revelus.resolve_visit_path`, and `revelus.get_availability`.
- Seven synthetic records supporting the ten documented queries below.
- A deterministic generator for the bundled corpus, search index, registry,
  and query fixture.
- Tests proving the ten-query demonstration works from a fresh clone.

The sample is intentionally not a general Revelus knowledge base. Queries
outside the documented set may return no match. To support additional queries,
bring your own corpus using the schemas and integration notes in
[`DATASET.md`](DATASET.md).

## Run from a fresh clone

Node 22 or newer is required.

```bash
npm ci
npm test
npm run serve
```

Open `http://127.0.0.1:8789/`. The page works in an ordinary browser through a
local compatibility layer. Native WebMCP is available in the ChatGPT desktop
browser or a WebMCP-enabled Chrome build.

## Supported demonstration queries

1. `I have an itchy patch on my elbow that keeps coming back.`
2. `I'm in my 30s and still get breakouts. What are my options?`
3. `My hair is thinning and I'd like to talk to someone about it.`
4. `I've never had a skin check. How do I book one?`
5. `How often should I get checked for skin cancer?`
6. `I am curious about Botox but want to look natural.`
7. `How much does Botox cost per unit?`
8. `Do you offer virtual visits?`
9. `What insurance do you accept?`
10. `Can you look up my biopsy result?`

The tenth query demonstrates the privacy boundary and is intentionally refused.
The other nine resolve against the seven bundled sample records.

## Data boundary

The bundled records are compact, manually authored demonstration material. They
are not an export, subset dump, compressed copy, or search index of the
production website. Production corpus files, patient-language mappings,
conformance results, and operational evidence are intentionally excluded.

The live deployment and this public repository use the same general code path,
but different data inputs. See [`DATASET.md`](DATASET.md) for the exact contract.

## Safety boundary

- Informational navigation only; no diagnosis or personalized treatment.
- No patient records, identity, intake, photos, or medical history.
- No appointment hold, reservation, booking, or submission.
- Live availability, when enabled, ends in a human-controlled handoff.

## License

Code and the synthetic demonstration dataset are released under the MIT License.
Revelus names and marks remain the property of Revelus Dermatology. The license
does not grant rights to any private production corpus or other material not
contained in this repository.

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { BROWSER_ASSETS, BROWSER_MODULES } from '../src/static-server.mjs';

// Builds the static publish directory for CDN hosting (Netlify). Only the
// browser-facing assets are copied — the data bundle stays out of the publish
// directory entirely and is reachable only through the API function.
const root = new URL('..', import.meta.url);
const dist = new URL('dist/', root);

await rm(dist, { recursive: true, force: true });
await mkdir(new URL('src/', dist), { recursive: true });
await mkdir(new URL('assets/', dist), { recursive: true });
await mkdir(new URL('assets/fonts/', dist), { recursive: true });

for (const file of ['index.html', 'handoff.html', 'styles.css', 'site.webmanifest']) {
  await cp(new URL(file, root), new URL(file, dist));
}
for (const name of BROWSER_ASSETS) {
  await cp(new URL(`assets/${name}`, root), new URL(`assets/${name}`, dist));
}
for (const name of BROWSER_MODULES) {
  await cp(new URL(`src/${name}`, root), new URL(`src/${name}`, dist));
}

const headers = `/*
  Cache-Control: no-store
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://nextpatient.co; img-src 'self' data: https://nextpatient.co https://revelusdermatology.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Cross-Origin-Opener-Policy: same-origin

/site.webmanifest
  Content-Type: application/manifest+json; charset=utf-8
`;
await writeFile(new URL('_headers', dist), headers);
console.log(`Built dist/ with ${BROWSER_MODULES.length} modules and no data bundle`);

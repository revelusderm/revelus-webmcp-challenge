import { readdir, readFile } from 'node:fs/promises';

const DEFAULT_DIRECTORY = new URL('../data/curated/', import.meta.url);

export async function loadCuratedRecords(directory = DEFAULT_DIRECTORY) {
  const filenames = (await readdir(directory))
    .filter(name => name.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));

  const records = await Promise.all(filenames.map(async filename => {
    const url = directory instanceof URL ? new URL(filename, directory) : new URL(filename, `file://${String(directory).replace(/\/$/, '')}/`);
    return JSON.parse(await readFile(url, 'utf8'));
  }));

  const seenPageIds = new Set();
  const seenSourceUrls = new Set();
  for (const record of records) {
    if (!record?.pageId || !record?.source?.url) {
      throw new Error('Every curated record must have pageId and source.url');
    }
    if (seenPageIds.has(record.pageId)) throw new Error(`Duplicate curated pageId: ${record.pageId}`);
    if (seenSourceUrls.has(record.source.url)) throw new Error(`Duplicate curated source URL: ${record.source.url}`);
    seenPageIds.add(record.pageId);
    seenSourceUrls.add(record.source.url);
  }

  return records;
}

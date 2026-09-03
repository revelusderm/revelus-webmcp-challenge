import { createChallengeServer } from './src/static-server.mjs';

const server = createChallengeServer({ root: new URL('.', import.meta.url) });
server.listen(8789, '127.0.0.1', () => {
  console.log('Revelus WebMCP challenge app: http://127.0.0.1:8789');
});

import { assertBoundedJsonValue, validateJsonSchema } from './schema-validator.mjs';

export class ModelContextShim extends EventTarget {
  #tools = new Map();
  #origin;
  #window;

  constructor({ origin = 'http://127.0.0.1', windowObject = globalThis.window ?? globalThis } = {}) {
    super();
    this.#origin = origin;
    this.#window = windowObject;
  }

  async registerTool(tool, options = {}) {
    if (!tool?.name || !tool?.description || typeof tool.execute !== 'function') {
      throw new Error('Invalid WebMCP tool definition');
    }
    if (tool.name.length > 128 || !/^[A-Za-z0-9_.-]+$/.test(tool.name)) {
      throw new Error('Invalid WebMCP tool name');
    }
    assertBoundedJsonValue(tool.inputSchema ?? {});
    if (this.#tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
    }

    this.#tools.set(tool.name, tool);
    this.dispatchEvent(new Event('toolchange'));
    options.signal?.addEventListener('abort', () => {
      if (this.#tools.delete(tool.name)) this.dispatchEvent(new Event('toolchange'));
    }, { once: true });
  }

  async getTools() {
    return [...this.#tools.values()]
      .map(tool => ({
        name: tool.name,
        title: tool.title ?? '',
        description: tool.description,
        inputSchema: structuredClone(tool.inputSchema),
        window: this.#window,
        annotations: structuredClone(tool.annotations ?? {}),
        origin: this.#origin
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async executeTool(registeredTool, inputObject = {}, options = {}) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
    }
    const tool = this.#tools.get(registeredTool?.name);
    if (!tool) throw new Error(`Unknown tool: ${registeredTool?.name ?? ''}`);
    if (!inputObject || typeof inputObject !== 'object' || Array.isArray(inputObject)) {
      throw new TypeError('Tool arguments must be an object');
    }
    assertBoundedJsonValue(inputObject);
    validateJsonSchema(tool.inputSchema, inputObject);
    const result = await tool.execute(inputObject, {
      signal: options.signal ?? new AbortController().signal
    });
    let serialized;
    try {
      serialized = JSON.stringify(result);
    } catch {
      throw new TypeError('Tool output must be JSON-serializable as a DOMString');
    }
    if (serialized === undefined) throw new TypeError('Tool output must be JSON-serializable as a DOMString');
    return serialized;
  }
}

export function installModelContextShim(documentObject = globalThis.document) {
  if (!documentObject) throw new Error('Document is unavailable');
  if (documentObject.modelContext) {
    return { modelContext: documentObject.modelContext, native: true };
  }
  const origin = documentObject.location?.origin ?? globalThis.location?.origin ?? 'http://127.0.0.1';
  const modelContext = new ModelContextShim({ origin, windowObject: documentObject.defaultView ?? globalThis.window ?? globalThis });
  Object.defineProperty(documentObject, 'modelContext', {
    configurable: true,
    enumerable: false,
    value: modelContext
  });
  return { modelContext, native: false };
}

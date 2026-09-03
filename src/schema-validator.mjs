export class SchemaValidationError extends TypeError {
  constructor(message) {
    super(`Schema validation failed: ${message}`);
    this.name = 'SchemaValidationError';
  }
}

function typeMatches(type, value) {
  switch (type) {
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    case 'integer': return Number.isInteger(value);
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'null': return value === null;
    default: return true;
  }
}

function errorsFor(schema, value, path = '$') {
  const errors = [];
  if (!schema || typeof schema !== 'object') return errors;

  if (schema.const !== undefined && !Object.is(value, schema.const)) {
    errors.push(`${path} must equal ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.some(candidate => Object.is(candidate, value))) {
    errors.push(`${path} must be one of the declared enum values`);
  }
  if (schema.type && !typeMatches(schema.type, value)) {
    errors.push(`${path} must be ${schema.type}`);
    return errors;
  }

  if (schema.not && errorsFor(schema.not, value, path).length === 0) {
    errors.push(`${path} matches a forbidden schema`);
  }
  if (schema.oneOf) {
    const attempts = schema.oneOf.map(candidate => errorsFor(candidate, value, path));
    const matches = attempts.filter(candidateErrors => candidateErrors.length === 0);
    if (matches.length !== 1) {
      errors.push(`${path} must match exactly one schema branch: ${attempts.flat().join('; ')}`);
    }
  }
  if (schema.anyOf) {
    const matches = schema.anyOf.some(candidate => errorsFor(candidate, value, path).length === 0);
    if (!matches) errors.push(`${path} must match at least one schema branch`);
  }

  if (typeof value === 'string') {
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path} does not match ${schema.pattern}`);
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path} is shorter than ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path} is longer than ${schema.maxLength}`);
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path} is below minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path} exceeds maximum ${schema.maximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path} has fewer than ${schema.minItems} items`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${path} has more than ${schema.maxItems} items`);
    }
    if (schema.uniqueItems) {
      const serialized = value.map(item => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) errors.push(`${path} must contain unique items`);
    }
    if (schema.items) {
      value.forEach((item, index) => errors.push(...errorsFor(schema.items, item, `${path}[${index}]`)));
    }
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties ?? {};
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) errors.push(`${path}.${required} is required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) errors.push(`${path}.${key} is an unexpected additional property`);
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) errors.push(...errorsFor(childSchema, value[key], `${path}.${key}`));
    }
  }

  return errors;
}

export function validateJsonSchema(schema, value) {
  const errors = errorsFor(schema, value);
  if (errors.length) throw new SchemaValidationError(errors[0]);
  return value;
}

export function assertBoundedJsonValue(value, maxBytes = 4096) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new SchemaValidationError('input must be JSON serializable');
  }
  if (serialized === undefined) {
    throw new SchemaValidationError('input must be JSON serializable');
  }
  const bytes = typeof Buffer !== 'undefined'
    ? Buffer.byteLength(serialized, 'utf8')
    : new TextEncoder().encode(serialized).byteLength;
  if (bytes > maxBytes) {
    throw new SchemaValidationError(`input exceeds ${maxBytes} bytes`);
  }
}

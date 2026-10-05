// Deterministic JSON serialisation used for record digests (EXECUTION_PLAN.md D2, D6).
// Object keys are sorted by UTF-16 code unit order; no whitespace is emitted.

function isPlainObject(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function serialise(value, path, ancestors) {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new TypeError(`canonicalJson: non-finite number at ${path}`);
      return JSON.stringify(value);
    case "object":
      break;
    default:
      throw new TypeError(`canonicalJson: unsupported ${typeof value} at ${path}`);
  }

  if (ancestors.has(value)) throw new TypeError(`canonicalJson: circular reference at ${path}`);
  ancestors.add(value);
  let text;
  if (Array.isArray(value)) {
    const parts = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) throw new TypeError(`canonicalJson: sparse array hole at ${path}[${index}]`);
      parts.push(serialise(value[index], `${path}[${index}]`, ancestors));
    }
    text = `[${parts.join(",")}]`;
  } else {
    if (!isPlainObject(value)) throw new TypeError(`canonicalJson: non-plain object at ${path}`);
    const keys = Object.keys(value).sort();
    const parts = keys.map((key) => `${JSON.stringify(key)}:${serialise(value[key], `${path}.${key}`, ancestors)}`);
    text = `{${parts.join(",")}}`;
  }
  ancestors.delete(value);
  return text;
}

/**
 * Serialise JSON-compatible data deterministically. Throws TypeError for undefined,
 * functions, symbols, bigints, NaN/Infinity, sparse arrays, cycles and non-plain objects.
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
  return serialise(value, "$", new Set());
}

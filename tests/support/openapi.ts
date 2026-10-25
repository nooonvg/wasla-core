/**
 * Reads `contracts/openapi/core-v1.yaml` as data, and checks a value against a
 * schema taken out of it.
 *
 * Why this exists at all, and why it is not a dependency
 * -----------------------------------------------------
 * Milestones 24, 25 and 26 gated what a route *reads* from a request, and each
 * of those gates could compare code against the contract by scanning its text:
 * "does this parameter appear", "is this component referenced". What a route
 * *answers* cannot be checked that way. A response is a value, and the question
 * is whether that value satisfies the shape the contract publishes, so the
 * contract has to be parsed into something a check can walk.
 *
 * The repository has no YAML dependency and adding one would put a third party
 * between CORE and the file MOVE and MARKET build against, so this reads the
 * subset the contract actually uses:
 *
 *  - block mappings and block sequences, by indentation;
 *  - flow mappings and flow sequences on one line — `{ type: string }`,
 *    `[a, b]` — which is how most of this contract is written;
 *  - folded and literal scalars (`>`, `>-`, `|`, `|-`), which the descriptions
 *    use heavily;
 *  - quoted and bare scalars, booleans and numbers.
 *
 * It deliberately does **not** support anchors, aliases, multiple documents,
 * tags or nested flow collections, and it throws on a line it cannot account
 * for rather than skipping it. A parser that silently ignores what it does not
 * understand would let a response schema disappear from the contract without
 * the gate noticing, which is the failure this file exists to prevent.
 */
import { readFileSync } from "node:fs";

export type Yaml = string | number | boolean | null | Yaml[] | { [key: string]: Yaml };

interface Line {
  readonly indent: number;
  readonly text: string;
  readonly number: number;
}

function lines(source: string): Line[] {
  const out: Line[] = [];
  source.split("\n").forEach((raw, index) => {
    // A whole-line comment at any indent, which is what YAML drops. A `#` after
    // content is left alone: this contract writes URLs and prose that contain
    // one, and guessing where a comment starts mid-line would silently change a
    // documented value.
    const withoutComment = raw.trimStart().startsWith("#") ? "" : raw;
    if (withoutComment.trim() === "") return;
    out.push({
      indent: withoutComment.length - withoutComment.trimStart().length,
      text: withoutComment.trim(),
      number: index + 1,
    });
  });
  return out;
}

function scalar(text: string, line: number): Yaml {
  if (text === "") return null;
  if (text.startsWith('"')) {
    const end = text.lastIndexOf('"');
    if (end <= 0) throw new Error(`unterminated quote on line ${line}: ${text}`);
    return text.slice(1, end);
  }
  if (text.startsWith("'")) {
    const end = text.lastIndexOf("'");
    if (end <= 0) throw new Error(`unterminated quote on line ${line}: ${text}`);
    return text.slice(1, end);
  }
  if (text.startsWith("{") || text.startsWith("[")) return flow(text, line);
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null" || text === "~") return null;
  if (/^-?\d+$/.test(text)) return Number(text);
  if (/^-?\d+\.\d+$/.test(text)) return Number(text);
  return text;
}

/** `{ a: 1, b: [x, y] }` and `[a, b]`, one level of nesting, which is all the contract uses. */
function flow(text: string, line: number): Yaml {
  const body = text.slice(1, -1).trim();
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let quote: string | null = null;
  for (const ch of body) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "{" || ch === "[") depth += 1;
    if (ch === "}" || ch === "]") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") parts.push(current);
  const items = parts.map((part) => part.trim()).filter((part) => part !== "");
  if (text.startsWith("[")) return items.map((item) => scalar(item, line));
  const map: Record<string, Yaml> = {};
  for (const item of items) {
    // An entry with no `key:` is a key whose value is null — which is what YAML
    // itself does, and the reason this reader must not be stricter here than a
    // real parser: `{ description: A, and more prose }` is *valid* YAML that
    // means `{ description: "A", "and more prose": null }`. Refusing it would
    // hide the defect behind a parse error instead of showing it to the gate as
    // the junk key it is.
    if (!looksLikeKey(item)) {
      map[item] = null;
      continue;
    }
    const colon = splitKey(item, line);
    map[colon.key] = scalar(colon.rest, line);
  }
  return map;
}

/** Indexed access, with the bound check the parser would otherwise repeat. */
function at(all: Line[], index: number): Line {
  const line: Line | undefined = all[index];
  if (line === undefined) throw new Error(`the contract has no line at index ${index}`);
  return line;
}

function splitKey(text: string, line: number): { key: string; rest: string } {
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ":" && (i + 1 === text.length || text[i + 1] === " ")) {
      const key = text.slice(0, i).trim();
      return {
        key: key.startsWith('"') || key.startsWith("'") ? key.slice(1, -1) : key,
        rest: text.slice(i + 1).trim(),
      };
    }
  }
  throw new Error(`expected a "key:" on line ${line}: ${text}`);
}

/**
 * A flow collection may be written across several lines — the contract has a
 * `required:` list wrapped for width, and one schema written as a `[` on its own
 * line. Joins lines until the brackets balance, so the flow reader always sees a
 * complete collection.
 */
function gatherFlow(all: Line[], index: number): { text: string; next: number } {
  let text = at(all, index).text;
  let i = index + 1;
  const balanced = (s: string): boolean => {
    let depth = 0;
    let quote: string | null = null;
    for (const ch of s) {
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "[" || ch === "{") depth += 1;
      else if (ch === "]" || ch === "}") depth -= 1;
    }
    return depth === 0;
  };
  while (!balanced(text)) {
    if (i >= all.length) throw new Error(`unterminated flow collection at line ${at(all, index).number}`);
    text = `${text} ${at(all, i).text}`;
    i += 1;
  }
  return { text, next: i };
}

function startsFlow(text: string): boolean {
  return text.startsWith("[") || text.startsWith("{");
}

function block(all: Line[], from: number, indent: number): { value: Yaml; next: number } {
  if (from >= all.length || at(all, from).indent < indent) return { value: null, next: from };
  const level = at(all, from).indent;
  if (startsFlow(at(all, from).text)) {
    const gathered = gatherFlow(all, from);
    return { value: flow(gathered.text, at(all, from).number), next: gathered.next };
  }
  if (at(all, from).text.startsWith("- ") || at(all, from).text === "-") {
    const items: Yaml[] = [];
    let i = from;
    while (i < all.length && at(all, i).indent === level && at(all, i).text.startsWith("-")) {
      const line = at(all, i);
      const rest = line.text === "-" ? "" : line.text.slice(2).trim();
      if (rest === "") {
        const nested = block(all, i + 1, level + 1);
        items.push(nested.value);
        i = nested.next;
        continue;
      }
      // `- key: value` starts a mapping whose first entry is on the dash line.
      if (!rest.startsWith("{") && !rest.startsWith("[") && looksLikeKey(rest)) {
        const map: Record<string, Yaml> = {};
        const entry = splitKey(rest, line.number);
        const childIndent = line.indent + 2;
        if (entry.rest === "") {
          const nested = block(all, i + 1, childIndent + 1);
          map[entry.key] = nested.value;
          i = nested.next;
        } else {
          map[entry.key] = folded(all, i, entry.rest, childIndent);
          i = skipFolded(all, i, entry.rest, childIndent);
        }
        while (i < all.length && at(all, i).indent === childIndent && !at(all, i).text.startsWith("- ")) {
          const more = readEntry(all, i, childIndent, map);
          i = more;
        }
        items.push(map);
        continue;
      }
      items.push(scalar(rest, line.number));
      i += 1;
    }
    return { value: items, next: i };
  }
  const map: Record<string, Yaml> = {};
  let i = from;
  while (i < all.length && at(all, i).indent === level && !at(all, i).text.startsWith("- ")) {
    i = readEntry(all, i, level, map);
  }
  return { value: map, next: i };
}

function looksLikeKey(text: string): boolean {
  try {
    splitKey(text, 0);
    return true;
  } catch {
    return false;
  }
}

function readEntry(
  all: Line[],
  index: number,
  indent: number,
  into: Record<string, Yaml>,
): number {
  const line = at(all, index);
  const entry = splitKey(line.text, line.number);
  if (startsFlow(entry.rest)) {
    const gathered = gatherFlow(all, index);
    const complete = splitKey(gathered.text, line.number);
    into[entry.key] = flow(complete.rest, line.number);
    return gathered.next;
  }
  if (entry.rest === "") {
    const nested = block(all, index + 1, indent + 1);
    into[entry.key] = nested.value;
    return nested.next;
  }
  into[entry.key] = folded(all, index, entry.rest, indent);
  return skipFolded(all, index, entry.rest, indent);
}

function foldedLines(all: Line[], index: number, indent: number): Line[] {
  const out: Line[] = [];
  let i = index + 1;
  while (i < all.length && at(all, i).indent > indent) {
    out.push(at(all, i));
    i += 1;
  }
  return out;
}

function folded(all: Line[], index: number, rest: string, indent: number): Yaml {
  if (rest === ">" || rest === ">-" || rest === "|" || rest === "|-") {
    const body = foldedLines(all, index, indent);
    const separator = rest.startsWith("|") ? "\n" : " ";
    return body.map((line) => line.text).join(separator);
  }
  return scalar(rest, at(all, index).number);
}

function skipFolded(all: Line[], index: number, rest: string, indent: number): number {
  if (rest === ">" || rest === ">-" || rest === "|" || rest === "|-") {
    return index + 1 + foldedLines(all, index, indent).length;
  }
  return index + 1;
}

export function parseYaml(source: string): Yaml {
  const all = lines(source);
  const result = block(all, 0, 0);
  if (result.next !== all.length) {
    throw new Error(`could not account for line ${at(all, result.next).number}: ${at(all, result.next).text}`);
  }
  return result.value;
}

// ── the contract, as operations ────────────────────────────────────────────────

export interface DocumentedResponse {
  readonly status: string;
  /** The content type the contract says this response is sent as, if it says. */
  readonly contentType?: string;
  /** The schema for that content type, `$ref`s already resolved. */
  readonly schema?: Yaml;
  readonly description?: string;
  /** Every key written on the response object, so a junk key is visible. */
  readonly keys: readonly string[];
  /**
   * The response headers the contract says this response carries, lower-cased,
   * with their declarations `$ref`-resolved — milestone 28. `content-type` is
   * deliberately not among them: OpenAPI states a response header named
   * `Content-Type` is ignored, because the media type is already declared by
   * `content`, which milestone 27 gates.
   */
  readonly headers: ReadonlyMap<string, Yaml>;
}

export interface Operation {
  readonly method: string;
  readonly path: string;
  readonly responses: ReadonlyMap<string, DocumentedResponse>;
  readonly label: string;
}

export interface Contract {
  readonly document: Record<string, Yaml>;
  readonly operations: readonly Operation[];
  resolve(node: Yaml): Yaml;
}

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

export function loadContract(path = "contracts/openapi/core-v1.yaml"): Contract {
  const document = parseYaml(readFileSync(path, "utf8")) as Record<string, Yaml>;

  const resolve = (node: Yaml): Yaml => {
    let seen = 0;
    let current = node;
    while (
      current !== null &&
      typeof current === "object" &&
      !Array.isArray(current) &&
      typeof current["$ref"] === "string"
    ) {
      if ((seen += 1) > 10) throw new Error("$ref chain too deep");
      const ref = current["$ref"] as string;
      if (!ref.startsWith("#/")) throw new Error(`external $ref not supported: ${ref}`);
      let target: Yaml = document;
      for (const step of ref.slice(2).split("/")) {
        if (target === null || typeof target !== "object" || Array.isArray(target)) {
          throw new Error(`$ref does not resolve: ${ref}`);
        }
        const next: Yaml | undefined = (target as Record<string, Yaml>)[step];
        if (next === undefined) throw new Error(`$ref does not resolve: ${ref}`);
        target = next;
      }
      current = target;
    }
    return current;
  };

  /**
   * Resolves every `$ref` in a schema, not only the one at its root.
   *
   * The contract writes most of its nesting in flow maps —
   * `items: { $ref: "#/components/schemas/Role" }` — so a reader that resolved
   * only the top node would hand the checker a bare `{ $ref }` and the check
   * would pass on anything. A repeated reference along one path is left
   * unresolved rather than followed forever; nothing in this contract is
   * recursive, and if something becomes so the check will say so out loud
   * instead of hanging.
   */
  const deepResolve = (node: Yaml, seen: readonly string[] = []): Yaml => {
    if (node === null || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map((item) => deepResolve(item, seen));
    const ref = (node as Record<string, Yaml>)["$ref"];
    if (typeof ref === "string") {
      if (seen.includes(ref)) return node;
      return deepResolve(resolve(node), [...seen, ref]);
    }
    const out: Record<string, Yaml> = {};
    for (const [key, value] of Object.entries(node as Record<string, Yaml>)) {
      out[key] = deepResolve(value, seen);
    }
    return out;
  };

  const paths = document["paths"] as Record<string, Yaml>;
  const operations: Operation[] = [];
  for (const [path, node] of Object.entries(paths)) {
    const byMethod = node as Record<string, Yaml>;
    for (const method of METHODS) {
      const operation = byMethod[method];
      if (operation === undefined) continue;
      const responses = ((operation as Record<string, Yaml>)["responses"] ?? {}) as Record<
        string,
        Yaml
      >;
      const schemas = new Map<string, DocumentedResponse>();
      for (const [status, response] of Object.entries(responses)) {
        const resolved = resolve(response) as Record<string, Yaml>;
        const content = resolved["content"] as Record<string, Yaml> | undefined;
        const contentType = content === null || content === undefined ? undefined : Object.keys(content)[0];
        const body =
          contentType === undefined
            ? undefined
            : (content as Record<string, Yaml>)[contentType] as Record<string, Yaml>;
        const schema = body?.["schema"];
        schemas.set(status, {
          status,
          contentType,
          schema: schema === undefined ? undefined : deepResolve(schema),
          description: typeof resolved["description"] === "string" ? resolved["description"] : undefined,
          keys: Object.keys(resolved),
          headers: new Map(
            Object.entries((resolved["headers"] ?? {}) as Record<string, Yaml>).map(
              ([name, declaration]) => [name.toLowerCase(), deepResolve(declaration)] as const,
            ),
          ),
        });
      }
      operations.push({
        method: method.toUpperCase(),
        path,
        responses: schemas,
        label: `${method.toUpperCase()} ${path}`,
      });
    }
  }
  return { document, operations, resolve };
}

// ── checking a value against a schema ─────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Returns every way `value` fails `schema`, as sentences, and an empty array
 * when it satisfies it.
 *
 * Two decisions worth stating, because both make this stricter than an ordinary
 * OpenAPI validator:
 *
 *  - a property the schema does not describe is a failure, even though OpenAPI
 *    treats an object as open unless `additionalProperties: false` is written.
 *    An undocumented field in a response is exactly the defect this gate exists
 *    to find: a consumer either ignores a field CORE went to the trouble of
 *    sending, or depends on one CORE never promised and may remove.
 *  - `nullable` must be written for `null` to pass, so a column that became
 *    nullable in the database cannot start arriving as `null` in a response
 *    while the contract still says it is a string.
 */
/**
 * Flattens `allOf`, so a response that is "the record, plus what this call also
 * answers" can say so by reference instead of repeating the record's properties.
 *
 * Only the object case is merged, which is all the contract uses: required is
 * the union and properties are combined. A property declared twice with two
 * different schemas is refused rather than resolved — whichever branch won would
 * be a coin toss, and the point of this reader is to have no opinions the
 * contract did not state. Returns the problem list on failure so the caller can
 * report it exactly like any other violation.
 */
/**
 * `additionalProperties` as a schema, when the contract chose to describe a map
 * rather than name its keys. `false` and an absent declaration both mean the
 * same thing here — an undocumented key is a violation — which is stricter than
 * OpenAPI's default and is the point: the gate exists to catch a property CORE
 * returns that nobody wrote down.
 */
function additional(spec: Record<string, Yaml>): Yaml | undefined {
  const declared = spec["additionalProperties"];
  if (declared === null || declared === undefined || typeof declared !== "object") return undefined;
  return declared;
}

function merged(spec: Record<string, Yaml>, at: string): Record<string, Yaml> | string[] {
  const branches = spec["allOf"];
  if (!Array.isArray(branches)) return spec;
  const out: Record<string, Yaml> = { ...spec, type: "object" };
  delete out["allOf"];
  const properties: Record<string, Yaml> = { ...((spec["properties"] ?? {}) as Record<string, Yaml>) };
  const required = new Set<string>(
    ((spec["required"] ?? []) as Yaml[]).filter((key): key is string => typeof key === "string"),
  );
  for (const branch of branches) {
    if (branch === null || typeof branch !== "object" || Array.isArray(branch)) {
      return [`${at}: allOf contains something that is not a schema`];
    }
    const part = branch as Record<string, Yaml>;
    if (Array.isArray(part["allOf"])) {
      const nested = merged(part, at);
      if (Array.isArray(nested)) return nested;
      Object.assign(part, nested);
    }
    for (const key of (part["required"] ?? []) as Yaml[]) {
      if (typeof key === "string") required.add(key);
    }
    for (const [key, value] of Object.entries((part["properties"] ?? {}) as Record<string, Yaml>)) {
      const existing = properties[key];
      if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(value)) {
        return [`${at}: allOf declares "${key}" twice with different schemas`];
      }
      properties[key] = value;
    }
  }
  out["properties"] = properties;
  out["required"] = [...required];
  return out;
}

export function violations(value: unknown, schema: Yaml, at = "body"): string[] {
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    return [`${at}: schema is not an object`];
  }
  const spec = merged(schema as Record<string, Yaml>, at);
  if (Array.isArray(spec)) return spec;
  const type = spec["type"];
  const problems: string[] = [];

  if (value === null) {
    return spec["nullable"] === true ? [] : [`${at}: is null but the contract does not allow null`];
  }
  if (typeof type !== "string") return [`${at}: schema has no type`];

  const enumeration = spec["enum"];
  if (Array.isArray(enumeration) && !enumeration.some((option) => option === value)) {
    problems.push(`${at}: ${JSON.stringify(value)} is not one of ${JSON.stringify(enumeration)}`);
  }

  switch (type) {
    case "object": {
      if (typeof value !== "object" || Array.isArray(value)) {
        return [`${at}: expected an object, got ${describe(value)}`];
      }
      const properties = (spec["properties"] ?? {}) as Record<string, Yaml>;
      const required = (spec["required"] ?? []) as Yaml[];
      // JSON Schema semantics, restored here for one reason: `details` is
      // documented as a bare `{ type: object }` — a free-form object — and a
      // free-form object that rejected every key would not be free-form. The
      // members a refusal carries there are documented where they belong, in
      // the prose of the response that returns them (`details.claimed_at` on
      // KeyReused, `details.organization_ids` on DeletionConflict), so the gate
      // stays closed for every structured object — the ones that declare
      // `properties` — and open only where the contract itself says "any".
      const freeForm =
        Object.keys(properties).length === 0 && spec["additionalProperties"] === undefined;
      for (const key of required) {
        if (typeof key === "string" && !(key in (value as object))) {
          problems.push(`${at}: required property "${key}" is missing`);
        }
      }
      for (const [key, member] of Object.entries(value as Record<string, unknown>)) {
        const property = properties[key] ?? additional(spec);
        if (property === undefined) {
          if (!freeForm) {
            problems.push(`${at}: property "${key}" is returned but the contract does not document it`);
          }
          continue;
        }
        problems.push(...violations(member, property, `${at}.${key}`));
      }
      return problems;
    }
    case "array": {
      if (!Array.isArray(value)) return [`${at}: expected an array, got ${describe(value)}`];
      const items = spec["items"];
      if (items === undefined) return [`${at}: schema has no items`];
      value.forEach((member, index) => {
        problems.push(...violations(member, items, `${at}[${index}]`));
      });
      return problems;
    }
    case "string": {
      if (typeof value !== "string") {
        problems.push(`${at}: expected a string, got ${describe(value)}`);
        return problems;
      }
      const format = spec["format"];
      if (format === "uuid" && !UUID.test(value)) {
        problems.push(`${at}: ${JSON.stringify(value)} is not a uuid`);
      }
      if (format === "date-time" && !TIMESTAMP.test(value)) {
        problems.push(`${at}: ${JSON.stringify(value)} is not a timestamp`);
      }
      const min = spec["minLength"];
      if (typeof min === "number" && value.length < min) {
        problems.push(`${at}: shorter than minLength ${min}`);
      }
      return problems;
    }
    case "integer": {
      if (typeof value !== "number" || !Number.isInteger(value)) {
        problems.push(`${at}: expected an integer, got ${describe(value)}`);
      }
      return problems;
    }
    case "number": {
      if (typeof value !== "number") {
        problems.push(`${at}: expected a number, got ${describe(value)}`);
      }
      return problems;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        problems.push(`${at}: expected a boolean, got ${describe(value)}`);
      }
      return problems;
    }
    default:
      return [`${at}: unsupported type "${type}"`];
  }
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

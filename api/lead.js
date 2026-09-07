import { createHash } from "node:crypto";

const MAX_BODY_BYTES = 4096;
const RESEND_TIMEOUT_MS = 4000;
const RESEND_URL = "https://api.resend.com/emails";
const SNAPSHOT_SOURCE = "homepage snapshot form";
const SNAPSHOT_REQUEST_PHASE = "request";
const SNAPSHOT_CONTEXT_PHASE = "context";
const SNAPSHOT_REQUEST_ALLOWED_KEYS = new Set([
  "version",
  "phase",
  "website",
  "email",
  "leadReference",
  "submittedAt",
  "company",
]);
const SNAPSHOT_CONTEXT_ALLOWED_KEYS = new Set([
  "version",
  "phase",
  "website",
  "email",
  "leadReference",
  "contextSubmittedAt",
  "firstName",
  "sellsBuyer",
  "competitors",
  "company",
]);
const SNAPSHOT_REFERENCE_PATTERN =
  /^shifter-snapshot-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SNAPSHOT_FIRST_NAME_MAX = 80;
const SNAPSHOT_SELLS_BUYER_MAX = 600;
const SNAPSHOT_COMPETITORS_MAX = 300;
const START_ROUTES = Object.freeze({
  single: "standard",
  multiple: "scoped",
  unsure: "snapshot",
});
const START_ALLOWED_KEYS = new Set([
  "version",
  "website",
  "businessDescription",
  "scope",
  "leadReference",
  "submittedAt",
  "contact_email",
]);
const LEGACY_ALLOWED_KEYS = new Set([
  "website",
  "email",
  "details",
  "source",
  "company",
]);
const LEGACY_SOURCES = new Set([
  "homepage snapshot form",
  "start qualification form",
]);
const LEAD_REFERENCE_PATTERN =
  /^shifter-start-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function normalizeWebsite(raw) {
  if (typeof raw !== "string") {
    return { ok: false, error: "required" };
  }

  const value = raw.trim();

  if (!value) {
    return { ok: false, error: "required" };
  }

  if (raw.length > 200) {
    return { ok: false, error: "too_long" };
  }

  if (/\s/.test(value) || /[\u0000-\u001f\u007f\\]/.test(value)) {
    return { ok: false, error: "format" };
  }

  const scheme = value.match(/^[a-z][a-z0-9+.-]*:/i);

  if (scheme && !/^https?:\/\//i.test(value)) {
    return { ok: false, error: "format" };
  }

  let parsed;

  try {
    parsed = new URL(scheme ? value : `https://${value}`);
  } catch (error) {
    return { ok: false, error: "format" };
  }

  const hostname = parsed.hostname.toLowerCase();
  const labels = hostname.split(".");
  const invalidHostname =
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    Boolean(parsed.username || parsed.password) ||
    (hostname.startsWith("[") && hostname.endsWith("]")) ||
    IPV4_PATTERN.test(hostname) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    !hostname.includes(".") ||
    hostname.length > 253 ||
    labels.some(
      (label) =>
        !label || label.length > 63 || !DOMAIN_LABEL_PATTERN.test(label),
    );

  return invalidHostname
    ? { ok: false, error: "format" }
    : { ok: true, value: parsed.origin };
}

function normalizeEmail(raw) {
  if (typeof raw !== "string") return { ok: false, error: "required" };
  const value = raw.trim();
  if (!value) return { ok: false, error: "required" };
  if (value.length > 254) return { ok: false, error: "too_long" };
  if (/\s|[\u0000-\u001f\u007f]/.test(value)) {
    return { ok: false, error: "format" };
  }
  const parts = value.split("@");
  if (parts.length !== 2 || !parts[0]) {
    return { ok: false, error: "format" };
  }
  const hostname = parts[1].toLowerCase();
  const labels = hostname.split(".");
  const invalidDomain =
    IPV4_PATTERN.test(hostname) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    !hostname.includes(".") ||
    hostname.length > 253 ||
    labels.some(
      (label) =>
        !label || label.length > 63 || !DOMAIN_LABEL_PATTERN.test(label),
    );
  return invalidDomain
    ? { ok: false, error: "format" }
    : { ok: true, value };
}

function normalizeDetails(raw) {
  if (typeof raw !== "string") return { ok: false, error: "format" };
  if (/[\u0000-\u001f\u007f]/.test(raw)) {
    return { ok: false, error: "format" };
  }
  const value = raw.trim().replace(/\s+/g, " ");
  return value.length <= 600
    ? { ok: true, value }
    : { ok: false, error: "too_long" };
}

function normalizeOptionalSnapshotText(raw, maxLength) {
  if (raw === undefined) return { ok: true, value: "" };
  if (typeof raw !== "string") return { ok: false, error: "format" };
  if (/[\u0000-\u001f\u007f]/.test(raw)) {
    return { ok: false, error: "format" };
  }
  const value = raw.trim().replace(/\s+/g, " ");
  return value.length <= maxLength
    ? { ok: true, value }
    : { ok: false, error: "too_long" };
}

function normalizeSnapshotCompetitors(raw) {
  const result = normalizeOptionalSnapshotText(raw, SNAPSHOT_COMPETITORS_MAX);
  if (!result.ok) return result;
  const entries = result.value
    .split(/[;,]/)
    .filter((entry) => entry.trim() !== "");
  return entries.length <= 3
    ? result
    : { ok: false, error: "too_many" };
}

function validateSnapshotLeadReference(raw) {
  return typeof raw === "string" && SNAPSHOT_REFERENCE_PATTERN.test(raw);
}

function calculateSnapshotDueDate(submittedAt) {
  const date = new Date(submittedAt);
  if (Number.isNaN(date.valueOf())) return "";
  date.setUTCHours(0, 0, 0, 0);
  let businessDays = 0;
  while (businessDays < 2) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) businessDays += 1;
  }
  return date.toISOString().slice(0, 10);
}

function formatSnapshotValue(value) {
  return value || "—";
}

function buildSnapshotRequestEmail(lead) {
  return [
    `Source: ${SNAPSHOT_SOURCE}`,
    `Reference: ${lead.leadReference}`,
    `Website: ${lead.website}`,
    `Work email: ${lead.email}`,
    "First name: —",
    "Sells/buyer: —",
    "Competitors: —",
    `Submitted: ${lead.submittedAt}`,
    `Snapshot due: ${calculateSnapshotDueDate(lead.submittedAt)}`,
  ].join("\n");
}

function buildSnapshotContextEmail(lead) {
  return [
    "Source: homepage snapshot context",
    `Reference: ${lead.leadReference}`,
    `Website: ${lead.website}`,
    `Work email: ${lead.email}`,
    `First name: ${formatSnapshotValue(lead.firstName)}`,
    `Sells/buyer: ${formatSnapshotValue(lead.sellsBuyer)}`,
    `Competitors: ${formatSnapshotValue(lead.competitors)}`,
    `Context submitted: ${lead.contextSubmittedAt}`,
  ].join("\n");
}

function normalizeBusinessDescription(raw) {
  if (typeof raw !== "string") return { ok: false, error: "required" };
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return { ok: false, error: "required" };
  if (value.length < 5) return { ok: false, error: "too_short" };
  if (value.length > 160) return { ok: false, error: "too_long" };
  return { ok: true, value };
}

function validateScope(raw) {
  return Object.hasOwn(START_ROUTES, raw)
    ? { ok: true, value: raw }
    : { ok: false, error: "required" };
}

function validateLeadReference(raw) {
  return typeof raw === "string" && LEAD_REFERENCE_PATTERN.test(raw);
}

function validateSubmittedAt(raw) {
  if (typeof raw !== "string") return false;
  const parsed = new Date(raw);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === raw;
}

function deriveRoute(scope) {
  return Object.hasOwn(START_ROUTES, scope) ? START_ROUTES[scope] : null;
}

function isAllowedOrigin(origin, env = process.env) {
  if (origin === undefined || origin === "") {
    return true;
  }

  if (typeof origin !== "string" || origin === "null") {
    return false;
  }

  let parsed;

  try {
    parsed = new URL(origin);
  } catch (error) {
    return false;
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    return false;
  }

  if (
    origin === "https://shifter.co" ||
    origin === "https://www.shifter.co"
  ) {
    return true;
  }

  if (
    parsed.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) &&
    /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin)
  ) {
    return true;
  }

  return (
    env.VERCEL_ENV === "preview" &&
    typeof env.VERCEL_URL === "string" &&
    origin === `https://${env.VERCEL_URL}`
  );
}

function buildStartEmail(lead) {
  return [
    "Source: shifter-start",
    `Reference: ${lead.leadReference}`,
    `Website: ${lead.website}`,
    `Business: ${lead.businessDescription}`,
    `Scope: ${lead.scope}`,
    `Route: ${lead.route}`,
    `Submitted: ${lead.submittedAt}`,
  ].join("\n");
}

function validateLegacyLead(body) {
  const website = normalizeWebsite(body.website);
  if (!website.ok) return null;

  const hasEmail = Object.hasOwn(body, "email");
  const email = hasEmail
    ? normalizeEmail(body.email)
    : { ok: true, value: "" };
  if (!email.ok) return null;

  const hasDetails = Object.hasOwn(body, "details");
  const details = hasDetails
    ? normalizeDetails(body.details)
    : { ok: true, value: "" };
  if (!details.ok) return null;

  const hasSource = Object.hasOwn(body, "source");
  const suppliedSource = hasSource ? body.source : "";
  if (
    hasSource &&
    (typeof suppliedSource !== "string" ||
      !LEGACY_SOURCES.has(suppliedSource))
  ) {
    return null;
  }
  if (suppliedSource === "homepage snapshot form" && !hasEmail) return null;
  if (suppliedSource === "start qualification form" && hasEmail) return null;

  const form = hasEmail
    ? "snapshot"
    : suppliedSource === "start qualification form" || details.value
      ? "start"
      : "snapshot";
  const source = form === "start"
    ? "start qualification form"
    : hasEmail
      ? "homepage snapshot form"
      : "legacy homepage form";

  return {
    form,
    website: website.value,
    email: email.value,
    details: details.value,
    source,
  };
}

function buildLegacyEmail(lead) {
  const text = [
    `Source: ${lead.source}`,
    `Website: ${lead.website}`,
    lead.email ? `Work email: ${lead.email}` : "",
    lead.details ? `Details: ${lead.details}` : "",
  ].filter(Boolean).join("\n");
  const payload = {
    from: "Shifter Leads <leads@shifter.co>",
    to: ["hello@shifter.co"],
    subject: `${lead.form === "start" ? "Start form" : "Snapshot request"}: ${lead.website}`,
    text,
  };
  if (lead.email) payload.reply_to = lead.email;
  return payload;
}

function createLegacyIdempotencyKey(emailPayload) {
  const digest = createHash("sha256")
    .update(JSON.stringify(emailPayload), "utf8")
    .digest("hex");
  return `legacy-lead/${digest}`;
}

async function deliverWithResend(
  emailPayload,
  {
    fetchImpl,
    apiKey,
    setTimeoutImpl,
    clearTimeoutImpl,
    idempotencyKey,
    userAgent,
  },
) {
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    return { ok: false, status: 503 };
  }
  const abortController = new AbortController();
  const timer = setTimeoutImpl(
    () => abortController.abort(),
    RESEND_TIMEOUT_MS,
  );
  try {
    const response = await fetchImpl(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": userAgent,
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(emailPayload),
      signal: abortController.signal,
    });
    if (!response || response.ok !== true) {
      return { ok: false, status: 502 };
    }
    const providerBody = await response.json();
    return providerBody &&
      typeof providerBody.id === "string" &&
      providerBody.id.trim() !== ""
      ? { ok: true }
      : { ok: false, status: 502 };
  } catch (error) {
    return { ok: false, status: 502 };
  } finally {
    clearTimeoutImpl(timer);
  }
}

function isPlainBody(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(body);
  return prototype === Object.prototype || prototype === null;
}

function getHeader(req, name) {
  if (!req || !req.headers || typeof req.headers !== "object") {
    return undefined;
  }

  const target = name.toLowerCase();
  if (Object.hasOwn(req.headers, target)) {
    return req.headers[target];
  }

  const match = Object.keys(req.headers).find(
    (headerName) => headerName.toLowerCase() === target,
  );
  return match === undefined ? undefined : req.headers[match];
}

function sendJson(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function isJsonContentType(value) {
  return (
    typeof value === "string" &&
    value.split(";", 1)[0].trim().toLowerCase() === "application/json"
  );
}

function admitLeadRequest(req, env) {
  if (req.method !== "POST") {
    return { ok: false, status: 405, allow: "POST" };
  }

  if (!isJsonContentType(getHeader(req, "content-type"))) {
    return { ok: false, status: 415 };
  }

  if (!isAllowedOrigin(getHeader(req, "origin"), env)) {
    return { ok: false, status: 403 };
  }

  const contentLength = getHeader(req, "content-length");
  if (
    typeof contentLength === "string" &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > MAX_BODY_BYTES
  ) {
    return { ok: false, status: 413 };
  }

  return { ok: true };
}

function hasOnlyAllowedKeys(body, allowedKeys) {
  return Reflect.ownKeys(body).every(
    (key) => typeof key === "string" && allowedKeys.has(key),
  );
}

function readHoneypot(body, fieldName) {
  const value = Object.hasOwn(body, fieldName) ? body[fieldName] : "";
  return typeof value === "string"
    ? { ok: true, filled: value !== "" }
    : { ok: false };
}

function parseLeadBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
      return { ok: false, status: 413 };
    }
    try {
      body = JSON.parse(body);
    } catch (error) {
      return { ok: false, status: 400 };
    }
  }

  let serialized;
  try {
    serialized = JSON.stringify(body);
  } catch (error) {
    return { ok: false, status: 400 };
  }
  if (
    typeof serialized === "string" &&
    Buffer.byteLength(serialized, "utf8") > MAX_BODY_BYTES
  ) {
    return { ok: false, status: 413 };
  }
  return isPlainBody(body)
    ? { ok: true, body }
    : { ok: false, status: 400 };
}

function validateStartPayload(body) {
  const website = normalizeWebsite(body.website);
  const businessDescription = normalizeBusinessDescription(
    body.businessDescription,
  );
  const scope = validateScope(body.scope);

  if (
    !website.ok ||
    !businessDescription.ok ||
    !scope.ok ||
    !validateLeadReference(body.leadReference) ||
    !validateSubmittedAt(body.submittedAt)
  ) {
    return null;
  }

  const route = deriveRoute(scope.value);
  if (!route) return null;

  return {
    website: website.value,
    businessDescription: businessDescription.value,
    scope: scope.value,
    leadReference: body.leadReference,
    submittedAt: body.submittedAt,
    route,
  };
}

function validateSnapshotRequestPayload(body) {
  const website = normalizeWebsite(body.website);
  const email = normalizeEmail(body.email);
  if (
    body.phase !== SNAPSHOT_REQUEST_PHASE ||
    !website.ok ||
    !email.ok ||
    !validateSnapshotLeadReference(body.leadReference) ||
    !validateSubmittedAt(body.submittedAt)
  ) {
    return null;
  }
  return {
    phase: SNAPSHOT_REQUEST_PHASE,
    website: website.value,
    email: email.value,
    leadReference: body.leadReference,
    submittedAt: body.submittedAt,
  };
}

function validateSnapshotContextPayload(body) {
  const website = normalizeWebsite(body.website);
  const email = normalizeEmail(body.email);
  const firstName = normalizeOptionalSnapshotText(
    body.firstName,
    SNAPSHOT_FIRST_NAME_MAX,
  );
  const sellsBuyer = normalizeOptionalSnapshotText(
    body.sellsBuyer,
    SNAPSHOT_SELLS_BUYER_MAX,
  );
  const competitors = normalizeSnapshotCompetitors(body.competitors);
  if (
    body.phase !== SNAPSHOT_CONTEXT_PHASE ||
    !website.ok ||
    !email.ok ||
    !validateSnapshotLeadReference(body.leadReference) ||
    !validateSubmittedAt(body.contextSubmittedAt) ||
    !firstName.ok ||
    !sellsBuyer.ok ||
    !competitors.ok
  ) {
    return null;
  }
  return {
    phase: SNAPSHOT_CONTEXT_PHASE,
    website: website.value,
    email: email.value,
    leadReference: body.leadReference,
    contextSubmittedAt: body.contextSubmittedAt,
    firstName: firstName.value,
    sellsBuyer: sellsBuyer.value,
    competitors: competitors.value,
  };
}

function createLeadHandler({
  fetchImpl = globalThis.fetch,
  env = process.env,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  const handleLegacySnapshot = async (body, res) => {
    const lead = validateLegacyLead(body);
    if (!lead) return sendJson(res, 400, { ok: false });
    const emailPayload = buildLegacyEmail(lead);
    const delivery = await deliverWithResend(emailPayload, {
      fetchImpl,
      apiKey: env.RESEND_API_KEY,
      setTimeoutImpl,
      clearTimeoutImpl,
      idempotencyKey: createLegacyIdempotencyKey(emailPayload),
      userAgent: "shifter-lead-form/1",
    });
    return delivery.ok
      ? sendJson(res, 202, { ok: true, accepted: true })
      : sendJson(res, delivery.status, { ok: false });
  };

  const handleSnapshotV3 = async (body, res) => {
    const lead = body.phase === SNAPSHOT_REQUEST_PHASE
      ? validateSnapshotRequestPayload(body)
      : validateSnapshotContextPayload(body);
    if (!lead) return sendJson(res, 400, { ok: false });

    const isRequest = lead.phase === SNAPSHOT_REQUEST_PHASE;
    const emailPayload = {
      from: "Shifter Leads <leads@shifter.co>",
      to: ["hello@shifter.co"],
      subject: isRequest
        ? `Snapshot request: ${lead.website}`
        : `Snapshot context added: ${lead.website}`,
      text: isRequest
        ? buildSnapshotRequestEmail(lead)
        : buildSnapshotContextEmail(lead),
      reply_to: lead.email,
    };
    const delivery = await deliverWithResend(emailPayload, {
      fetchImpl,
      apiKey: env.RESEND_API_KEY,
      setTimeoutImpl,
      clearTimeoutImpl,
      idempotencyKey: `snapshot-${isRequest ? "request" : "context"}/${lead.leadReference}`,
      userAgent: "shifter-snapshot-form/3",
    });
    return delivery.ok
      ? sendJson(res, 202, {
        ok: true,
        accepted: true,
        leadReference: lead.leadReference,
      })
      : sendJson(res, delivery.status, { ok: false });
  };

  return async function handler(req, res) {
    const admission = admitLeadRequest(req, env);
    if (!admission.ok) {
      if (admission.allow) res.setHeader("Allow", admission.allow);
      return sendJson(res, admission.status, { ok: false });
    }

    const parsed = parseLeadBody(req);
    if (!parsed.ok) return sendJson(res, parsed.status, { ok: false });
    const body = parsed.body;
    const hasVersion = Object.hasOwn(body, "version");

    if (!hasVersion) {
      if (!hasOnlyAllowedKeys(body, LEGACY_ALLOWED_KEYS)) {
        return sendJson(res, 400, { ok: false });
      }
      const honeypot = readHoneypot(body, "company");
      if (!honeypot.ok) return sendJson(res, 400, { ok: false });
      if (honeypot.filled) {
        return sendJson(res, 202, { ok: true, accepted: false });
      }
      return handleLegacySnapshot(body, res);
    }

    if (body.version === 3) {
      const allowedKeys = body.phase === SNAPSHOT_REQUEST_PHASE
        ? SNAPSHOT_REQUEST_ALLOWED_KEYS
        : SNAPSHOT_CONTEXT_ALLOWED_KEYS;
      if (!hasOnlyAllowedKeys(body, allowedKeys)) {
        return sendJson(res, 400, { ok: false });
      }
      const honeypot = readHoneypot(body, "company");
      if (!honeypot.ok) return sendJson(res, 400, { ok: false });
      if (honeypot.filled) {
        return sendJson(res, 202, { ok: true, accepted: false });
      }
      return handleSnapshotV3(body, res);
    }

    if (body.version !== 2 || !hasOnlyAllowedKeys(body, START_ALLOWED_KEYS)) {
      return sendJson(res, 400, { ok: false });
    }

    const honeypot = readHoneypot(body, "contact_email");
    if (!honeypot.ok) return sendJson(res, 400, { ok: false });
    if (honeypot.filled) {
      return sendJson(res, 202, { ok: true, accepted: false });
    }

    const lead = validateStartPayload(body);
    if (!lead) {
      return sendJson(res, 400, { ok: false });
    }

    const delivery = await deliverWithResend({
      from: "Shifter Leads <leads@shifter.co>",
      to: ["hello@shifter.co"],
      subject: `Start form: ${lead.website}`,
      text: buildStartEmail(lead),
    }, {
      fetchImpl,
      apiKey: env.RESEND_API_KEY,
      setTimeoutImpl,
      clearTimeoutImpl,
      idempotencyKey: `start-form/${lead.leadReference}`,
      userAgent: "shifter-start-form/2",
    });
    if (delivery.ok) {
      return sendJson(res, 202, {
        ok: true,
        accepted: true,
        route: lead.route,
        leadReference: lead.leadReference,
      });
    }
    return sendJson(res, delivery.status, { ok: false });
  };
}

function createResponseCollector() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

function webResponseFromCollector(collector) {
  return new Response(JSON.stringify(collector.body), {
    status: collector.statusCode,
    headers: {
      ...collector.headers,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function webHeadersToRecord(headers) {
  return Object.fromEntries(headers.entries());
}

async function readWebBody(body) {
  if (!body) return { ok: true, value: "" };

  const reader = body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) return { ok: false, status: 400 };
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch (error) {
          // The response must remain a fixed 413 even if cancellation fails.
        }
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
  } catch (error) {
    return { ok: false, status: 400 };
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, value: new TextDecoder().decode(bytes) };
}

function createWebLeadHandler(dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const legacyHandler = createLeadHandler({ ...dependencies, env });

  return async function fetch(request) {
    const req = {
      method: request.method,
      headers: webHeadersToRecord(request.headers),
    };
    const admission = admitLeadRequest(req, env);
    if (!admission.ok) {
      const collector = createResponseCollector();
      if (admission.allow) collector.setHeader("Allow", admission.allow);
      sendJson(collector, admission.status, { ok: false });
      return webResponseFromCollector(collector);
    }

    const body = await readWebBody(request.body);
    if (!body.ok) {
      const collector = createResponseCollector();
      sendJson(collector, body.status, { ok: false });
      return webResponseFromCollector(collector);
    }

    req.body = body.value;
    const collector = createResponseCollector();
    await legacyHandler(req, collector);
    return webResponseFromCollector(collector);
  };
}

export {
  MAX_BODY_BYTES,
  RESEND_TIMEOUT_MS,
  normalizeWebsite,
  normalizeEmail,
  normalizeDetails,
  normalizeBusinessDescription,
  validateScope,
  validateLeadReference,
  validateSnapshotLeadReference,
  validateSnapshotRequestPayload,
  validateSnapshotContextPayload,
  calculateSnapshotDueDate,
  buildSnapshotRequestEmail,
  buildSnapshotContextEmail,
  validateSubmittedAt,
  deriveRoute,
  isAllowedOrigin,
  buildStartEmail,
  buildLegacyEmail,
  createLegacyIdempotencyKey,
  createLeadHandler,
  createWebLeadHandler,
};
export default { fetch: createWebLeadHandler() };

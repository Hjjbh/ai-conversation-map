/*
 * T0-01 ChatGPT read-only structure probe.
 *
 * This is isolated Stage 0 evidence tooling, not extension production code.
 * It does not run automatically, persist data, use the network, write to the
 * clipboard, or emit message text and source attribute values.
 */
(function installReadonlyProbe(globalScope) {
  "use strict";

  const PROBE_VERSION = "0.1.0";
  const ALLOWED_HOSTS = new Set(["chatgpt.com", "www.chatgpt.com"]);
  const MAX_MESSAGE_CANDIDATES = 500;
  const ROLE_SELECTOR = '[data-message-author-role="user"], [data-message-author-role="assistant"]';
  const STRUCTURE_SELECTORS = Object.freeze({
    headings: "h1, h2, h3, h4, h5, h6",
    paragraphs: "p",
    unorderedLists: "ul",
    orderedLists: "ol",
    listItems: "li",
    codeBlocks: "pre",
    inlineCode: "code",
    tables: "table",
    blockquotes: "blockquote",
    links: "a",
    images: "img",
  });

  function textLengthBucket(length) {
    if (length === 0) return "empty";
    if (length <= 40) return "1-40";
    if (length <= 200) return "41-200";
    if (length <= 1000) return "201-1000";
    return "1000+";
  }

  function safeCount(node, selector) {
    return node && typeof node.querySelectorAll === "function"
      ? node.querySelectorAll(selector).length
      : 0;
  }

  function hasAttribute(node, name) {
    return Boolean(node && typeof node.hasAttribute === "function" && node.hasAttribute(name));
  }

  function getAttribute(node, name) {
    if (!node || typeof node.getAttribute !== "function") return null;
    return node.getAttribute(name);
  }

  function summarizeMessageNode(node, roleNode, index) {
    const rawRole = getAttribute(roleNode, "data-message-author-role");
    const role = rawRole === "user" || rawRole === "assistant" ? rawRole : "unknown";
    const rawTextLength = typeof node.textContent === "string" ? node.textContent.length : 0;
    const structure = {};

    for (const [name, selector] of Object.entries(STRUCTURE_SELECTORS)) {
      structure[name] = safeCount(node, selector);
    }

    const ariaBusy = getAttribute(node, "aria-busy") === "true"
      || getAttribute(roleNode, "aria-busy") === "true";

    return Object.freeze({
      ordinal: index + 1,
      role,
      textLengthBucket: textLengthBucket(rawTextLength),
      answerStateHint: role === "assistant" && ariaBusy ? "streaming-signal" : "unconfirmed",
      structure: Object.freeze(structure),
      attributePresence: Object.freeze({
        dataMessageId: hasAttribute(node, "data-message-id") || hasAttribute(roleNode, "data-message-id"),
        dataTestId: hasAttribute(node, "data-testid") || hasAttribute(roleNode, "data-testid"),
        dataMessageAuthorRole: hasAttribute(roleNode, "data-message-author-role"),
        ariaBusy: hasAttribute(node, "aria-busy") || hasAttribute(roleNode, "aria-busy"),
        ariaLabel: hasAttribute(node, "aria-label") || hasAttribute(roleNode, "aria-label"),
      }),
    });
  }

  function findMessageEntries(main) {
    const roleNodes = Array.from(main.querySelectorAll(ROLE_SELECTOR));
    if (roleNodes.length > MAX_MESSAGE_CANDIDATES) {
      return { entries: [], errorCode: "MESSAGE_CANDIDATE_LIMIT_EXCEEDED" };
    }

    const seenRoles = new Map();
    const entries = [];

    for (const roleNode of roleNodes) {
      const turnNode = typeof roleNode.closest === "function"
        ? roleNode.closest('[data-testid^="conversation-turn-"]') || roleNode
        : roleNode;

      if (!main.contains(turnNode)) {
        return { entries: [], errorCode: "MESSAGE_CONTAINER_OUTSIDE_ROOT" };
      }

      const role = getAttribute(roleNode, "data-message-author-role");
      const priorRole = seenRoles.get(turnNode);
      if (priorRole && priorRole !== role) {
        return { entries: [], errorCode: "ROLE_CONTAINER_CONFLICT" };
      }
      if (priorRole === role) continue;

      seenRoles.set(turnNode, role);
      entries.push({ node: turnNode, roleNode });
    }

    return { entries, errorCode: null };
  }

  function classifyPath(pathname) {
    if (typeof pathname !== "string") return "unknown";
    if (/^\/c\/[^/]+\/?$/.test(pathname)) return "conversation";
    if (pathname === "/" || pathname === "") return "home";
    return "other";
  }

  function safeCapturedAt() {
    try {
      const value = new Date().toISOString();
      return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ? value : null;
    } catch {
      return null;
    }
  }

  function buildReport(documentRef, locationRef) {
    const hostname = String(locationRef && locationRef.hostname || "").toLowerCase();
    const protocol = String(locationRef && locationRef.protocol || "").toLowerCase();
    const hostAllowed = ALLOWED_HOSTS.has(hostname);
    const pathKind = classifyPath(locationRef && locationRef.pathname);
    const capturedAt = safeCapturedAt();

    if (protocol !== "https:") {
      return Object.freeze({
        schemaVersion: "1",
        probeVersion: PROBE_VERSION,
        capturedAt,
        status: "blocked",
        errorCodes: Object.freeze(["PROTOCOL_NOT_ALLOWED"]),
        page: Object.freeze({ surface: "unconfirmed", hostAllowed, pathKind: "unknown" }),
        messages: Object.freeze([]),
      });
    }

    if (!hostAllowed) {
      return Object.freeze({
        schemaVersion: "1",
        probeVersion: PROBE_VERSION,
        capturedAt,
        status: "blocked",
        errorCodes: Object.freeze(["HOST_NOT_ALLOWED"]),
        page: Object.freeze({ surface: "unconfirmed", hostAllowed: false, pathKind: "unknown" }),
        messages: Object.freeze([]),
      });
    }

    if (pathKind !== "conversation") {
      return Object.freeze({
        schemaVersion: "1",
        probeVersion: PROBE_VERSION,
        capturedAt,
        status: "blocked",
        errorCodes: Object.freeze(["CONVERSATION_PATH_REQUIRED"]),
        page: Object.freeze({ surface: "chatgpt-web", hostAllowed: true, pathKind }),
        messages: Object.freeze([]),
      });
    }

    const mainRegions = documentRef && typeof documentRef.querySelectorAll === "function"
      ? Array.from(documentRef.querySelectorAll("main"))
      : [];

    if (mainRegions.length === 0) {
      return Object.freeze({
        schemaVersion: "1",
        probeVersion: PROBE_VERSION,
        capturedAt,
        status: "blocked",
        errorCodes: Object.freeze(["MAIN_REGION_NOT_FOUND"]),
        page: Object.freeze({
          surface: "chatgpt-web",
          hostAllowed: true,
          pathKind,
        }),
        messages: Object.freeze([]),
      });
    }

    if (mainRegions.length !== 1) {
      return Object.freeze({
        schemaVersion: "1",
        probeVersion: PROBE_VERSION,
        capturedAt,
        status: "blocked",
        errorCodes: Object.freeze(["MAIN_REGION_AMBIGUOUS"]),
        page: Object.freeze({ surface: "chatgpt-web", hostAllowed: true, pathKind }),
        messages: Object.freeze([]),
      });
    }

    const scan = findMessageEntries(mainRegions[0]);
    if (scan.errorCode) {
      return Object.freeze({
        schemaVersion: "1",
        probeVersion: PROBE_VERSION,
        capturedAt,
        status: "blocked",
        errorCodes: Object.freeze([scan.errorCode]),
        page: Object.freeze({ surface: "chatgpt-web", hostAllowed: true, pathKind }),
        messages: Object.freeze([]),
      });
    }

    const entries = scan.entries;
    const messages = entries.map((entry, index) =>
      summarizeMessageNode(entry.node, entry.roleNode, index));

    return Object.freeze({
      schemaVersion: "1",
      probeVersion: PROBE_VERSION,
      capturedAt,
      status: messages.length > 0 ? "observed" : "blocked",
      errorCodes: Object.freeze(messages.length > 0 ? [] : ["MESSAGE_CANDIDATES_NOT_FOUND"]),
      page: Object.freeze({
        surface: "chatgpt-web",
        hostAllowed: true,
        pathKind,
        mainRegionFound: true,
      }),
      summary: Object.freeze({
        messageCount: messages.length,
        userCount: messages.filter((message) => message.role === "user").length,
        assistantCount: messages.filter((message) => message.role === "assistant").length,
        streamingSignalCount: messages.filter((message) => message.answerStateHint === "streaming-signal").length,
      }),
      messages: Object.freeze(messages),
      limitations: Object.freeze([
        "Selector behavior is probe evidence, not a stability guarantee.",
        "Answer completion remains unconfirmed without an explicit stable signal.",
        "No raw text, source identifiers, attribute values, URLs, or DOM fragments are included.",
      ]),
    });
  }

  function run() {
    return buildReport(globalScope.document, globalScope.location);
  }

  function dispose() {
    if (globalScope.AICMReadonlyProbe === api) {
      return delete globalScope.AICMReadonlyProbe;
    }
    return false;
  }

  const api = Object.freeze({
    version: PROBE_VERSION,
    run,
    dispose,
  });

  if (Object.prototype.hasOwnProperty.call(globalScope, "AICMReadonlyProbe")) {
    throw new Error("AICM_PROBE_GLOBAL_CONFLICT");
  }

  Object.defineProperty(globalScope, "AICMReadonlyProbe", {
    value: api,
    configurable: true,
    enumerable: false,
    writable: false,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const probePath = path.join(__dirname, "chatgpt-readonly-probe.js");
const probeSource = fs.readFileSync(probePath, "utf8");

function loadProbe(context = {}) {
  vm.runInNewContext(probeSource, context);
  return { context, probe: context.AICMReadonlyProbe };
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

function runProbe(document, location = conversationLocation()) {
  const { probe } = loadProbe({ document, location });
  return { probe, report: normalize(probe.run()) };
}

class FakeNode {
  constructor({ attributes = {}, textContent = "", counts = {}, closestNode = null } = {}) {
    this.attributes = attributes;
    this.textContent = textContent;
    this.counts = counts;
    this.closestNode = closestNode;
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }

  querySelectorAll(selector) {
    return Array.from({ length: this.counts[selector] || 0 });
  }

  closest() {
    return this.closestNode;
  }
}

function createDocument(entries = [], options = {}) {
  const main = {
    querySelectorAll() {
      return entries.map((entry) => entry.roleNode);
    },
    contains(node) {
      return entries.some((entry) => entry.node === node);
    },
  };
  const mainRegions = Array.from({ length: options.mainCount ?? 1 }, () => main);

  return {
    accountLure: options.accountLure,
    querySelectorAll(selector) {
      return selector === "main" ? mainRegions : [];
    },
  };
}

function conversationLocation(overrides = {}) {
  return {
    protocol: "https:",
    hostname: "chatgpt.com",
    pathname: "/c/synthetic-conversation",
    search: "?account=account-query-lure",
    href: "https://chatgpt.com/c/synthetic-conversation?account=account-query-lure",
    ...overrides,
  };
}

test("blocks non-ChatGPT hosts before inspecting the document", () => {
  let inspected = false;
  const documentRef = { querySelectorAll() { inspected = true; return []; } };
  const { report } = runProbe(documentRef, conversationLocation({ hostname: "example.com" }));

  assert.equal(report.status, "blocked");
  assert.equal(report.schemaVersion, "2");
  assert.equal(report.errorCodes[0], "HOST_NOT_ALLOWED");
  assert.equal(inspected, false);
});

test("blocks non-HTTPS and non-conversation paths before inspecting the document", () => {
  for (const locationRef of [
    conversationLocation({ protocol: "http:" }),
    conversationLocation({ pathname: "/" }),
    conversationLocation({ pathname: "/settings" }),
  ]) {
    let inspected = false;
    const documentRef = { querySelectorAll() { inspected = true; return []; } };
    const { report } = runProbe(documentRef, locationRef);

    assert.equal(report.status, "blocked");
    assert.equal(inspected, false);
  }
});

test("emits a strict structural summary without raw content or attribute values", () => {
  const turn = new FakeNode({
    attributes: {
      "data-testid": "conversation-turn-real-identifier",
      href: "https://private.example/path",
      src: "https://private.example/image.png",
      alt: "private-image-description",
    },
    textContent: "synthetic secret-shaped text that must never be emitted",
    counts: { "p": 2, "pre": 1, "code": 1, "a": 1, "img": 1 },
  });
  const roleNode = new FakeNode({
    attributes: {
      "data-message-author-role": "assistant",
      "data-message-id": "real-message-identifier",
      "aria-busy": "true",
      "aria-label": "private-account-label",
    },
    closestNode: turn,
  });
  const documentRef = createDocument([{ node: turn, roleNode }], {
    accountLure: "private-account-region",
  });
  const { probe, report } = runProbe(documentRef);
  const serialized = JSON.stringify(report);

  assert.deepEqual(Object.keys(probe), ["version", "run", "dispose"]);
  assert.equal(probe.version, "0.2.0");
  assert.equal(report.schemaVersion, "2");
  assert.deepEqual(Object.keys(report), [
    "schemaVersion", "probeVersion", "capturedAt", "status", "errorCodes",
    "page", "summary", "messages", "limitations",
  ]);
  assert.deepEqual(Object.keys(report.messages[0]), [
    "ordinal", "role", "textLengthBucket", "answerStateHint", "stateEvidence", "structure", "attributePresence",
  ]);
  assert.equal(report.status, "observed");
  assert.equal(report.page.pathKind, "conversation");
  assert.equal(report.messages[0].role, "assistant");
  assert.equal(report.messages[0].answerStateHint, "streaming-signal");
  assert.equal(report.messages[0].stateEvidence.ariaBusyTrue, true);
  assert.deepEqual(report.messages[0].stateEvidence.completionActionKinds, []);
  assert.equal(report.messages[0].structure.paragraphs, 2);
  assert.equal(report.messages[0].structure.codeBlocks, 1);
  assert.equal(report.messages[0].attributePresence.dataMessageId, true);
  for (const lure of [
    "secret-shaped", "real-message-identifier", "real-conversation-identifier",
    "conversation-turn-real-identifier", "private.example", "private-image-description",
    "private-account-label", "private-account-region", "account-query-lure",
  ]) {
    assert.equal(serialized.includes(lure), false, `leaked lure: ${lure}`);
  }
});

test("requires a positive copy action for completion and blocks signal conflicts", () => {
  const copySelector = '[data-testid="copy-turn-action-button"]';
  const feedbackSelector = '[data-testid="good-response-turn-action-button"]';
  const completeTurn = new FakeNode({
    textContent: "synthetic completed response",
    counts: { [copySelector]: 1, [feedbackSelector]: 1 },
  });
  const completeRole = new FakeNode({
    attributes: { "data-message-author-role": "assistant" },
    closestNode: completeTurn,
  });
  const complete = runProbe(createDocument([{ node: completeTurn, roleNode: completeRole }])).report;

  const conflictTurn = new FakeNode({
    textContent: "synthetic conflicting response",
    attributes: { "aria-busy": "true" },
    counts: { [copySelector]: 1 },
  });
  const conflictRole = new FakeNode({
    attributes: { "data-message-author-role": "assistant" },
    closestNode: conflictTurn,
  });
  const conflict = runProbe(createDocument([{ node: conflictTurn, roleNode: conflictRole }])).report;

  const feedbackOnlyTurn = new FakeNode({
    textContent: "synthetic feedback-only response",
    counts: { [feedbackSelector]: 1 },
  });
  const feedbackOnlyRole = new FakeNode({
    attributes: { "data-message-author-role": "assistant" },
    closestNode: feedbackOnlyTurn,
  });
  const feedbackOnly = runProbe(createDocument([{ node: feedbackOnlyTurn, roleNode: feedbackOnlyRole }])).report;

  const userTurn = new FakeNode({
    textContent: "synthetic user message",
    counts: { [copySelector]: 1 },
  });
  const userRole = new FakeNode({
    attributes: { "data-message-author-role": "user" },
    closestNode: userTurn,
  });
  const user = runProbe(createDocument([{ node: userTurn, roleNode: userRole }])).report;

  assert.equal(complete.messages[0].answerStateHint, "completed-signal");
  assert.deepEqual(complete.messages[0].stateEvidence.completionActionKinds, [
    "copy-action", "positive-feedback-action",
  ]);
  assert.equal(complete.summary.completedSignalCount, 1);
  assert.equal(conflict.messages[0].answerStateHint, "conflicting-signals");
  assert.equal(conflict.summary.streamingSignalCount, 1);
  assert.equal(conflict.summary.conflictingSignalCount, 1);
  assert.equal(feedbackOnly.messages[0].answerStateHint, "unconfirmed");
  assert.equal(user.messages[0].answerStateHint, "unconfirmed");
  assert.deepEqual(user.messages[0].stateEvidence.completionActionKinds, []);
});

test("deduplicates only same-role candidates for the same turn", () => {
  const turn = new FakeNode({ textContent: "synthetic" });
  const firstRole = new FakeNode({
    attributes: { "data-message-author-role": "user" },
    closestNode: turn,
  });
  const duplicateRole = new FakeNode({
    attributes: { "data-message-author-role": "user" },
    closestNode: turn,
  });
  const { report } = runProbe(createDocument([
      { node: turn, roleNode: firstRole },
      { node: turn, roleNode: duplicateRole },
    ]));

  assert.equal(report.summary.messageCount, 1);
});

test("blocks missing, ambiguous, empty, and role-conflicting roots", () => {
  const missing = runProbe(createDocument([], { mainCount: 0 })).report;
  const ambiguous = runProbe(createDocument([], { mainCount: 2 })).report;
  const empty = runProbe(createDocument([])).report;

  const turn = new FakeNode({ textContent: "synthetic" });
  const userRole = new FakeNode({ attributes: { "data-message-author-role": "user" }, closestNode: turn });
  const assistantRole = new FakeNode({ attributes: { "data-message-author-role": "assistant" }, closestNode: turn });
  const conflict = runProbe(createDocument([
    { node: turn, roleNode: userRole },
    { node: turn, roleNode: assistantRole },
  ])).report;

  assert.equal(missing.errorCodes[0], "MAIN_REGION_NOT_FOUND");
  assert.equal(ambiguous.errorCodes[0], "MAIN_REGION_AMBIGUOUS");
  assert.equal(empty.errorCodes[0], "MESSAGE_CANDIDATES_NOT_FOUND");
  assert.equal(conflict.errorCodes[0], "ROLE_CONTAINER_CONFLICT");
  assert.equal(conflict.status, "blocked");
});

test("blocks excessive candidates and containers outside the unique root", () => {
  const excessiveEntries = Array.from({ length: 501 }, () => {
    const roleNode = new FakeNode({ attributes: { "data-message-author-role": "user" } });
    return { node: roleNode, roleNode };
  });
  const excessive = runProbe(createDocument(excessiveEntries)).report;

  const outsideRole = new FakeNode({ attributes: { "data-message-author-role": "assistant" } });
  const outsideMain = {
    querySelectorAll() { return [outsideRole]; },
    contains() { return false; },
  };
  const outsideDocument = {
    querySelectorAll(selector) { return selector === "main" ? [outsideMain] : []; },
  };
  const outside = runProbe(outsideDocument).report;

  assert.equal(excessive.errorCodes[0], "MESSAGE_CANDIDATE_LIMIT_EXCEEDED");
  assert.equal(outside.errorCodes[0], "MESSAGE_CONTAINER_OUTSIDE_ROOT");
  assert.equal(excessive.status, "blocked");
  assert.equal(outside.status, "blocked");
});

test("global installation blocks collisions and can be explicitly disposed", () => {
  const context = {};
  const { probe } = loadProbe(context);

  assert.throws(() => vm.runInNewContext(probeSource, context), /AICM_PROBE_GLOBAL_CONFLICT/);
  assert.equal(probe.dispose(), true);
  assert.equal(Object.prototype.hasOwnProperty.call(context, "AICMReadonlyProbe"), false);
  assert.doesNotThrow(() => vm.runInNewContext(probeSource, context));
});

test("source contains no external I/O or page interaction APIs", () => {
  const forbiddenPatterns = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bEventSource\b/,
    /\bsendBeacon\b/,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bindexedDB\b/,
    /\bcaches\s*\./,
    /\.\s*cookie\b/,
    /(?:navigator|globalScope)\s*\.\s*clipboard\b/i,
    /\bcreateObjectURL\s*\(/,
    /\bexecCommand\s*\(/,
    /\.\s*(?:click|submit|requestSubmit|focus|scroll|scrollTo|scrollIntoView)\s*\(/,
    /(?:location|locationRef)\s*\.\s*(?:assign|replace|reload)\s*\(/,
  ];

  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(probeSource), false, `forbidden API matched: ${pattern}`);
  }
});

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
  constructor({ attributes = {}, closestNode = null, throwAttributes = [] } = {}) {
    this.attributes = attributes;
    this.closestNode = closestNode;
    this.throwAttributes = new Set(throwAttributes);
  }

  getAttribute(name) {
    if (this.throwAttributes.has(name)) throw new Error("synthetic attribute read failure");
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
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
    ...overrides,
  };
}

function messageEntry({ role, messageId, testId, nodeMessageId, nodeTestId, throwNodeAttributes = [], throwRoleAttributes = [] }) {
  const node = new FakeNode({
    attributes: {
      ...(nodeMessageId === undefined && messageId !== undefined ? { "data-message-id": messageId } : {}),
      ...(nodeTestId === undefined && testId !== undefined ? { "data-testid": testId } : {}),
      ...(nodeMessageId !== undefined ? { "data-message-id": nodeMessageId } : {}),
      ...(nodeTestId !== undefined ? { "data-testid": nodeTestId } : {}),
    },
    throwAttributes: throwNodeAttributes,
  });
  const roleNode = new FakeNode({
    attributes: {
      "data-message-author-role": role,
      ...(messageId !== undefined ? { "data-message-id": messageId } : {}),
      ...(testId !== undefined ? { "data-testid": testId } : {}),
    },
    closestNode: node,
    throwAttributes: throwRoleAttributes,
  });
  return { node, roleNode };
}

function s1Entries(overrides = []) {
  const roles = ["user", "assistant", "user", "assistant", "user", "assistant"];
  return roles.map((role, index) => messageEntry({
    role,
    messageId: `synthetic-message-${index + 1}`,
    testId: `synthetic-turn-${index + 1}`,
    ...(overrides[index] || {}),
  }));
}

test("blocks non-ChatGPT hosts, protocols, and paths with the schema 3 terminal shape", () => {
  for (const location of [
    conversationLocation({ hostname: "example.com" }),
    conversationLocation({ protocol: "http:" }),
    conversationLocation({ pathname: "/settings" }),
  ]) {
    let inspected = false;
    const documentRef = { querySelectorAll() { inspected = true; return []; } };
    const { report } = runProbe(documentRef, location);

    assert.equal(report.status, "blocked");
    assert.equal(report.schemaVersion, "3");
    assert.equal(report.probeVersion, "0.3.0");
    assert.equal(report.summary.valueExposure, "none");
    assert.deepEqual(report.candidateStrategies, []);
    assert.equal(inspected, false);
  }
});

test("emits only a fixed non-exposing identity summary", () => {
  const entries = s1Entries();
  const { probe, report } = runProbe(createDocument(entries));
  const serialized = JSON.stringify(report);

  assert.deepEqual(Object.keys(probe), ["version", "run", "dispose"]);
  assert.equal(probe.version, "0.3.0");
  assert.deepEqual(Object.keys(report), [
    "schemaVersion", "probeVersion", "policyVersion", "capturedAt", "status", "errorCodes",
    "page", "summary", "candidateStrategies", "limitations",
  ]);
  assert.deepEqual(Object.keys(report.page), ["surface", "hostAllowed", "pathKind", "mainRegionFound"]);
  assert.deepEqual(Object.keys(report.summary), [
    "messageCount", "userCount", "assistantCount", "strategyCount", "conflictCount", "valueExposure",
  ]);
  assert.equal(report.status, "observed");
  assert.equal(report.errorCodes.length, 0);
  assert.equal(report.page.pathKind, "conversation");
  assert.equal(report.summary.messageCount, 6);
  assert.equal(report.summary.userCount, 3);
  assert.equal(report.summary.assistantCount, 3);
  assert.equal(report.summary.strategyCount, 2);
  assert.equal(report.summary.conflictCount, 0);
  assert.equal(report.summary.valueExposure, "none");
  assert.match(report.capturedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.deepEqual(report.candidateStrategies.map((strategy) => strategy.strategyId), [
    "data-message-id", "data-testid-role",
  ]);
  for (const strategy of report.candidateStrategies) {
    assert.equal(strategy.candidateStatus, "unique");
    assert.equal(strategy.evidenceConfidence, "low");
    assert.equal(strategy.valueExposure, "none");
    assert.equal(strategy.eligibleCount, 6);
    assert.equal(strategy.presentCount, 6);
    assert.equal(strategy.emptyCount, 0);
    assert.equal(strategy.readErrorCount, 0);
    assert.equal(strategy.distinctCount, 6);
    assert.equal(strategy.duplicateGroupCount, 0);
    assert.equal(strategy.roleConflictCount, 0);
  }
  assert.deepEqual(report.limitations, []);
  for (const lure of ["synthetic-message-1", "synthetic-message-2", "synthetic-turn-1", "synthetic-turn-2"]) {
    assert.equal(serialized.includes(lure), false, `leaked lure: ${lure}`);
  }
});

test("reports duplicate, partial, and role-conflict candidates without exposing values", () => {
  const entries = s1Entries([
    { messageId: "same-id", testId: "same-test" },
    { messageId: "same-id", testId: "other-test" },
    { messageId: undefined, testId: "third-test" },
  ]);
  const { report } = runProbe(createDocument(entries));
  const byId = report.candidateStrategies[0];
  const byTest = report.candidateStrategies[1];

  assert.equal(byId.candidateStatus, "ambiguous");
  assert.equal(byId.presentCount, 5);
  assert.equal(byId.emptyCount, 1);
  assert.equal(byId.distinctCount, 4);
  assert.equal(byId.duplicateGroupCount, 1);
  assert.equal(byId.roleConflictCount, 1);
  assert.equal(byTest.candidateStatus, "unique");
  assert.equal(byTest.presentCount, 6);
  assert.equal(byTest.distinctCount, 6);
  assert.equal(report.summary.conflictCount, 1);
  assert.deepEqual(report.limitations, ["CANDIDATE_EMPTY", "DUPLICATE_CANDIDATE", "ROLE_CONFLICT"]);
  const serialized = JSON.stringify(report);
  for (const lure of ["same-id", "same-test", "other-test", "third-test"]) {
    assert.equal(serialized.includes(lure), false, `leaked lure: ${lure}`);
  }
});

test("keeps isolated candidate read errors in an observed ambiguous summary", () => {
  const entries = s1Entries([
    {
      messageId: "safe-id",
      testId: "safe-test",
      throwNodeAttributes: ["data-message-id"],
      throwRoleAttributes: ["data-message-id"],
    },
  ]);
  const report = runProbe(createDocument(entries)).report;
  const byId = report.candidateStrategies[0];

  assert.equal(report.status, "observed");
  assert.equal(byId.candidateStatus, "ambiguous");
  assert.equal(byId.readErrorCount, 1);
  assert.equal(byId.presentCount, 5);
  assert.equal(byId.emptyCount, 0);
  assert.deepEqual(report.limitations, ["VALUE_READ_ERROR"]);
  assert.deepEqual(report.errorCodes, []);
});

test("blocks missing, ambiguous, empty, conflicting, and excessive roots", () => {
  const missing = runProbe(createDocument([], { mainCount: 0 })).report;
  const ambiguous = runProbe(createDocument([], { mainCount: 2 })).report;
  const empty = runProbe(createDocument([])).report;

  const turn = new FakeNode();
  const userRole = new FakeNode({ attributes: { "data-message-author-role": "user" }, closestNode: turn });
  const assistantRole = new FakeNode({ attributes: { "data-message-author-role": "assistant" }, closestNode: turn });
  const conflict = runProbe(createDocument([
    { node: turn, roleNode: userRole },
    { node: turn, roleNode: assistantRole },
  ])).report;

  const excessiveEntries = Array.from({ length: 21 }, () => messageEntry({ role: "user" }));
  const excessive = runProbe(createDocument(excessiveEntries)).report;

  assert.equal(missing.errorCodes[0], "MAIN_REGION_NOT_FOUND");
  assert.equal(ambiguous.errorCodes[0], "MAIN_REGION_AMBIGUOUS");
  assert.equal(empty.errorCodes[0], "MESSAGE_CANDIDATES_NOT_FOUND");
  assert.equal(conflict.errorCodes[0], "ROLE_CONTAINER_CONFLICT");
  assert.equal(excessive.errorCodes[0], "MESSAGE_CANDIDATE_LIMIT_EXCEEDED");
  for (const report of [missing, ambiguous, empty, conflict, excessive]) {
    assert.equal(report.status, "blocked");
    assert.deepEqual(report.candidateStrategies, []);
  }
});

test("enforces the S1 six-message alternating shape before candidate reads", () => {
  let candidateReads = 0;
  const makeRoleNode = (role) => ({
    getAttribute(name) {
      if (name === "data-message-author-role") return role;
      candidateReads += 1;
      throw new Error("candidate-value-lure");
    },
    closest() { return this; },
  });
  const invalidEntries = ["user", "assistant"].map((role) => {
    const roleNode = makeRoleNode(role);
    return { node: roleNode, roleNode };
  });
  const report = runProbe(createDocument(invalidEntries)).report;

  assert.equal(report.status, "blocked");
  assert.deepEqual(report.errorCodes, ["S1_SHAPE_REQUIRED"]);
  assert.deepEqual(report.candidateStrategies, []);
  assert.equal(candidateReads, 0);
});

test("contains page getter and DOM method failures behind a fixed runtime error", () => {
  const closestFailure = s1Entries();
  closestFailure[0].roleNode.closest = () => { throw new Error("closest-value-lure"); };
  const closestReport = runProbe(createDocument(closestFailure)).report;

  const main = {
    querySelectorAll() { return s1Entries().map((entry) => entry.roleNode); },
    contains() { throw new Error("contains-value-lure"); },
  };
  const containsReport = runProbe({ querySelectorAll(selector) {
    return selector === "main" ? [main] : [];
  } }).report;

  for (const report of [closestReport, containsReport]) {
    assert.equal(report.status, "error");
    assert.deepEqual(report.errorCodes, ["PROBE_RUNTIME_FAILURE"]);
    assert.deepEqual(report.candidateStrategies, []);
    assert.equal(JSON.stringify(report).includes("lure"), false);
  }
});

test("contains location and clock failures without exposing exception text", () => {
  const hostileLocation = {};
  Object.defineProperty(hostileLocation, "hostname", {
    get() { throw new Error("location-value-lure"); },
  });
  const locationContext = { document: createDocument(s1Entries()), location: hostileLocation };
  const locationReport = normalize(loadProbe(locationContext).probe.run());

  let inspected = 0;
  const clockContext = {
    document: {
      querySelectorAll() { inspected += 1; return []; },
    },
    location: conversationLocation(),
    Date: class BrokenDate {
      toISOString() { throw new Error("clock-value-lure"); }
    },
  };
  const clockReport = normalize(loadProbe(clockContext).probe.run());

  for (const report of [locationReport, clockReport]) {
    assert.equal(report.status, "error");
    assert.deepEqual(report.errorCodes, ["PROBE_RUNTIME_FAILURE"]);
    assert.equal(JSON.stringify(report).includes("lure"), false);
  }
  assert.equal(inspected, 0);
  assert.equal(clockReport.capturedAt, null);
});

test("deduplicates only same-role candidates for the same turn", () => {
  const turn = new FakeNode();
  const firstRole = new FakeNode({ attributes: { "data-message-author-role": "user" }, closestNode: turn });
  const duplicateRole = new FakeNode({ attributes: { "data-message-author-role": "user" }, closestNode: turn });
  const { report } = runProbe(createDocument([
    { node: turn, roleNode: firstRole },
    { node: turn, roleNode: duplicateRole },
    ...s1Entries().map((entry) => entry).slice(1),
  ]));

  assert.equal(report.summary.messageCount, 6);
});

test("enforces two run calls and does not inspect the page after the quota", () => {
  let inspected = 0;
  const documentRef = {
    querySelectorAll(selector) {
      inspected += 1;
      return selector === "main" ? [] : [];
    },
  };
  const { probe } = loadProbe({ document: documentRef, location: conversationLocation() });

  const first = normalize(probe.run());
  const second = normalize(probe.run());
  const beforeThird = inspected;
  const third = normalize(probe.run());

  assert.equal(first.status, "blocked");
  assert.equal(second.status, "blocked");
  assert.equal(third.status, "blocked");
  assert.deepEqual(third.errorCodes, ["RUN_QUOTA_EXHAUSTED"]);
  assert.equal(inspected, beforeThird);
});

test("global installation blocks collisions and can be explicitly disposed", () => {
  const context = {};
  const { probe } = loadProbe(context);

  assert.throws(() => vm.runInNewContext(probeSource, context), /AICM_PROBE_GLOBAL_CONFLICT/);
  assert.equal(probe.dispose(), true);
  assert.equal(probe.dispose(), false);
  assert.equal(Object.prototype.hasOwnProperty.call(context, "AICMReadonlyProbe"), false);
  assert.doesNotThrow(() => vm.runInNewContext(probeSource, context));
});

test("disposed references cannot inspect the page or revive the run quota", () => {
  let inspected = 0;
  const documentRef = {
    querySelectorAll(selector) {
      inspected += 1;
      return selector === "main" ? [] : [];
    },
  };
  const { probe } = loadProbe({ document: documentRef, location: conversationLocation() });

  probe.run();
  const beforeDispose = inspected;
  assert.equal(probe.dispose(), true);
  const afterDispose = normalize(probe.run());

  assert.equal(inspected, beforeDispose);
  assert.equal(afterDispose.status, "blocked");
  assert.deepEqual(afterDispose.errorCodes, ["PROBE_DISPOSED"]);
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

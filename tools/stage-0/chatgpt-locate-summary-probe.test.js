"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const probePath = path.join(__dirname, "chatgpt-locate-summary-probe.js");
const probeSource = fs.readFileSync(probePath, "utf8");

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(name, callback) {
      const callbacks = listeners.get(name) || new Set();
      callbacks.add(callback);
      listeners.set(name, callbacks);
    },
    removeEventListener(name, callback) {
      const callbacks = listeners.get(name);
      if (callbacks) callbacks.delete(callback);
    },
    dispatch(name) {
      for (const callback of Array.from(listeners.get(name) || [])) callback({ type: name });
    },
    listenerCount(name) {
      return (listeners.get(name) || new Set()).size;
    },
  };
}

class FakeMutationObserver {
  static instances = [];

  constructor(callback) {
    this.callback = callback;
    this.connected = false;
    this.targets = [];
    FakeMutationObserver.instances.push(this);
  }

  observe(target, options) {
    this.targets.push({ target, options });
    this.connected = true;
  }

  disconnect() {
    this.connected = false;
  }

  trigger(records = []) {
    if (this.connected) this.callback(records, this);
  }
}

class FakeNode {
  constructor({ role, root = null, rect = null } = {}) {
    this.role = role;
    this.root = root || this;
    this.rect = rect || { top: -300, left: 20, width: 600, height: 100 };
    this.scrollCalls = [];
    this.attributes = role ? { "data-message-author-role": role } : {};
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  closest() {
    return this.root;
  }

  getBoundingClientRect() {
    return { ...this.rect, right: this.rect.left + this.rect.width, bottom: this.rect.top + this.rect.height };
  }

  scrollIntoView(options) {
    this.scrollCalls.push(options);
    this.rect = { top: 100, left: 20, width: 600, height: 100 };
  }
}

class FakeOverlay {
  constructor(parent, removeFailures) {
    this.parentNode = null;
    this.parent = parent;
    this.removeFailures = removeFailures;
    this.style = {};
    this.attributes = {};
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }
}

function createDocument(entries, options = {}) {
  const documentEvents = eventTarget();
  const body = {
    children: [],
    removeCalls: 0,
    appendChild(node) {
      node.parentNode = body;
      body.children.push(node);
      return node;
    },
    removeChild(node) {
      body.removeCalls += 1;
      if ((options.removeFailures || 0) > 0) {
        options.removeFailures -= 1;
        throw new Error("synthetic cleanup failure");
      }
      const index = body.children.indexOf(node);
      if (index >= 0) body.children.splice(index, 1);
      node.parentNode = null;
      return node;
    },
  };
  const main = {
    querySelectorAll(selector) {
      if (selector === '[data-message-author-role="user"], [data-message-author-role="assistant"]') {
        return entries.map((entry) => entry.roleNode);
      }
      if (selector === '[data-message-author-role="user"]') {
        return entries.filter((entry) => entry.roleNode.role === "user").map((entry) => entry.roleNode);
      }
      if (selector === '[data-message-author-role="assistant"]') {
        return entries.filter((entry) => entry.roleNode.role === "assistant").map((entry) => entry.roleNode);
      }
      return [];
    },
    contains(node) {
      return entries.some((entry) => entry.root === node || entry.roleNode === node);
    },
  };
  main.parentNode = body;
  const documentRef = {
    ...documentEvents,
    body,
    documentElement: body,
    querySelectorAll(selector) {
      return selector === "main" ? [main] : [];
    },
    contains(node) {
      return node === main || body.children.includes(node);
    },
    createElement() {
      return new FakeOverlay(body, options.removeFailures || 0);
    },
  };
  return { documentRef, main, body, documentEvents };
}

function s1Entries() {
  const roles = ["user", "assistant", "user", "assistant", "user", "assistant"];
  return roles.map((role) => {
    const root = new FakeNode({ role: null });
    const roleNode = new FakeNode({ role, root });
    return { root, roleNode };
  });
}

function conversationLocation(overrides = {}) {
  return {
    protocol: "https:",
    hostname: "chatgpt.com",
    pathname: "/c/synthetic-conversation",
    ...overrides,
  };
}

function loadProbe({ entries = s1Entries(), location = conversationLocation(), documentOptions = {}, overrides = {}, documentGetter } = {}) {
  FakeMutationObserver.instances = [];
  const { documentRef, main, body, documentEvents } = createDocument(entries, documentOptions);
  const windowEvents = eventTarget();
  const context = {
    document: documentRef,
    location,
    innerHeight: 800,
    innerWidth: 1000,
    MutationObserver: FakeMutationObserver,
    setTimeout,
    clearTimeout,
    ...windowEvents,
    ...overrides,
  };
  if (documentGetter) {
    Object.defineProperty(context, "document", { configurable: true, get: documentGetter });
  }
  vm.runInNewContext(probeSource, context);
  return { context, probe: context.AICMLocateSummaryProbe, documentRef, main, body, documentEvents, windowEvents, entries };
}

async function run(probe) {
  return normalize(await probe.run());
}

test("uses one manual-run lifecycle to scroll, visually confirm, highlight, and clean up", async () => {
  const loaded = loadProbe();
  assert.equal(loaded.body.children.length, 0);
  const report = await run(loaded.probe);
  const target = loaded.entries[3].root;

  assert.equal(report.status, "observed");
  assert.deepEqual(report.errorCodes, []);
  assert.equal(report.page.surface, "chatgpt-web");
  assert.equal(report.page.pathKind, "conversation");
  assert.deepEqual(report.summary, {
    messageCount: 6,
    userCount: 3,
    assistantCount: 3,
    targetOrdinal: 4,
    targetRole: "assistant",
    targetCount: 1,
    scrollAttempted: true,
    scrollConfirmed: true,
    focusConfirmed: true,
    highlightApplied: true,
    highlightCleared: true,
    valueExposure: "none",
  });
  assert.deepEqual(report.limitations, [
    "TARGET_IS_EPHEMERAL",
    "LOW_LOCATION_CONFIDENCE",
    "NO_STABLE_ID_CONCLUSION",
  ]);
  assert.equal(JSON.stringify(target.scrollCalls), JSON.stringify([{ block: "center", behavior: "auto" }]));
  assert.equal(loaded.body.children.length, 0);
  assert.equal(JSON.stringify(report).includes("synthetic"), false);
});

test("keeps the sentinel across R01/R02 and disposes after R02", async () => {
  const loaded = loadProbe();
  const first = await run(loaded.probe);
  const second = await run(loaded.probe);
  const third = await run(loaded.probe);

  assert.equal(first.status, "observed");
  assert.equal(second.status, "observed");
  assert.equal(second.capturedAt === first.capturedAt, false);
  assert.equal(third.status, "blocked");
  assert.deepEqual(third.errorCodes, ["PROBE_DISPOSED"]);
  assert.equal(third.capturedAt, null);
  assert.equal(loaded.body.children.length, 0);
  assert.equal(loaded.documentEvents.listenerCount("pagehide"), 0);
  assert.equal(FakeMutationObserver.instances[0].connected, false);
});

test("blocks non-ChatGPT pages before reading the main region", async () => {
  let inspected = 0;
  const loaded = loadProbe({ location: conversationLocation({ hostname: "example.com" }) });
  loaded.documentRef.querySelectorAll = () => {
    inspected += 1;
    return [];
  };
  const report = await run(loaded.probe);

  assert.equal(report.status, "blocked");
  assert.deepEqual(report.errorCodes, ["HOST_NOT_ALLOWED"]);
  assert.equal(report.page.surface, "unknown");
  assert.equal(inspected, 0);
});

test("enforces the six-message alternating S1 shape before any action", async () => {
  const entries = s1Entries().slice(0, 4);
  const loaded = loadProbe({ entries });
  const report = await run(loaded.probe);

  assert.equal(report.status, "blocked");
  assert.deepEqual(report.errorCodes, ["S1_SHAPE_REQUIRED"]);
  assert.equal(report.summary.targetCount, 0);
  assert.equal(loaded.body.children.length, 0);
});

test("locks the session when the page is hidden or paged away", async () => {
  const loaded = loadProbe();
  const first = await run(loaded.probe);
  let inspectedAfterSignal = 0;
  const originalQuery = loaded.documentRef.querySelectorAll;
  loaded.documentRef.querySelectorAll = (...args) => {
    inspectedAfterSignal += 1;
    return originalQuery(...args);
  };
  loaded.documentEvents.dispatch("visibilitychange");
  const second = await run(loaded.probe);

  assert.equal(first.status, "observed");
  assert.equal(second.status, "error");
  assert.deepEqual(second.errorCodes, ["CONVERSATION_CHANGED"]);
  assert.equal(second.summary.targetCount, 0);
  assert.equal(inspectedAfterSignal, 0);
  assert.equal(loaded.probe.dispose(), false);

  const paged = loadProbe();
  await run(paged.probe);
  let inspectedAfterPagehide = 0;
  const originalPagedQuery = paged.documentRef.querySelectorAll;
  paged.documentRef.querySelectorAll = (...args) => {
    inspectedAfterPagehide += 1;
    return originalPagedQuery(...args);
  };
  paged.windowEvents.dispatch("pagehide");
  const pagehideReport = await run(paged.probe);
  assert.equal(pagehideReport.status, "error");
  assert.deepEqual(pagehideReport.errorCodes, ["CONVERSATION_CHANGED"]);
  assert.equal(inspectedAfterPagehide, 0);
  assert.equal(paged.windowEvents.listenerCount("pagehide"), 0);
});

test("locks the session when the main region is replaced", async () => {
  const loaded = loadProbe();
  await run(loaded.probe);
  const observer = FakeMutationObserver.instances[0];
  observer.trigger([{ target: loaded.body, removedNodes: [loaded.main], addedNodes: [{}] }]);
  let inspected = 0;
  const originalQuery = loaded.documentRef.querySelectorAll;
  loaded.documentRef.querySelectorAll = (...args) => {
    inspected += 1;
    return originalQuery(...args);
  };
  const report = await run(loaded.probe);

  assert.equal(report.status, "error");
  assert.deepEqual(report.errorCodes, ["CONVERSATION_CHANGED"]);
  assert.equal(inspected, 0);
});

test("does not trust an external node that reuses the overlay marker", async () => {
  const loaded = loadProbe();
  await run(loaded.probe);
  const externalOverlay = {
    getAttribute(name) {
      return name === "data-aicm-locate-overlay" ? "true" : null;
    },
  };
  const observer = FakeMutationObserver.instances[0];
  observer.trigger([{ target: loaded.body, addedNodes: [externalOverlay], removedNodes: [] }]);
  const report = await run(loaded.probe);

  assert.equal(report.status, "error");
  assert.deepEqual(report.errorCodes, ["CONVERSATION_CHANGED"]);
  assert.equal(loaded.body.children.length, 0);
});

test("invalidates same-shaped path changes and content mutations", async () => {
  const pathChanged = loadProbe();
  await run(pathChanged.probe);
  pathChanged.context.location.pathname = "/c/another-synthetic-conversation";
  const pathReport = await run(pathChanged.probe);
  assert.equal(pathReport.status, "error");
  assert.deepEqual(pathReport.errorCodes, ["CONVERSATION_CHANGED"]);

  const contentChanged = loadProbe();
  await run(contentChanged.probe);
  const observer = FakeMutationObserver.instances[0];
  observer.trigger([{ type: "characterData", target: contentChanged.entries[0].roleNode }]);
  const contentReport = await run(contentChanged.probe);
  assert.equal(contentReport.status, "error");
  assert.deepEqual(contentReport.errorCodes, ["CONVERSATION_CHANGED"]);
});

test("rechecks the current path during an action even without a history event", async () => {
  const loaded = loadProbe();
  const target = loaded.entries[3].root;
  target.scrollIntoView = () => {
    loaded.context.location.pathname = "/c/path-changed-without-event";
    target.rect = { top: 100, left: 20, width: 600, height: 100 };
  };
  const report = await run(loaded.probe);

  assert.equal(report.status, "error");
  assert.deepEqual(report.errorCodes, ["CONVERSATION_CHANGED"]);
  assert.equal(loaded.body.children.length, 0);
});

test("reports a cleanup warning only when the watchdog eventually clears the overlay", async () => {
  const loaded = loadProbe({ documentOptions: { removeFailures: 1 } });
  const report = await run(loaded.probe);

  assert.equal(report.status, "observed");
  assert.equal(report.summary.highlightCleared, true);
  assert.deepEqual(report.limitations, [
    "TARGET_IS_EPHEMERAL",
    "LOW_LOCATION_CONFIDENCE",
    "NO_STABLE_ID_CONCLUSION",
    "HIGHLIGHT_CLEANUP_WARNING",
  ]);
  assert.equal(loaded.body.children.length, 0);
});

test("does not report success when pagehide arrives during the highlight window", async () => {
  let loaded;
  const reportPromise = (() => {
    loaded = loadProbe({
      overrides: {
        setTimeout(callback, delay) {
          return setTimeout(() => {
            if (delay === 50) loaded.windowEvents.dispatch("pagehide");
            callback();
          }, delay);
        },
      },
    });
    return loaded.probe.run();
  })();
  const report = normalize(await reportPromise);

  assert.equal(report.status, "error");
  assert.deepEqual(report.errorCodes, ["CONVERSATION_CHANGED"]);
  assert.equal(report.summary.highlightApplied, true);
  assert.equal(report.summary.highlightCleared, true);
  assert.equal(loaded.body.children.length, 0);
});

test("aborts pending viewport work after dispose without a later page read", async () => {
  const pendingTimers = [];
  const loaded = loadProbe({
    overrides: {
      setTimeout(callback, delay) {
        const handle = { callback, delay, cancelled: false };
        pendingTimers.push(handle);
        return handle;
      },
      clearTimeout(handle) {
        handle.cancelled = true;
      },
    },
  });
  const target = loaded.entries[3].root;
  let rectReads = 0;
  const originalRect = target.getBoundingClientRect.bind(target);
  target.getBoundingClientRect = () => {
    rectReads += 1;
    return originalRect();
  };
  target.scrollIntoView = () => {};
  const running = loaded.probe.run();
  await Promise.resolve();
  await Promise.resolve();
  const readsBeforeDispose = rectReads;
  assert.ok(pendingTimers.length > 0);
  assert.equal(loaded.probe.dispose(), true);
  const report = normalize(await running);

  assert.equal(report.status, "error");
  assert.deepEqual(report.errorCodes, ["PROBE_DISPOSED"]);
  for (const timer of pendingTimers) timer.callback();
  assert.equal(rectReads, readsBeforeDispose);
  assert.equal(loaded.body.children.length, 0);
});

test("dispose during highlight removes the overlay once and blocks late cleanup", async () => {
  let loaded;
  const reportPromise = (() => {
    loaded = loadProbe({
      overrides: {
        setTimeout(callback, delay) {
          return setTimeout(() => {
            if (delay === 50) loaded.probe.dispose();
            callback();
          }, delay);
        },
      },
    });
    return loaded.probe.run();
  })();
  const report = await run({ run: () => reportPromise });

  assert.equal(report.status, "error");
  assert.deepEqual(report.errorCodes, ["PROBE_DISPOSED"]);
  assert.equal(loaded.body.children.length, 0);
  assert.equal(loaded.body.removeCalls, 1);
});

test("fails closed when highlight cleanup never succeeds", async () => {
  const loaded = loadProbe({ documentOptions: { removeFailures: Number.MAX_SAFE_INTEGER } });
  const report = await run(loaded.probe);

  assert.equal(report.status, "error");
  assert.deepEqual(report.errorCodes, ["HIGHLIGHT_CLEANUP_FAILED"]);
  assert.equal(report.summary.targetCount, 1);
  assert.equal(report.summary.highlightApplied, true);
  assert.equal(report.summary.highlightCleared, false);
  assert.equal(loaded.body.children.length, 1);
  assert.equal(loaded.body.children[0].style.visibility, "hidden");
  assert.equal(loaded.body.children[0].style.opacity, "0");
  assert.equal(loaded.body.children[0].style.pointerEvents, "none");
});

test("returns a fixed null-timestamp runtime terminal without reading the page", async () => {
  let inspected = 0;
  const loaded = loadProbe({
    overrides: {
      Date: class BrokenDate {
        toISOString() {
          throw new Error("clock-value-lure");
        }
      },
    },
  });
  loaded.documentRef.querySelectorAll = () => {
    inspected += 1;
    return [];
  };
  const report = await run(loaded.probe);

  assert.equal(report.status, "error");
  assert.deepEqual(report.errorCodes, ["PROBE_RUNTIME_FAILURE"]);
  assert.equal(report.capturedAt, null);
  assert.deepEqual(report.page, {
    surface: "unknown",
    hostAllowed: false,
    pathKind: "unknown",
    mainRegionFound: false,
  });
  assert.equal(inspected, 0);
});

test("contains a document getter exception behind a fixed runtime terminal", async () => {
  const withGetter = loadProbe();
  vm.runInNewContext(
    "Object.defineProperty(globalThis, 'document', { configurable: true, get() { throw new Error('document-value-lure'); } });",
    withGetter.context,
  );
  const report = await run(withGetter.probe);

  assert.equal(report.status, "error");
  assert.equal(JSON.stringify(report.errorCodes), JSON.stringify(["PROBE_RUNTIME_FAILURE"]));
  assert.equal(JSON.stringify(report).includes("document-value-lure"), false);
});

test("terminates a controlled slow action at the fixed run deadline", async () => {
  const pendingTimers = [];
  const loaded = loadProbe({
    overrides: {
      setTimeout(callback, delay) {
        const handle = { callback, delay, cancelled: false };
        pendingTimers.push(handle);
        return handle;
      },
      clearTimeout(handle) {
        handle.cancelled = true;
      },
    },
  });
  const running = loaded.probe.run();
  await Promise.resolve();
  await Promise.resolve();
  const deadlineTimer = pendingTimers.find((timer) => timer.delay === 5000);
  assert.ok(deadlineTimer, "run deadline timer was not installed");
  const target = loaded.entries[3].root;
  let rectReads = 0;
  const originalRect = target.getBoundingClientRect.bind(target);
  target.getBoundingClientRect = () => {
    rectReads += 1;
    return originalRect();
  };
  deadlineTimer.callback();
  const report = await running;
  const readsAfterDeadline = rectReads;
  for (const timer of pendingTimers) {
    if (!timer.cancelled && timer !== deadlineTimer) timer.callback();
  }

  assert.equal(report.status, "error");
  assert.equal(JSON.stringify(report.errorCodes), JSON.stringify(["PROBE_RUNTIME_FAILURE"]));
  assert.equal(loaded.body.children.length, 0);
  assert.equal(rectReads, readsAfterDeadline);
});

test("does not expose forbidden I/O, focus, click, or conversation mutation APIs", () => {
  const forbiddenPatterns = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bEventSource\b/,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bindexedDB\b/,
    /\.\s*(?:click|submit|requestSubmit|focus)\s*\(/,
    /(?:location|locationRef)\s*\.\s*(?:assign|replace|reload)\s*\(/,
  ];
  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(probeSource), false, `forbidden API matched: ${pattern}`);
  }
});

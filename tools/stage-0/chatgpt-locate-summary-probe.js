/*
 * T0-03 ChatGPT temporary locate-summary probe.
 *
 * This is isolated Stage 0 evidence tooling, not extension production code.
 * It is intentionally limited to one synthetic S1 target (ordinal 4,
 * assistant). It emits only a fixed diagnostic summary. It never reads or
 * returns message text, source attribute values, URLs, cookies, or network
 * data, and it never clicks or changes conversation state.
 */
(function installLocateSummaryProbe(globalScope) {
  "use strict";

  const PROBE_VERSION = "0.1.0";
  const SCHEMA_VERSION = "1";
  const POLICY_VERSION = "locate-summary-0.1";
  const MAX_RUNS = 2;
  const MAX_MESSAGE_CANDIDATES = 20;
  const TARGET_ORDINAL = 4;
  const TARGET_ROLE = "assistant";
  const SCROLL_CONFIRM_TIMEOUT_MS = 1500;
  const HIGHLIGHT_DURATION_MS = 50;
  const HIGHLIGHT_WATCHDOG_MS = 1500;
  const RUN_TIMEOUT_MS = 5000;
  const ALLOWED_HOSTS = new Set(["chatgpt.com", "www.chatgpt.com"]);
  const ROLE_SELECTOR = '[data-message-author-role="user"], [data-message-author-role="assistant"]';
  const ERROR_CODES = Object.freeze([
    "PROTOCOL_NOT_ALLOWED",
    "HOST_NOT_ALLOWED",
    "CONVERSATION_PATH_REQUIRED",
    "MAIN_REGION_NOT_FOUND",
    "MAIN_REGION_AMBIGUOUS",
    "S1_SHAPE_REQUIRED",
    "TARGET_NOT_FOUND",
    "TARGET_AMBIGUOUS",
    "TARGET_ROLE_MISMATCH",
    "SCROLL_NOT_CONFIRMED",
    "FOCUS_NOT_CONFIRMED",
    "HIGHLIGHT_NOT_CONFIRMED",
    "HIGHLIGHT_CLEANUP_FAILED",
    "CONVERSATION_CHANGED",
    "PERMISSION_NOT_GRANTED",
    "PROBE_RUNTIME_FAILURE",
    "RUN_QUOTA_EXHAUSTED",
    "PROBE_DISPOSED",
  ]);
  const LIMITATION_CODES = Object.freeze([
    "TARGET_IS_EPHEMERAL",
    "LOW_LOCATION_CONFIDENCE",
    "NO_STABLE_ID_CONCLUSION",
    "HIGHLIGHT_CLEANUP_WARNING",
  ]);

  let api;
  let runCount = 0;
  let disposed = false;
  let session = null;
  let activeOverlay = null;
  const ownedOverlays = new WeakSet();
  const activeRunStates = new Set();

  function freezeArray(values) {
    return Object.freeze(Array.from(values));
  }

  function freezeErrorCodes(codes) {
    const requested = new Set(codes);
    return freezeArray(ERROR_CODES.filter((code) => requested.has(code)).slice(0, 3));
  }

  function freezeLimitations(codes) {
    const requested = new Set(codes);
    return freezeArray(LIMITATION_CODES.filter((code) => requested.has(code)).slice(0, 4));
  }

  function safeCapturedAt() {
    try {
      const value = new Date().toISOString();
      return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
        ? value
        : null;
    } catch {
      return null;
    }
  }

  function classifyPath(pathname) {
    if (typeof pathname !== "string") return "unknown";
    return /^\/c\/[^/]+\/?$/.test(pathname) ? "conversation" : "unknown";
  }

  function unknownPage() {
    return {
      surface: "unknown",
      hostAllowed: false,
      pathKind: "unknown",
      mainRegionFound: false,
    };
  }

  function emptySummary(overrides = {}) {
    return Object.freeze({
      messageCount: 0,
      userCount: 0,
      assistantCount: 0,
      targetOrdinal: TARGET_ORDINAL,
      targetRole: TARGET_ROLE,
      targetCount: 0,
      scrollAttempted: false,
      scrollConfirmed: false,
      focusConfirmed: false,
      highlightApplied: false,
      highlightCleared: false,
      valueExposure: "none",
      ...overrides,
    });
  }

  function pageSnapshot(page) {
    return Object.freeze({
      surface: page.surface === "chatgpt-web" ? "chatgpt-web" : "unknown",
      hostAllowed: Boolean(page.hostAllowed),
      pathKind: page.pathKind === "conversation" ? "conversation" : "unknown",
      mainRegionFound: Boolean(page.mainRegionFound),
    });
  }

  function buildReport({ capturedAt, status, errorCodes = [], page = unknownPage(), summary, limitations = [] }) {
    return Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      probeVersion: PROBE_VERSION,
      policyVersion: POLICY_VERSION,
      capturedAt,
      status,
      errorCodes: freezeErrorCodes(errorCodes),
      page: pageSnapshot(page),
      summary: emptySummary(summary),
      limitations: freezeLimitations(limitations),
    });
  }

  function terminalReport({ capturedAt, status, errorCode, page, summary, limitations }) {
    return buildReport({
      capturedAt,
      status,
      errorCodes: [errorCode],
      page,
      summary,
      limitations,
    });
  }

  function shortCircuitReport(errorCode) {
    return terminalReport({
      capturedAt: null,
      status: "blocked",
      errorCode,
      page: unknownPage(),
    });
  }

  function getLocationSnapshot() {
    try {
      const locationRef = globalScope.location;
      const protocol = String(locationRef && locationRef.protocol || "").toLowerCase();
      const hostname = String(locationRef && locationRef.hostname || "").toLowerCase();
      const pathname = String(locationRef && locationRef.pathname || "");
      const rawPathKind = classifyPath(pathname);
      const hostAllowed = ALLOWED_HOSTS.has(hostname);
      return {
        protocolAllowed: protocol === "https:",
        hostAllowed,
        pathKind: rawPathKind,
        locationKey: `${protocol}|${hostname}|${pathname}`,
        page: {
          surface: hostAllowed ? "chatgpt-web" : "unknown",
          hostAllowed,
          pathKind: rawPathKind,
          mainRegionFound: false,
        },
      };
    } catch {
      return null;
    }
  }

  function findEntries(main) {
    if (!main || typeof main.querySelectorAll !== "function") {
      return { entries: [], errorCode: "MAIN_REGION_NOT_FOUND" };
    }

    let roleNodes;
    let userNodes;
    let assistantNodes;
    try {
      roleNodes = Array.from(main.querySelectorAll(ROLE_SELECTOR));
      userNodes = new Set(Array.from(main.querySelectorAll('[data-message-author-role="user"]')));
      assistantNodes = new Set(Array.from(main.querySelectorAll('[data-message-author-role="assistant"]')));
    } catch {
      return { entries: [], errorCode: "PROBE_RUNTIME_FAILURE" };
    }

    if (roleNodes.length > MAX_MESSAGE_CANDIDATES) {
      return { entries: [], errorCode: "S1_SHAPE_REQUIRED" };
    }

    const seenRoots = new Map();
    const entries = [];
    for (const roleNode of roleNodes) {
      const isUser = userNodes.has(roleNode);
      const isAssistant = assistantNodes.has(roleNode);
      if (isUser === isAssistant) return { entries: [], errorCode: "TARGET_AMBIGUOUS" };
      const role = isUser ? "user" : "assistant";

      let root;
      try {
        root = typeof roleNode.closest === "function"
          ? roleNode.closest('[data-testid^="conversation-turn-"]') || roleNode
          : roleNode;
        if (typeof main.contains !== "function" || !main.contains(root)) {
          return { entries: [], errorCode: "PROBE_RUNTIME_FAILURE" };
        }
      } catch {
        return { entries: [], errorCode: "PROBE_RUNTIME_FAILURE" };
      }

      const priorRole = seenRoots.get(root);
      if (priorRole && priorRole !== role) {
        return { entries: [], errorCode: "TARGET_AMBIGUOUS" };
      }
      if (priorRole === role) continue;
      seenRoots.set(root, role);
      entries.push({ root, role });
    }

    return { entries, errorCode: null };
  }

  function isExpectedS1Shape(entries) {
    if (entries.length !== 6) return false;
    return entries.every((entry, index) => entry.role === (index % 2 === 0 ? "user" : "assistant"));
  }

  function shapeFingerprint(entries) {
    return entries.map((entry) => entry.role).join(",");
  }

  function safeRect(node) {
    if (!node || typeof node.getBoundingClientRect !== "function") return null;
    try {
      const rect = node.getBoundingClientRect();
      if (!rect) return null;
      const values = [rect.top, rect.right, rect.bottom, rect.left, rect.width, rect.height];
      if (!values.every((value) => Number.isFinite(Number(value)))) return null;
      return {
        top: Number(rect.top),
        right: Number(rect.right),
        bottom: Number(rect.bottom),
        left: Number(rect.left),
        width: Number(rect.width),
        height: Number(rect.height),
      };
    } catch {
      return null;
    }
  }

  function viewportIsVisible(node) {
    const rect = safeRect(node);
    const height = Number(globalScope.innerHeight);
    const width = Number(globalScope.innerWidth);
    if (!rect || !Number.isFinite(height) || !Number.isFinite(width) || height <= 0 || width <= 0) return false;
    return rect.width > 0 && rect.height > 0
      && rect.top >= 0 && rect.left >= 0
      && rect.bottom <= height && rect.right <= width;
  }

  function schedule(callback, delay, timers) {
    if (typeof globalScope.setTimeout !== "function") return false;
    const handle = globalScope.setTimeout(callback, delay);
    timers.push(handle);
    return true;
  }

  function createRunState(timers) {
    let resolveAbort;
    const abortPromise = new Promise((resolve) => {
      resolveAbort = () => resolve({ aborted: true });
    });
    return {
      aborted: false,
      abortPromise,
      timers,
      abort() {
        if (this.aborted) return;
        this.aborted = true;
        resolveAbort();
      },
      overlay: null,
    };
  }

  function runIsAborted(runState) {
    return Boolean(disposed || (runState && runState.aborted));
  }

  function createDeadline(timers) {
    let expired = false;
    let resolveDeadline;
    const promise = new Promise((resolve) => {
      resolveDeadline = () => {
        if (expired) return;
        expired = true;
        resolve(true);
      };
    });
    if (!schedule(resolveDeadline, RUN_TIMEOUT_MS, timers)) {
      return { expired: () => false, promise: null };
    }
    return { expired: () => expired, promise };
  }

  async function awaitWithDeadline(operation, deadline, runState) {
    const valuePromise = Promise.resolve(operation).then(
      (value) => ({ timedOut: false, value }),
      () => ({ timedOut: false, thrown: true }),
    );
    const contenders = [valuePromise];
    if (deadline.promise) {
      contenders.push(deadline.promise.then(() => ({ timedOut: true })));
    }
    if (runState && runState.abortPromise) {
      contenders.push(runState.abortPromise);
    }
    return Promise.race(contenders);
  }

  function cancelTimers(timers) {
    if (typeof globalScope.clearTimeout !== "function") return;
    for (const handle of timers.splice(0)) {
      try {
        globalScope.clearTimeout(handle);
      } catch {
        // Cleanup is best effort; the fixed report carries the final state.
      }
    }
  }

  function waitForViewport(node, timers, runState) {
    if (runIsAborted(runState)) return Promise.resolve(false);
    if (viewportIsVisible(node)) return Promise.resolve(true);
    if (typeof globalScope.setTimeout !== "function") return Promise.resolve(false);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const poll = () => {
        if (runIsAborted(runState) || (session && session.invalidated)) return finish(false);
        if (viewportIsVisible(node)) return finish(true);
        if (!schedule(poll, 16, timers)) return finish(false);
      };
      poll();
      schedule(() => finish(false), SCROLL_CONFIRM_TIMEOUT_MS, timers);
    });
  }

  function createOverlay(documentRef, rect) {
    try {
      if (!documentRef || typeof documentRef.createElement !== "function") return null;
      const parent = documentRef.body || documentRef.documentElement;
      if (!parent || typeof parent.appendChild !== "function") return null;
      const overlay = documentRef.createElement("div");
      if (!overlay || !overlay.style) return null;
      if (typeof overlay.setAttribute === "function") {
        overlay.setAttribute("data-aicm-locate-overlay", "true");
      }
      overlay.style.position = "fixed";
      overlay.style.pointerEvents = "none";
      overlay.style.zIndex = "2147483646";
      overlay.style.top = `${rect.top}px`;
      overlay.style.left = `${rect.left}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      overlay.style.border = "2px solid rgba(99, 102, 241, 0.9)";
      overlay.style.boxSizing = "border-box";
      ownedOverlays.add(overlay);
      parent.appendChild(overlay);
      const mountedAndVisible = overlay.parentNode === parent
        && overlay.style.pointerEvents === "none"
        && overlay.style.visibility !== "hidden"
        && overlay.style.display !== "none"
        && overlay.style.opacity !== "0";
      if (!mountedAndVisible) {
        removeOverlay(overlay);
        return null;
      }
      activeOverlay = overlay;
      return overlay;
    } catch {
      return null;
    }
  }

  function removeOverlay(overlay) {
    if (!overlay) return true;
    try {
      const parent = overlay.parentNode;
      if (parent && typeof parent.removeChild === "function") {
        parent.removeChild(overlay);
      } else if (typeof overlay.remove === "function") {
        overlay.remove();
      } else {
        return false;
      }
      const cleared = !overlay.parentNode;
      if (cleared && activeOverlay === overlay) activeOverlay = null;
      return cleared;
    } catch {
      return false;
    }
  }

  function hideOverlay(overlay) {
    if (!overlay || !overlay.style) return false;
    try {
      overlay.style.visibility = "hidden";
      overlay.style.opacity = "0";
      overlay.style.pointerEvents = "none";
      return overlay.style.visibility === "hidden" && overlay.style.opacity === "0";
    } catch {
      return false;
    }
  }

  function cleanupOverlay(overlay, timers, runState) {
    if (!overlay) return Promise.resolve({ cleared: true, warning: false });
    if (runIsAborted(runState)) return Promise.resolve({ aborted: true, cleared: false, warning: false });
    const hidden = hideOverlay(overlay);
    if (removeOverlay(overlay)) return Promise.resolve({ cleared: true, warning: !hidden });
    if (typeof globalScope.setTimeout !== "function") {
      return Promise.resolve({ cleared: false, warning: false });
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const retry = () => {
        if (runIsAborted(runState)) return finish({ aborted: true, cleared: false, warning: false });
        if (removeOverlay(overlay)) return finish({ cleared: true, warning: true });
        if (!schedule(retry, 50, timers)) finish({ cleared: false, warning: false });
      };
      schedule(retry, 50, timers);
      schedule(() => finish({ cleared: false, warning: false }), HIGHLIGHT_WATCHDOG_MS, timers);
    });
  }

  function addListener(target, eventName, callback, listeners) {
    if (!target || typeof target.addEventListener !== "function") return false;
    try {
      target.addEventListener(eventName, callback, { passive: true });
      listeners.push({ target, eventName, callback });
      return true;
    } catch {
      return false;
    }
  }

  function isOwnOverlayNode(node) {
    if (!node) return false;
    return ownedOverlays.has(node);
  }

  function createSession(documentRef, mainRef, entries, locationSnapshot) {
    const next = {
      documentRef,
      mainRef,
      shape: shapeFingerprint(entries),
      locationKey: locationSnapshot && locationSnapshot.locationKey,
      invalidated: false,
      observer: null,
      parentRef: null,
      listeners: [],
    };
    const invalidate = () => {
      next.invalidated = true;
    };
    const handleMutations = (records) => {
      for (const record of Array.from(records || [])) {
        if (record.target === mainRef) return invalidate();
        if (record.type === "attributes" || record.type === "characterData") return invalidate();
        const nodes = [
          ...Array.from(record.addedNodes || []),
          ...Array.from(record.removedNodes || []),
        ];
        if (nodes.some((node) => !isOwnOverlayNode(node))) return invalidate();
      }
    };

    if (typeof globalScope.MutationObserver !== "function") return null;
    try {
      next.observer = new globalScope.MutationObserver(handleMutations);
      next.observer.observe(mainRef, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
      next.parentRef = mainRef && mainRef.parentNode ? mainRef.parentNode : null;
      if (next.parentRef && next.parentRef !== mainRef) {
        next.observer.observe(next.parentRef, { childList: true });
      }
    } catch {
      return null;
    }

    for (const [target, eventName] of [
      [globalScope, "popstate"],
      [globalScope, "hashchange"],
      [globalScope, "beforeunload"],
      [globalScope, "pagehide"],
      [documentRef, "visibilitychange"],
    ]) {
      if (!addListener(target, eventName, invalidate, next.listeners)) {
        next.invalidated = true;
      }
    }
    return next;
  }

  function disposeSession() {
    if (!session) return;
    if (session.observer && typeof session.observer.disconnect === "function") {
      try {
        session.observer.disconnect();
      } catch {
        // Continue releasing listener references.
      }
    }
    for (const listener of session.listeners.splice(0)) {
      try {
        listener.target.removeEventListener(listener.eventName, listener.callback);
      } catch {
        // Continue releasing remaining references.
      }
    }
    session.observer = null;
    session.parentRef = null;
    session.documentRef = null;
    session.mainRef = null;
    session = null;
  }

  function disposeInternal() {
    if (disposed) return false;
    disposed = true;
    const overlays = new Set([activeOverlay]);
    for (const runState of activeRunStates) {
      runState.abort();
      if (runState.overlay) overlays.add(runState.overlay);
    }
    for (const overlay of overlays) {
      hideOverlay(overlay);
      removeOverlay(overlay);
    }
    activeOverlay = null;
    disposeSession();
    if (globalScope.AICMLocateSummaryProbe === api) {
      try {
        delete globalScope.AICMLocateSummaryProbe;
      } catch {
        // The report remains terminal even if global cleanup is unavailable.
      }
    }
    return true;
  }

  function sessionIsCurrent() {
    if (!session || session.invalidated) return false;
    if (globalScope.document !== session.documentRef) return false;
    try {
      if (typeof session.documentRef.contains !== "function" || !session.documentRef.contains(session.mainRef)) {
        return false;
      }
    } catch {
      return false;
    }
    const currentLocation = getLocationSnapshot();
    if (!currentLocation || !currentLocation.protocolAllowed
      || !currentLocation.hostAllowed || currentLocation.pathKind !== "conversation") return false;
    if (currentLocation.locationKey !== session.locationKey) return false;
    const scan = findEntries(session.mainRef);
    return !scan.errorCode && isExpectedS1Shape(scan.entries)
      && shapeFingerprint(scan.entries) === session.shape;
  }

  function baseSummary(entries) {
    return {
      messageCount: entries.length,
      userCount: entries.filter((entry) => entry.role === "user").length,
      assistantCount: entries.filter((entry) => entry.role === "assistant").length,
      targetOrdinal: TARGET_ORDINAL,
      targetRole: TARGET_ROLE,
      targetCount: 1,
      valueExposure: "none",
    };
  }

  function failAndDispose(report) {
    disposeInternal();
    return report;
  }

  function failForInvalidSession() {
    const capturedAt = safeCapturedAt();
    if (!capturedAt) {
      return failAndDispose(terminalReport({
        capturedAt: null,
        status: "error",
        errorCode: "PROBE_RUNTIME_FAILURE",
        page: unknownPage(),
      }));
    }
    return failAndDispose(terminalReport({
      capturedAt,
      status: "error",
      errorCode: "CONVERSATION_CHANGED",
      page: unknownPage(),
    }));
  }

  async function runInternal() {
    if (disposed) return shortCircuitReport("PROBE_DISPOSED");
    if (runCount >= MAX_RUNS) return shortCircuitReport("RUN_QUOTA_EXHAUSTED");
    if (session && (session.invalidated || globalScope.document !== session.documentRef)) {
      return failForInvalidSession();
    }
    runCount += 1;

    const capturedAt = safeCapturedAt();
    if (!capturedAt) {
      return failAndDispose(terminalReport({
        capturedAt: null,
        status: "error",
        errorCode: "PROBE_RUNTIME_FAILURE",
        page: unknownPage(),
      }));
    }

    const locationSnapshot = getLocationSnapshot();
    if (!locationSnapshot) {
      return failAndDispose(terminalReport({
        capturedAt,
        status: "error",
        errorCode: "PROBE_RUNTIME_FAILURE",
        page: unknownPage(),
      }));
    }
    if (!locationSnapshot.protocolAllowed) {
      return failAndDispose(terminalReport({
        capturedAt,
        status: "blocked",
        errorCode: "PROTOCOL_NOT_ALLOWED",
        page: unknownPage(),
      }));
    }
    if (!locationSnapshot.hostAllowed) {
      return failAndDispose(terminalReport({
        capturedAt,
        status: "blocked",
        errorCode: "HOST_NOT_ALLOWED",
        page: unknownPage(),
      }));
    }
    if (locationSnapshot.pathKind !== "conversation") {
      return failAndDispose(terminalReport({
        capturedAt,
        status: "blocked",
        errorCode: "CONVERSATION_PATH_REQUIRED",
        page: locationSnapshot.page,
      }));
    }

    if (!globalScope.document || typeof globalScope.document.querySelectorAll !== "function") {
      return failAndDispose(terminalReport({
        capturedAt,
        status: "blocked",
        errorCode: "MAIN_REGION_NOT_FOUND",
        page: { ...locationSnapshot.page, mainRegionFound: false },
      }));
    }

    let mainRegions;
    try {
      mainRegions = Array.from(globalScope.document.querySelectorAll("main"));
    } catch {
      return failAndDispose(terminalReport({
        capturedAt,
        status: "error",
        errorCode: "PROBE_RUNTIME_FAILURE",
        page: { ...locationSnapshot.page, mainRegionFound: false },
      }));
    }
    if (mainRegions.length === 0) {
      return failAndDispose(terminalReport({
        capturedAt,
        status: "blocked",
        errorCode: "MAIN_REGION_NOT_FOUND",
        page: { ...locationSnapshot.page, mainRegionFound: false },
      }));
    }
    if (mainRegions.length !== 1) {
      return failAndDispose(terminalReport({
        capturedAt,
        status: "blocked",
        errorCode: "MAIN_REGION_AMBIGUOUS",
        page: { ...locationSnapshot.page, mainRegionFound: false },
      }));
    }

    const main = mainRegions[0];
    const scan = findEntries(main);
    if (scan.errorCode) {
      return failAndDispose(terminalReport({
        capturedAt,
        status: scan.errorCode === "PROBE_RUNTIME_FAILURE" ? "error" : "blocked",
        errorCode: scan.errorCode,
        page: { ...locationSnapshot.page, mainRegionFound: true },
      }));
    }
    if (!isExpectedS1Shape(scan.entries)) {
      return failAndDispose(terminalReport({
        capturedAt,
        status: "blocked",
        errorCode: "S1_SHAPE_REQUIRED",
        page: { ...locationSnapshot.page, mainRegionFound: true },
      }));
    }

    if (!session) {
      session = createSession(globalScope.document, main, scan.entries, locationSnapshot);
      if (!session || session.invalidated) {
        return failAndDispose(terminalReport({
          capturedAt,
          status: "error",
          errorCode: "PROBE_RUNTIME_FAILURE",
          page: { ...locationSnapshot.page, mainRegionFound: true },
        }));
      }
    } else if (!sessionIsCurrent() || session.mainRef !== main) {
      return failAndDispose(terminalReport({
        capturedAt,
        status: "error",
        errorCode: "CONVERSATION_CHANGED",
        page: { ...locationSnapshot.page, mainRegionFound: true },
      }));
    }

    const target = scan.entries[TARGET_ORDINAL - 1];
    if (!target) {
      return failAndDispose(terminalReport({
        capturedAt,
        status: "blocked",
        errorCode: "TARGET_NOT_FOUND",
        page: { ...locationSnapshot.page, mainRegionFound: true },
      }));
    }
    if (target.role !== TARGET_ROLE) {
      return failAndDispose(terminalReport({
        capturedAt,
        status: "blocked",
        errorCode: "TARGET_ROLE_MISMATCH",
        page: { ...locationSnapshot.page, mainRegionFound: true },
      }));
    }
      if (!sessionIsCurrent()) {
      return failAndDispose(terminalReport({
        capturedAt,
        status: "error",
        errorCode: "CONVERSATION_CHANGED",
        page: { ...locationSnapshot.page, mainRegionFound: true },
        summary: baseSummary(scan.entries),
        limitations: ["TARGET_IS_EPHEMERAL", "LOW_LOCATION_CONFIDENCE", "NO_STABLE_ID_CONCLUSION"],
      }));
    }

    const timers = [];
    const runState = createRunState(timers);
    activeRunStates.add(runState);
    const summary = baseSummary(scan.entries);
    summary.scrollAttempted = true;
    let scrollConfirmed = false;
    let focusConfirmed = false;
    let overlay = null;
    let cleanupResult = { cleared: false, warning: false };
    const deadline = createDeadline(timers);
    try {
      if (!target.root || typeof target.root.scrollIntoView !== "function") {
        return failAndDispose(terminalReport({
          capturedAt,
          status: "error",
          errorCode: "SCROLL_NOT_CONFIRMED",
          page: { ...locationSnapshot.page, mainRegionFound: true },
          summary,
          limitations: ["TARGET_IS_EPHEMERAL", "LOW_LOCATION_CONFIDENCE", "NO_STABLE_ID_CONCLUSION"],
        }));
      }
      try {
        target.root.scrollIntoView({ block: "center", behavior: "auto" });
      } catch {
        return failAndDispose(terminalReport({
          capturedAt,
          status: "error",
          errorCode: "SCROLL_NOT_CONFIRMED",
          page: { ...locationSnapshot.page, mainRegionFound: true },
          summary,
          limitations: ["TARGET_IS_EPHEMERAL", "LOW_LOCATION_CONFIDENCE", "NO_STABLE_ID_CONCLUSION"],
        }));
      }
      const scrollWait = await awaitWithDeadline(waitForViewport(target.root, timers, runState), deadline, runState);
      if (scrollWait.aborted) {
        return terminalReport({
          capturedAt,
          status: "error",
          errorCode: "PROBE_DISPOSED",
          page: unknownPage(),
          summary,
          limitations: ["TARGET_IS_EPHEMERAL", "LOW_LOCATION_CONFIDENCE", "NO_STABLE_ID_CONCLUSION"],
        });
      }
      if (scrollWait.timedOut || deadline.expired()) {
        return failAndDispose(terminalReport({
          capturedAt,
          status: "error",
          errorCode: "PROBE_RUNTIME_FAILURE",
          page: { ...locationSnapshot.page, mainRegionFound: true },
          summary,
          limitations: ["TARGET_IS_EPHEMERAL", "LOW_LOCATION_CONFIDENCE", "NO_STABLE_ID_CONCLUSION"],
        }));
      }
      if (scrollWait.thrown) {
        return failAndDispose(terminalReport({
          capturedAt,
          status: "error",
          errorCode: "SCROLL_NOT_CONFIRMED",
          page: { ...locationSnapshot.page, mainRegionFound: true },
          summary,
          limitations: ["TARGET_IS_EPHEMERAL", "LOW_LOCATION_CONFIDENCE", "NO_STABLE_ID_CONCLUSION"],
        }));
      }
      scrollConfirmed = scrollWait.value === true;
      summary.scrollConfirmed = scrollConfirmed;
      if (session && session.invalidated) {
        return failAndDispose(terminalReport({
          capturedAt,
          status: "error",
          errorCode: "CONVERSATION_CHANGED",
          page: { ...locationSnapshot.page, mainRegionFound: true },
          summary,
          limitations: ["TARGET_IS_EPHEMERAL", "LOW_LOCATION_CONFIDENCE", "NO_STABLE_ID_CONCLUSION"],
        }));
      }
      if (!scrollConfirmed) {
        return failAndDispose(terminalReport({
          capturedAt,
          status: "error",
          errorCode: "SCROLL_NOT_CONFIRMED",
          page: { ...locationSnapshot.page, mainRegionFound: true },
          summary,
          limitations: ["TARGET_IS_EPHEMERAL", "LOW_LOCATION_CONFIDENCE", "NO_STABLE_ID_CONCLUSION"],
        }));
      }
      focusConfirmed = viewportIsVisible(target.root);
      summary.focusConfirmed = focusConfirmed;
      const currentAfterFocus = sessionIsCurrent();
      if (deadline.expired() || !focusConfirmed || !currentAfterFocus) {
        return failAndDispose(terminalReport({
          capturedAt,
          status: "error",
          errorCode: deadline.expired()
            ? "PROBE_RUNTIME_FAILURE"
            : (!currentAfterFocus ? "CONVERSATION_CHANGED" : "FOCUS_NOT_CONFIRMED"),
          page: { ...locationSnapshot.page, mainRegionFound: true },
          summary,
          limitations: ["TARGET_IS_EPHEMERAL", "LOW_LOCATION_CONFIDENCE", "NO_STABLE_ID_CONCLUSION"],
        }));
      }

      const rect = safeRect(target.root);
      overlay = rect ? createOverlay(globalScope.document, rect) : null;
      runState.overlay = overlay;
      summary.highlightApplied = Boolean(overlay);
      if (!overlay) {
        return failAndDispose(terminalReport({
          capturedAt,
          status: "error",
          errorCode: "HIGHLIGHT_NOT_CONFIRMED",
          page: { ...locationSnapshot.page, mainRegionFound: true },
          summary,
          limitations: ["TARGET_IS_EPHEMERAL", "LOW_LOCATION_CONFIDENCE", "NO_STABLE_ID_CONCLUSION"],
        }));
      }

      const highlightWait = await awaitWithDeadline(new Promise((resolve) => {
        if (!schedule(resolve, HIGHLIGHT_DURATION_MS, timers)) resolve();
      }), deadline, runState);
      if (highlightWait.aborted) {
        return terminalReport({
          capturedAt,
          status: "error",
          errorCode: "PROBE_DISPOSED",
          page: unknownPage(),
          summary,
          limitations: ["TARGET_IS_EPHEMERAL", "LOW_LOCATION_CONFIDENCE", "NO_STABLE_ID_CONCLUSION"],
        });
      }
      if (highlightWait.timedOut || deadline.expired() || highlightWait.thrown) {
        return failAndDispose(terminalReport({
          capturedAt,
          status: "error",
          errorCode: "PROBE_RUNTIME_FAILURE",
          page: { ...locationSnapshot.page, mainRegionFound: true },
          summary,
          limitations: ["TARGET_IS_EPHEMERAL", "LOW_LOCATION_CONFIDENCE", "NO_STABLE_ID_CONCLUSION"],
        }));
      }
      cleanupResult = await (async () => {
        const result = await awaitWithDeadline(cleanupOverlay(overlay, timers, runState), deadline, runState);
        return result;
      })();
      if (cleanupResult.aborted) {
        return terminalReport({
          capturedAt,
          status: "error",
          errorCode: "PROBE_DISPOSED",
          page: unknownPage(),
          summary,
          limitations: ["TARGET_IS_EPHEMERAL", "LOW_LOCATION_CONFIDENCE", "NO_STABLE_ID_CONCLUSION"],
        });
      }
      if (cleanupResult.timedOut || deadline.expired() || cleanupResult.thrown) {
        return failAndDispose(terminalReport({
          capturedAt,
          status: "error",
          errorCode: "PROBE_RUNTIME_FAILURE",
          page: { ...locationSnapshot.page, mainRegionFound: true },
          summary,
          limitations: ["TARGET_IS_EPHEMERAL", "LOW_LOCATION_CONFIDENCE", "NO_STABLE_ID_CONCLUSION"],
        }));
      }
      cleanupResult = cleanupResult.value;
      summary.highlightCleared = cleanupResult.cleared;
      if (!cleanupResult.cleared) {
        return failAndDispose(terminalReport({
          capturedAt,
          status: "error",
          errorCode: "HIGHLIGHT_CLEANUP_FAILED",
          page: { ...locationSnapshot.page, mainRegionFound: true },
          summary,
          limitations: ["TARGET_IS_EPHEMERAL", "LOW_LOCATION_CONFIDENCE", "NO_STABLE_ID_CONCLUSION"],
        }));
      }

      if (deadline.expired() || !sessionIsCurrent()) {
        return failAndDispose(terminalReport({
          capturedAt,
          status: "error",
          errorCode: deadline.expired() ? "PROBE_RUNTIME_FAILURE" : "CONVERSATION_CHANGED",
          page: { ...locationSnapshot.page, mainRegionFound: true },
          summary,
          limitations: ["TARGET_IS_EPHEMERAL", "LOW_LOCATION_CONFIDENCE", "NO_STABLE_ID_CONCLUSION"],
        }));
      }

      const limitations = ["TARGET_IS_EPHEMERAL", "LOW_LOCATION_CONFIDENCE", "NO_STABLE_ID_CONCLUSION"];
      if (cleanupResult.warning) limitations.push("HIGHLIGHT_CLEANUP_WARNING");
      const report = buildReport({
        capturedAt,
        status: "observed",
        page: { ...locationSnapshot.page, mainRegionFound: true },
        summary,
        limitations,
      });
      if (runCount >= MAX_RUNS) disposeInternal();
      return report;
    } catch {
      return failAndDispose(terminalReport({
        capturedAt,
        status: "error",
        errorCode: "PROBE_RUNTIME_FAILURE",
        page: { ...locationSnapshot.page, mainRegionFound: true },
        summary,
        limitations: ["TARGET_IS_EPHEMERAL", "LOW_LOCATION_CONFIDENCE", "NO_STABLE_ID_CONCLUSION"],
      }));
    } finally {
      cancelTimers(timers);
      activeRunStates.delete(runState);
      if (!runState.aborted && overlay && !summary.highlightCleared) {
        hideOverlay(overlay);
        removeOverlay(overlay);
      }
    }
  }

  function unexpectedRuntimeReport() {
    const capturedAt = safeCapturedAt();
    try {
      disposeInternal();
    } catch {
      // Keep the returned shape fixed even if a host cleanup primitive fails.
    }
    return terminalReport({
      capturedAt,
      status: "error",
      errorCode: "PROBE_RUNTIME_FAILURE",
      page: unknownPage(),
    });
  }

  async function run() {
    try {
      return await runInternal();
    } catch {
      return unexpectedRuntimeReport();
    }
  }

  function dispose() {
    return disposeInternal();
  }

  api = Object.freeze({
    version: PROBE_VERSION,
    run,
    dispose,
  });

  if (Object.prototype.hasOwnProperty.call(globalScope, "AICMLocateSummaryProbe")) {
    throw new Error("AICM_LOCATE_PROBE_GLOBAL_CONFLICT");
  }

  Object.defineProperty(globalScope, "AICMLocateSummaryProbe", {
    value: api,
    configurable: true,
    enumerable: false,
    writable: false,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);

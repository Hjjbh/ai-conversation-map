/*
 * T0-02 ChatGPT non-exposing identity-summary probe.
 *
 * This is isolated Stage 0 evidence tooling, not extension production code.
 * It does not run automatically, persist data, use the network, write to the
 * clipboard, or emit message text and source attribute values. Candidate
 * values are compared only in memory and are discarded before a report is
 * returned.
 */
(function installReadonlyProbe(globalScope) {
  "use strict";

  const PROBE_VERSION = "0.3.0";
  const SCHEMA_VERSION = "3";
  const POLICY_VERSION = "identity-summary-0.1";
  const MAX_MESSAGE_CANDIDATES = 20;
  const MAX_RUNS = 2;
  const ALLOWED_HOSTS = new Set(["chatgpt.com", "www.chatgpt.com"]);
  const ROLE_SELECTOR = '[data-message-author-role="user"], [data-message-author-role="assistant"]';
  const STRATEGY_IDS = Object.freeze(["data-message-id", "data-testid-role"]);
  const ERROR_CODES = Object.freeze([
    "PROTOCOL_NOT_ALLOWED",
    "HOST_NOT_ALLOWED",
    "CONVERSATION_PATH_REQUIRED",
    "MAIN_REGION_NOT_FOUND",
    "MAIN_REGION_AMBIGUOUS",
    "MESSAGE_CANDIDATE_LIMIT_EXCEEDED",
    "MESSAGE_CONTAINER_OUTSIDE_ROOT",
    "ROLE_CONTAINER_CONFLICT",
    "MESSAGE_CANDIDATES_NOT_FOUND",
    "OUTPUT_SCHEMA_MISMATCH",
    "VALUE_EXPOSURE_BLOCKED",
    "RUN_QUOTA_EXHAUSTED",
    "PROBE_DISPOSED",
    "PROBE_RUNTIME_FAILURE",
    "S1_SHAPE_REQUIRED",
  ]);
  const LIMITATION_CODES = Object.freeze([
    "CANDIDATE_EMPTY",
    "DUPLICATE_CANDIDATE",
    "ROLE_CONFLICT",
    "VALUE_READ_ERROR",
    "VALUE_EXPOSURE_BLOCKED",
  ]);

  function freezeArray(values) {
    return Object.freeze(Array.from(values));
  }

  function freezeErrorCodes(codes) {
    const requested = new Set(codes);
    const hasUnknownCode = Array.from(requested).some((code) => !ERROR_CODES.includes(code));
    if (hasUnknownCode || requested.size > 8) return freezeArray(["OUTPUT_SCHEMA_MISMATCH"]);
    return freezeArray(ERROR_CODES.filter((code) => requested.has(code)));
  }

  function freezePage({ surface, hostAllowed, pathKind, mainRegionFound }) {
    return Object.freeze({
      surface,
      hostAllowed: Boolean(hostAllowed),
      pathKind,
      mainRegionFound: Boolean(mainRegionFound),
    });
  }

  function emptySummary() {
    return Object.freeze({
      messageCount: 0,
      userCount: 0,
      assistantCount: 0,
      strategyCount: 0,
      conflictCount: 0,
      valueExposure: "none",
    });
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
    if (/^\/c\/[^/]+\/?$/.test(pathname)) return "conversation";
    if (pathname === "/" || pathname === "") return "home";
    return "other";
  }

  function getAttribute(node, name) {
    if (!node || typeof node.getAttribute !== "function") return null;
    try {
      return node.getAttribute(name);
    } catch {
      return null;
    }
  }

  function readCandidateAttribute(node, name) {
    if (!node || typeof node.getAttribute !== "function") return { kind: "missing" };
    try {
      const value = node.getAttribute(name);
      if (value === null || value === undefined || value === "") {
        return { kind: "empty" };
      }
      return typeof value === "string"
        ? { kind: "value", value }
        : { kind: "error" };
    } catch {
      return { kind: "error" };
    }
  }

  function readFirstCandidate(entry, attributeName) {
    const nodeResult = readCandidateAttribute(entry.node, attributeName);
    if (nodeResult.kind === "value" || nodeResult.kind === "error") return nodeResult;

    const roleResult = readCandidateAttribute(entry.roleNode, attributeName);
    if (roleResult.kind === "value" || roleResult.kind === "error") return roleResult;
    return { kind: "empty" };
  }

  function findMessageEntries(main) {
    if (!main || typeof main.querySelectorAll !== "function") {
      return { entries: [], errorCode: "MAIN_REGION_NOT_FOUND" };
    }

    let roleNodes;
    try {
      roleNodes = Array.from(main.querySelectorAll(ROLE_SELECTOR));
    } catch {
      return { entries: [], errorCode: "MAIN_REGION_NOT_FOUND" };
    }

    if (roleNodes.length > MAX_MESSAGE_CANDIDATES) {
      return { entries: [], errorCode: "MESSAGE_CANDIDATE_LIMIT_EXCEEDED" };
    }

    const seenRoles = new Map();
    const entries = [];

    for (const roleNode of roleNodes) {
      let turnNode;
      try {
        turnNode = typeof roleNode.closest === "function"
          ? roleNode.closest('[data-testid^="conversation-turn-"]') || roleNode
          : roleNode;

        if (typeof main.contains !== "function" || !main.contains(turnNode)) {
          return { entries: [], errorCode: "MESSAGE_CONTAINER_OUTSIDE_ROOT" };
        }
      } catch {
        return { entries: [], errorCode: "PROBE_RUNTIME_FAILURE" };
      }

      const role = getAttribute(roleNode, "data-message-author-role");
      const priorRole = seenRoles.get(turnNode);
      if (priorRole && priorRole !== role) {
        return { entries: [], errorCode: "ROLE_CONTAINER_CONFLICT" };
      }
      if (priorRole === role) continue;

      seenRoles.set(turnNode, role);
      entries.push({ node: turnNode, roleNode, role });
    }

    return { entries, errorCode: null };
  }

  function readStrategyCandidate(entry, strategyId) {
    if (strategyId === "data-message-id") {
      return readFirstCandidate(entry, "data-message-id");
    }

    if (strategyId === "data-testid-role") {
      const testIdResult = readFirstCandidate(entry, "data-testid");
      if (testIdResult.kind !== "value") return testIdResult;
      if (entry.role !== "user" && entry.role !== "assistant") return { kind: "error" };
      return { kind: "value", value: testIdResult.value, role: entry.role };
    }

    return { kind: "error" };
  }

  function summarizeStrategy(entries, strategyId) {
    let presentCount = 0;
    let emptyCount = 0;
    let readErrorCount = 0;
    const groups = new Map();

    for (const entry of entries) {
      const result = readStrategyCandidate(entry, strategyId);
      if (result.kind === "error") {
        readErrorCount += 1;
        continue;
      }
      if (result.kind !== "value") {
        emptyCount += 1;
        continue;
      }

      presentCount += 1;
      if (strategyId === "data-testid-role") {
        let roleGroups = groups.get(result.value);
        if (!roleGroups) {
          roleGroups = new Map();
          groups.set(result.value, roleGroups);
        }
        const group = roleGroups.get(result.role) || { count: 0, roles: new Set() };
        group.count += 1;
        group.roles.add(result.role);
        roleGroups.set(result.role, group);
      } else {
        const group = groups.get(result.value) || { count: 0, roles: new Set() };
        group.count += 1;
        group.roles.add(entry.role);
        groups.set(result.value, group);
      }
    }

    let distinctCount = 0;
    let duplicateGroupCount = 0;
    let roleConflictCount = 0;
    if (strategyId === "data-testid-role") {
      for (const roleGroups of groups.values()) {
        for (const group of roleGroups.values()) {
          distinctCount += 1;
          if (group.count >= 2) duplicateGroupCount += 1;
          if (group.roles.size >= 2) roleConflictCount += 1;
        }
        roleGroups.clear();
      }
    } else {
      for (const group of groups.values()) {
        distinctCount += 1;
        if (group.count >= 2) duplicateGroupCount += 1;
        if (group.roles.size >= 2) roleConflictCount += 1;
      }
    }
    groups.clear();

    const eligibleCount = entries.length;
    let candidateStatus = "unique";
    if (eligibleCount === 0) {
      candidateStatus = "not-observed";
    } else if (readErrorCount > 0 || roleConflictCount > 0) {
      candidateStatus = "ambiguous";
    } else if (duplicateGroupCount > 0) {
      candidateStatus = "duplicate";
    } else if (emptyCount > 0) {
      candidateStatus = "partial";
    }

    const limitations = new Set();
    if (emptyCount > 0 || eligibleCount === 0) limitations.add("CANDIDATE_EMPTY");
    if (duplicateGroupCount > 0) limitations.add("DUPLICATE_CANDIDATE");
    if (roleConflictCount > 0) limitations.add("ROLE_CONFLICT");
    if (readErrorCount > 0) limitations.add("VALUE_READ_ERROR");

    return Object.freeze({
      strategyId,
      scope: "message-root",
      eligibleCount,
      presentCount,
      emptyCount,
      readErrorCount,
      distinctCount,
      duplicateGroupCount,
      roleConflictCount,
      candidateStatus,
      evidenceConfidence: candidateStatus === "not-observed" ? "unknown" : "low",
      valueExposure: "none",
      limitations,
    });
  }

  function finalizeStrategies(entries) {
    const summaries = STRATEGY_IDS.map((strategyId) => summarizeStrategy(entries, strategyId));
    const limitations = new Set();
    for (const summary of summaries) {
      for (const code of summary.limitations) limitations.add(code);
    }

    const candidateStrategies = summaries.map((summary) => {
      const { limitations: ignored, ...publicSummary } = summary;
      void ignored;
      return Object.freeze(publicSummary);
    });
    const orderedLimitations = LIMITATION_CODES.filter((code) => limitations.has(code));

    return {
      candidateStrategies: freezeArray(candidateStrategies),
      limitations: freezeArray(orderedLimitations),
      conflictCount: candidateStrategies.filter((summary) =>
        summary.candidateStatus === "duplicate" || summary.candidateStatus === "ambiguous").length,
    };
  }

  function buildTerminalReport({ capturedAt, status, errorCodes, page, limitations = [] }) {
    return Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      probeVersion: PROBE_VERSION,
      policyVersion: POLICY_VERSION,
      capturedAt,
      status,
      errorCodes: freezeErrorCodes(errorCodes),
      page: freezePage(page),
      summary: emptySummary(),
      candidateStrategies: freezeArray([]),
      limitations: freezeArray(limitations),
    });
  }

  function buildQuotaReport() {
    return buildTerminalReport({
      capturedAt: safeCapturedAt(),
      status: "blocked",
      errorCodes: ["RUN_QUOTA_EXHAUSTED"],
      page: {
        surface: "unconfirmed",
        hostAllowed: false,
        pathKind: "unknown",
        mainRegionFound: false,
      },
    });
  }

  function buildDisposedReport() {
    return buildTerminalReport({
      capturedAt: safeCapturedAt(),
      status: "blocked",
      errorCodes: ["PROBE_DISPOSED"],
      page: {
        surface: "unconfirmed",
        hostAllowed: false,
        pathKind: "unknown",
        mainRegionFound: false,
      },
    });
  }

  function buildRuntimeFailureReport() {
    return buildTerminalReport({
      capturedAt: safeCapturedAt(),
      status: "error",
      errorCodes: ["PROBE_RUNTIME_FAILURE"],
      page: {
        surface: "unconfirmed",
        hostAllowed: false,
        pathKind: "unknown",
        mainRegionFound: false,
      },
    });
  }

  function isExpectedS1Shape(entries) {
    if (entries.length !== 6) return false;
    return entries.every((entry, index) => entry.role === (index % 2 === 0 ? "user" : "assistant"))
      && entries.filter((entry) => entry.role === "user").length === 3
      && entries.filter((entry) => entry.role === "assistant").length === 3;
  }

  function buildReport(documentRef, locationRef) {
    const hostname = String(locationRef && locationRef.hostname || "").toLowerCase();
    const protocol = String(locationRef && locationRef.protocol || "").toLowerCase();
    const hostAllowed = ALLOWED_HOSTS.has(hostname);
    const pathKind = classifyPath(locationRef && locationRef.pathname);
    const capturedAt = safeCapturedAt();

    if (!capturedAt) return buildRuntimeFailureReport();

    if (protocol !== "https:") {
      return buildTerminalReport({
        capturedAt,
        status: "blocked",
        errorCodes: ["PROTOCOL_NOT_ALLOWED"],
        page: { surface: "unconfirmed", hostAllowed, pathKind: "unknown", mainRegionFound: false },
      });
    }

    if (!hostAllowed) {
      return buildTerminalReport({
        capturedAt,
        status: "blocked",
        errorCodes: ["HOST_NOT_ALLOWED"],
        page: { surface: "unconfirmed", hostAllowed: false, pathKind: "unknown", mainRegionFound: false },
      });
    }

    if (pathKind !== "conversation") {
      return buildTerminalReport({
        capturedAt,
        status: "blocked",
        errorCodes: ["CONVERSATION_PATH_REQUIRED"],
        page: { surface: "chatgpt-web", hostAllowed: true, pathKind, mainRegionFound: false },
      });
    }

    let mainRegions;
    try {
      mainRegions = documentRef && typeof documentRef.querySelectorAll === "function"
        ? Array.from(documentRef.querySelectorAll("main"))
        : [];
    } catch {
      mainRegions = [];
    }

    if (mainRegions.length === 0) {
      return buildTerminalReport({
        capturedAt,
        status: "blocked",
        errorCodes: ["MAIN_REGION_NOT_FOUND"],
        page: { surface: "chatgpt-web", hostAllowed: true, pathKind, mainRegionFound: false },
      });
    }

    if (mainRegions.length !== 1) {
      return buildTerminalReport({
        capturedAt,
        status: "blocked",
        errorCodes: ["MAIN_REGION_AMBIGUOUS"],
        page: { surface: "chatgpt-web", hostAllowed: true, pathKind, mainRegionFound: false },
      });
    }

    const scan = findMessageEntries(mainRegions[0]);
    if (scan.errorCode) {
      return buildTerminalReport({
        capturedAt,
        status: scan.errorCode === "PROBE_RUNTIME_FAILURE" ? "error" : "blocked",
        errorCodes: [scan.errorCode],
        page: { surface: "chatgpt-web", hostAllowed: true, pathKind, mainRegionFound: true },
      });
    }

    const entries = scan.entries;
    if (entries.length === 0) {
      return buildTerminalReport({
        capturedAt,
        status: "blocked",
        errorCodes: ["MESSAGE_CANDIDATES_NOT_FOUND"],
        page: { surface: "chatgpt-web", hostAllowed: true, pathKind, mainRegionFound: true },
      });
    }

    if (!isExpectedS1Shape(entries)) {
      return buildTerminalReport({
        capturedAt,
        status: "blocked",
        errorCodes: ["S1_SHAPE_REQUIRED"],
        page: { surface: "chatgpt-web", hostAllowed: true, pathKind, mainRegionFound: true },
      });
    }

    const userCount = entries.filter((entry) => entry.role === "user").length;
    const assistantCount = entries.filter((entry) => entry.role === "assistant").length;
    const finalized = finalizeStrategies(entries);
    const summary = Object.freeze({
      messageCount: entries.length,
      userCount,
      assistantCount,
      strategyCount: finalized.candidateStrategies.length,
      conflictCount: finalized.conflictCount,
      valueExposure: "none",
    });

    return Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      probeVersion: PROBE_VERSION,
      policyVersion: POLICY_VERSION,
      capturedAt,
      status: "observed",
      errorCodes: freezeArray([]),
      page: freezePage({ surface: "chatgpt-web", hostAllowed: true, pathKind, mainRegionFound: true }),
      summary,
      candidateStrategies: finalized.candidateStrategies,
      limitations: finalized.limitations,
    });
  }

  let runCount = 0;
  let disposed = false;
  function run() {
    if (disposed) return buildDisposedReport();
    if (runCount >= MAX_RUNS) return buildQuotaReport();
    runCount += 1;
    try {
      return buildReport(globalScope.document, globalScope.location);
    } catch {
      return buildRuntimeFailureReport();
    }
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    return globalScope.AICMReadonlyProbe === api
      ? delete globalScope.AICMReadonlyProbe
      : false;
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

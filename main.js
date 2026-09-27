var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => StellaCopyPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// src/stella-api.ts
function getStellaEngine(app) {
  var _a, _b;
  const plugin = (_b = (_a = app.plugins) == null ? void 0 : _a.plugins) == null ? void 0 : _b["ggai-stella-engine"];
  return plugin != null ? plugin : null;
}

// src/vendor/session-text.ts
function pathToLeaf(session, leafId) {
  const path = [];
  let cur = session.nodes[leafId];
  const seen = /* @__PURE__ */ new Set();
  while (cur) {
    if (seen.has(cur.id))
      return [];
    seen.add(cur.id);
    path.push(cur);
    if (cur.parent == null)
      break;
    cur = session.nodes[cur.parent];
  }
  if (path.length === 0 || path[path.length - 1].parent != null)
    return [];
  path.reverse();
  return path;
}
function buildSpans(session, leafId = session.meta.activeLeafId) {
  const path = pathToLeaf(session, leafId);
  let spans = [];
  for (const node of path) {
    for (const patch of node.patches) {
      if (patch.op === "append") {
        for (const span of patch.spans)
          spans.push(span);
      } else {
        spans = applyPatch(spans, patch);
      }
    }
  }
  return normalize(spans);
}
function spansToText(spans) {
  let out = "";
  for (const s of spans)
    out += s.text;
  return out;
}
function applyPatch(spans, patch) {
  switch (patch.op) {
    case "append":
      return [...spans, ...patch.spans];
    case "delete":
      return cutRange(spans, patch.from, patch.to);
    case "replace": {
      const [left, right] = splitAt(spans, patch.from);
      const [, rest] = splitAt(right, patch.to - patch.from);
      return [...left, ...patch.spans, ...rest];
    }
  }
}
function splitAt(spans, at) {
  if (at <= 0)
    return [[], spans.slice()];
  const left = [];
  const right = [];
  let consumed = 0;
  let i = 0;
  for (; i < spans.length; i++) {
    const s = spans[i];
    const len = s.text.length;
    if (consumed + len <= at) {
      left.push(s);
      consumed += len;
      if (consumed === at) {
        i++;
        break;
      }
    } else {
      const cut = at - consumed;
      if (cut > 0)
        left.push({ author: s.author, text: s.text.slice(0, cut) });
      if (cut < len)
        right.push({ author: s.author, text: s.text.slice(cut) });
      i++;
      break;
    }
  }
  for (; i < spans.length; i++)
    right.push(spans[i]);
  return [left, right];
}
function cutRange(spans, from, to) {
  if (from >= to)
    return spans.slice();
  const [left, rest] = splitAt(spans, from);
  const [, right] = splitAt(rest, to - from);
  return [...left, ...right];
}
function normalize(spans) {
  const out = [];
  for (const s of spans) {
    if (s.text.length === 0)
      continue;
    const last = out[out.length - 1];
    if (last && last.author === s.author) {
      last.text += s.text;
    } else {
      out.push({ author: s.author, text: s.text });
    }
  }
  return out;
}

// src/copy-text.ts
function validateSession(value) {
  const s = value;
  const bad = () => new Error("\uC774 \uC138\uC158 \uAD6C\uC870\uB97C \uC548\uC804\uD558\uAC8C \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC2A4\uD154\uB77C \uBC84\uC804\uACFC \uC138\uC158 \uD30C\uC77C\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
  if (!s || s.schemaVersion !== 1 || !s.meta || !s.nodes || typeof s.nodes !== "object" || typeof s.meta.activeLeafId !== "string" || typeof s.meta.rootId !== "string" || ![void 0, "novel", "chat", "textgame"].includes(s.meta.mode))
    throw bad();
  const seen = /* @__PURE__ */ new Set();
  let id = s.meta.activeLeafId;
  let root = "";
  while (id !== null) {
    if (seen.has(id) || !Object.prototype.hasOwnProperty.call(s.nodes, id))
      throw bad();
    seen.add(id);
    const node = s.nodes[id];
    if (!node || node.id !== id || !(node.parent === null || typeof node.parent === "string") || !["root", "ai-continue", "ai-regen", "user-write", "user-edit"].includes(node.kind) || !Array.isArray(node.patches))
      throw bad();
    root = id;
    id = node.parent;
  }
  if (root !== s.meta.rootId)
    throw bad();
  let length = 0;
  for (const node of pathToLeaf(s, s.meta.activeLeafId)) {
    for (const p of node.patches) {
      if (!p || !["append", "replace", "delete"].includes(p.op))
        throw bad();
      let added = 0;
      if (p.op !== "delete") {
        if (!Array.isArray(p.spans))
          throw bad();
        for (const span of p.spans) {
          if (!span || typeof span.text !== "string" || !["ai", "user"].includes(span.author))
            throw bad();
          added += span.text.length;
        }
      }
      if (p.op === "append")
        length += added;
      else {
        if (!Number.isSafeInteger(p.from) || !Number.isSafeInteger(p.to) || p.from < 0 || p.to < p.from || p.to > length)
          throw bad();
        length += added - (p.to - p.from);
      }
    }
  }
}
var DEFAULT_OPTIONS = { names: true, numbers: false };
function parseRange(start, end, total) {
  if (total < 1)
    throw new Error("\uBCF5\uC0AC\uD560 \uBA54\uC2DC\uC9C0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
  if (!/^\d+$/.test(start.trim()) || !/^\d+$/.test(end.trim())) {
    throw new Error("\uC2DC\uC791\xB7\uB05D \uBC88\uD638\uC5D0 0 \uC774\uC0C1\uC758 \uC815\uC218\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
  }
  const from = Number(start.trim()), to = Number(end.trim());
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from > to || to >= total) {
    throw new Error(`\uBC88\uD638\uB294 0~${total - 1} \uC0AC\uC774\uC5EC\uC57C \uD558\uBA70, \uC2DC\uC791 \uBC88\uD638\uAC00 \uB05D \uBC88\uD638\uBCF4\uB2E4 \uD074 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`);
  }
  return [from, to];
}
function formatCopy(snapshot, options, range) {
  if (snapshot.mode === "novel")
    return snapshot.body;
  const [from, to] = range ? parseRange(String(range[0]), String(range[1]), snapshot.messages.length) : [0, snapshot.messages.length - 1];
  return snapshot.messages.slice(from, to + 1).map((message) => {
    const heading = [options.numbers ? `#${message.index}` : "", options.names ? message.name : ""].filter(Boolean).join(" \xB7 ");
    return heading ? `${heading}
${message.text}` : message.text;
  }).join("\n\n");
}

// src/vendor/chat-messages.ts
var CHAT_MESSAGE_SEPARATOR = "\n\n";
function chatRoleOfKind(kind) {
  switch (kind) {
    case "user-write":
      return "user";
    case "user-edit":
      return null;
    default:
      return "assistant";
  }
}
function buildChatMessages(session, leafId) {
  const path = pathToLeaf(session, leafId != null ? leafId : session.meta.activeLeafId);
  const messages = [];
  for (const node of path) {
    for (const patch of node.patches) {
      if (patch.op === "append") {
        const text = patch.spans.map((s) => s.text).join("");
        if (!text)
          continue;
        const role = chatRoleOfKind(node.kind);
        if (role) {
          messages.push({ nodeId: node.id, role, text });
        } else if (messages.length > 0) {
          messages[messages.length - 1].text += text;
        } else {
          messages.push({ nodeId: node.id, role: "assistant", text });
        }
      } else {
        const insert = patch.op === "replace" ? patch.spans.map((s) => s.text).join("") : "";
        applyRangeEdit(messages, patch.from, patch.to, insert);
      }
    }
  }
  return messages.filter((m) => m.text.length > 0);
}
function applyRangeEdit(messages, from, to, insert) {
  if (messages.length === 0)
    return;
  let ownerIdx = messages.length - 1;
  let scan = 0;
  for (let i = 0; i < messages.length; i++) {
    const end = scan + messages[i].text.length;
    if (from < end) {
      ownerIdx = i;
      break;
    }
    scan = end;
  }
  let offset = 0;
  messages.forEach((msg, i) => {
    const start = offset;
    const end = start + msg.text.length;
    offset = end;
    let text = msg.text;
    const delFrom = Math.max(from, start);
    const delTo = Math.min(to, end);
    if (delTo > delFrom) {
      text = text.slice(0, delFrom - start) + text.slice(delTo - start);
    }
    if (i === ownerIdx && insert) {
      const at = Math.min(Math.max(from - start, 0), text.length);
      text = text.slice(0, at) + insert + text.slice(at);
    }
    msg.text = text;
  });
}

// src/adapter.ts
var TESTED_ENGINE_VERSION = "0.0.46";
var VIEW_TYPES = ["ggai-stella-session", "ggai-stella-chat-session", "ggai-stella-pro-session"];
function requireEngine(app) {
  var _a;
  const engine = getStellaEngine(app);
  if (!engine)
    throw new Error("\uC2A4\uD154\uB77C \uC5D4\uC9C4\uC744 \uBA3C\uC800 \uD65C\uC131\uD654\uD574 \uC8FC\uC138\uC694.");
  if (typeof ((_a = engine.store) == null ? void 0 : _a.getSession) !== "function" || typeof engine.flushSessionEdits !== "function") {
    throw new Error("\uC774 \uC2A4\uD154\uB77C \uBC84\uC804\uC740 \uBCF5\uC0AC\uAE30\uC640 \uD638\uD658\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uAE30\uC900 \uBC84\uC804: 0.0.46.");
  }
  return engine;
}
function currentSessionFile(app) {
  var _a, _b;
  const engine = getStellaEngine(app);
  return (_b = (_a = engine == null ? void 0 : engine.getActiveOrLastSessionFile) == null ? void 0 : _a.call(engine)) != null ? _b : null;
}
function assertIdle(app, engine, file) {
  var _a, _b, _c;
  if ((_a = engine.isSessionChanging) == null ? void 0 : _a.call(engine, file))
    throw new Error("\uC138\uC158 \uC791\uC5C5\uC774 \uB05D\uB09C \uB4A4 \uB2E4\uC2DC \uBCF5\uC0AC\uD574 \uC8FC\uC138\uC694.");
  for (const type of VIEW_TYPES) {
    for (const leaf of app.workspace.getLeavesOfType(type)) {
      const view = leaf.view;
      if (((_b = view.getSessionFile) == null ? void 0 : _b.call(view)) === file && ((_c = view.isGenerating) == null ? void 0 : _c.call(view))) {
        throw new Error("\uC0DD\uC131\xB7\uBC88\uC5ED \uB4F1 \uC9C4\uD589 \uC911\uC778 \uC791\uC5C5\uC774 \uB05D\uB09C \uB4A4 \uB2E4\uC2DC \uBCF5\uC0AC\uD574 \uC8FC\uC138\uC694.");
      }
    }
  }
}
async function readSnapshot(app, file) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
  const engine = requireEngine(app);
  assertIdle(app, engine, file);
  await engine.flushSessionEdits(file, { convert: false });
  assertIdle(app, engine, file);
  const raw = await engine.store.getSession(file);
  if (!raw)
    throw new Error("\uC138\uC158\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC138\uC158\uC744 \uB2E4\uC2DC \uC5F4\uC5B4 \uC8FC\uC138\uC694.");
  validateSession(raw);
  const session = JSON.parse(JSON.stringify(raw));
  const snapshot = {
    file,
    title: session.meta.name || "\uC81C\uBAA9 \uC5C6\uB294 \uC138\uC158",
    mode: session.meta.mode === "chat" ? "chat" : "novel",
    engineVersion: (_b = (_a = engine.manifest) == null ? void 0 : _a.version) != null ? _b : "\uC54C \uC218 \uC5C6\uC74C",
    capturedAt: Date.now(),
    body: spansToText(buildSpans(session)),
    messages: [],
    warnings: []
  };
  if (snapshot.mode === "chat") {
    const [scenarios, persona, meta] = await Promise.all([
      (_e = (_d = (_c = engine.store).getScenarios) == null ? void 0 : _d.call(_c).catch(() => null)) != null ? _e : Promise.resolve(null),
      session.meta.personaFile ? (_h = (_g = (_f = engine.store).getUserProfile) == null ? void 0 : _g.call(_f, session.meta.personaFile).catch(() => null)) != null ? _h : Promise.resolve(null) : Promise.resolve(null),
      (_k = (_j = (_i = engine.store).getSessionNodeMeta) == null ? void 0 : _j.call(_i, file).catch(() => null)) != null ? _k : Promise.resolve(null)
    ]);
    if (scenarios === null || meta === null || session.meta.personaFile && !persona) {
      snapshot.warnings.push("\uC77C\uBD80 \uD654\uC790 \uC774\uB984\uC744 \uC77D\uC9C0 \uBABB\uD574 AI\xB7\uC0AC\uC6A9\uC790 \uB610\uB294 \uD654\uC790 ID\uB85C \uD45C\uC2DC\uD569\uB2C8\uB2E4.");
    }
    const byId = new Map((scenarios != null ? scenarios : []).map((item) => {
      var _a2, _b2, _c2;
      return [(_b2 = (_a2 = item.scenario.data.extensions) == null ? void 0 : _a2.stella) == null ? void 0 : _b2.id, (_c2 = item.scenario.data.name) == null ? void 0 : _c2.trim()];
    }));
    const hostName = byId.get(session.meta.scenarioId) || "AI";
    snapshot.messages = buildChatMessages(session).map((msg, index) => {
      var _a2, _b2, _c2, _d2, _e2;
      const speakerId = (_a2 = session.nodes[msg.nodeId]) == null ? void 0 : _a2.speaker;
      const name = msg.role === "user" ? ((_b2 = persona == null ? void 0 : persona.name) == null ? void 0 : _b2.trim()) || "\uC0AC\uC6A9\uC790 / User" : ((_e2 = (_d2 = (_c2 = meta == null ? void 0 : meta.nodes) == null ? void 0 : _c2[msg.nodeId]) == null ? void 0 : _d2.speakerName) == null ? void 0 : _e2.trim()) || (speakerId ? byId.get(speakerId) || `AI (${speakerId})` : hostName);
      return {
        index,
        nodeId: msg.nodeId,
        role: msg.role,
        name,
        text: msg.text.startsWith(CHAT_MESSAGE_SEPARATOR) ? msg.text.slice(CHAT_MESSAGE_SEPARATOR.length) : msg.text
      };
    });
  }
  if (getStellaEngine(app) !== engine)
    throw new Error("\uC2A4\uD154\uB77C\uAC00 \uB2E4\uC2DC \uB85C\uB4DC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uBCF5\uC0AC\uB97C \uB2E4\uC2DC \uC2E4\uD589\uD574 \uC8FC\uC138\uC694.");
  return snapshot;
}

// src/clipboard.ts
async function writeClipboard(text, doc) {
  var _a, _b, _c;
  if (!text.trim())
    throw new Error("\uBCF5\uC0AC\uD560 \uB0B4\uC6A9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
  try {
    const clipboard = (_a = doc.defaultView) == null ? void 0 : _a.navigator.clipboard;
    if (clipboard) {
      await clipboard.writeText(text);
      return true;
    }
  } catch (e) {
  }
  const active = doc.activeElement;
  const selection = (_b = doc.defaultView) == null ? void 0 : _b.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
  const inputSelection = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement ? { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection } : null;
  const field = doc.createElement("textarea");
  field.value = text;
  field.className = "stella-copy-clipboard-helper";
  field.setAttribute("aria-label", "\uBCF5\uC0AC \uC784\uC2DC \uC601\uC5ED / Clipboard");
  doc.body.appendChild(field);
  let copied = false;
  try {
    field.focus();
    field.select();
    copied = doc.execCommand("copy");
  } catch (e) {
    copied = false;
  } finally {
    field.remove();
    active == null ? void 0 : active.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges)
        selection.addRange(range);
    }
    if (inputSelection && (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement)) {
      try {
        active.setSelectionRange(inputSelection.start, inputSelection.end, (_c = inputSelection.direction) != null ? _c : void 0);
      } catch (e) {
      }
    }
  }
  return copied;
}

// src/copy-modal.ts
var import_obsidian = require("obsidian");
var CopyModal = class extends import_obsidian.Modal {
  constructor(app, snapshot, fallback = false) {
    super(app);
    this.fallback = fallback;
    this.options = { ...DEFAULT_OPTIONS };
    this.closed = false;
    this.loading = false;
    this.useRange = false;
    this.snapshot = snapshot;
  }
  onOpen() {
    this.closed = false;
    this.render();
  }
  onClose() {
    this.closed = true;
    this.contentEl.empty();
  }
  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass("stella-copy");
    this.modalEl.addClass("stella-copy-modal");
    const s = this.snapshot;
    this.setTitle("\uC2A4\uD154\uB77C \uBCF5\uC0AC\uAE30 \xB7 Stella Copy");
    root.createEl("p", { cls: "stella-copy-title", text: s.title });
    root.createEl("p", { cls: "stella-copy-caption", text: s.mode === "chat" ? `\uCC44\uD305 / Chat \xB7 ${s.messages.length}\uAC1C \uBA54\uC2DC\uC9C0 \xB7 \uBC88\uD638 0~${Math.max(0, s.messages.length - 1)}` : "\uC18C\uC124 / Novel \xB7 \uD604\uC7AC \uBD84\uAE30 \uC804\uCCB4 \uC6D0\uBB38" });
    root.createEl("p", { cls: "stella-copy-caption", text: "\uD604\uC7AC \uBD84\uAE30\uC758 \uC800\uC7A5 \uC6D0\uBB38\uC744 \uBCF5\uC0AC\uD569\uB2C8\uB2E4. \u2018AI\uC5D0\uAC8C \uC228\uAE40\u2019\uB3C4 \uD3EC\uD568\uD558\uBA70, \uBC88\uC5ED\xB7\uD654\uBA74\uC6A9 \uC815\uADDC\uC2DD\xB7\uC774\uBBF8\uC9C0 \uD30C\uC77C\uC740 \uD3EC\uD568\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." });
    if (s.engineVersion !== TESTED_ENGINE_VERSION) {
      root.createEl("p", { cls: "stella-copy-warning", text: `\uD604\uC7AC \uC5D4\uC9C4 ${s.engineVersion} \xB7 \uC18C\uC2A4 \uAE30\uC900 \uAC80\uC99D \uBC84\uC804 ${TESTED_ENGINE_VERSION}. \uC5C5\uB370\uC774\uD2B8\uB41C \uBC84\uC804\uC740 \uACB0\uACFC\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.` });
    }
    for (const warning of s.warnings)
      root.createEl("p", { cls: "stella-copy-warning", text: warning });
    if (s.mode === "chat") {
      const scope = root.createEl("label", { cls: "stella-copy-field" });
      scope.createSpan({ text: "\uBCF5\uC0AC \uBC94\uC704 / Scope" });
      const select = scope.createEl("select");
      select.createEl("option", { value: "all", text: "\uC804\uCCB4 / All messages" });
      select.createEl("option", { value: "range", text: "\uBC88\uD638 \uBC94\uC704 / Number range" });
      select.value = this.useRange ? "range" : "all";
      const ranges = root.createDiv({ cls: "stella-copy-range" });
      const makeNumber = (label2, value) => {
        const wrap = ranges.createEl("label", { cls: "stella-copy-field" });
        wrap.createSpan({ text: label2 });
        const input = wrap.createEl("input", { type: "number", value });
        input.min = "0";
        input.max = String(Math.max(0, s.messages.length - 1));
        input.step = "1";
        input.inputMode = "numeric";
        input.addEventListener("input", () => this.updatePreview());
        return input;
      };
      this.from = makeNumber("\uC2DC\uC791 \uBC88\uD638 / From", "0");
      this.to = makeNumber("\uB05D \uBC88\uD638 / To", String(Math.max(0, s.messages.length - 1)));
      const updateScope = () => {
        this.useRange = select.value === "range";
        this.from.disabled = this.to.disabled = !this.useRange;
        this.updatePreview();
      };
      select.addEventListener("change", updateScope);
      this.from.disabled = this.to.disabled = !this.useRange;
      root.createEl("p", { cls: "stella-copy-caption", text: "\uCCAB \uBA54\uC2DC\uC9C0\uB294 0\uBC88\uC785\uB2C8\uB2E4. \uC2DC\uC791\xB7\uB05D \uBC88\uD638 \uBAA8\uB450 \uD3EC\uD568\uD569\uB2C8\uB2E4. \uC228\uAE40 \uBA54\uC2DC\uC9C0\uB3C4 \uBC88\uD638\uC5D0 \uD3EC\uD568\uB418\uBA70 \uC0AD\uC81C\uD55C \uBA54\uC2DC\uC9C0\uC640 \uB2E4\uB978 \uBD84\uAE30\uB294 \uC81C\uC678\uB429\uB2C8\uB2E4." });
      const checks = root.createDiv({ cls: "stella-copy-checks" });
      for (const [key, label2] of [["names", "\uD654\uC790 \uC774\uB984 / Names"], ["numbers", "\uBA54\uC2DC\uC9C0 \uBC88\uD638 / Numbers"]]) {
        const wrap = checks.createEl("label");
        const input = wrap.createEl("input", { type: "checkbox" });
        input.checked = this.options[key];
        wrap.createSpan({ text: label2 });
        input.addEventListener("change", () => {
          this.options[key] = input.checked;
          this.updatePreview();
        });
      }
    }
    const label = root.createEl("label", { cls: "stella-copy-field" });
    label.createSpan({ text: "\uBCF5\uC0AC \uACB0\uACFC \uBBF8\uB9AC\uBCF4\uAE30 / Preview" });
    this.preview = label.createEl("textarea", { cls: "stella-copy-preview" });
    this.preview.readOnly = true;
    this.preview.spellcheck = false;
    this.status = root.createEl("p", { cls: "stella-copy-status", attr: { role: "status", "aria-live": "polite" } });
    const actions = root.createDiv({ cls: "stella-copy-actions" });
    this.copyButton = actions.createEl("button", { cls: "mod-cta", text: "\uBCF5\uC0AC / Copy" });
    this.copyButton.addEventListener("click", () => void this.copy());
    const selectAll = actions.createEl("button", { text: "\uD14D\uC2A4\uD2B8 \uC120\uD0DD / Select text" });
    selectAll.addEventListener("click", () => {
      this.preview.focus();
      this.preview.select();
    });
    const refresh = actions.createEl("button", { text: "\uB2E4\uC2DC \uBD88\uB7EC\uC624\uAE30 / Reload" });
    refresh.addEventListener("click", () => void this.reload(refresh));
    root.createEl("p", { cls: "stella-copy-caption", text: "\uC774 \uCC3D\uC744 \uC5F4 \uB54C\uC758 \uB0B4\uC6A9\uC785\uB2C8\uB2E4. \uC774\uD6C4 \uC218\uC815\uD558\uAC70\uB098 \uBD84\uAE30\uB97C \uBC14\uAFE8\uB2E4\uBA74 \uB2E4\uC2DC \uBD88\uB7EC\uC624\uC138\uC694. \uC0C8\uB85C \uBD88\uB7EC\uC624\uBA74 \uBC88\uD638 \uBC94\uC704\uAC00 \uCD08\uAE30\uD654\uB429\uB2C8\uB2E4." });
    this.updatePreview();
    if (this.fallback) {
      this.status.setText("\uC790\uB3D9 \uBCF5\uC0AC\uAC00 \uCC28\uB2E8\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \u2018\uD14D\uC2A4\uD2B8 \uC120\uD0DD\u2019 \uD6C4 \uAE30\uAE30\uC758 \uBCF5\uC0AC \uBA54\uB274 \uB610\uB294 Ctrl/Cmd+C\uB97C \uC0AC\uC6A9\uD574 \uC8FC\uC138\uC694.");
      this.fallback = false;
    }
  }
  updatePreview() {
    if (!this.preview)
      return;
    try {
      const range = this.snapshot.mode === "chat" && this.useRange ? parseRange(this.from.value, this.to.value, this.snapshot.messages.length) : void 0;
      this.preview.value = formatCopy(this.snapshot, this.options, range);
      const valid = Boolean(this.preview.value.trim());
      this.copyButton.disabled = !valid || this.loading;
      this.status.removeClass("stella-copy-warning");
      this.status.setText(valid ? range ? `#${range[0]}~#${range[1]} \xB7 ${range[1] - range[0] + 1}\uAC1C \uBA54\uC2DC\uC9C0 \uC120\uD0DD` : "\uC804\uCCB4 \uC120\uD0DD / All selected" : "\uBCF5\uC0AC\uD560 \uB0B4\uC6A9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
    } catch (error) {
      this.preview.value = "";
      this.copyButton.disabled = true;
      this.status.addClass("stella-copy-warning");
      this.status.setText(error instanceof Error ? error.message : "\uBC88\uD638\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
    }
  }
  async copy() {
    this.updatePreview();
    if (this.copyButton.disabled)
      return;
    this.copyButton.disabled = true;
    try {
      const copied = await writeClipboard(this.preview.value, this.contentEl.ownerDocument);
      if (this.closed)
        return;
      if (copied) {
        this.status.setText("\uD074\uB9BD\uBCF4\uB4DC\uC5D0 \uBCF5\uC0AC\uD588\uC2B5\uB2C8\uB2E4. / Copied");
        new import_obsidian.Notice("\uC2A4\uD154\uB77C \uC6D0\uBB38\uC744 \uBCF5\uC0AC\uD588\uC2B5\uB2C8\uB2E4.");
      } else {
        this.preview.focus();
        this.preview.select();
        this.status.setText("\uC790\uB3D9 \uBCF5\uC0AC\uAC00 \uCC28\uB2E8\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC120\uD0DD\uB41C \uD14D\uC2A4\uD2B8\uB97C \uAE30\uAE30\uC758 \uBCF5\uC0AC \uBA54\uB274 \uB610\uB294 Ctrl/Cmd+C\uB85C \uBCF5\uC0AC\uD574 \uC8FC\uC138\uC694.");
      }
    } catch (error) {
      if (!this.closed)
        this.status.setText(error instanceof Error ? error.message : "\uBCF5\uC0AC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      if (!this.closed)
        this.copyButton.disabled = false;
    }
  }
  async reload(button) {
    if (this.loading)
      return;
    this.loading = true;
    button.disabled = true;
    this.copyButton.disabled = true;
    this.status.setText("\uBD88\uB7EC\uC624\uB294 \uC911 / Loading\u2026");
    try {
      const snapshot = await readSnapshot(this.app, this.snapshot.file);
      if (this.closed)
        return;
      this.snapshot = snapshot;
      this.loading = false;
      this.render();
    } catch (error) {
      if (!this.closed)
        this.status.setText(`\uC0C8\uB85C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uAE30\uC874 \uBBF8\uB9AC\uBCF4\uAE30\uB97C \uC720\uC9C0\uD569\uB2C8\uB2E4. ${error instanceof Error ? error.message : ""}`);
    } finally {
      this.loading = false;
      if (!this.closed) {
        button.disabled = false;
        this.copyButton.disabled = !this.preview.value.trim();
      }
    }
  }
};

// src/main.ts
var StellaCopyPlugin = class extends import_obsidian2.Plugin {
  constructor() {
    super(...arguments);
    this.bound = null;
    this.unregister = null;
    this.stopped = false;
    this.running = false;
    this.modals = /* @__PURE__ */ new Set();
  }
  async onload() {
    this.stopped = false;
    this.addCommand({
      id: "copy-all",
      name: "\uC804\uCCB4 \uC6D0\uBB38 \uBCF5\uC0AC / Copy all",
      icon: "copy",
      callback: () => void this.run(false)
    });
    this.addCommand({
      id: "copy-range",
      name: "\uBC88\uD638 \uBC94\uC704\xB7\uBBF8\uB9AC\uBCF4\uAE30 / Range & preview",
      icon: "list-ordered",
      callback: () => void this.run(true)
    });
    this.app.workspace.onLayoutReady(() => {
      if (this.stopped)
        return;
      this.bindEngine();
      this.registerInterval(window.setInterval(() => this.bindEngine(), 2e3));
    });
  }
  bindEngine() {
    var _a;
    if (this.stopped)
      return;
    const engine = getStellaEngine(this.app);
    if (engine === this.bound)
      return;
    this.detach();
    if (!engine || typeof ((_a = engine.extensions) == null ? void 0 : _a.register) !== "function")
      return;
    try {
      this.unregister = engine.extensions.register({
        id: "stella-copy:actions",
        sessionActions: [
          { id: "stella-copy:copy-all", title: "\uC804\uCCB4 \uC6D0\uBB38 \uBCF5\uC0AC / Copy all", icon: "copy", run: ({ sessionFile }) => this.run(false, sessionFile) },
          { id: "stella-copy:copy-range", title: "\uBC88\uD638 \uBC94\uC704\xB7\uBBF8\uB9AC\uBCF4\uAE30 / Range & preview", icon: "list-ordered", run: ({ sessionFile }) => this.run(true, sessionFile) }
        ]
      });
      this.bound = engine;
    } catch (e) {
    }
  }
  detach() {
    var _a;
    try {
      (_a = this.unregister) == null ? void 0 : _a.call(this);
    } catch (e) {
    }
    this.unregister = null;
    this.bound = null;
  }
  showModal(snapshot, fallback = false) {
    if (this.stopped)
      return;
    const modal = new CopyModal(this.app, snapshot, fallback);
    const close = modal.onClose.bind(modal);
    modal.onClose = () => {
      close();
      this.modals.delete(modal);
    };
    this.modals.add(modal);
    modal.open();
  }
  async run(preview, explicitFile) {
    if (this.stopped || this.running)
      return;
    this.running = true;
    try {
      const file = explicitFile != null ? explicitFile : currentSessionFile(this.app);
      if (!file)
        throw new Error("\uBCF5\uC0AC\uD560 \uC2A4\uD154\uB77C \uC138\uC158\uC744 \uBA3C\uC800 \uC5F4\uC5B4 \uC8FC\uC138\uC694.");
      const snapshot = await readSnapshot(this.app, file);
      if (this.stopped)
        return;
      if (preview || snapshot.warnings.length > 0 || snapshot.engineVersion !== "0.0.46") {
        this.showModal(snapshot);
        return;
      }
      const text = formatCopy(snapshot, DEFAULT_OPTIONS);
      if (!text.trim())
        throw new Error("\uBCF5\uC0AC\uD560 \uB0B4\uC6A9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
      const copied = await writeClipboard(text, document);
      if (this.stopped)
        return;
      if (copied)
        new import_obsidian2.Notice(snapshot.mode === "chat" ? `\uCC44\uD305 ${snapshot.messages.length}\uAC1C \uBA54\uC2DC\uC9C0\uB97C \uBCF5\uC0AC\uD588\uC2B5\uB2C8\uB2E4.` : "\uD604\uC7AC \uBD84\uAE30\uC758 \uC18C\uC124 \uC6D0\uBB38 \uC804\uCCB4\uB97C \uBCF5\uC0AC\uD588\uC2B5\uB2C8\uB2E4.");
      else
        this.showModal(snapshot, true);
    } catch (error) {
      if (!this.stopped)
        new import_obsidian2.Notice(error instanceof Error ? error.message : "\uBCF5\uC0AC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      this.running = false;
    }
  }
  onunload() {
    this.stopped = true;
    this.detach();
    for (const modal of this.modals)
      modal.close();
    this.modals.clear();
  }
};

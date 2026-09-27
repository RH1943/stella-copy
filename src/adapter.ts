import type { App } from "obsidian";
import { getStellaEngine, type StellaEngineApi } from "./stella-api";
import type { CopySnapshot } from "./model";
import { validateSession } from "./copy-text";
import { buildSpans, spansToText } from "./vendor/session-text";
import { buildChatMessages, CHAT_MESSAGE_SEPARATOR } from "./vendor/chat-messages";

export const TESTED_ENGINE_VERSION = "0.0.46";
const VIEW_TYPES = ["ggai-stella-session", "ggai-stella-chat-session", "ggai-stella-pro-session"];
interface ScenarioItem { scenarioFile: string; scenario: { data: { name?: string; extensions?: { stella?: { id?: string } } } } }
interface NodeMeta { nodes?: Record<string, { speakerName?: string }> }
export interface CopyEngine extends StellaEngineApi {
  manifest?: { version?: string };
  getActiveOrLastSessionFile?(): string | null;
  flushSessionEdits(file: string, opts?: { convert?: boolean }): Promise<void>;
  isSessionChanging?(file: string): boolean;
  store: {
    getSession(file: string): Promise<unknown>;
    getScenarios?(): Promise<ScenarioItem[]>;
    getUserProfile?(file: string): Promise<{ name?: string } | null>;
    getSessionNodeMeta?(file: string): Promise<NodeMeta>;
  };
}
interface HostView { getSessionFile?(): string | null; isGenerating?(): boolean }

export function requireEngine(app: App): CopyEngine {
  const engine = getStellaEngine(app) as CopyEngine | null;
  if (!engine) throw new Error("스텔라 엔진을 먼저 활성화해 주세요.");
  if (typeof engine.store?.getSession !== "function" || typeof engine.flushSessionEdits !== "function") {
    throw new Error("이 스텔라 버전은 복사기와 호환되지 않습니다. 기준 버전: 0.0.46.");
  }
  return engine;
}

export function currentSessionFile(app: App): string | null {
  const engine = getStellaEngine(app) as CopyEngine | null;
  return engine?.getActiveOrLastSessionFile?.() ?? null;
}

function assertIdle(app: App, engine: CopyEngine, file: string): void {
  if (engine.isSessionChanging?.(file)) throw new Error("세션 작업이 끝난 뒤 다시 복사해 주세요.");
  for (const type of VIEW_TYPES) {
    for (const leaf of app.workspace.getLeavesOfType(type)) {
      const view = leaf.view as unknown as HostView;
      if (view.getSessionFile?.() === file && view.isGenerating?.()) {
        throw new Error("생성·번역 등 진행 중인 작업이 끝난 뒤 다시 복사해 주세요.");
      }
    }
  }
}

/** Only engine-owned flush may commit edits. This adapter never calls save/patch or reads JSON files directly. */
export async function readSnapshot(app: App, file: string): Promise<CopySnapshot> {
  const engine = requireEngine(app);
  assertIdle(app, engine, file);
  await engine.flushSessionEdits(file, { convert: false });
  assertIdle(app, engine, file);
  const raw = await engine.store.getSession(file);
  if (!raw) throw new Error("세션을 찾을 수 없습니다. 세션을 다시 열어 주세요.");
  validateSession(raw);
  // Store returns shared cache objects; take an isolated snapshot before any more awaits.
  const session = JSON.parse(JSON.stringify(raw)) as typeof raw;
  const snapshot: CopySnapshot = {
    file, title: session.meta.name || "제목 없는 세션", mode: session.meta.mode === "chat" ? "chat" : "novel",
    engineVersion: engine.manifest?.version ?? "알 수 없음", capturedAt: Date.now(),
    body: spansToText(buildSpans(session)), messages: [], warnings: [],
  };
  if (snapshot.mode === "chat") {
    const [scenarios, persona, meta] = await Promise.all([
      engine.store.getScenarios?.().catch(() => null) ?? Promise.resolve(null),
      session.meta.personaFile ? engine.store.getUserProfile?.(session.meta.personaFile).catch(() => null) ?? Promise.resolve(null) : Promise.resolve(null),
      engine.store.getSessionNodeMeta?.(file).catch(() => null) ?? Promise.resolve(null),
    ]);
    if (scenarios === null || meta === null || (session.meta.personaFile && !persona)) {
      snapshot.warnings.push("일부 화자 이름을 읽지 못해 AI·사용자 또는 화자 ID로 표시합니다.");
    }
    const byId = new Map((scenarios ?? []).map(item => [item.scenario.data.extensions?.stella?.id, item.scenario.data.name?.trim()]));
    const hostName = byId.get(session.meta.scenarioId) || "AI";
    snapshot.messages = buildChatMessages(session).map((msg, index) => {
      const speakerId = session.nodes[msg.nodeId]?.speaker;
      const name = msg.role === "user" ? persona?.name?.trim() || "사용자 / User"
        : meta?.nodes?.[msg.nodeId]?.speakerName?.trim() || (speakerId ? byId.get(speakerId) || `AI (${speakerId})` : hostName);
      return { index, nodeId: msg.nodeId, role: msg.role, name,
        text: msg.text.startsWith(CHAT_MESSAGE_SEPARATOR) ? msg.text.slice(CHAT_MESSAGE_SEPARATOR.length) : msg.text };
    });
  }
  if (getStellaEngine(app) !== engine) throw new Error("스텔라가 다시 로드되었습니다. 복사를 다시 실행해 주세요.");
  return snapshot;
}

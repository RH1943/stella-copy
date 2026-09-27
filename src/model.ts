/** Minimal read-only projection of Stella 0.0.46's session schema. */
export interface Span { author: "ai" | "user"; text: string }
export type Patch =
  | { op: "append"; spans: Span[] }
  | { op: "replace"; from: number; to: number; spans: Span[] }
  | { op: "delete"; from: number; to: number };
export type TurnKind = "root" | "ai-continue" | "ai-regen" | "user-write" | "user-edit";
export interface SessionNode {
  id: string;
  parent: string | null;
  kind: TurnKind;
  patches: Patch[];
  speaker?: string;
}
export interface StellaSession {
  schemaVersion: 1;
  meta: {
    name?: string;
    mode?: "novel" | "textgame" | "chat";
    rootId: string;
    activeLeafId: string;
    scenarioId?: string;
    personaFile?: string;
  };
  nodes: Record<string, SessionNode>;
}
export interface CopyMessage { index: number; nodeId: string; role: "user" | "assistant"; name: string; text: string }
export interface CopySnapshot {
  file: string;
  title: string;
  mode: "chat" | "novel";
  engineVersion: string;
  capturedAt: number;
  body: string;
  messages: CopyMessage[];
  warnings: string[];
}

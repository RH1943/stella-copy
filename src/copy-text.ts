import type { CopySnapshot, StellaSession, SessionNode } from "./model";
import { pathToLeaf } from "./vendor/session-text";

/** Fail closed for unknown/corrupt active paths rather than silently copying a partial story. */
export function validateSession(value: unknown): asserts value is StellaSession {
  const s = value as StellaSession | null;
  const bad = () => new Error("이 세션 구조를 안전하게 읽을 수 없습니다. 스텔라 버전과 세션 파일을 확인해 주세요.");
  if (!s || s.schemaVersion !== 1 || !s.meta || !s.nodes || typeof s.nodes !== "object" ||
    typeof s.meta.activeLeafId !== "string" || typeof s.meta.rootId !== "string" ||
    ![undefined, "novel", "chat", "textgame"].includes(s.meta.mode)) throw bad();
  const seen = new Set<string>();
  let id: string | null = s.meta.activeLeafId;
  let root = "";
  while (id !== null) {
    if (seen.has(id) || !Object.prototype.hasOwnProperty.call(s.nodes, id)) throw bad();
    seen.add(id);
    const node: SessionNode = s.nodes[id];
    if (!node || node.id !== id || !(node.parent === null || typeof node.parent === "string") ||
      !["root", "ai-continue", "ai-regen", "user-write", "user-edit"].includes(node.kind) ||
      !Array.isArray(node.patches)) throw bad();
    root = id;
    id = node.parent;
  }
  if (root !== s.meta.rootId) throw bad();
  let length = 0;
  for (const node of pathToLeaf(s, s.meta.activeLeafId)) {
    for (const p of node.patches) {
      if (!p || !["append", "replace", "delete"].includes(p.op)) throw bad();
      let added = 0;
      if (p.op !== "delete") {
        if (!Array.isArray(p.spans)) throw bad();
        for (const span of p.spans) {
          if (!span || typeof span.text !== "string" || !["ai", "user"].includes(span.author)) throw bad();
          added += span.text.length;
        }
      }
      if (p.op === "append") length += added;
      else {
        if (!Number.isSafeInteger(p.from) || !Number.isSafeInteger(p.to) || p.from < 0 || p.to < p.from || p.to > length) throw bad();
        length += added - (p.to - p.from);
      }
    }
  }
}

export interface CopyOptions { names: boolean; numbers: boolean }
export const DEFAULT_OPTIONS: CopyOptions = { names: true, numbers: false };

export function parseRange(start: string, end: string, total: number): [number, number] {
  if (total < 1) throw new Error("복사할 메시지가 없습니다.");
  if (!/^\d+$/.test(start.trim()) || !/^\d+$/.test(end.trim())) {
    throw new Error("시작·끝 번호에 0 이상의 정수를 입력해 주세요.");
  }
  const from = Number(start.trim()), to = Number(end.trim());
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from > to || to >= total) {
    throw new Error(`번호는 0~${total - 1} 사이여야 하며, 시작 번호가 끝 번호보다 클 수 없습니다.`);
  }
  return [from, to];
}

export function formatCopy(snapshot: CopySnapshot, options: CopyOptions, range?: [number, number]): string {
  if (snapshot.mode === "novel") return snapshot.body;
  const [from, to] = range ? parseRange(String(range[0]), String(range[1]), snapshot.messages.length)
    : [0, snapshot.messages.length - 1];
  return snapshot.messages.slice(from, to + 1).map(message => {
    const heading = [options.numbers ? `#${message.index}` : "", options.names ? message.name : ""].filter(Boolean).join(" · ");
    return heading ? `${heading}\n${message.text}` : message.text;
  }).join("\n\n");
}

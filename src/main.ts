import { Notice, Plugin } from "obsidian";
import { getStellaEngine, type StellaEngineApi } from "./stella-api";
import { currentSessionFile, readSnapshot } from "./adapter";
import { DEFAULT_OPTIONS, formatCopy } from "./copy-text";
import { writeClipboard } from "./clipboard";
import { CopyModal } from "./copy-modal";

export default class StellaCopyPlugin extends Plugin {
  private bound: StellaEngineApi | null = null;
  private unregister: (() => void) | null = null;
  private stopped = false;
  private running = false;
  private modals = new Set<CopyModal>();

  async onload(): Promise<void> {
    this.stopped = false;
    this.addCommand({ id: "copy-all", name: "전체 원문 복사 / Copy all", icon: "copy",
      callback: () => void this.run(false) });
    this.addCommand({ id: "copy-range", name: "번호 범위·미리보기 / Range & preview", icon: "list-ordered",
      callback: () => void this.run(true) });
    this.app.workspace.onLayoutReady(() => {
      if (this.stopped) return;
      this.bindEngine();
      // Handles late loading and disabling/re-enabling Stella without monkey-patching the host.
      this.registerInterval(window.setInterval(() => this.bindEngine(), 2000));
    });
  }

  private bindEngine(): void {
    if (this.stopped) return;
    const engine = getStellaEngine(this.app);
    if (engine === this.bound) return;
    this.detach();
    if (!engine || typeof engine.extensions?.register !== "function") return;
    try {
      this.unregister = engine.extensions.register({
        id: "stella-copy:actions",
        sessionActions: [
          { id: "stella-copy:copy-all", title: "전체 원문 복사 / Copy all", icon: "copy", run: ({ sessionFile }) => this.run(false, sessionFile) },
          { id: "stella-copy:copy-range", title: "번호 범위·미리보기 / Range & preview", icon: "list-ordered", run: ({ sessionFile }) => this.run(true, sessionFile) },
        ],
      });
      this.bound = engine;
    } catch { /* commands remain available; retry after Stella finishes loading */ }
  }

  private detach(): void {
    try { this.unregister?.(); } catch { /* host may already have unloaded */ }
    this.unregister = null;
    this.bound = null;
  }

  private showModal(snapshot: Awaited<ReturnType<typeof readSnapshot>>, fallback = false): void {
    if (this.stopped) return;
    const modal = new CopyModal(this.app, snapshot, fallback);
    const close = modal.onClose.bind(modal);
    modal.onClose = () => { close(); this.modals.delete(modal); };
    this.modals.add(modal);
    modal.open();
  }

  private async run(preview: boolean, explicitFile?: string): Promise<void> {
    if (this.stopped || this.running) return;
    this.running = true;
    try {
      const file = explicitFile ?? currentSessionFile(this.app);
      if (!file) throw new Error("복사할 스텔라 세션을 먼저 열어 주세요.");
      const snapshot = await readSnapshot(this.app, file);
      if (this.stopped) return;
      if (preview || snapshot.warnings.length > 0 || snapshot.engineVersion !== "0.0.46") {
        this.showModal(snapshot);
        return;
      }
      const text = formatCopy(snapshot, DEFAULT_OPTIONS);
      if (!text.trim()) throw new Error("복사할 내용이 없습니다.");
      const copied = await writeClipboard(text, document);
      if (this.stopped) return;
      if (copied) new Notice(snapshot.mode === "chat" ? `채팅 ${snapshot.messages.length}개 메시지를 복사했습니다.` : "현재 분기의 소설 원문 전체를 복사했습니다.");
      else this.showModal(snapshot, true);
    } catch (error) {
      if (!this.stopped) new Notice(error instanceof Error ? error.message : "복사하지 못했습니다.");
    } finally { this.running = false; }
  }

  onunload(): void {
    this.stopped = true;
    this.detach();
    for (const modal of this.modals) modal.close();
    this.modals.clear();
  }
}

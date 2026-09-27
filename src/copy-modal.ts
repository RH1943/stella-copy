import { App, Modal, Notice } from "obsidian";
import type { CopySnapshot } from "./model";
import { DEFAULT_OPTIONS, formatCopy, parseRange } from "./copy-text";
import { readSnapshot, TESTED_ENGINE_VERSION } from "./adapter";
import { writeClipboard } from "./clipboard";

export class CopyModal extends Modal {
  private snapshot: CopySnapshot;
  private options = { ...DEFAULT_OPTIONS };
  private preview!: HTMLTextAreaElement;
  private status!: HTMLElement;
  private copyButton!: HTMLButtonElement;
  private from!: HTMLInputElement;
  private to!: HTMLInputElement;
  private closed = false;
  private loading = false;
  private useRange = false;

  constructor(app: App, snapshot: CopySnapshot, private fallback = false) {
    super(app);
    this.snapshot = snapshot;
  }

  onOpen(): void { this.closed = false; this.render(); }
  onClose(): void { this.closed = true; this.contentEl.empty(); }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("stella-copy");
    this.modalEl.addClass("stella-copy-modal");
    const s = this.snapshot;
    this.setTitle("스텔라 복사기 · Stella Copy");
    root.createEl("p", { cls: "stella-copy-title", text: s.title });
    root.createEl("p", { cls: "stella-copy-caption", text: s.mode === "chat"
      ? `채팅 / Chat · ${s.messages.length}개 메시지 · 번호 0~${Math.max(0, s.messages.length - 1)}`
      : "소설 / Novel · 현재 분기 전체 원문" });
    root.createEl("p", { cls: "stella-copy-caption", text: "현재 분기의 저장 원문을 복사합니다. ‘AI에게 숨김’도 포함하며, 번역·화면용 정규식·이미지 파일은 포함하지 않습니다." });
    if (s.engineVersion !== TESTED_ENGINE_VERSION) {
      root.createEl("p", { cls: "stella-copy-warning", text: `현재 엔진 ${s.engineVersion} · 소스 기준 검증 버전 ${TESTED_ENGINE_VERSION}. 업데이트된 버전은 결과를 확인해 주세요.` });
    }
    for (const warning of s.warnings) root.createEl("p", { cls: "stella-copy-warning", text: warning });

    if (s.mode === "chat") {
      const scope = root.createEl("label", { cls: "stella-copy-field" });
      scope.createSpan({ text: "복사 범위 / Scope" });
      const select = scope.createEl("select");
      select.createEl("option", { value: "all", text: "전체 / All messages" });
      select.createEl("option", { value: "range", text: "번호 범위 / Number range" });
      select.value = this.useRange ? "range" : "all";
      const ranges = root.createDiv({ cls: "stella-copy-range" });
      const makeNumber = (label: string, value: string): HTMLInputElement => {
        const wrap = ranges.createEl("label", { cls: "stella-copy-field" });
        wrap.createSpan({ text: label });
        const input = wrap.createEl("input", { type: "number", value });
        input.min = "0"; input.max = String(Math.max(0, s.messages.length - 1)); input.step = "1";
        input.inputMode = "numeric";
        input.addEventListener("input", () => this.updatePreview());
        return input;
      };
      this.from = makeNumber("시작 번호 / From", "0");
      this.to = makeNumber("끝 번호 / To", String(Math.max(0, s.messages.length - 1)));
      const updateScope = () => {
        this.useRange = select.value === "range";
        this.from.disabled = this.to.disabled = !this.useRange;
        this.updatePreview();
      };
      select.addEventListener("change", updateScope);
      this.from.disabled = this.to.disabled = !this.useRange;
      root.createEl("p", { cls: "stella-copy-caption", text: "첫 메시지는 0번입니다. 시작·끝 번호 모두 포함합니다. 숨김 메시지도 번호에 포함되며 삭제한 메시지와 다른 분기는 제외됩니다." });
      const checks = root.createDiv({ cls: "stella-copy-checks" });
      for (const [key, label] of [["names", "화자 이름 / Names"], ["numbers", "메시지 번호 / Numbers"]] as const) {
        const wrap = checks.createEl("label");
        const input = wrap.createEl("input", { type: "checkbox" });
        input.checked = this.options[key];
        wrap.createSpan({ text: label });
        input.addEventListener("change", () => { this.options[key] = input.checked; this.updatePreview(); });
      }
    }

    const label = root.createEl("label", { cls: "stella-copy-field" });
    label.createSpan({ text: "복사 결과 미리보기 / Preview" });
    this.preview = label.createEl("textarea", { cls: "stella-copy-preview" });
    this.preview.readOnly = true;
    this.preview.spellcheck = false;
    this.status = root.createEl("p", { cls: "stella-copy-status", attr: { role: "status", "aria-live": "polite" } });
    const actions = root.createDiv({ cls: "stella-copy-actions" });
    this.copyButton = actions.createEl("button", { cls: "mod-cta", text: "복사 / Copy" });
    this.copyButton.addEventListener("click", () => void this.copy());
    const selectAll = actions.createEl("button", { text: "텍스트 선택 / Select text" });
    selectAll.addEventListener("click", () => { this.preview.focus(); this.preview.select(); });
    const refresh = actions.createEl("button", { text: "다시 불러오기 / Reload" });
    refresh.addEventListener("click", () => void this.reload(refresh));
    root.createEl("p", { cls: "stella-copy-caption", text: "이 창을 열 때의 내용입니다. 이후 수정하거나 분기를 바꿨다면 다시 불러오세요. 새로 불러오면 번호 범위가 초기화됩니다." });
    this.updatePreview();
    if (this.fallback) {
      this.status.setText("자동 복사가 차단되었습니다. ‘텍스트 선택’ 후 기기의 복사 메뉴 또는 Ctrl/Cmd+C를 사용해 주세요.");
      this.fallback = false;
    }
  }

  private updatePreview(): void {
    if (!this.preview) return;
    try {
      const range = this.snapshot.mode === "chat" && this.useRange
        ? parseRange(this.from.value, this.to.value, this.snapshot.messages.length) : undefined;
      this.preview.value = formatCopy(this.snapshot, this.options, range);
      const valid = Boolean(this.preview.value.trim());
      this.copyButton.disabled = !valid || this.loading;
      this.status.removeClass("stella-copy-warning");
      this.status.setText(valid ? (range ? `#${range[0]}~#${range[1]} · ${range[1] - range[0] + 1}개 메시지 선택` : "전체 선택 / All selected") : "복사할 내용이 없습니다.");
    } catch (error) {
      this.preview.value = "";
      this.copyButton.disabled = true;
      this.status.addClass("stella-copy-warning");
      this.status.setText(error instanceof Error ? error.message : "번호를 확인해 주세요.");
    }
  }

  private async copy(): Promise<void> {
    this.updatePreview();
    if (this.copyButton.disabled) return;
    this.copyButton.disabled = true;
    try {
      const copied = await writeClipboard(this.preview.value, this.contentEl.ownerDocument);
      if (this.closed) return;
      if (copied) { this.status.setText("클립보드에 복사했습니다. / Copied"); new Notice("스텔라 원문을 복사했습니다."); }
      else {
        this.preview.focus(); this.preview.select();
        this.status.setText("자동 복사가 차단되었습니다. 선택된 텍스트를 기기의 복사 메뉴 또는 Ctrl/Cmd+C로 복사해 주세요.");
      }
    } catch (error) { if (!this.closed) this.status.setText(error instanceof Error ? error.message : "복사하지 못했습니다."); }
    finally { if (!this.closed) this.copyButton.disabled = false; }
  }

  private async reload(button: HTMLButtonElement): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    button.disabled = true;
    this.copyButton.disabled = true;
    this.status.setText("불러오는 중 / Loading…");
    try {
      const snapshot = await readSnapshot(this.app, this.snapshot.file);
      if (this.closed) return;
      this.snapshot = snapshot;
      this.loading = false;
      this.render();
    } catch (error) {
      if (!this.closed) this.status.setText(`새로 불러오지 못했습니다. 기존 미리보기를 유지합니다. ${error instanceof Error ? error.message : ""}`);
    } finally {
      this.loading = false;
      if (!this.closed) { button.disabled = false; this.copyButton.disabled = !this.preview.value.trim(); }
    }
  }
}

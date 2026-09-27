/** Browser clipboard first; legacy fallback stays local and restores focus/selection. */
export async function writeClipboard(text: string, doc: Document): Promise<boolean> {
  if (!text.trim()) throw new Error("복사할 내용이 없습니다.");
  try {
    const clipboard = doc.defaultView?.navigator.clipboard;
    if (clipboard) { await clipboard.writeText(text); return true; }
  } catch { /* mobile/permission fallback below */ }
  const active = doc.activeElement as HTMLElement | null;
  const selection = doc.defaultView?.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
  const inputSelection = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement
    ? { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection } : null;
  const field = doc.createElement("textarea");
  field.value = text;
  field.className = "stella-copy-clipboard-helper";
  field.setAttribute("aria-label", "복사 임시 영역 / Clipboard");
  doc.body.appendChild(field);
  let copied = false;
  try { field.focus(); field.select(); copied = doc.execCommand("copy"); }
  catch { copied = false; }
  finally {
    field.remove();
    active?.focus({ preventScroll: true });
    if (selection) { selection.removeAllRanges(); for (const range of ranges) selection.addRange(range); }
    if (inputSelection && (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement)) {
      try { active.setSelectionRange(inputSelection.start, inputSelection.end, inputSelection.direction ?? undefined); } catch { /* non-text input */ }
    }
  }
  return copied;
}

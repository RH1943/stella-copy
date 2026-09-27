/**
 * GGAI Stella Engine 확장 API 타입 + 접근 헬퍼.
 *
 * 스텔라도 npm 패키지가 아니므로 외부 플러그인이 쓸 수 있는 공개 계약만 여기
 * 로컬로 선언한다. 스텔라 내부 타입(StellaSession 등)은 구조 전체를 복제하지
 * 않고 필요한 최소만 느슨하게 잡는다.
 * 사용법·규칙은 docs/stella-settings-panel.md, docs/stella-extension-hooks.md 참조.
 */

import type { App } from "obsidian";

// ─── 확장 탭 설정 패널 (UI 면) ───

export interface StellaSettingsPanelContext {
  /** 스텔라 플러그인 인스턴스. plugin.ai / plugin.store 등 접근 가능 (타입은 느슨). */
  plugin: unknown;
  /** 현재 활성 세션 파일 경로. 확장 탭은 세션이 없으면 그려지지 않으므로 실사용 시 non-null. */
  activeSessionFile: string | null;
  /** 스텔라 내장 활성 설정 스냅샷 — 외부 확장은 읽기만 하고 patchSettings 는 쓰지 않는다. */
  settings: Record<string, unknown>;
  /** 내장 패널 전용 — 외부 확장은 사용 금지 (내장 기능 필드와 충돌). */
  patchSettings: (patch: Record<string, unknown>) => Promise<unknown>;
  /** 외부 확장 전용 저장 칸 읽기. 패널 id + 활성 세션(없으면 전역) 기준 격리. */
  getPanelData: <T = unknown>() => T | undefined;
  /** 외부 확장 전용 저장 칸에 병합 저장 + 이 패널 재렌더. */
  setPanelData: (patch: Record<string, unknown>) => Promise<void>;
  /** 이 패널 본문만 다시 그린다. */
  rerender: () => void;
}

export interface StellaSettingsPanel {
  /** 자기 플러그인 id 로 네임스페이스한 고유 id (예: "my-plugin:foo") */
  id: string;
  title: string;
  /** 낮을수록 위. 내장 패널이 0~99 를 쓰므로 외부는 100 이상 권장. */
  order?: number;
  render(body: HTMLElement, ctx: StellaSettingsPanelContext): void;
}

// ─── 생성 과정 개입 (실행 면) ───

/**
 * 세션창 하단 확장 버튼(퍼즐) 트레이에 넣는 조작 액션.
 * 확장이 세션 화면에 자체 버튼/툴바/모달을 직접 붙이는 대신 쓰는 공용 진입점.
 * 상세 규약: docs/stella-extension-hooks.md "조작 UI — 두 가지 선택지"
 */
export interface StellaSessionAction {
  /** 확장 안에서 유일한 id */
  id: string;
  /** 트레이에 표시할 이름 */
  title: string;
  /** Lucide 아이콘 이름. 생략 시 puzzle */
  icon?: string;
  run(input: { plugin: unknown; sessionFile: string }): void | Promise<void>;
}

export interface StellaGenerationCompleteInput {
  plugin: unknown;
  /** 세션 파일 경로 */
  sessionFile: string;
  /** 새로 만들어진 AI 노드 id */
  nodeId: string;
  /** 생성된 가시 텍스트 */
  generatedText: string;
  /**
   * 생성 시작 지점(부모)까지의 **저장 원문** — 문자 오프셋 기준값이라 숨김 구간도
   * 그대로 들어 있다. 위치 계산(내가 붙인 것이 본문 어디인지)에만 쓰고,
   * **AI 에게 넘길 재료로는 쓰지 말 것** — 그 용도는 `plugin.getSessionBodyText(...)`.
   */
  parentText: string;
  profile: unknown;
}

/**
 * 컨텍스트 기여 — 외부 확장이 원하는 텍스트를 전송본의 원하는 위치에 넣는
 * **유일한 진입점**. 엔진이 가상 로어북 상시 엔트리로 감싸 삽입하므로
 * 미리보기·생성·토큰 예산에 자동으로 동일 반영된다.
 * 상세 규약: docs/stella-extension-hooks.md
 */
export interface StellaCustomContext {
  slot: "custom";
  /** 삽입할 텍스트. 빈 문자열이면 무시된다. */
  text: string;
  /** 디버깅/로그 표시명. 생략 시 확장 id. */
  name?: string;
  /** 삽입 위치 (ST 로어북 position 의미). 기본 "after_char" (캐릭터 설명 뒤). */
  position?: "before_char" | "after_char" | "before_examples" | "after_examples" | "at_depth";
  /** position="at_depth" 일 때 히스토리 끝에서의 깊이. 기본 4. */
  depth?: number;
  /** position="at_depth" 일 때 메시지 역할. 기본 "system". */
  role?: "system" | "user" | "assistant";
  /** 같은 위치 내 정렬 — 큰 값이 우선. 다른 확장과의 배치 조정용. 기본 100. */
  order?: number;
}

export interface StellaContextInput {
  plugin: unknown;
  /** 세션 파일 경로 */
  sessionFile: string;
  session: unknown;
  /** 컨텍스트를 만드는 지점(이어쓰기가 보낼 리프 노드 id) */
  leafId: string;
  /**
   * **이번 전송본이 실제로 보낼 이야기 본문.** 확장이 본문을 볼 일이 있으면 이 값을 쓴다.
   *
   * `session` 을 파고들어 본문을 직접 재구성하지 말 것 — 스텔라 본문은 노드 패치를
   * 쌓아 만드는 구조라 밖에서 맞추기 어렵고, 맞춰도 사용자가 "AI 에게 숨김"으로
   * 눈감겨 둔 구간이 딸려 들어간다(엔진은 안 보내는데 확장만 보게 된다).
   * 이 값은 숨김이 이미 빠진 상태다.
   */
  bodyText: string;
  /** 숨김 처리된 노드 id 집합 — 노드 단위로 걸러야 할 때만. 보통은 `bodyText` 로 충분. */
  hiddenNodeIds: ReadonlySet<string>;
  settings: Record<string, unknown>;
}

export interface StellaExtension {
  /** 자기 플러그인 id 로 네임스페이스한 고유 id (예: "my-plugin:foo") */
  id: string;
  /**
   * 전송본 컨텍스트 기여. 외부 확장은 `slot: "custom"` 만 쓴다
   * ("summary"/"phone" 은 스텔라 내장 기능 전용 슬롯).
   * 매 생성·미리보기마다 호출되므로 무거운 조회는 캐시할 것.
   */
  contributeContext?(
    input: StellaContextInput
  ): StellaCustomContext[] | Promise<StellaCustomContext[]>;
  /** 생성 완료 직후 자동 실행 (병렬, 에러 격리 — 실패해도 생성 저장을 막지 않음). */
  onGenerationComplete?(input: StellaGenerationCompleteInput): void | Promise<void>;
  /**
   * 로어북 선택 대체 (이음새당 단일 소유 — 여럿 등록 시 마지막만 적용).
   * 스텔라 로어북 스키마를 그대로 반환해야 하는 고급 이음새라, 쓰려면
   * docs/stella-extension-hooks.md 의 안내대로 스텔라 레포 타입을 확인할 것.
   */
  selectLorebooks?: (input: unknown) => Promise<unknown[]>;
  /**
   * 세션창 하단 확장 버튼(퍼즐) 트레이에 넣을 조작 액션들.
   * 등록하면 스텔라가 버튼 노출/메뉴/에러 처리를 알아서 한다.
   */
  sessionActions?: StellaSessionAction[];
}

// ─── 스텔라 플러그인 공개 표면 ───

// ─── 로어북 활용 (선택) ───

/**
 * 스텔라 로어북(월드 인포/용어집) — 필요한 최소 형태만 느슨하게 선언.
 * 전체 스키마는 스텔라 레포 `로어북 스펙.md` / `src/types/lorebook.ts` 참조.
 * `plugin.store` 로 읽어와 로어북 허브에 그대로 넘길 때만 쓴다.
 */
export interface StellaLorebook {
  meta: { id: string; name: string; [k: string]: unknown };
  entries: Array<Record<string, unknown>>;
}

/** `store.getLorebooks()` 의 목록 항목. */
export interface StellaLorebookListItem {
  lorebookFile: string;
  lorebook: StellaLorebook;
}

/**
 * 로어북 허브 입력 — 내 확장이 스스로 돌리는 AI 작업(번역/요약/분석 등)에
 * 사용자의 로어북(용어집)을 붙일 때 쓴다. 상세: docs/stella-lorebook.md.
 */
export interface StellaLorebookTaskInput {
  /** 세션 파일 경로. 세션과 무관한 실행이면 "" (전역 설정으로 판단). */
  sessionFile: string;
  /** 대상 로어북들 (store 로 읽어 넘긴다). */
  books: StellaLorebook[];
  /** 매칭/선별 대상 본문 (번역 원문, 분석 대상 등). */
  scanText: string;
  /** 이 로어북이 함께 쓰일 내 작업 프롬프트 전문 — AI 선별이 "어떤 작업인지" 판단에 쓴다. */
  taskPrompt: string;
  /** AI 호출 로그용 작업 이름 (예: "번역"). */
  taskLabel: string;
}

/**
 * 훅 입력의 `plugin`(느슨한 unknown)을 캐스팅해 쓰는 스텔라 플러그인 인스턴스의
 * 일부. 로어북 읽기(store)와 로어북 허브(lorebookPlus)만 최소로 선언한다.
 * 내부 파일을 직접 뒤지는 용도가 아니라, 공개된 조회와 허브만 쓴다.
 */
export interface StellaPluginLorebookAccess {
  store: {
    getLorebooks(): Promise<StellaLorebookListItem[]>;
    getLorebookById(id: string): Promise<StellaLorebookListItem | null>;
  };
  lorebookPlus: {
    /**
     * 로어북을 쓰는 확장의 단일 허브 — 본문에 대한 키워드 매칭 텍스트를 만들되,
     * 사용자가 "AI 선별을 다른 확장에도 적용"을 켜 두었으면 선별 결과를 합쳐 준다.
     * 로어북 파일을 직접 파싱하지 말고 이 함수를 지나가야 그 설정이 자동 반영된다.
     */
    buildTaskLorebookText(input: StellaLorebookTaskInput): Promise<string>;
  };
}

// ─── 스텔라 플러그인 공개 표면 ───

export interface StellaEngineApi {
  /** 확장 탭 설정 패널 등록. 반환 함수 = 해제 (onunload 에서 호출). */
  registerSettingsPanel(panel: StellaSettingsPanel): () => void;
  /** 생성 과정 개입 확장 등록. 반환 함수 = 해제 (onunload 에서 호출). */
  extensions: {
    register(ext: StellaExtension): () => void;
    unregister(id: string): void;
  };
  /**
   * 세션 본문을 **AI 에게 보낼 수 있는 형태**로 가져온다 (훅 밖에서도 쓰는 본문 창구).
   * 열려 있는 세션의 미저장 편집을 먼저 커밋하고, "AI 에게 숨김" 구간을 뺀 텍스트를 준다.
   *
   *  - `leafId` — 그 지점까지. 생략하면 현재 보고 있는 지점까지.
   *  - `afterNodeId` — 그 노드 **이후 새로 진행된 부분만**(내 확장이 마지막으로 처리한
   *    지점을 노드 id 로 기억해 두었다가 넘기면 된다). 지금 본문 기준이라, 사용자가
   *    나중에 지우거나 고친 대목은 지워지고 고쳐진 채로 나온다.
   *
   * 세션을 못 읽으면 빈 문자열.
   */
  getSessionBodyText(
    sessionFile: string,
    opts?: { leafId?: string; afterNodeId?: string }
  ): Promise<string>;
}

/**
 * 스텔라 엔진 플러그인을 가져온다. 미설치/비활성이면 null.
 * 매 사용 시점마다 호출해도 된다(캐시하지 말 것).
 */
export function getStellaEngine(app: App): StellaEngineApi | null {
  const plugin = (app as unknown as {
    plugins?: { plugins?: Record<string, unknown> };
  }).plugins?.plugins?.["ggai-stella-engine"];
  return (plugin as StellaEngineApi | undefined) ?? null;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatMessages } from '../src/vendor/chat-messages';
import { buildSpans, spansToText } from '../src/vendor/session-text';
import { formatCopy, parseRange, validateSession, DEFAULT_OPTIONS } from '../src/copy-text';
import { readSnapshot } from '../src/adapter';
import type { StellaSession, SessionNode, CopySnapshot } from '../src/model';

function node(id: string, parent: string | null, kind: SessionNode['kind'], text: string): SessionNode {
  return { id, parent, kind, patches: [{ op: 'append', spans: [{ author: kind === 'user-write' ? 'user' : 'ai', text }] }] };
}
function session(mode: 'chat' | 'novel' = 'chat'): StellaSession {
  return { schemaVersion: 1, meta: { name: '테스트', mode, rootId: 'r', activeLeafId: 'a', scenarioId: 'host', personaFile: 'user.json' }, nodes: {
    r: node('r', null, 'root', '처음👋'),
    u: node('u', 'r', 'user-write', '\n\n안녕'),
    a: node('a', 'u', 'ai-continue', '\n\n응답'),
    other: node('other', 'u', 'ai-regen', '\n\n다른 분기'),
  } };
}
function mock(s: StellaSession, opts: { busy?: boolean; flushError?: boolean } = {}) {
  const calls: unknown[] = [];
  const engine = {
    manifest: { version: '0.0.46' },
    async flushSessionEdits(file: string, options: unknown) { calls.push([file, options]); if (opts.flushError) throw Error('save failed'); },
    store: {
      async getSession() { return s; },
      async getScenarios() { return ['host', 'friend'].map(id => ({ scenarioFile: id, scenario: { data: { name: id === 'host' ? '주인공' : '친구', extensions: { stella: { id } } } } })); },
      async getUserProfile() { return { name: '플레이어' }; },
      async getSessionNodeMeta() { return { nodes: { u: { hidden: true }, a: { speakerName: '익명 손님' } } }; },
    },
  };
  const app = { plugins: { plugins: { 'ggai-stella-engine': engine } }, workspace: { getLeavesOfType() { return opts.busy ? [{ view: { getSessionFile: () => 'test.json', isGenerating: () => true } }] : []; } } };
  return { app: app as any, engine, calls };
}

test('active branch only; emoji and contiguous roles remain separate; shared cache unchanged', () => {
  const s = session(); s.nodes.u.kind = 'ai-continue';
  const before = JSON.stringify(s); validateSession(s);
  assert.deepEqual(buildChatMessages(s).map(m => [m.role, m.text]), [['assistant', '처음👋'], ['assistant', '\n\n안녕'], ['assistant', '\n\n응답']]);
  assert.equal(spansToText(buildSpans(s)), '처음👋\n\n안녕\n\n응답');
  assert.equal(JSON.stringify(s), before);
});

test('replace/delete patches use UTF-16 offsets and preserve original message roles', () => {
  const s = session();
  s.nodes.e = { id: 'e', parent: 'a', kind: 'user-edit', patches: [
    { op: 'replace', from: 6, to: 8, spans: [{ author: 'user', text: '수정했습니다' }] },
  ] }; s.meta.activeLeafId = 'e'; validateSession(s);
  const messages = buildChatMessages(s);
  assert.equal(messages[1].role, 'user');
  assert.equal(messages[1].text, '\n\n수정했습니다');
  assert.equal(messages.map(m => m.text).join(''), spansToText(buildSpans(s)));
  s.nodes.d = { id: 'd', parent: 'e', kind: 'user-edit', patches: [{ op: 'delete', from: 4, to: 12 }] }; s.meta.activeLeafId = 'd';
  validateSession(s); assert.deepEqual(buildChatMessages(s).map(m => m.nodeId), ['r', 'a']);
});

test('replace across message boundaries matches engine flattened story', () => {
  const s = session(); s.nodes.e = { id: 'e', parent: 'a', kind: 'user-edit', patches: [{ op: 'replace', from: 2, to: 10, spans: [{ author: 'user', text: '새 문장' }] }] }; s.meta.activeLeafId = 'e';
  validateSession(s);
  assert.equal(buildChatMessages(s).map(m => m.text).join(''), spansToText(buildSpans(s)));
});

test('broken root, missing parent, cyclic path, unknown patch and out-of-bounds edit fail closed', () => {
  const changes = [
    (s: any) => s.meta.rootId = 'no', (s: any) => s.nodes.u.parent = 'missing',
    (s: any) => s.nodes.r.parent = 'a', (s: any) => s.nodes.a.patches[0].op = 'future',
    (s: any) => s.nodes.a.patches = [{ op: 'delete', from: 0, to: 99999 }],
    (s: any) => s.schemaVersion = 2,
  ];
  for (const change of changes) { const s = session(); change(s); assert.throws(() => validateSession(s)); }
});

test('number ranges are zero-based and inclusive, reject blank/fraction/reversed/out-of-bounds input', () => {
  assert.deepEqual(parseRange('0', '2', 3), [0, 2]); assert.deepEqual(parseRange('1', '1', 3), [1, 1]);
  for (const [a,b,n] of [['','2',3], ['-1','2',3], ['1.5','2',3], ['2','1',3], ['0','3',3], ['0','0',0], ['1e0','2',3], ['9007199254740993','9007199254740993',10]] as const) assert.throws(() => parseRange(a,b,n));
});

test('snapshot includes hidden text and anonymous/group/persona names without mutating session', async () => {
  const s = session(); s.nodes.r.speaker = 'friend'; const before = JSON.stringify(s); const {app,calls} = mock(s);
  const snap = await readSnapshot(app, 'test.json');
  assert.deepEqual(calls, [['test.json', {convert:false}]]);
  assert.deepEqual(snap.messages.map(m => m.name), ['친구','플레이어','익명 손님']);
  assert.equal(snap.messages[1].text, '안녕'); assert.equal(snap.messages[1].index, 1);
  assert.equal(formatCopy(snap, DEFAULT_OPTIONS, [1,2]), '플레이어\n안녕\n\n익명 손님\n응답');
  assert.equal(formatCopy(snap, { names:false, numbers:true }, [1,1]), '#1\n안녕');
  assert.equal(formatCopy(snap, { names:false, numbers:false }), '처음👋\n\n안녕\n\n응답');
  assert.equal(JSON.stringify(s), before);
});

test('novel full copy preserves every whitespace character and markup', async () => {
  const s = session('novel'); s.nodes.r.patches = [{op:'append',spans:[{author:'ai',text:'  <state>숨김</state>\r\n\n본문  '}]}];
  const {app} = mock(s); const snap = await readSnapshot(app, 'test.json');
  assert.equal(formatCopy(snap, DEFAULT_OPTIONS), '  <state>숨김</state>\r\n\n본문  \n\n안녕\n\n응답');
});

test('no engine, generation in progress, and failed flush stop instead of copying stale content', async () => {
  await assert.rejects(readSnapshot({plugins:{plugins:{}}} as any,'test.json'), /활성화/);
  const busy = mock(session(), {busy:true}); await assert.rejects(readSnapshot(busy.app,'test.json'), /진행 중/); assert.equal(busy.calls.length,0);
  const failed = mock(session(),{flushError:true}); await assert.rejects(readSnapshot(failed.app,'test.json'), /save failed/);
});

test('snapshot cannot change while names load, and metadata errors are visible', async () => {
  const s = session(); const {app,engine} = mock(s);
  engine.store.getScenarios = async () => { s.nodes.a.patches = [{op:'append',spans:[{author:'ai',text:'NEW'}]}]; throw Error('failed'); };
  const snapshot = await readSnapshot(app,'test.json');
  assert.equal(snapshot.messages[2].text, '응답'); assert.equal(snapshot.warnings.length,1);
});

test('large chat copies all 10001 messages regardless of viewport', async () => {
  const s = session(); s.nodes = { r:node('r',null,'root','처음') };
  let parent = 'r';
  for (let i=1;i<=10000;i++) { const id=`m${i}`; s.nodes[id]=node(id,parent,i%2?'user-write':'ai-continue',`\n\n메시지 ${i}`); parent=id; }
  s.meta.activeLeafId=parent;
  const {app}=mock(s); const snapshot = await readSnapshot(app,'test.json');
  assert.equal(snapshot.messages.length,10001); assert.equal(snapshot.messages[10000].text,'메시지 10000');
  assert.equal(formatCopy(snapshot,{names:false,numbers:false},[9999,10000]),'메시지 9999\n\n메시지 10000');
});

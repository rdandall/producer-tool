const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path, dependencies = {}) {
  const output = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)((id) => dependencies[id] ?? require(id), module, module.exports);
  return module.exports;
}
const state = load('lib/desk/state.ts');
const card = { id: 'one', title: 'Send estimate', project: 'PERSONAL', detail: '', color: '#69a68b', zone: 'desk', x: .2, y: .3 };
const base = { cards: [card], preferences: state.emptyDesk.preferences };

test('merges edits on different devices without overwriting unrelated fields or cards', () => {
  const local = { ...base, cards: [{ ...card, notes: 'New notes' }, { ...card, id: 'two' }] };
  const remote = { ...base, cards: [{ ...card, zone: 'done', x: .8 }, { ...card, id: 'three' }] };
  const merged = state.mergeDesk(base, local, remote);
  assert.equal(merged.cards.length, 3);
  assert.equal(merged.cards[0].notes, 'New notes');
  assert.equal(merged.cards[0].zone, 'done');
  assert.equal(merged.cards[0].x, .8);
});

test('merges concurrent checklist additions and removals', () => {
  const b = { ...base, cards: [{ ...card, checklist: [{id:'old',text:'Old step',done:false}] }] };
  const local = { ...base, cards: [{ ...card, checklist: [{id:'local',text:'Local step',done:false}] }] };
  const remote = { ...base, cards: [{ ...card, checklist: [...b.cards[0].checklist, {id:'remote',text:'Remote step',done:true}] }] };
  assert.deepEqual(state.mergeDesk(b, local, remote).cards[0].checklist.map(c=>c.id).sort(), ['local','remote']);
});

test('unchanged stale device preserves cloud deletion and preferences', () => {
  const remote = { cards: [{ ...card, zone: 'deleted' }], preferences: { ...base.preferences, movement: 'float' } };
  assert.deepEqual(state.mergeDesk(base, base, remote), remote);
});

test('transient countdown never travels to another device', () => {
  const saved = state.durableDesk({ ...base, cards: [{ ...card, zone: 'pending', remaining: 1500 }] });
  assert.equal(saved.cards[0].zone, 'desk');
  assert.equal('remaining' in saved.cards[0], false);
  assert(state.validDesk(saved));
});

test('rejects duplicate ids, invalid coordinates and malformed checklist payloads', () => {
  assert(state.validDesk(base));
  assert(!state.validDesk({...base,cards:[card,card]}));
  assert(!state.validDesk({...base,cards:[{...card,x:Infinity}]}));
  assert(!state.validDesk({...base,cards:[{...card,checklist:[{id:'a',text:123,done:false}]}]}));
});

function routeHarness() {
  let stored = null;
  let failRead = false;
  let race = false;
  const db = { from() {
    let mode='read', row, expected;
    return {
      select() { if(mode==='update') {
        if(race){ race=false; return Promise.resolve({data:[],error:null}); }
        if(stored!==expected) return Promise.resolve({data:[],error:null});
        stored=row.value; return Promise.resolve({data:[{key:row.key}],error:null});
      } return this; },
      eq(key,value){ if(key==='value')expected=value; return this; },
      async maybeSingle(){return failRead?{data:null,error:new Error('offline')}:{data:stored===null?null:{value:stored},error:null};},
      async insert(value){if(stored!==null)return {error:{code:'23505'}};stored=value.value;return {error:null};},
      update(value){mode='update';row=value;return this;},
    };
  }};
  const route=load('app/api/desk/route.ts', {'@/lib/desk/state':state,'@/lib/supabase/server':{createClient:async()=>db}});
  const put=(body)=>route.PUT(new Request('http://localhost/api/desk',{method:'PUT',headers:{host:'localhost',origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(body)}));
  return {route,put,get stored(){return stored},set failRead(v){failRead=v},set race(v){race=v}};
}

test('API creates cloud state, rejects stale revisions, and catches compare-and-swap races', async()=>{
  const h=routeHarness();
  const first=await h.put({revision:null,data:base}); assert.equal(first.status,200);
  const saved=await first.json(); assert(saved.revision);
  assert.equal((await h.put({revision:null,data:state.emptyDesk})).status,409);
  h.race=true;
  assert.equal((await h.put({revision:saved.revision,data:state.emptyDesk})).status,409);
  assert.equal(JSON.parse(h.stored).data.cards.length,1);
  const updated=await h.put({revision:saved.revision,data:state.emptyDesk});assert.equal(updated.status,200);
  assert.equal(JSON.parse(h.stored).data.cards.length,0);
});

test('database outage never appears as a successful empty load', async()=>{
  const h=routeHarness();h.failRead=true;
  assert.equal((await h.route.GET()).status,503);
  assert.equal((await h.put({revision:null,data:base})).status,503);
});

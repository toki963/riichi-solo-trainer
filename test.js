'use strict';
const assert = require('node:assert/strict');
const E = require('./engine.js');

function counts(groups) {
  const result = Array(34).fill(0);
  for (const token of groups.trim().split(/\s+/)) {
    const m = token.match(/^([0-9]+)([mpsz])$/);
    assert.ok(m, `bad tile token: ${token}`);
    const suit = { m: 0, p: 1, s: 2, z: 3 }[m[2]];
    for (const char of m[1]) {
      const rank = Number(char);
      const type = suit === 3 ? 27 + rank - 1 : suit * 9 + rank - 1;
      result[type]++;
    }
  }
  return result;
}
function tilesFromCounts(c) {
  let uid = 0;
  const result = [];
  for (let t = 0; t < 34; t++) for (let i = 0; i < c[t]; i++) result.push({ uid: uid++, type: t, red: false });
  return result;
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

test('타일 세트는 136장이고 적도라 사용 시 5만·5통·5삭이 각각 한 장씩 있다', () => {
  const all = E.buildTileSet(true);
  assert.equal(all.length, 136);
  assert.equal(new Set(all.map(t => t.uid)).size, 136);
  assert.equal(all.filter(t => t.red).length, 3);
  assert.deepEqual(all.filter(t => t.red).map(t => t.type).sort((a,b)=>a-b), [4,13,22]);
  assert.equal(E.buildTileSet(false).filter(t => t.red).length, 0);
});

test('새 국은 손패 14/13/13/13, 생패산 69장, 전체 타일 136장으로 시작한다', () => {
  const g = E.newGame({ redFives: true });
  assert.deepEqual(g.players.map(p => p.hand.length), [14, 13, 13, 13]);
  assert.equal(g.wall.length, 69);
  assert.equal(g.deadWall.length, 14);
  assert.equal(g.players.reduce((sum,p)=>sum+p.hand.length,0) + g.wall.length + g.deadWall.length, 136);
});

test('일반형 완성패는 -1샹텐, 13장 텐파이는 0샹텐이다', () => {
  assert.equal(E.calcShanten(counts('123m 123p 123s 789s 55z')), -1);
  const tenpai = counts('123m 123p 123s 789s 5z');
  assert.equal(tenpai.reduce((a,b)=>a+b,0), 13);
  assert.equal(E.calcShanten(tenpai), 0);
  assert.deepEqual(E.getWinningTiles(tenpai), [31]);
});

test('치또이츠와 국사무쌍 샹텐 계산이 특수형 옵션을 따른다', () => {
  const chiitoi = counts('11m 22m 33p 44p 55s 66s 77z');
  assert.equal(chiitoi.reduce((a,b)=>a+b,0), 14);
  assert.equal(E.calcShanten(chiitoi, { specialHands: true }), -1);
  assert.ok(E.calcShanten(chiitoi, { specialHands: false }) > -1);
  const kokushi = counts('19m 19p 19s 1234567z 1m');
  assert.equal(kokushi.reduce((a,b)=>a+b,0), 14);
  assert.equal(E.calcShanten(kokushi, { specialHands: true }), -1);
  assert.ok(E.calcShanten(kokushi, { specialHands: false }) > -1);
});

test('완성된 14장에 대해서 유효패 대기를 찾지 않고, 13장 텐파이만 대기패를 반환한다', () => {
  const complete = counts('123m 123p 123s 789s 55z');
  assert.deepEqual(E.getWinningTiles(complete), []);
  assert.deepEqual(E.getWinningTiles(counts('123m 123p 123s 789s 5z')), [31]);
});

test('도라 표시패의 다음 패와 적도라를 계산한다', () => {
  assert.equal(E.tileDoraSuccessor(8), 0); // 9m -> 1m
  assert.equal(E.tileDoraSuccessor(30), 27); // north -> east
  assert.equal(E.tileDoraSuccessor(33), 31); // red dragon -> white dragon
  const counted = E.countDora([{ uid: 1, type: 5, red: true }, { uid: 2, type: 5, red: false }], [{ type: 4 }]);
  assert.equal(counted.normalDora, 2);
  assert.equal(counted.redDora, 1);
  assert.equal(counted.total, 3);
});

test('샹텐/유효패 후보 분석은 중복 일반패를 후보로 반복하지 않고 매수를 0~4 범위로 제한한다', () => {
  const g = E.newGame();
  const result = E.analyzeDiscards(g.players[0].hand, E.getVisibleTiles(g, false));
  assert.equal(result.ok, true);
  const keys = result.candidates.map(c => `${c.type}:${c.red ? 1 : 0}`);
  assert.equal(keys.length, new Set(keys).size);
  assert.ok(result.candidates.length <= 14);
  assert.ok(result.availableUnseen.every(n => n >= 0 && n <= 4));
  assert.ok(result.candidates.every(c => Number.isInteger(c.shanten) && c.ukeire >= 0));
});

test('현물은 해당 상대에게 안전하며 스지와 벽 단서는 완전한 안전패로 표시하지 않는다', () => {
  const opp = { riichi: true, riichiTile: 3, river: [{ tile: { type: 4 } }] }; // 4m is actual river tile
  assert.equal(E.getDefenseSignal(4, opp, []).level, 'safe');
  const suji = E.getDefenseSignal(6, { riichi: true, riichiTile: 3, river: [] }, []); // 7m is suji from riichi 4m? index 3=4m -> 7m index6
  assert.ok(['safer', 'clue', 'unclear'].includes(suji.level));
  assert.notEqual(suji.level, 'safe');
});

test('리치 없이도 멘젠쯔모 역이 있으면 점수 계산을 반환하고, 역 없는 론은 막는다', () => {
  const hand = tilesFromCounts(counts('123m 234p 456s 678s 22z'));
  assert.equal(hand.length, 14);
  const tsumo = E.evaluateWinningHand(hand, 25, 'tsumo', { winnerIndex: 0, specialHands: true, closed: true, seatWind: 27, roundWind: 27, doraIndicators: [] });
  assert.equal(tsumo.valid, true);
  assert.ok(tsumo.yaku.some(y => y.name === '멘젠쯔모'));
  assert.ok(tsumo.points.total > 0);
  const ron = E.evaluateWinningHand(hand, 25, 'ron', { winnerIndex: 1, fromIndex: 0, specialHands: true, closed: true, seatWind: 28, roundWind: 27, doraIndicators: [] });
  assert.equal(ron.valid, false);
});

test('플레이어 타패 후 손패는 13장이고 AI 진행 후 플레이어에게 14장이 돌아온다', () => {
  const g = E.newGame({ difficulty: 'beginner' });
  const discard = g.players[0].hand.find(t => t.uid !== g.players[0].lastDrawUid) || g.players[0].hand[0];
  const result = E.applyHumanDiscard(g, discard.uid, false);
  assert.equal(result.ok, true);
  assert.equal(g.players[0].hand.length, 13);
  assert.equal(g.decisions.length, 1);
  assert.equal(g.players[0].river.length, 1);
  let guard = 0;
  while (g.phase === 'turn' && g.currentTurn !== 0 && guard++ < 5) E.performAITurn(g);
  if (g.phase === 'turn' && g.currentTurn === 0 && g.players[0].hand.length === 13) E.drawHumanTurn(g);
  assert.ok(g.phase === 'ended' || (g.currentTurn === 0 && g.players[0].hand.length === 14));
});

test('한 국이 종료될 때 복기 평가와 당시 공개 정보 기록을 남기고 상대 손패는 스냅샷에서 숨긴다', () => {
  const g = E.newGame({ difficulty: 'beginner' });
  let guard = 0;
  while (g.phase !== 'ended' && guard++ < 300) {
    if (g.phase === 'ronOffer') { E.passRon(g); continue; }
    if (g.phase !== 'turn') break;
    if (g.currentTurn === 0) {
      if (g.players[0].hand.length === 13) E.drawHumanTurn(g);
      if (g.phase === 'ended') break;
      const discard = E.chooseAIDiscard(g, 0);
      if (!discard) { E.finishExhaustive(g); break; }
      E.applyHumanDiscard(g, discard.uid, false);
    } else {
      E.performAITurn(g);
    }
  }
  assert.equal(g.phase, 'ended');
  assert.ok(g.final?.reason);
  assert.ok(g.decisions.length > 0);
  assert.ok(g.decisions.every(d => d.publicBefore?.players?.length === 4));
  assert.ok(g.decisions.every(d => d.publicBefore.players.every(p => !Object.hasOwn(p, 'hand'))));
  const review = E.evaluateHandReview(g);
  assert.equal(review.decisionCount, g.decisions.length);
  assert.ok(Object.values(review.categories).every(c => c.score == null || (c.score >= 0 && c.score <= c.weight)));
  assert.equal(E.summarizeHand(g).decisionCount, g.decisions.length);
});

console.log(`\n${passed} tests passed.`);

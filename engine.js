/* Riichi Solo Trainer — rule engine (no external dependencies)
 * Scope: closed-hand four-player practice hand; no chi/pon/kan yet.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RiichiEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TILE_COUNT = 34;
  const SUITS = ['m', 'p', 's'];
  const HONORS = ['東', '南', '西', '北', '白', '發', '中'];
  const SUIT_NAMES = ['만', '통', '삭'];
  const WIND_NAMES = ['동', '남', '서', '북'];
  const shantenCache = new Map();/* Riichi Solo Trainer — rule engine (no external dependencies)
 * Scope: closed-hand four-player practice hand; no chi/pon/kan yet.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RiichiEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TILE_COUNT = 34;
  const SUITS = ['m', 'p', 's'];
  const HONORS = ['東', '南', '西', '北', '白', '發', '中'];
  const SUIT_NAMES = ['만', '통', '삭'];
  const WIND_NAMES = ['동', '남', '서', '북'];
  const shantenCache = new Map();

  function tileShort(type, red = false) {
    if (type < 0 || type >= 34) return '?';
    if (type < 27) {
      const suit = Math.floor(type / 9);
      const rank = type % 9 + 1;
      return `${red ? '0' : rank}${SUITS[suit]}`;
    }
    return `${HONORS[type - 27]}`;
  }

  function tileName(type, red = false) {
    if (type < 27) {
      const suit = Math.floor(type / 9);
      const rank = type % 9 + 1;
      return `${red ? '적도라 ' : ''}${rank}${SUIT_NAMES[suit]}`;
    }
    return HONORS[type - 27];
  }

  function tileSort(a, b) {
    return a.type - b.type || Number(a.red) - Number(b.red) || a.uid - b.uid;
  }

  function sortHand(hand) {
    hand.sort(tileSort);
    return hand;
  }

  function buildTileSet(redFives = true) {
    const tiles = [];
    let uid = 0;
    for (let type = 0; type < 34; type++) {
      for (let copy = 0; copy < 4; copy++) {
        const isFive = type < 27 && type % 9 === 4;
        // One red five per suit. The remaining three copies are normal.
        const red = Boolean(redFives && isFive && copy === 0);
        tiles.push({ uid: uid++, type, red });
      }
    }
    return tiles;
  }

  function shuffle(items, rng = Math.random) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function countsFromTiles(tiles) {
    const counts = Array(TILE_COUNT).fill(0);
    for (const tile of tiles || []) {
      const t = typeof tile === 'number' ? tile : tile?.type;
      if (Number.isInteger(t) && t >= 0 && t < 34) counts[t]++;
    }
    return counts;
  }

  function countsKey(counts, openMelds = 0, specials = true) {
    return `${counts.join('')}:${openMelds}:${specials ? 1 : 0}`;
  }

  function standardShanten(counts, openMelds = 0) {
    const memo = new Map();
    let best = 8;

    function dfs(melds, taatsu, head) {
      // There is no benefit from keeping more than four melds or taatsu.
      if (melds > 4) return;
      if (taatsu > 4) taatsu = 4;

      let i = 0;
      while (i < 34 && counts[i] === 0) i++;
      if (i === 34) {
        const usableTaatsu = Math.min(taatsu, 4 - melds - openMelds);
        const sh = 8 - 2 * (melds + openMelds) - usableTaatsu - head;
        if (sh < best) best = sh;
        return;
      }

      const key = `${i}/${melds}/${taatsu}/${head}/${counts.slice(i).join('')}`;
      const prior = memo.get(key);
      if (prior !== undefined && prior <= best) return;
      memo.set(key, best);

      // Isolated tile.
      counts[i]--;
      dfs(melds, taatsu, head);
      counts[i]++;

      // Triplet.
      if (counts[i] >= 3) {
        counts[i] -= 3;
        dfs(melds + 1, taatsu, head);
        counts[i] += 3;
      }

      // Sequence (suits only; never cross a suit boundary).
      if (i < 27 && i % 9 <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0) {
        counts[i]--; counts[i + 1]--; counts[i + 2]--;
        dfs(melds + 1, taatsu, head);
        counts[i]++; counts[i + 1]++; counts[i + 2]++;
      }

      // Head pair.
      if (!head && counts[i] >= 2) {
        counts[i] -= 2;
        dfs(melds, taatsu, 1);
        counts[i] += 2;
      }

      // Pair as a taatsu.
      if (counts[i] >= 2) {
        counts[i] -= 2;
        dfs(melds, taatsu + 1, head);
        counts[i] += 2;
      }

      // Adjacent/gapped taatsu.
      if (i < 27 && i % 9 <= 7 && counts[i + 1] > 0) {
        counts[i]--; counts[i + 1]--;
        dfs(melds, taatsu + 1, head);
        counts[i]++; counts[i + 1]++;
      }
      if (i < 27 && i % 9 <= 6 && counts[i + 2] > 0) {
        counts[i]--; counts[i + 2]--;
        dfs(melds, taatsu + 1, head);
        counts[i]++; counts[i + 2]++;
      }
    }
    dfs(0, 0, 0);
    return best;
  }

  function chiitoiShanten(counts) {
    let pairs = 0;
    let unique = 0;
    for (const n of counts) {
      if (n > 0) unique++;
      if (n >= 2) pairs++;
    }
    return 6 - pairs + Math.max(0, 7 - unique);
  }

  const ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  function kokushiShanten(counts) {
    let unique = 0;
    let pair = false;
    for (const t of ORPHANS) {
      if (counts[t] > 0) unique++;
      if (counts[t] > 1) pair = true;
    }
    return 13 - unique - (pair ? 1 : 0);
  }

  function calcShanten(input, options = {}) {
    const counts = Array.isArray(input) && input.length === 34 ? input.slice() : countsFromTiles(input);
    const openMelds = Math.max(0, Number(options.openMelds || 0));
    const specials = options.specialHands !== false && openMelds === 0;
    const key = countsKey(counts, openMelds, specials);
    const cached = shantenCache.get(key);
    if (cached !== undefined) return cached;
    let answer = standardShanten(counts, openMelds);
    if (specials) answer = Math.min(answer, chiitoiShanten(counts), kokushiShanten(counts));
    shantenCache.set(key, answer);
    if (shantenCache.size > 60000) shantenCache.clear();
    return answer;
  }

  function isCompleteStandard(counts) {
    if (counts.reduce((a, b) => a + b, 0) !== 14) return false;
    return standardShanten(counts, 0) === -1;
  }

  function isChiitoiComplete(counts) {
    return counts.reduce((a, b) => a + b, 0) === 14 && counts.filter(n => n === 2).length === 7;
  }

  function isKokushiComplete(counts) {
    if (counts.reduce((a, b) => a + b, 0) !== 14) return false;
    return kokushiShanten(counts) === -1;
  }

  function getWinningTiles(counts, options = {}) {
    if (!Array.isArray(counts) || counts.length !== 34 || counts.reduce((a, b) => a + b, 0) !== 13) return [];
    const waits = [];
    for (let t = 0; t < 34; t++) {
      if (counts[t] >= 4) continue;
      counts[t]++;
      const complete = calcShanten(counts, options) === -1;
      counts[t]--;
      if (complete) waits.push(t);
    }
    return waits;
  }

  function shapePotential(counts) {
    let score = 0;
    // Pairs can serve as a head or become a triplet.
    for (let t = 0; t < 34; t++) {
      if (counts[t] >= 2) score += Math.min(2, Math.floor(counts[t] / 2)) * 2.2;
      if (counts[t] >= 3) score += 0.8;
    }
    // Connected suited tiles form useful incomplete shapes; this is a heuristic only.
    for (let suit = 0; suit < 3; suit++) {
      const base = suit * 9;
      for (let r = 0; r < 8; r++) {
        if (counts[base + r] && counts[base + r + 1]) score += 0.85;
      }
      for (let r = 0; r < 7; r++) {
        if (counts[base + r] && counts[base + r + 2]) score += 0.45;
      }
    }
    return score;
  }

  function knownTypeCounts(handTiles, visibleTiles = []) {
    const counts = countsFromTiles([...(handTiles || []), ...(visibleTiles || [])]);
    return counts.map(n => Math.min(4, n));
  }

  function availableUnseenCounts(handTiles, visibleTiles = []) {
    const known = knownTypeCounts(handTiles, visibleTiles);
    return known.map(n => Math.max(0, 4 - n));
  }

  function analyzeDiscards(handTiles, visibleTiles = [], options = {}) {
    if (!Array.isArray(handTiles) || handTiles.length !== 14) {
      return { ok: false, error: '타패 분석은 14장인 손패를 필요로 합니다.', candidates: [] };
    }
    const handCounts = countsFromTiles(handTiles);
    const available = availableUnseenCounts(handTiles, visibleTiles);
    const unique = new Map();
    for (const tile of handTiles) {
      const key = `${tile.type}:${tile.red ? 1 : 0}`;
      if (!unique.has(key)) unique.set(key, tile);
    }
    const candidates = [];
    for (const tile of unique.values()) {
      const post = handCounts.slice();
      post[tile.type]--;
      const sh = calcShanten(post, { specialHands: options.specialHands !== false });
      const effective = [];
      const shapeOnly = [];
      const baseShape = shapePotential(post);
      let ukeire = 0;
      for (let t = 0; t < 34; t++) {
        if (available[t] <= 0 || post[t] >= 4) continue;
        post[t]++;
        const nextSh = calcShanten(post, { specialHands: options.specialHands !== false });
        if (nextSh < sh) {
          effective.push({ type: t, count: available[t] });
          ukeire += available[t];
        } else if (nextSh === sh && shapePotential(post) > baseShape + 0.25) {
          shapeOnly.push({ type: t, count: available[t] });
        }
        post[t]--;
      }
      candidates.push({
        tile: { ...tile },
        type: tile.type,
        red: Boolean(tile.red),
        shanten: sh,
        effective,
        ukeire,
        shapeOnly,
        shapeScore: Number(baseShape.toFixed(2)),
      });
    }
    candidates.sort((a, b) => a.shanten - b.shanten || b.ukeire - a.ukeire || b.shapeScore - a.shapeScore || a.type - b.type);
    const bestShanten = Math.min(...candidates.map(c => c.shanten));
    const bestUkeire = Math.max(...candidates.filter(c => c.shanten === bestShanten).map(c => c.ukeire));
    const bestShape = Math.max(...candidates.filter(c => c.shanten === bestShanten && c.ukeire === bestUkeire).map(c => c.shapeScore));
    for (const c of candidates) {
      c.isBestEfficiency = c.shanten === bestShanten && c.ukeire === bestUkeire;
      c.shantenLoss = Math.max(0, c.shanten - bestShanten);
      c.ukeireLoss = c.shanten === bestShanten ? Math.max(0, bestUkeire - c.ukeire) : null;
      c.shapeLoss = Math.max(0, bestShape - c.shapeScore);
    }
    return {
      ok: true,
      shantenBeforeDiscard: calcShanten(handCounts, { specialHands: options.specialHands !== false }),
      availableUnseen: available,
      candidates,
      best: candidates.find(c => c.isBestEfficiency) || candidates[0],
      note: '미확인 매수는 현재 보이는 패를 제외한 수입니다. 상대의 비공개 손패·패산 위치를 구분할 수 없으므로 실제 남은 패산 매수는 아닙니다.',
    };
  }

  function getDecompositions(counts) {
    const result = [];
    const work = counts.slice();
    function takeMelds(melds) {
      let i = 0;
      while (i < 34 && work[i] === 0) i++;
      if (i === 34) {
        if (melds.length === 4) result.push(melds.map(m => ({ ...m })));
        return;
      }
      if (work[i] >= 3) {
        work[i] -= 3;
        melds.push({ kind: 'triplet', tile: i });
        takeMelds(melds);
        melds.pop(); work[i] += 3;
      }
      if (i < 27 && i % 9 <= 6 && work[i + 1] > 0 && work[i + 2] > 0) {
        work[i]--; work[i + 1]--; work[i + 2]--;
        melds.push({ kind: 'sequence', tile: i });
        takeMelds(melds);
        melds.pop(); work[i]++; work[i + 1]++; work[i + 2]++;
      }
    }
    for (let pair = 0; pair < 34; pair++) {
      if (work[pair] < 2) continue;
      work[pair] -= 2;
      const before = result.length;
      takeMelds([]);
      for (let i = before; i < result.length; i++) result[i].pair = pair;
      work[pair] += 2;
    }
    return result;
  }

  function allSimple(counts) {
    for (let t = 0; t < 34; t++) {
      if (!counts[t]) continue;
      if (t >= 27) return false;
      const rank = t % 9 + 1;
      if (rank === 1 || rank === 9) return false;
    }
    return true;
  }

  function tileDoraSuccessor(type) {
    if (type < 27) {
      const suitBase = Math.floor(type / 9) * 9;
      return suitBase + ((type % 9 + 1) % 9);
    }
    if (type <= 30) return 27 + ((type - 27 + 1) % 4);
    return 31 + ((type - 31 + 1) % 3);
  }

  function getDoraTypes(indicators = []) {
    return indicators.map(t => tileDoraSuccessor(typeof t === 'number' ? t : t.type));
  }

  function countDora(tiles, indicators = []) {
    const doraTypes = getDoraTypes(indicators);
    let normalDora = 0;
    let redDora = 0;
    for (const tile of tiles || []) {
      if (tile.red) redDora++;
      for (const d of doraTypes) if (tile.type === d) normalDora++;
    }
    return { normalDora, redDora, total: normalDora + redDora, doraTypes };
  }

  function isValuePair(pair, seatWind = 27, roundWind = 27) {
    if (pair >= 31) return true;
    return pair === seatWind || pair === roundWind;
  }

  function hasTriplet(decomp, type) {
    return decomp.some(m => m.kind === 'triplet' && m.tile === type);
  }

  function countTriplets(decomp) {
    return decomp.filter(m => m.kind === 'triplet').length;
  }

  function countSequences(decomp) {
    return decomp.filter(m => m.kind === 'sequence').length;
  }

  function doraCountInTypes(counts, indicators = []) {
    const types = getDoraTypes(indicators);
    return types.reduce((sum, type) => sum + counts[type], 0);
  }

  function sequenceStarts(decomp) {
    return decomp.filter(m => m.kind === 'sequence').map(m => m.tile);
  }

  function yakuForDecomposition(counts, decomp, context) {
    const yaku = [];
    const han = { total: 0 };
    const add = (name, value) => {
      yaku.push({ name, han: value });
      han.total += value;
    };
    const closed = context.closed !== false;
    const isTsumo = context.method === 'tsumo';
    const seatWind = context.seatWind ?? 27;
    const roundWind = context.roundWind ?? 27;

    if (context.riichi && closed) add('리치', 1);
    if (context.doubleRiichi && closed) add('더블 리치', 2);
    if (isTsumo && closed) add('멘젠쯔모', 1);
    if (allSimple(counts) && (closed || context.kuitan !== false)) add('탕야오', 1);

    for (const type of [31, 32, 33]) if (hasTriplet(decomp, type)) add(`역패 ${tileName(type)}`, 1);
    if (hasTriplet(decomp, seatWind)) add('역패 자풍', 1);
    if (hasTriplet(decomp, roundWind)) add('역패 장풍', 1);

    const triplets = countTriplets(decomp);
    const sequences = countSequences(decomp);
    if (triplets === 4) add('대대화', 2);

    const starts = sequenceStarts(decomp);
    const uniqueStarts = new Set(starts);
    if (starts.some((x, i) => starts.indexOf(x) !== i)) add('이페코', 1);

    let sanshoku = false;
    for (let r = 0; r <= 6; r++) {
      if ([r, 9 + r, 18 + r].every(x => starts.includes(x))) sanshoku = true;
    }
    if (sanshoku) add('삼색동순', closed ? 2 : 1);

    let ittsuu = false;
    for (let suit = 0; suit < 3; suit++) {
      const b = suit * 9;
      if ([b, b + 3, b + 6].every(x => starts.includes(x))) ittsuu = true;
    }
    if (ittsuu) add('일기통관', closed ? 2 : 1);

    let sanshokuDoukou = false;
    for (let r = 0; r < 9; r++) {
      if ([r, 9 + r, 18 + r].every(t => hasTriplet(decomp, t))) sanshokuDoukou = true;
    }
    if (sanshokuDoukou) add('삼색동각', 2);

    // Flush yaku.
    const suitsUsed = new Set();
    let honorsUsed = false;
    for (let t = 0; t < 34; t++) if (counts[t] > 0) {
      if (t < 27) suitsUsed.add(Math.floor(t / 9));
      else honorsUsed = true;
    }
    if (suitsUsed.size === 1) add(honorsUsed ? '혼일색' : '청일색', honorsUsed ? (closed ? 3 : 2) : (closed ? 6 : 5));

    // Chanta/junchan: every group and pair touches a terminal or honor, and a sequence exists.
    const groups = decomp.map(m => m.kind === 'sequence'
      ? (m.tile % 9 === 0 || m.tile % 9 === 6 || m.tile >= 27)
      : (m.tile >= 27 || m.tile % 9 === 0 || m.tile % 9 === 8));
    const pairTerminal = decomp.pair >= 27 || decomp.pair % 9 === 0 || decomp.pair % 9 === 8;
    if (sequences > 0 && groups.every(Boolean) && pairTerminal) {
      if (honorsUsed) add('찬타', closed ? 2 : 1);
      else add('준찬타', closed ? 3 : 2);
    }

    const allTerminalsHonors = counts.every((n, t) => !n || t >= 27 || t % 9 === 0 || t % 9 === 8);
    if (allTerminalsHonors) add('혼노두', 2);

    // Pinfu requires four sequences, a non-value pair, and a ryanmen winning placement.
    let pinfu = false;
    if (closed && sequences === 4 && triplets === 0 && !isValuePair(decomp.pair, seatWind, roundWind)) {
      const placements = winningPlacements(decomp, context.winningTile);
      pinfu = placements.some(p => p.kind === 'sequence' && p.wait === 'ryanmen');
    }
    if (pinfu) add('평화', 1);

    // Detect three concealed triplets; ron-completed triplet does not count as concealed.
    const concealedTriplets = decomp.filter(m => m.kind === 'triplet' && !(context.method === 'ron' && m.tile === context.winningTile)).length;
    if (concealedTriplets >= 3) add('삼암각', 2);

    return { yaku, han: han.total, pinfu };
  }

  function winningPlacements(decomp, winningTile) {
    const placements = [];
    if (decomp.pair === winningTile) placements.push({ kind: 'pair', wait: 'tanki' });
    for (const meld of decomp) {
      if (meld.kind === 'triplet' && meld.tile === winningTile) placements.push({ kind: 'triplet', wait: 'shanpon' });
      if (meld.kind === 'sequence' && winningTile >= meld.tile && winningTile <= meld.tile + 2) {
        const pos = winningTile - meld.tile;
        let wait = 'ryanmen';
        if (pos === 1) wait = 'kanchan';
        else if ((pos === 2 && meld.tile % 9 === 0) || (pos === 0 && meld.tile % 9 === 6)) wait = 'penchan';
        placements.push({ kind: 'sequence', wait, pos, start: meld.tile });
      }
    }
    return placements;
  }

  function fuForDecomposition(decomp, counts, context, pinfu) {
    if (isChiitoiComplete(counts)) return { fu: 25, wait: 'chiitoi' };
    const method = context.method;
    const winningTile = context.winningTile;
    const placements = winningPlacements(decomp, winningTile);
    let bestFu = 0;
    let bestWait = 'unknown';
    for (const placement of placements.length ? placements : [{ kind: 'unknown', wait: 'unknown' }]) {
      if (pinfu && method === 'tsumo') return { fu: 20, wait: placement.wait };
      let fu = 20;
      if (method === 'ron' && context.closed !== false) fu += 10;
      if (method === 'tsumo' && !pinfu) fu += 2;
      if (decomp.pair >= 31) fu += 2;
      if (decomp.pair === (context.seatWind ?? 27)) fu += 2;
      if (decomp.pair === (context.roundWind ?? 27)) fu += 2;
      for (const meld of decomp) {
        if (meld.kind !== 'triplet') continue;
        const terminalOrHonor = meld.tile >= 27 || meld.tile % 9 === 0 || meld.tile % 9 === 8;
        const completedByRon = method === 'ron' && meld.tile === winningTile;
        const closedTriplet = !completedByRon;
        fu += terminalOrHonor ? (closedTriplet ? 8 : 4) : (closedTriplet ? 4 : 2);
      }
      if (['tanki', 'kanchan', 'penchan'].includes(placement.wait)) fu += 2;
      // Closed ron with no fu beyond the base is still rounded to 30.
      fu = Math.ceil(fu / 10) * 10;
      if (fu < 30 && method === 'ron') fu = 30;
      if (fu > bestFu) { bestFu = fu; bestWait = placement.wait; }
    }
    return { fu: bestFu || 30, wait: bestWait };
  }

  function calculateBasePoints(han, fu, yakuman = 0) {
    if (yakuman > 0) return { base: 8000 * yakuman, limit: yakuman === 1 ? '역만' : `${yakuman}배 역만` };
    if (han >= 13) return { base: 8000, limit: '헤아림 역만(간이 규칙)' };
    if (han >= 11) return { base: 6000, limit: '삼배만' };
    if (han >= 8) return { base: 4000, limit: '배만' };
    if (han >= 6) return { base: 3000, limit: '하네만' };
    const raw = fu * Math.pow(2, han + 2);
    if (han >= 5 || raw >= 2000) return { base: 2000, limit: '만관' };
    return { base: raw, limit: null };
  }

  function round100(n) { return Math.ceil(n / 100) * 100; }

  function pointsForHand(han, fu, winnerIndex, method, fromIndex = null, yakuman = 0, dealerIndex = 0) {
    const { base, limit } = calculateBasePoints(han, fu, yakuman);
    const winnerDealer = winnerIndex === dealerIndex;
    if (method === 'ron') {
      const points = round100(base * (winnerDealer ? 6 : 4));
      return { base, limit, ron: points, total: points, payments: fromIndex == null ? [] : [{ from: fromIndex, amount: points }] };
    }
    const payments = [];
    let total = 0;
    for (let i = 0; i < 4; i++) {
      if (i === winnerIndex) continue;
      const amount = winnerDealer ? round100(base * 2) : round100(base * (i === dealerIndex ? 2 : 1));
      payments.push({ from: i, amount });
      total += amount;
    }
    return { base, limit, total, payments };
  }

  function evaluateWinningHand(handTiles, winningTileType, method, context = {}) {
    const counts = countsFromTiles(handTiles);
    if (counts.reduce((a, b) => a + b, 0) !== 14 || calcShanten(counts, { specialHands: context.specialHands !== false }) !== -1) {
      return { valid: false, reason: '완성형 손패가 아닙니다.' };
    }
    const dora = countDora(handTiles, context.doraIndicators || []);

    if (context.specialHands !== false && isKokushiComplete(counts)) {
      const yaku = [{ name: '국사무쌍', han: 0, yakuman: 1 }];
      const points = pointsForHand(0, 0, context.winnerIndex ?? 0, method, context.fromIndex, 1, context.dealerIndex ?? 0);
      return { valid: true, yaku, han: 0, fu: 0, yakuman: 1, dora, points, limit: '역만', explanation: '국사무쌍 형태를 인식했습니다.' };
    }

    if (context.specialHands !== false && isChiitoiComplete(counts)) {
      const yaku = [{ name: '칠대자', han: 2 }];
      if (context.riichi) yaku.push({ name: '리치', han: context.doubleRiichi ? 2 : 1 });
      if (method === 'tsumo') yaku.push({ name: '멘젠쯔모', han: 1 });
      if (allSimple(counts)) yaku.push({ name: '탕야오', han: 1 });
      let suits = new Set(); let honor = false;
      for (let t = 0; t < 34; t++) if (counts[t]) { if (t < 27) suits.add(Math.floor(t / 9)); else honor = true; }
      if (suits.size === 1) yaku.push({ name: honor ? '혼일색' : '청일색', han: honor ? 3 : 6 });
      const yakuHan = yaku.reduce((s, y) => s + y.han, 0);
      if (yakuHan <= 0) return { valid: false, reason: '역이 없습니다.' };
      const han = yakuHan + dora.total;
      const points = pointsForHand(han, 25, context.winnerIndex ?? 0, method, context.fromIndex, 0, context.dealerIndex ?? 0);
      return { valid: true, yaku, han, yakuHan, fu: 25, dora, points, limit: points.limit };
    }

    const decompositions = getDecompositions(counts);
    let best = null;
    for (const decomp of decompositions) {
      const data = yakuForDecomposition(counts, decomp, { ...context, method, winningTile: winningTileType, closed: context.closed !== false });
      if (!data.yaku.length) continue;
      const fuData = fuForDecomposition(decomp, counts, { ...context, method, winningTile: winningTileType, closed: context.closed !== false }, data.pinfu);
      const han = data.han + dora.total;
      const points = pointsForHand(han, fuData.fu, context.winnerIndex ?? 0, method, context.fromIndex, 0, context.dealerIndex ?? 0);
      const candidate = { valid: true, yaku: data.yaku, han, yakuHan: data.han, fu: fuData.fu, wait: fuData.wait, dora, points, limit: points.limit, decomposition: decomp, pinfu: data.pinfu };
      if (!best || candidate.points.total > best.points.total || (candidate.points.total === best.points.total && candidate.fu > best.fu)) best = candidate;
    }
    if (!best) return { valid: false, reason: '형태는 완성되었지만 적용 가능한 역이 없습니다. 도라만으로는 화료할 수 없습니다.' };
    return best;
  }

  function getVisibleTiles(state, includeCurrentHand = true) {
    const result = [];
    if (includeCurrentHand) result.push(...(state.players?.[0]?.hand || []));
    for (const player of state.players || []) {
      for (const discard of player.river || []) result.push(discard.tile || discard);
      for (const meld of player.melds || []) result.push(...(meld.tiles || []));
    }
    result.push(...(state.doraIndicators || []));
    return result;
  }

  function getRoundContext(state, playerIndex, method, fromIndex = null) {
    const p = state.players[playerIndex];
    return {
      method,
      winnerIndex: playerIndex,
      fromIndex,
      closed: p.closed !== false,
      riichi: p.riichi,
      doubleRiichi: p.doubleRiichi,
      seatWind: 27 + ((playerIndex - (state.dealerIndex ?? 0) + 4) % 4),
      roundWind: 27, // practice hand starts East 1
      dealerIndex: state.dealerIndex ?? 0,
      doraIndicators: state.doraIndicators,
      specialHands: state.settings.specialHands,
      kuitan: true,
    };
  }

  function hasStructuralFuriten(state, playerIndex) {
    const player = state.players[playerIndex];
    if (player.tempFuriten || player.permanentFuriten) return true;
    if (!player.hand || player.hand.length !== 13) return false;
    const counts = countsFromTiles(player.hand);
    const waits = getWinningTiles(counts, { specialHands: state.settings.specialHands });
    if (!waits.length) return false;
    const riverTypes = new Set(player.river.map(d => (d.tile || d).type));
    return waits.some(t => riverTypes.has(t));
  }

  function canTsumo(state, playerIndex = 0) {
    if (state.initialDiscardPending && playerIndex === (state.dealerIndex ?? 0)) {
      return { can: false, reason: '첫 타패 전 천화·지화 판정은 미지원입니다.' };
    }
    const player = state.players[playerIndex];
    if (!player || player.hand.length !== 14) return { can: false, reason: '쯔모할 수 있는 장수가 아닙니다.' };
    const winning = player.lastDrawUid == null ? player.hand[player.hand.length - 1] : player.hand.find(t => t.uid === player.lastDrawUid);
    if (!winning) return { can: false, reason: '쯔모패 정보가 없습니다.' };
    const result = evaluateWinningHand(player.hand, winning.type, 'tsumo', getRoundContext(state, playerIndex, 'tsumo'));
    return result.valid ? { can: true, tile: winning, result } : { can: false, reason: result.reason || '유효한 역이 없습니다.' };
  }

  function canRonOnDiscard(state, playerIndex, tile, fromIndex) {
    const player = state.players[playerIndex];
    if (!player || player.hand.length !== 13) return { can: false, reason: '대기 상태가 아닙니다.' };
    if (hasStructuralFuriten(state, playerIndex)) return { can: false, reason: '후리텐 상태입니다.' };
    const counts = countsFromTiles(player.hand);
    if (counts[tile.type] >= 4) return { can: false, reason: '동일한 패가 이미 네 장 있습니다.' };
    const hand = [...player.hand, tile];
    const result = evaluateWinningHand(hand, tile.type, 'ron', getRoundContext(state, playerIndex, 'ron', fromIndex));
    return result.valid ? { can: true, result } : { can: false, reason: result.reason || '역이 없어 론할 수 없습니다.' };
  }

  function canDeclareRiichi(handAfterDiscard, player, state) {
    if (!player || player.riichi || player.closed === false || player.points < 1000) return false;
    if (!Array.isArray(handAfterDiscard) || handAfterDiscard.length !== 13) return false;
    return calcShanten(countsFromTiles(handAfterDiscard), { specialHands: state.settings.specialHands }) === 0;
  }

  function isGenbutsu(type, opponent) {
    return (opponent.river || []).some(d => (d.tile || d).type === type);
  }

  function isSuji(type, opponent) {
    if (type >= 27 || opponent.riichiTile == null) return false;
    const suit = Math.floor(type / 9);
    const rank = type % 9 + 1;
    const riichiType = opponent.riichiTile;
    if (Math.floor(riichiType / 9) !== suit) return false;
    const d = riichiType % 9 + 1;
    const safeRanks = [];
    if (d >= 1 && d <= 3) safeRanks.push(d + 3);
    else if (d >= 4 && d <= 6) safeRanks.push(d - 3, d + 3);
    else safeRanks.push(d - 3);
    return safeRanks.includes(rank);
  }

  function isKabeClue(type, visibleTiles) {
    if (type >= 27) return { clue: false, reason: '' };
    const suit = Math.floor(type / 9);
    const rank = type % 9 + 1;
    const counts = countsFromTiles(visibleTiles);
    const base = suit * 9;
    const exhausted = r => r >= 1 && r <= 9 && counts[base + r - 1] >= 4;
    const blockers = [];
    if (rank <= 7 && (exhausted(rank + 1) || exhausted(rank + 2))) blockers.push('상위 연속형의 구성패가 모두 공개됨');
    if (rank >= 3 && (exhausted(rank - 1) || exhausted(rank - 2))) blockers.push('하위 연속형의 구성패가 모두 공개됨');
    return { clue: blockers.length > 0, reason: blockers.join(' · ') };
  }

  function getDefenseSignal(type, opponent, visibleTiles = []) {
    const reasons = [];
    let level = 'unclear';
    if (isGenbutsu(type, opponent)) {
      return { level: 'safe', label: '현물', reasons: ['이 상대의 버림패에 이미 있습니다. 해당 상대의 론에는 안전합니다.'], genbutsu: true, suji: false, kabe: false };
    }
    const suji = isSuji(type, opponent);
    const kabe = isKabeClue(type, visibleTiles);
    if (suji) {
      level = 'safer';
      reasons.push('리치 선언패의 스지 관계입니다. 양면 대기에는 상대적으로 안전하지만 단기·샤보·간짱 대기를 막지는 않습니다.');
    }
    if (kabe.clue) {
      if (level === 'unclear') level = 'clue';
      reasons.push(`벽 단서: ${kabe.reason}. 일부 연속형 대기만 제한하며 완전한 안전패는 아닙니다.`);
    }
    if (!reasons.length) reasons.push('현물·스지·벽에서 뚜렷한 안전 근거를 확인하지 못했습니다. 위험 확률은 계산하지 않습니다.');
    const labels = { safe: '현물 · 론 안전', safer: '스지 · 상대적으로 안전', clue: '벽 단서 · 일부 형태 제한', unclear: '뚜렷한 안전 근거 없음' };
    return { level, label: labels[level], reasons, genbutsu: false, suji, kabe: kabe.clue };
  }

  function snapshotPublic(state) {
    return {
      round: state.round,
      honba: state.honba,
      wallRemaining: state.wall.length,
      turnNumber: state.turnNumber,
      doraIndicators: state.doraIndicators.map(t => ({ ...t })),
      players: state.players.map((p, i) => ({
        index: i,
        name: p.name,
        seat: p.seat,
        riichi: p.riichi,
        riichiTile: p.riichiTile,
        points: p.points,
        river: p.river.map(d => ({ tile: { ...(d.tile || d) }, riichiDeclaration: Boolean(d.riichiDeclaration), turnIndex: d.turnIndex })),
      })),
    };
  }

  function newGame(settings = {}) {
    const normalized = {
      redFives: settings.redFives !== false,
      specialHands: settings.specialHands !== false,
      autoSort: settings.autoSort !== false,
      showTileNumbers: settings.showTileNumbers !== false,
      difficulty: settings.difficulty || 'intermediate',
      showPostDiscardAnalysis: settings.showPostDiscardAnalysis !== false,
      textTiles: settings.textTiles === true,
      theme: settings.theme === 'dark' ? 'dark' : 'light',
      startTurn: settings.startTurn === 'opponent' ? 'opponent' : 'self',
    };
    const dealerIndex = normalized.startTurn === 'opponent' ? 1 : 0;
    const all = shuffle(buildTileSet(normalized.redFives));
    const deadWall = all.slice(0, 14);
    const wall = all.slice(14);
    const names = ['나', 'AI', 'AI', 'AI'];
    const seatOrder = ['동', '남', '서', '북'];
    const seats = names.map((_, i) => seatOrder[(i - dealerIndex + 4) % 4]);
    const players = names.map((name, i) => ({
      id: i,
      name: i === 0 ? name : `AI · ${seats[i]}`,
      seat: seats[i],
      points: 25000,
      hand: [],
      river: [],
      melds: [],
      closed: true,
      riichi: false,
      doubleRiichi: false,
      riichiTile: null,
      riichiTurn: null,
      lastDrawUid: null,
      tempFuriten: false,
      permanentFuriten: false,
      finalHand: null,
    }));
    for (let round = 0; round < 13; round++) {
      for (let i = 0; i < 4; i++) players[i].hand.push(wall.pop());
    }
    players[dealerIndex].hand.push(wall.pop());
    players[dealerIndex].lastDrawUid = players[dealerIndex].hand[players[dealerIndex].hand.length - 1].uid;
    if (normalized.autoSort) players.forEach(p => sortHand(p.hand));
    return {
      version: 1,
      id: `hand-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      createdAt: new Date().toISOString(),
      settings: normalized,
      round: '동1국',
      honba: 0,
      dealerIndex,
      initialDiscardPending: true,
      players,
      wall,
      deadWall,
      doraIndicators: [{ ...deadWall[4] }],
      riichiPot: 0,
      currentTurn: dealerIndex,
      phase: 'turn',
      turnNumber: 1,
      discards: 0,
      decisions: [],
      eventLog: [{ type: 'start', text: `동1국 시작 · ${players[dealerIndex].name} 선공`, turnNumber: 0, public: null }],
      pendingRon: null,
      lastAnalysis: null,
      final: null,
      _completionRecorded: false,
    };
  }

  function currentUserHand(state) { return state.players[0].hand; }

  function decisionCandidates(state) {
    return analyzeDiscards(state.players[0].hand, getVisibleTiles(state, false).concat(state.players[0].hand), { specialHands: state.settings.specialHands });
  }

  function applyHumanDiscard(state, uid, declareRiichi = false) {
    if (state.phase !== 'turn' || state.currentTurn !== 0 || state.players[0].hand.length !== 14) {
      return { ok: false, error: '지금은 타패할 차례가 아닙니다.' };
    }
    const player = state.players[0];
    const selectedIndex = player.hand.findIndex(t => t.uid === uid);
    if (selectedIndex < 0) return { ok: false, error: '선택한 패를 찾을 수 없습니다.' };
    if (player.riichi && uid !== player.lastDrawUid) return { ok: false, error: '리치 후에는 쯔모패만 버릴 수 있습니다.' };

    const tile = player.hand[selectedIndex];
    const handBefore = player.hand.map(t => ({ ...t }));
    const publicBefore = snapshotPublic(state);
    const analysis = analyzeDiscards(handBefore, getVisibleTiles(state, false), { specialHands: state.settings.specialHands });
    const candidate = analysis.candidates.find(c => c.type === tile.type && c.red === Boolean(tile.red)) || null;
    const postHand = handBefore.filter(t => t.uid !== uid);
    const riichiAllowed = canDeclareRiichi(postHand, player, state);
    if (declareRiichi && !riichiAllowed) return { ok: false, error: '이 타패로는 리치를 선언할 수 없습니다. 멘젠·1000점·텐파이가 필요합니다.' };
    if (player.riichi && declareRiichi) return { ok: false, error: '이미 리치 상태입니다.' };

    const decision = {
      id: state.decisions.length + 1,
      turnNumber: state.turnNumber,
      handBefore,
      drawnTile: player.lastDrawUid == null ? null : handBefore.find(t => t.uid === player.lastDrawUid) ? { ...handBefore.find(t => t.uid === player.lastDrawUid) } : null,
      selected: { ...tile },
      declareRiichi: Boolean(declareRiichi),
      riichiBefore: player.riichi,
      shantenBefore: calcShanten(countsFromTiles(handBefore), { specialHands: state.settings.specialHands }),
      selectedCandidate: candidate ? { ...candidate, effective: candidate.effective.map(x => ({ ...x })), shapeOnly: candidate.shapeOnly.map(x => ({ ...x })) } : null,
      analysis: analysis.ok ? JSON.parse(JSON.stringify(analysis)) : null,
      publicBefore,
      opponentsRiichi: state.players.slice(1).filter(p => p.riichi).map(p => p.id),
      wallRemaining: state.wall.length,
    };

    if (declareRiichi) {
      player.riichi = true;
      player.riichiTurn = state.turnNumber;
      player.riichiTile = tile.type;
      player.points -= 1000;
      state.riichiPot += 1000;
      state.eventLog.push({ type: 'riichi', player: 0, tile: { ...tile }, turnNumber: state.turnNumber, text: '플레이어 리치 선언' });
    }
    player.hand = postHand;
    if (state.settings.autoSort) sortHand(player.hand);
    player.lastDrawUid = null;
    // The dealer's initial 14-tile hand has now been discarded; later draws
    // must follow ordinary turn rules and must not be treated as a first-turn win.
    if (state.initialDiscardPending && (state.dealerIndex ?? 0) === 0) state.initialDiscardPending = false;
    player.river.push({ tile: { ...tile }, turnIndex: state.discards++, riichiDeclaration: Boolean(declareRiichi), turnNumber: state.turnNumber });
    decision.publicAfter = snapshotPublic(state);
    state.decisions.push(decision);
    state.lastAnalysis = {
      decisionId: decision.id,
      selected: { ...tile },
      selectedCandidate: decision.selectedCandidate,
      analysis: decision.analysis,
      shantenBefore: decision.shantenBefore,
      shantenAfter: candidate?.shanten ?? null,
      declareRiichi: Boolean(declareRiichi),
    };
    state.eventLog.push({ type: 'discard', player: 0, tile: { ...tile }, turnNumber: state.turnNumber, riichiDeclaration: Boolean(declareRiichi), text: `플레이어 타패 ${tileShort(tile.type, tile.red)}` });
    state.turnNumber++;
    const resolution = resolveDiscardResponses(state, tile, 0, 0);
    return { ok: true, tile, resolution };
  }

  function isTileSafeAgainstAnyRiichi(state, type) {
    const riichiPlayers = state.players.filter((p, i) => i !== 0 && p.riichi);
    if (!riichiPlayers.length) return false;
    return riichiPlayers.some(p => isGenbutsu(type, p));
  }

  function aiDiscardScore(state, playerIndex, tile, postCounts, postHand) {
    const sh = calcShanten(postCounts, { specialHands: state.settings.specialHands });
    const shape = shapePotential(postCounts);
    const redPenalty = tile.red ? 4 : 0;
    const doraTypes = new Set(getDoraTypes(state.doraIndicators));
    const doraPenalty = doraTypes.has(tile.type) ? 2.5 : 0;
    let safetyBonus = 0;
    if (state.settings.difficulty === 'advanced') {
      const attackers = state.players.filter((p, i) => i !== playerIndex && p.riichi);
      const anyUnclear = attackers.length && attackers.every(p => !isGenbutsu(tile.type, p));
      const shAfter = calcShanten(postCounts, { specialHands: state.settings.specialHands });
      if (anyUnclear && shAfter > 0) safetyBonus -= 1.5;
      if (attackers.some(p => isGenbutsu(tile.type, p))) safetyBonus += 1.2;
    }
    // Lower shanten dominates. Shape and bonus retention are inexpensive heuristic tie-breakers.
    return -sh * 100 + shape * 2.1 - redPenalty - doraPenalty + safetyBonus;
  }

  function chooseAIDiscard(state, playerIndex) {
    const player = state.players[playerIndex];
    if (player.riichi && player.lastDrawUid != null) {
      return player.hand.find(t => t.uid === player.lastDrawUid) || player.hand[player.hand.length - 1];
    }
    let bestScore = -Infinity;
    let best = [];
    const seen = new Set();
    for (const tile of player.hand) {
      const typeRedKey = `${tile.type}:${tile.red ? 1 : 0}`;
      if (seen.has(typeRedKey)) continue;
      seen.add(typeRedKey);
      const post = player.hand.filter(t => t.uid !== tile.uid);
      const postCounts = countsFromTiles(post);
      const score = aiDiscardScore(state, playerIndex, tile, postCounts, post);
      if (score > bestScore + 0.001) { bestScore = score; best = [tile]; }
      else if (Math.abs(score - bestScore) < 0.001) best.push(tile);
    }
    if (!best.length) return player.hand[player.hand.length - 1];
    if (state.settings.difficulty === 'beginner' && best.length === 1) {
      // Mildly forgiving beginner play: occasionally use another tile with no shanten loss.
      const ranked = player.hand.map(tile => ({ tile, score: aiDiscardScore(state, playerIndex, tile, countsFromTiles(player.hand.filter(t => t.uid !== tile.uid)), []) }));
      const top = Math.max(...ranked.map(x => x.score));
      const near = ranked.filter(x => x.score >= top - 2.1);
      if (near.length && Math.random() < 0.22) return near[Math.floor(Math.random() * near.length)].tile;
    }
    return best[Math.floor(Math.random() * best.length)];
  }

  function getResponseOrder(fromIndex) {
    const order = [];
    for (let step = 1; step < 4; step++) order.push((fromIndex + step) % 4);
    return order;
  }

  function finishWin(state, winnerIndex, method, fromIndex, winningTile, result) {
    const winner = state.players[winnerIndex];
    let payout = result.points;
    const transfers = [];
    if (method === 'ron') {
      const amount = payout.ron;
      state.players[fromIndex].points -= amount;
      winner.points += amount;
      transfers.push({ from: fromIndex, to: winnerIndex, amount });
    } else {
      for (const p of payout.payments || []) {
        state.players[p.from].points -= p.amount;
        winner.points += p.amount;
        transfers.push({ from: p.from, to: winnerIndex, amount: p.amount });
      }
    }
    if (state.riichiPot > 0) {
      winner.points += state.riichiPot;
      transfers.push({ from: null, to: winnerIndex, amount: state.riichiPot, label: '리치 공탁금' });
      state.riichiPot = 0;
    }
    state.phase = 'ended';
    state.pendingRon = null;
    state.final = {
      reason: method === 'tsumo' ? '쯔모 화료' : '론 화료',
      winner: winnerIndex,
      method,
      from: fromIndex,
      winningTile: { ...winningTile },
      result: JSON.parse(JSON.stringify(result)),
      transfers,
      scoresAfter: state.players.map(p => p.points),
      handsRevealed: true,
      endedAt: new Date().toISOString(),
    };
    state.eventLog.push({ type: 'win', player: winnerIndex, from: fromIndex, tile: { ...winningTile }, turnNumber: state.turnNumber, text: `${winner.name} ${method === 'tsumo' ? '쯔모' : '론'} 화료` });
    for (const p of state.players) p.finalHand = p.hand.map(t => ({ ...t }));
    return state.final;
  }

  function finishExhaustive(state) {
    if (state.phase === 'ended') return state.final;
    state.phase = 'ended';
    state.pendingRon = null;
    const shantens = state.players.map(p => ({ player: p.id, shanten: calcShanten(countsFromTiles(p.hand), { specialHands: state.settings.specialHands }), handCount: p.hand.length }));
    const tenpai = shantens.filter(x => x.shanten === 0 && x.handCount === 13).map(x => x.player);
    const deltas = [0, 0, 0, 0];
    // Standard noten payments are deliberately omitted rather than guessed; tenpai is displayed only.
    state.final = {
      reason: '유국 · 패산 소진',
      winner: null,
      method: 'exhaustive',
      tenpai,
      shantens,
      transfers: [],
      scoresAfter: state.players.map(p => p.points),
      pointsDelta: deltas,
      handsRevealed: true,
      endedAt: new Date().toISOString(),
      note: `유국 시 노텐 벌점·친 유지 규칙은 아직 적용하지 않았습니다. 점수 변화는 0으로 두고 텐파이 여부만 표시합니다. 리치 공탁금 ${state.riichiPot}점은 다음 국 이월을 구현하지 않아 미분배 상태로 남습니다.`,
    };
    state.eventLog.push({ type: 'draw', turnNumber: state.turnNumber, text: '패산 소진으로 유국' });
    for (const p of state.players) p.finalHand = p.hand.map(t => ({ ...t }));
    return state.final;
  }

  function resolveDiscardResponses(state, tile, fromIndex, startResponseIndex = 0) {
    const order = getResponseOrder(fromIndex);
    for (let i = startResponseIndex; i < order.length; i++) {
      const responder = order[i];
      const claim = canRonOnDiscard(state, responder, tile, fromIndex);
      if (!claim.can) continue;
      if (responder === 0) {
        state.phase = 'ronOffer';
        state.pendingRon = { tile: { ...tile }, from: fromIndex, responseOrder: order, responseIndex: i, result: claim.result };
        return { status: 'ronOffer', player: responder };
      }
      // Atamahane: the first valid ron in turn order wins. Multiple ron is not implemented.
      finishWin(state, responder, 'ron', fromIndex, tile, claim.result);
      return { status: 'ended', winner: responder };
    }
    state.pendingRon = null;
    state.phase = 'turn';
    state.currentTurn = (fromIndex + 1) % 4;
    return { status: 'continue', next: state.currentTurn };
  }

  function passRon(state) {
    if (state.phase !== 'ronOffer' || !state.pendingRon) return { status: 'error', error: '응답할 론 제안이 없습니다.' };
    const pending = state.pendingRon;
    const p = state.players[0];
    if (p.riichi) p.permanentFuriten = true;
    else p.tempFuriten = true;
    state.eventLog.push({ type: 'passRon', player: 0, tile: pending.tile, turnNumber: state.turnNumber, text: '플레이어 론 패스' });
    state.phase = 'turn';
    return resolveDiscardResponses(state, pending.tile, pending.from, pending.responseIndex + 1);
  }

  function claimRon(state) {
    if (state.phase !== 'ronOffer' || !state.pendingRon) return { status: 'error', error: '응답할 론 제안이 없습니다.' };
    const pending = state.pendingRon;
    const result = pending.result;
    finishWin(state, 0, 'ron', pending.from, pending.tile, result);
    return { status: 'ended', winner: 0 };
  }

  function claimTsumo(state, playerIndex = 0) {
    if (state.phase !== 'turn' || state.currentTurn !== playerIndex) return { status: 'error', error: '지금은 쯔모할 차례가 아닙니다.' };
    const check = canTsumo(state, playerIndex);
    if (!check.can) return { status: 'error', error: check.reason };
    finishWin(state, playerIndex, 'tsumo', null, check.tile, check.result);
    return { status: 'ended', winner: playerIndex };
  }

  function performAITurn(state) {
    if (state.phase !== 'turn' || state.currentTurn === 0) return { status: 'error', error: 'AI의 차례가 아닙니다.' };
    const index = state.currentTurn;
    if (state.wall.length === 0) {
      finishExhaustive(state);
      return { status: 'ended', reason: 'exhaustive' };
    }
    const player = state.players[index];
    const initialDealerDiscard = Boolean(state.initialDiscardPending && index === (state.dealerIndex ?? 0));
    if (!initialDealerDiscard) {
      const drawn = state.wall.pop();
      player.hand.push(drawn);
      player.lastDrawUid = drawn.uid;
    }
    player.tempFuriten = false;
    if (state.settings.autoSort) sortHand(player.hand);

    const tsumo = initialDealerDiscard ? { can: false } : canTsumo(state, index);
    if (tsumo.can) {
      finishWin(state, index, 'tsumo', null, tsumo.tile, tsumo.result);
      return { status: 'ended', winner: index, method: 'tsumo' };
    }

    const discard = chooseAIDiscard(state, index);
    if (!discard) {
      finishExhaustive(state);
      return { status: 'ended', reason: 'no-discard' };
    }
    const postHand = player.hand.filter(t => t.uid !== discard.uid);
    let declareRiichi = false;
    if (!player.riichi && player.closed && player.points >= 1000 && canDeclareRiichi(postHand, player, state)) {
      const threshold = state.settings.difficulty === 'beginner' ? 0.25 : state.settings.difficulty === 'advanced' ? 0.9 : 0.65;
      declareRiichi = Math.random() < threshold;
    }
    if (declareRiichi) {
      player.riichi = true;
      player.riichiTurn = state.turnNumber;
      player.riichiTile = discard.type;
      player.points -= 1000;
      state.riichiPot += 1000;
      state.eventLog.push({ type: 'riichi', player: index, tile: { ...discard }, turnNumber: state.turnNumber, text: `${player.name} 리치 선언` });
    }
    player.hand = postHand;
    if (state.settings.autoSort) sortHand(player.hand);
    player.lastDrawUid = null;
    if (initialDealerDiscard) state.initialDiscardPending = false;
    player.river.push({ tile: { ...discard }, turnIndex: state.discards++, riichiDeclaration: declareRiichi, turnNumber: state.turnNumber });
    state.eventLog.push({ type: 'discard', player: index, tile: { ...discard }, turnNumber: state.turnNumber, riichiDeclaration: declareRiichi, text: `${player.name} 타패 ${tileShort(discard.type, discard.red)}` });
    state.turnNumber++;
    return resolveDiscardResponses(state, discard, index, 0);
  }

  function drawHumanTurn(state) {
    if (state.phase !== 'turn' || state.currentTurn !== 0) return { status: 'error', error: '플레이어의 차례가 아닙니다.' };
    if (state.wall.length === 0) {
      finishExhaustive(state);
      return { status: 'ended', reason: 'exhaustive' };
    }
    const player = state.players[0];
    const tile = state.wall.pop();
    player.hand.push(tile);
    player.lastDrawUid = tile.uid;
    player.tempFuriten = false;
    if (state.settings.autoSort) sortHand(player.hand);
    state.eventLog.push({ type: 'draw', player: 0, tile: { ...tile }, turnNumber: state.turnNumber, text: '플레이어 쯔모' });
    return { status: 'turn', tile };
  }

  function makePracticeHand(redFives = true, riverCount = 0) {
    const all = shuffle(buildTileSet(redFives));
    return {
      hand: sortHand(all.slice(0, 14)),
      river: all.slice(14, 14 + riverCount).map((tile, i) => ({ tile: { ...tile }, turnIndex: i, riichiDeclaration: i === Math.min(3, riverCount - 1) })),
      remaining: all.slice(14 + riverCount),
    };
  }

  function decisionEvaluation(decision) {
    const analysis = decision.analysis;
    const actual = decision.selectedCandidate;
    if (!analysis?.ok || !actual) return { label: '분석 불가', reason: '해당 턴의 분석 자료가 없습니다.' };
    const best = analysis.best;
    if (actual.shanten > best.shanten) {
      return { label: '샹텐 손실', reason: `선택한 타패는 샹텐 수가 ${actual.shanten - best.shanten} 늘어났습니다. 당시 보이는 정보 기준으로 샹텐을 유지하는 후보가 있었습니다.`, severity: 'poor' };
    }
    if (actual.shanten === best.shanten && actual.ukeire < best.ukeire) {
      return { label: '유효패 감소', reason: `샹텐 수는 같지만 미확인 유효패가 최선 후보보다 ${best.ukeire - actual.ukeire}장 적습니다. 수비·타점 목적이 있었다면 의도적 선택일 수 있습니다.`, severity: 'review' };
    }
    if (actual.shanten === best.shanten && actual.ukeire === best.ukeire && actual.shapeScore + 0.01 < best.shapeScore) {
      return { label: '형태 검토', reason: '샹텐과 유효패 매수는 같지만 단순 형태 점수에서 다른 후보가 앞섭니다. 이 점수는 학습용 휴리스틱이며 정답을 보장하지 않습니다.', severity: 'review' };
    }
    return { label: '효율 기준 양호', reason: '샹텐과 미확인 유효패 매수 기준으로 최선 후보와 동률입니다. 전략적 우열 전체를 증명하는 것은 아닙니다.', severity: 'good' };
  }

  function evaluateHandReview(state) {
    const decisions = state.decisions || [];
    let efficiencyPenalty = 0;
    let shapePenalty = 0;
    let attackScoreTotal = 0;
    let attackCount = 0;
    let defenseScoreTotal = 0;
    let defenseCount = 0;
    let shantenLosses = 0;
    let ukeireLosses = 0;
    let safetyRechecks = 0;
    let bestCalls = 0;

    for (const d of decisions) {
      const analysis = d.analysis;
      const selected = d.selectedCandidate;
      if (!analysis?.ok || !selected || !analysis.candidates.length) continue;
      const minSh = Math.min(...analysis.candidates.map(c => c.shanten));
      const bestAtSh = analysis.candidates.filter(c => c.shanten === minSh);
      const bestUkeire = Math.max(...bestAtSh.map(c => c.ukeire));
      const shapeMax = Math.max(...bestAtSh.filter(c => c.ukeire === bestUkeire).map(c => c.shapeScore));
      const shLoss = Math.max(0, selected.shanten - minSh);
      const ukLoss = selected.shanten === minSh ? Math.max(0, bestUkeire - selected.ukeire) : bestUkeire;
      efficiencyPenalty += Math.min(1, shLoss * 0.6 + (bestUkeire ? ukLoss / bestUkeire * 0.4 : 0));
      shapePenalty += shapeMax > 0 ? Math.min(1, Math.max(0, shapeMax - selected.shapeScore) / Math.max(1, shapeMax)) : 0;
      if (shLoss > 0) shantenLosses++;
      if (ukLoss > 0) ukeireLosses++;
      if (selected.shanten === minSh && selected.ukeire === bestUkeire) bestCalls++;

      const beforeHand = d.handBefore || [];
      const beforeCounts = countsFromTiles(beforeHand);
      const beforeSh = calcShanten(beforeCounts, { specialHands: state.settings.specialHands });
      if (!d.opponentsRiichi?.length && beforeSh <= 1) {
        attackScoreTotal += selected.shanten === minSh ? 100 : Math.max(0, 100 - shLoss * 45 - (ukLoss / Math.max(1, bestUkeire)) * 55);
        attackCount++;
      }

      if (d.opponentsRiichi?.length) {
        const snapshots = d.publicBefore?.players || [];
        const visible = [...beforeHand, ...(snapshots.flatMap(p => p.river.map(x => x.tile)) || []), ...(d.publicBefore?.doraIndicators || [])];
        const signals = d.opponentsRiichi.map(id => {
          const opponent = snapshots.find(p => p.index === id);
          return opponent ? getDefenseSignal(d.selected.type, opponent, visible) : { level: 'unclear' };
        });
        let score = 25;
        if (signals.some(s => s.level === 'safe')) score = 100;
        else if (signals.some(s => s.level === 'safer')) score = 72;
        else if (signals.some(s => s.level === 'clue')) score = 55;
        else safetyRechecks++;
        defenseScoreTotal += score;
        defenseCount++;
      }
    }
    const n = decisions.length || 1;
    const categories = {
      efficiency: { label: '패 효율', weight: 40, score: Math.round(40 * (1 - efficiencyPenalty / n)), evaluated: decisions.length > 0, detail: '샹텐 손실과 유효패 매수 감소를 기준으로 계산' },
      shape: { label: '형태 판단', weight: 20, score: Math.round(20 * (1 - shapePenalty / n)), evaluated: decisions.length > 0, detail: '연결·타츠·쌍을 세는 단순 휴리스틱; 완전한 형태 평가가 아님' },
      attack: { label: '공격 판단', weight: 20, score: attackCount ? Math.round(20 * (attackScoreTotal / attackCount / 100)) : null, evaluated: attackCount > 0, detail: attackCount ? `상대 리치가 없고 샹텐 1 이하였던 ${attackCount}회만 평가` : '평가할 공격 기회가 충분하지 않음' },
      defense: { label: '수비 판단', weight: 20, score: defenseCount ? Math.round(20 * (defenseScoreTotal / defenseCount / 100)) : null, evaluated: defenseCount > 0, detail: defenseCount ? `리치 상대가 있던 ${defenseCount}회에서 현물·스지·벽 단서 활용만 평가` : '상대 리치 상황이 없어 평가 제외' },
      situation: { label: '국 상황 판단', weight: 0, score: null, evaluated: false, detail: '단일 동1국만 지원하므로 반장전 순위·오라스 전략은 평가하지 않음' },
    };
    let weighted = 0; let weights = 0;
    for (const cat of Object.values(categories)) if (cat.evaluated && cat.score != null) {
      weighted += cat.score; weights += cat.weight;
    }
    // Normalize the points actually evaluated to a 100-point scale; omitted domains stay visibly omitted.
    const normalizedScores = {};
    for (const [key, cat] of Object.entries(categories)) normalizedScores[key] = cat.score == null ? null : Math.round((cat.score / Math.max(1, cat.weight)) * 100);
    return {
      total: weights ? Math.round((weighted / weights) * 100) : null,
      evaluatedWeight: weights,
      categories,
      normalizedScores,
      decisionCount: decisions.length,
      shantenLosses,
      ukeireLosses,
      safetyRechecks,
      bestCalls,
      notes: [
        '이 점수는 현재 구현된 효율·형태·안전 단서의 휴리스틱 지표이며, 실력이나 승률을 검증한 점수가 아닙니다.',
        '결과(화료·방총)와 의사결정 질을 분리합니다. 상대의 숨은 손패를 알고 있었다고 가정하지 않습니다.',
        '각 범주의 평가 가능한 배점만 100점으로 환산합니다. 제외된 범주는 점수가 아니라 미평가로 표시됩니다.',
      ],
    };
  }

  function summarizeHand(state) {
    const final = state.final || {};
    const before = state.players.map(p => 25000);
    const after = state.players.map(p => p.points);
    return {
      id: state.id,
      createdAt: state.createdAt,
      endedAt: final.endedAt || new Date().toISOString(),
      result: final.reason || '종료',
      winner: final.winner == null ? null : final.winner,
      winnerName: final.winner == null ? null : state.players[final.winner]?.name,
      method: final.method,
      pointDeltas: after.map((p, i) => p - before[i]),
      scoreAfter: after,
      humanWon: final.winner === 0,
      decisionCount: state.decisions.length,
      reviewScore: evaluateHandReview(state).total,
      shantenLosses: evaluateHandReview(state).shantenLosses,
      ukeireLosses: evaluateHandReview(state).ukeireLosses,
    };
  }

  return {
    TILE_COUNT, SUITS, HONORS, ORPHANS,
    tileShort, tileName, tileSort, sortHand,
    buildTileSet, shuffle, countsFromTiles, calcShanten, isCompleteStandard,
    isChiitoiComplete, isKokushiComplete, getWinningTiles, shapePotential,
    availableUnseenCounts, analyzeDiscards, getDecompositions,
    tileDoraSuccessor, getDoraTypes, countDora, evaluateWinningHand, pointsForHand,
    knownTypeCounts, getVisibleTiles, getRoundContext, hasStructuralFuriten,
    canTsumo, canRonOnDiscard, canDeclareRiichi, isGenbutsu, isSuji, isKabeClue, getDefenseSignal,
    newGame, applyHumanDiscard, chooseAIDiscard, performAITurn, drawHumanTurn,
    resolveDiscardResponses, passRon, claimRon, claimTsumo, finishExhaustive,
    makePracticeHand, decisionEvaluation, evaluateHandReview, summarizeHand,
  };
});


  function tileShort(type, red = false) {
    if (type < 0 || type >= 34) return '?';
    if (type < 27) {
      const suit = Math.floor(type / 9);
      const rank = type % 9 + 1;
      return `${red ? '0' : rank}${SUITS[suit]}`;
    }
    return `${HONORS[type - 27]}`;
  }

  function tileName(type, red = false) {
    if (type < 27) {
      const suit = Math.floor(type / 9);
      const rank = type % 9 + 1;
      return `${red ? '적도라 ' : ''}${rank}${SUIT_NAMES[suit]}`;
    }
    return HONORS[type - 27];
  }

  function tileSort(a, b) {
    return a.type - b.type || Number(a.red) - Number(b.red) || a.uid - b.uid;
  }

  function sortHand(hand) {
    hand.sort(tileSort);
    return hand;
  }

  function buildTileSet(redFives = true) {
    const tiles = [];
    let uid = 0;
    for (let type = 0; type < 34; type++) {
      for (let copy = 0; copy < 4; copy++) {
        const isFive = type < 27 && type % 9 === 4;
        // One red five per suit. The remaining three copies are normal.
        const red = Boolean(redFives && isFive && copy === 0);
        tiles.push({ uid: uid++, type, red });
      }
    }
    return tiles;
  }

  function shuffle(items, rng = Math.random) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function countsFromTiles(tiles) {
    const counts = Array(TILE_COUNT).fill(0);
    for (const tile of tiles || []) {
      const t = typeof tile === 'number' ? tile : tile?.type;
      if (Number.isInteger(t) && t >= 0 && t < 34) counts[t]++;
    }
    return counts;
  }

  function countsKey(counts, openMelds = 0, specials = true) {
    return `${counts.join('')}:${openMelds}:${specials ? 1 : 0}`;
  }

  function standardShanten(counts, openMelds = 0) {
    const memo = new Map();
    let best = 8;

    function dfs(melds, taatsu, head) {
      // There is no benefit from keeping more than four melds or taatsu.
      if (melds > 4) return;
      if (taatsu > 4) taatsu = 4;

      let i = 0;
      while (i < 34 && counts[i] === 0) i++;
      if (i === 34) {
        const usableTaatsu = Math.min(taatsu, 4 - melds - openMelds);
        const sh = 8 - 2 * (melds + openMelds) - usableTaatsu - head;
        if (sh < best) best = sh;
        return;
      }

      const key = `${i}/${melds}/${taatsu}/${head}/${counts.slice(i).join('')}`;
      const prior = memo.get(key);
      if (prior !== undefined && prior <= best) return;
      memo.set(key, best);

      // Isolated tile.
      counts[i]--;
      dfs(melds, taatsu, head);
      counts[i]++;

      // Triplet.
      if (counts[i] >= 3) {
        counts[i] -= 3;
        dfs(melds + 1, taatsu, head);
        counts[i] += 3;
      }

      // Sequence (suits only; never cross a suit boundary).
      if (i < 27 && i % 9 <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0) {
        counts[i]--; counts[i + 1]--; counts[i + 2]--;
        dfs(melds + 1, taatsu, head);
        counts[i]++; counts[i + 1]++; counts[i + 2]++;
      }

      // Head pair.
      if (!head && counts[i] >= 2) {
        counts[i] -= 2;
        dfs(melds, taatsu, 1);
        counts[i] += 2;
      }

      // Pair as a taatsu.
      if (counts[i] >= 2) {
        counts[i] -= 2;
        dfs(melds, taatsu + 1, head);
        counts[i] += 2;
      }

      // Adjacent/gapped taatsu.
      if (i < 27 && i % 9 <= 7 && counts[i + 1] > 0) {
        counts[i]--; counts[i + 1]--;
        dfs(melds, taatsu + 1, head);
        counts[i]++; counts[i + 1]++;
      }
      if (i < 27 && i % 9 <= 6 && counts[i + 2] > 0) {
        counts[i]--; counts[i + 2]--;
        dfs(melds, taatsu + 1, head);
        counts[i]++; counts[i + 2]++;
      }
    }
    dfs(0, 0, 0);
    return best;
  }

  function chiitoiShanten(counts) {
    let pairs = 0;
    let unique = 0;
    for (const n of counts) {
      if (n > 0) unique++;
      if (n >= 2) pairs++;
    }
    return 6 - pairs + Math.max(0, 7 - unique);
  }

  const ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  function kokushiShanten(counts) {
    let unique = 0;
    let pair = false;
    for (const t of ORPHANS) {
      if (counts[t] > 0) unique++;
      if (counts[t] > 1) pair = true;
    }
    return 13 - unique - (pair ? 1 : 0);
  }

  function calcShanten(input, options = {}) {
    const counts = Array.isArray(input) && input.length === 34 ? input.slice() : countsFromTiles(input);
    const openMelds = Math.max(0, Number(options.openMelds || 0));
    const specials = options.specialHands !== false && openMelds === 0;
    const key = countsKey(counts, openMelds, specials);
    const cached = shantenCache.get(key);
    if (cached !== undefined) return cached;
    let answer = standardShanten(counts, openMelds);
    if (specials) answer = Math.min(answer, chiitoiShanten(counts), kokushiShanten(counts));
    shantenCache.set(key, answer);
    if (shantenCache.size > 60000) shantenCache.clear();
    return answer;
  }

  function isCompleteStandard(counts) {
    if (counts.reduce((a, b) => a + b, 0) !== 14) return false;
    return standardShanten(counts, 0) === -1;
  }

  function isChiitoiComplete(counts) {
    return counts.reduce((a, b) => a + b, 0) === 14 && counts.filter(n => n === 2).length === 7;
  }

  function isKokushiComplete(counts) {
    if (counts.reduce((a, b) => a + b, 0) !== 14) return false;
    return kokushiShanten(counts) === -1;
  }

  function getWinningTiles(counts, options = {}) {
    if (!Array.isArray(counts) || counts.length !== 34 || counts.reduce((a, b) => a + b, 0) !== 13) return [];
    const waits = [];
    for (let t = 0; t < 34; t++) {
      if (counts[t] >= 4) continue;
      counts[t]++;
      const complete = calcShanten(counts, options) === -1;
      counts[t]--;
      if (complete) waits.push(t);
    }
    return waits;
  }

  function shapePotential(counts) {
    let score = 0;
    // Pairs can serve as a head or become a triplet.
    for (let t = 0; t < 34; t++) {
      if (counts[t] >= 2) score += Math.min(2, Math.floor(counts[t] / 2)) * 2.2;
      if (counts[t] >= 3) score += 0.8;
    }
    // Connected suited tiles form useful incomplete shapes; this is a heuristic only.
    for (let suit = 0; suit < 3; suit++) {
      const base = suit * 9;
      for (let r = 0; r < 8; r++) {
        if (counts[base + r] && counts[base + r + 1]) score += 0.85;
      }
      for (let r = 0; r < 7; r++) {
        if (counts[base + r] && counts[base + r + 2]) score += 0.45;
      }
    }
    return score;
  }

  function knownTypeCounts(handTiles, visibleTiles = []) {
    const counts = countsFromTiles([...(handTiles || []), ...(visibleTiles || [])]);
    return counts.map(n => Math.min(4, n));
  }

  function availableUnseenCounts(handTiles, visibleTiles = []) {
    const known = knownTypeCounts(handTiles, visibleTiles);
    return known.map(n => Math.max(0, 4 - n));
  }

  function analyzeDiscards(handTiles, visibleTiles = [], options = {}) {
    if (!Array.isArray(handTiles) || handTiles.length !== 14) {
      return { ok: false, error: '타패 분석은 14장인 손패를 필요로 합니다.', candidates: [] };
    }
    const handCounts = countsFromTiles(handTiles);
    const available = availableUnseenCounts(handTiles, visibleTiles);
    const unique = new Map();
    for (const tile of handTiles) {
      const key = `${tile.type}:${tile.red ? 1 : 0}`;
      if (!unique.has(key)) unique.set(key, tile);
    }
    const candidates = [];
    for (const tile of unique.values()) {
      const post = handCounts.slice();
      post[tile.type]--;
      const sh = calcShanten(post, { specialHands: options.specialHands !== false });
      const effective = [];
      const shapeOnly = [];
      const baseShape = shapePotential(post);
      let ukeire = 0;
      for (let t = 0; t < 34; t++) {
        if (available[t] <= 0 || post[t] >= 4) continue;
        post[t]++;
        const nextSh = calcShanten(post, { specialHands: options.specialHands !== false });
        if (nextSh < sh) {
          effective.push({ type: t, count: available[t] });
          ukeire += available[t];
        } else if (nextSh === sh && shapePotential(post) > baseShape + 0.25) {
          shapeOnly.push({ type: t, count: available[t] });
        }
        post[t]--;
      }
      candidates.push({
        tile: { ...tile },
        type: tile.type,
        red: Boolean(tile.red),
        shanten: sh,
        effective,
        ukeire,
        shapeOnly,
        shapeScore: Number(baseShape.toFixed(2)),
      });
    }
    candidates.sort((a, b) => a.shanten - b.shanten || b.ukeire - a.ukeire || b.shapeScore - a.shapeScore || a.type - b.type);
    const bestShanten = Math.min(...candidates.map(c => c.shanten));
    const bestUkeire = Math.max(...candidates.filter(c => c.shanten === bestShanten).map(c => c.ukeire));
    const bestShape = Math.max(...candidates.filter(c => c.shanten === bestShanten && c.ukeire === bestUkeire).map(c => c.shapeScore));
    for (const c of candidates) {
      c.isBestEfficiency = c.shanten === bestShanten && c.ukeire === bestUkeire;
      c.shantenLoss = Math.max(0, c.shanten - bestShanten);
      c.ukeireLoss = c.shanten === bestShanten ? Math.max(0, bestUkeire - c.ukeire) : null;
      c.shapeLoss = Math.max(0, bestShape - c.shapeScore);
    }
    return {
      ok: true,
      shantenBeforeDiscard: calcShanten(handCounts, { specialHands: options.specialHands !== false }),
      availableUnseen: available,
      candidates,
      best: candidates.find(c => c.isBestEfficiency) || candidates[0],
      note: '미확인 매수는 현재 보이는 패를 제외한 수입니다. 상대의 비공개 손패·패산 위치를 구분할 수 없으므로 실제 남은 패산 매수는 아닙니다.',
    };
  }

  function getDecompositions(counts) {
    const result = [];
    const work = counts.slice();
    function takeMelds(melds) {
      let i = 0;
      while (i < 34 && work[i] === 0) i++;
      if (i === 34) {
        if (melds.length === 4) result.push(melds.map(m => ({ ...m })));
        return;
      }
      if (work[i] >= 3) {
        work[i] -= 3;
        melds.push({ kind: 'triplet', tile: i });
        takeMelds(melds);
        melds.pop(); work[i] += 3;
      }
      if (i < 27 && i % 9 <= 6 && work[i + 1] > 0 && work[i + 2] > 0) {
        work[i]--; work[i + 1]--; work[i + 2]--;
        melds.push({ kind: 'sequence', tile: i });
        takeMelds(melds);
        melds.pop(); work[i]++; work[i + 1]++; work[i + 2]++;
      }
    }
    for (let pair = 0; pair < 34; pair++) {
      if (work[pair] < 2) continue;
      work[pair] -= 2;
      const before = result.length;
      takeMelds([]);
      for (let i = before; i < result.length; i++) result[i].pair = pair;
      work[pair] += 2;
    }
    return result;
  }

  function allSimple(counts) {
    for (let t = 0; t < 34; t++) {
      if (!counts[t]) continue;
      if (t >= 27) return false;
      const rank = t % 9 + 1;
      if (rank === 1 || rank === 9) return false;
    }
    return true;
  }

  function tileDoraSuccessor(type) {
    if (type < 27) {
      const suitBase = Math.floor(type / 9) * 9;
      return suitBase + ((type % 9 + 1) % 9);
    }
    if (type <= 30) return 27 + ((type - 27 + 1) % 4);
    return 31 + ((type - 31 + 1) % 3);
  }

  function getDoraTypes(indicators = []) {
    return indicators.map(t => tileDoraSuccessor(typeof t === 'number' ? t : t.type));
  }

  function countDora(tiles, indicators = []) {
    const doraTypes = getDoraTypes(indicators);
    let normalDora = 0;
    let redDora = 0;
    for (const tile of tiles || []) {
      if (tile.red) redDora++;
      for (const d of doraTypes) if (tile.type === d) normalDora++;
    }
    return { normalDora, redDora, total: normalDora + redDora, doraTypes };
  }

  function isValuePair(pair, seatWind = 27, roundWind = 27) {
    if (pair >= 31) return true;
    return pair === seatWind || pair === roundWind;
  }

  function hasTriplet(decomp, type) {
    return decomp.some(m => m.kind === 'triplet' && m.tile === type);
  }

  function countTriplets(decomp) {
    return decomp.filter(m => m.kind === 'triplet').length;
  }

  function countSequences(decomp) {
    return decomp.filter(m => m.kind === 'sequence').length;
  }

  function doraCountInTypes(counts, indicators = []) {
    const types = getDoraTypes(indicators);
    return types.reduce((sum, type) => sum + counts[type], 0);
  }

  function sequenceStarts(decomp) {
    return decomp.filter(m => m.kind === 'sequence').map(m => m.tile);
  }

  function yakuForDecomposition(counts, decomp, context) {
    const yaku = [];
    const han = { total: 0 };
    const add = (name, value) => {
      yaku.push({ name, han: value });
      han.total += value;
    };
    const closed = context.closed !== false;
    const isTsumo = context.method === 'tsumo';
    const seatWind = context.seatWind ?? 27;
    const roundWind = context.roundWind ?? 27;

    if (context.riichi && closed) add('리치', 1);
    if (context.doubleRiichi && closed) add('더블 리치', 2);
    if (isTsumo && closed) add('멘젠쯔모', 1);
    if (allSimple(counts) && (closed || context.kuitan !== false)) add('탕야오', 1);

    for (const type of [31, 32, 33]) if (hasTriplet(decomp, type)) add(`역패 ${tileName(type)}`, 1);
    if (hasTriplet(decomp, seatWind)) add('역패 자풍', 1);
    if (hasTriplet(decomp, roundWind)) add('역패 장풍', 1);

    const triplets = countTriplets(decomp);
    const sequences = countSequences(decomp);
    if (triplets === 4) add('대대화', 2);

    const starts = sequenceStarts(decomp);
    const uniqueStarts = new Set(starts);
    if (starts.some((x, i) => starts.indexOf(x) !== i)) add('이페코', 1);

    let sanshoku = false;
    for (let r = 0; r <= 6; r++) {
      if ([r, 9 + r, 18 + r].every(x => starts.includes(x))) sanshoku = true;
    }
    if (sanshoku) add('삼색동순', closed ? 2 : 1);

    let ittsuu = false;
    for (let suit = 0; suit < 3; suit++) {
      const b = suit * 9;
      if ([b, b + 3, b + 6].every(x => starts.includes(x))) ittsuu = true;
    }
    if (ittsuu) add('일기통관', closed ? 2 : 1);

    let sanshokuDoukou = false;
    for (let r = 0; r < 9; r++) {
      if ([r, 9 + r, 18 + r].every(t => hasTriplet(decomp, t))) sanshokuDoukou = true;
    }
    if (sanshokuDoukou) add('삼색동각', 2);

    // Flush yaku.
    const suitsUsed = new Set();
    let honorsUsed = false;
    for (let t = 0; t < 34; t++) if (counts[t] > 0) {
      if (t < 27) suitsUsed.add(Math.floor(t / 9));
      else honorsUsed = true;
    }
    if (suitsUsed.size === 1) add(honorsUsed ? '혼일색' : '청일색', honorsUsed ? (closed ? 3 : 2) : (closed ? 6 : 5));

    // Chanta/junchan: every group and pair touches a terminal or honor, and a sequence exists.
    const groups = decomp.map(m => m.kind === 'sequence'
      ? (m.tile % 9 === 0 || m.tile % 9 === 6 || m.tile >= 27)
      : (m.tile >= 27 || m.tile % 9 === 0 || m.tile % 9 === 8));
    const pairTerminal = decomp.pair >= 27 || decomp.pair % 9 === 0 || decomp.pair % 9 === 8;
    if (sequences > 0 && groups.every(Boolean) && pairTerminal) {
      if (honorsUsed) add('찬타', closed ? 2 : 1);
      else add('준찬타', closed ? 3 : 2);
    }

    const allTerminalsHonors = counts.every((n, t) => !n || t >= 27 || t % 9 === 0 || t % 9 === 8);
    if (allTerminalsHonors) add('혼노두', 2);

    // Pinfu requires four sequences, a non-value pair, and a ryanmen winning placement.
    let pinfu = false;
    if (closed && sequences === 4 && triplets === 0 && !isValuePair(decomp.pair, seatWind, roundWind)) {
      const placements = winningPlacements(decomp, context.winningTile);
      pinfu = placements.some(p => p.kind === 'sequence' && p.wait === 'ryanmen');
    }
    if (pinfu) add('평화', 1);

    // Detect three concealed triplets; ron-completed triplet does not count as concealed.
    const concealedTriplets = decomp.filter(m => m.kind === 'triplet' && !(context.method === 'ron' && m.tile === context.winningTile)).length;
    if (concealedTriplets >= 3) add('삼암각', 2);

    return { yaku, han: han.total, pinfu };
  }

  function winningPlacements(decomp, winningTile) {
    const placements = [];
    if (decomp.pair === winningTile) placements.push({ kind: 'pair', wait: 'tanki' });
    for (const meld of decomp) {
      if (meld.kind === 'triplet' && meld.tile === winningTile) placements.push({ kind: 'triplet', wait: 'shanpon' });
      if (meld.kind === 'sequence' && winningTile >= meld.tile && winningTile <= meld.tile + 2) {
        const pos = winningTile - meld.tile;
        let wait = 'ryanmen';
        if (pos === 1) wait = 'kanchan';
        else if ((pos === 2 && meld.tile % 9 === 0) || (pos === 0 && meld.tile % 9 === 6)) wait = 'penchan';
        placements.push({ kind: 'sequence', wait, pos, start: meld.tile });
      }
    }
    return placements;
  }

  function fuForDecomposition(decomp, counts, context, pinfu) {
    if (isChiitoiComplete(counts)) return { fu: 25, wait: 'chiitoi' };
    const method = context.method;
    const winningTile = context.winningTile;
    const placements = winningPlacements(decomp, winningTile);
    let bestFu = 0;
    let bestWait = 'unknown';
    for (const placement of placements.length ? placements : [{ kind: 'unknown', wait: 'unknown' }]) {
      if (pinfu && method === 'tsumo') return { fu: 20, wait: placement.wait };
      let fu = 20;
      if (method === 'ron' && context.closed !== false) fu += 10;
      if (method === 'tsumo' && !pinfu) fu += 2;
      if (decomp.pair >= 31) fu += 2;
      if (decomp.pair === (context.seatWind ?? 27)) fu += 2;
      if (decomp.pair === (context.roundWind ?? 27)) fu += 2;
      for (const meld of decomp) {
        if (meld.kind !== 'triplet') continue;
        const terminalOrHonor = meld.tile >= 27 || meld.tile % 9 === 0 || meld.tile % 9 === 8;
        const completedByRon = method === 'ron' && meld.tile === winningTile;
        const closedTriplet = !completedByRon;
        fu += terminalOrHonor ? (closedTriplet ? 8 : 4) : (closedTriplet ? 4 : 2);
      }
      if (['tanki', 'kanchan', 'penchan'].includes(placement.wait)) fu += 2;
      // Closed ron with no fu beyond the base is still rounded to 30.
      fu = Math.ceil(fu / 10) * 10;
      if (fu < 30 && method === 'ron') fu = 30;
      if (fu > bestFu) { bestFu = fu; bestWait = placement.wait; }
    }
    return { fu: bestFu || 30, wait: bestWait };
  }

  function calculateBasePoints(han, fu, yakuman = 0) {
    if (yakuman > 0) return { base: 8000 * yakuman, limit: yakuman === 1 ? '역만' : `${yakuman}배 역만` };
    if (han >= 13) return { base: 8000, limit: '헤아림 역만(간이 규칙)' };
    if (han >= 11) return { base: 6000, limit: '삼배만' };
    if (han >= 8) return { base: 4000, limit: '배만' };
    if (han >= 6) return { base: 3000, limit: '하네만' };
    const raw = fu * Math.pow(2, han + 2);
    if (han >= 5 || raw >= 2000) return { base: 2000, limit: '만관' };
    return { base: raw, limit: null };
  }

  function round100(n) { return Math.ceil(n / 100) * 100; }

  function pointsForHand(han, fu, winnerIndex, method, fromIndex = null, yakuman = 0) {
    const { base, limit } = calculateBasePoints(han, fu, yakuman);
    const winnerDealer = winnerIndex === 0; // this single-hand practice table starts with East as dealer
    if (method === 'ron') {
      const points = round100(base * (winnerDealer ? 6 : 4));
      return { base, limit, ron: points, total: points, payments: fromIndex == null ? [] : [{ from: fromIndex, amount: points }] };
    }
    const payments = [];
    let total = 0;
    for (let i = 0; i < 4; i++) {
      if (i === winnerIndex) continue;
      const amount = winnerDealer ? round100(base * 2) : round100(base * (i === 0 ? 2 : 1));
      payments.push({ from: i, amount });
      total += amount;
    }
    return { base, limit, total, payments };
  }

  function evaluateWinningHand(handTiles, winningTileType, method, context = {}) {
    const counts = countsFromTiles(handTiles);
    if (counts.reduce((a, b) => a + b, 0) !== 14 || calcShanten(counts, { specialHands: context.specialHands !== false }) !== -1) {
      return { valid: false, reason: '완성형 손패가 아닙니다.' };
    }
    const dora = countDora(handTiles, context.doraIndicators || []);

    if (context.specialHands !== false && isKokushiComplete(counts)) {
      const yaku = [{ name: '국사무쌍', han: 0, yakuman: 1 }];
      const points = pointsForHand(0, 0, context.winnerIndex ?? 0, method, context.fromIndex, 1);
      return { valid: true, yaku, han: 0, fu: 0, yakuman: 1, dora, points, limit: '역만', explanation: '국사무쌍 형태를 인식했습니다.' };
    }

    if (context.specialHands !== false && isChiitoiComplete(counts)) {
      const yaku = [{ name: '칠대자', han: 2 }];
      if (context.riichi) yaku.push({ name: '리치', han: context.doubleRiichi ? 2 : 1 });
      if (method === 'tsumo') yaku.push({ name: '멘젠쯔모', han: 1 });
      if (allSimple(counts)) yaku.push({ name: '탕야오', han: 1 });
      let suits = new Set(); let honor = false;
      for (let t = 0; t < 34; t++) if (counts[t]) { if (t < 27) suits.add(Math.floor(t / 9)); else honor = true; }
      if (suits.size === 1) yaku.push({ name: honor ? '혼일색' : '청일색', han: honor ? 3 : 6 });
      const yakuHan = yaku.reduce((s, y) => s + y.han, 0);
      if (yakuHan <= 0) return { valid: false, reason: '역이 없습니다.' };
      const han = yakuHan + dora.total;
      const points = pointsForHand(han, 25, context.winnerIndex ?? 0, method, context.fromIndex);
      return { valid: true, yaku, han, yakuHan, fu: 25, dora, points, limit: points.limit };
    }

    const decompositions = getDecompositions(counts);
    let best = null;
    for (const decomp of decompositions) {
      const data = yakuForDecomposition(counts, decomp, { ...context, method, winningTile: winningTileType, closed: context.closed !== false });
      if (!data.yaku.length) continue;
      const fuData = fuForDecomposition(decomp, counts, { ...context, method, winningTile: winningTileType, closed: context.closed !== false }, data.pinfu);
      const han = data.han + dora.total;
      const points = pointsForHand(han, fuData.fu, context.winnerIndex ?? 0, method, context.fromIndex);
      const candidate = { valid: true, yaku: data.yaku, han, yakuHan: data.han, fu: fuData.fu, wait: fuData.wait, dora, points, limit: points.limit, decomposition: decomp, pinfu: data.pinfu };
      if (!best || candidate.points.total > best.points.total || (candidate.points.total === best.points.total && candidate.fu > best.fu)) best = candidate;
    }
    if (!best) return { valid: false, reason: '형태는 완성되었지만 적용 가능한 역이 없습니다. 도라만으로는 화료할 수 없습니다.' };
    return best;
  }

  function getVisibleTiles(state, includeCurrentHand = true) {
    const result = [];
    if (includeCurrentHand) result.push(...(state.players?.[0]?.hand || []));
    for (const player of state.players || []) {
      for (const discard of player.river || []) result.push(discard.tile || discard);
      for (const meld of player.melds || []) result.push(...(meld.tiles || []));
    }
    result.push(...(state.doraIndicators || []));
    return result;
  }

  function getRoundContext(state, playerIndex, method, fromIndex = null) {
    const p = state.players[playerIndex];
    return {
      method,
      winnerIndex: playerIndex,
      fromIndex,
      closed: p.closed !== false,
      riichi: p.riichi,
      doubleRiichi: p.doubleRiichi,
      seatWind: 27 + (playerIndex % 4),
      roundWind: 27, // practice hand starts East 1
      doraIndicators: state.doraIndicators,
      specialHands: state.settings.specialHands,
      kuitan: true,
    };
  }

  function hasStructuralFuriten(state, playerIndex) {
    const player = state.players[playerIndex];
    if (player.tempFuriten || player.permanentFuriten) return true;
    if (!player.hand || player.hand.length !== 13) return false;
    const counts = countsFromTiles(player.hand);
    const waits = getWinningTiles(counts, { specialHands: state.settings.specialHands });
    if (!waits.length) return false;
    const riverTypes = new Set(player.river.map(d => (d.tile || d).type));
    return waits.some(t => riverTypes.has(t));
  }

  function canTsumo(state, playerIndex = 0) {
    const player = state.players[playerIndex];
    if (!player || player.hand.length !== 14) return { can: false, reason: '쯔모할 수 있는 장수가 아닙니다.' };
    const winning = player.lastDrawUid == null ? player.hand[player.hand.length - 1] : player.hand.find(t => t.uid === player.lastDrawUid);
    if (!winning) return { can: false, reason: '쯔모패 정보가 없습니다.' };
    const result = evaluateWinningHand(player.hand, winning.type, 'tsumo', getRoundContext(state, playerIndex, 'tsumo'));
    return result.valid ? { can: true, tile: winning, result } : { can: false, reason: result.reason || '유효한 역이 없습니다.' };
  }

  function canRonOnDiscard(state, playerIndex, tile, fromIndex) {
    const player = state.players[playerIndex];
    if (!player || player.hand.length !== 13) return { can: false, reason: '대기 상태가 아닙니다.' };
    if (hasStructuralFuriten(state, playerIndex)) return { can: false, reason: '후리텐 상태입니다.' };
    const counts = countsFromTiles(player.hand);
    if (counts[tile.type] >= 4) return { can: false, reason: '동일한 패가 이미 네 장 있습니다.' };
    const hand = [...player.hand, tile];
    const result = evaluateWinningHand(hand, tile.type, 'ron', getRoundContext(state, playerIndex, 'ron', fromIndex));
    return result.valid ? { can: true, result } : { can: false, reason: result.reason || '역이 없어 론할 수 없습니다.' };
  }

  function canDeclareRiichi(handAfterDiscard, player, state) {
    if (!player || player.riichi || player.closed === false || player.points < 1000) return false;
    if (!Array.isArray(handAfterDiscard) || handAfterDiscard.length !== 13) return false;
    return calcShanten(countsFromTiles(handAfterDiscard), { specialHands: state.settings.specialHands }) === 0;
  }

  function isGenbutsu(type, opponent) {
    return (opponent.river || []).some(d => (d.tile || d).type === type);
  }

  function isSuji(type, opponent) {
    if (type >= 27 || opponent.riichiTile == null) return false;
    const suit = Math.floor(type / 9);
    const rank = type % 9 + 1;
    const riichiType = opponent.riichiTile;
    if (Math.floor(riichiType / 9) !== suit) return false;
    const d = riichiType % 9 + 1;
    const safeRanks = [];
    if (d >= 1 && d <= 3) safeRanks.push(d + 3);
    else if (d >= 4 && d <= 6) safeRanks.push(d - 3, d + 3);
    else safeRanks.push(d - 3);
    return safeRanks.includes(rank);
  }

  function isKabeClue(type, visibleTiles) {
    if (type >= 27) return { clue: false, reason: '' };
    const suit = Math.floor(type / 9);
    const rank = type % 9 + 1;
    const counts = countsFromTiles(visibleTiles);
    const base = suit * 9;
    const exhausted = r => r >= 1 && r <= 9 && counts[base + r - 1] >= 4;
    const blockers = [];
    if (rank <= 7 && (exhausted(rank + 1) || exhausted(rank + 2))) blockers.push('상위 연속형의 구성패가 모두 공개됨');
    if (rank >= 3 && (exhausted(rank - 1) || exhausted(rank - 2))) blockers.push('하위 연속형의 구성패가 모두 공개됨');
    return { clue: blockers.length > 0, reason: blockers.join(' · ') };
  }

  function getDefenseSignal(type, opponent, visibleTiles = []) {
    const reasons = [];
    let level = 'unclear';
    if (isGenbutsu(type, opponent)) {
      return { level: 'safe', label: '현물', reasons: ['이 상대의 버림패에 이미 있습니다. 해당 상대의 론에는 안전합니다.'], genbutsu: true, suji: false, kabe: false };
    }
    const suji = isSuji(type, opponent);
    const kabe = isKabeClue(type, visibleTiles);
    if (suji) {
      level = 'safer';
      reasons.push('리치 선언패의 스지 관계입니다. 양면 대기에는 상대적으로 안전하지만 단기·샤보·간짱 대기를 막지는 않습니다.');
    }
    if (kabe.clue) {
      if (level === 'unclear') level = 'clue';
      reasons.push(`벽 단서: ${kabe.reason}. 일부 연속형 대기만 제한하며 완전한 안전패는 아닙니다.`);
    }
    if (!reasons.length) reasons.push('현물·스지·벽에서 뚜렷한 안전 근거를 확인하지 못했습니다. 위험 확률은 계산하지 않습니다.');
    const labels = { safe: '현물 · 론 안전', safer: '스지 · 상대적으로 안전', clue: '벽 단서 · 일부 형태 제한', unclear: '뚜렷한 안전 근거 없음' };
    return { level, label: labels[level], reasons, genbutsu: false, suji, kabe: kabe.clue };
  }

  function snapshotPublic(state) {
    return {
      round: state.round,
      honba: state.honba,
      wallRemaining: state.wall.length,
      turnNumber: state.turnNumber,
      doraIndicators: state.doraIndicators.map(t => ({ ...t })),
      players: state.players.map((p, i) => ({
        index: i,
        name: p.name,
        seat: p.seat,
        riichi: p.riichi,
        riichiTile: p.riichiTile,
        points: p.points,
        river: p.river.map(d => ({ tile: { ...(d.tile || d) }, riichiDeclaration: Boolean(d.riichiDeclaration), turnIndex: d.turnIndex })),
      })),
    };
  }

  function newGame(settings = {}) {
    const normalized = {
      redFives: settings.redFives !== false,
      specialHands: settings.specialHands !== false,
      autoSort: settings.autoSort !== false,
      showTileNumbers: settings.showTileNumbers !== false,
      difficulty: settings.difficulty || 'intermediate',
      showPostDiscardAnalysis: settings.showPostDiscardAnalysis !== false,
    };
    const all = shuffle(buildTileSet(normalized.redFives));
    const deadWall = all.slice(0, 14);
    const wall = all.slice(14);
    const names = ['나', 'AI · 남', 'AI · 서', 'AI · 북'];
    const seats = ['동', '남', '서', '북'];
    const players = names.map((name, i) => ({
      id: i,
      name,
      seat: seats[i],
      points: 25000,
      hand: [],
      river: [],
      melds: [],
      closed: true,
      riichi: false,
      doubleRiichi: false,
      riichiTile: null,
      riichiTurn: null,
      lastDrawUid: null,
      tempFuriten: false,
      permanentFuriten: false,
      finalHand: null,
    }));
    for (let round = 0; round < 13; round++) {
      for (let i = 0; i < 4; i++) players[i].hand.push(wall.pop());
    }
    players[0].hand.push(wall.pop());
    players[0].lastDrawUid = players[0].hand[players[0].hand.length - 1].uid;
    if (normalized.autoSort) players.forEach(p => sortHand(p.hand));
    return {
      version: 1,
      id: `hand-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      createdAt: new Date().toISOString(),
      settings: normalized,
      round: '동1국',
      honba: 0,
      players,
      wall,
      deadWall,
      doraIndicators: [{ ...deadWall[4] }],
      riichiPot: 0,
      currentTurn: 0,
      phase: 'turn',
      turnNumber: 1,
      discards: 0,
      decisions: [],
      eventLog: [{ type: 'start', text: '동1국 시작', turnNumber: 0, public: null }],
      pendingRon: null,
      lastAnalysis: null,
      final: null,
      _completionRecorded: false,
    };
  }

  function currentUserHand(state) { return state.players[0].hand; }

  function decisionCandidates(state) {
    return analyzeDiscards(state.players[0].hand, getVisibleTiles(state, false).concat(state.players[0].hand), { specialHands: state.settings.specialHands });
  }

  function applyHumanDiscard(state, uid, declareRiichi = false) {
    if (state.phase !== 'turn' || state.currentTurn !== 0 || state.players[0].hand.length !== 14) {
      return { ok: false, error: '지금은 타패할 차례가 아닙니다.' };
    }
    const player = state.players[0];
    const selectedIndex = player.hand.findIndex(t => t.uid === uid);
    if (selectedIndex < 0) return { ok: false, error: '선택한 패를 찾을 수 없습니다.' };
    if (player.riichi && uid !== player.lastDrawUid) return { ok: false, error: '리치 후에는 쯔모패만 버릴 수 있습니다.' };

    const tile = player.hand[selectedIndex];
    const handBefore = player.hand.map(t => ({ ...t }));
    const publicBefore = snapshotPublic(state);
    const analysis = analyzeDiscards(handBefore, getVisibleTiles(state, false), { specialHands: state.settings.specialHands });
    const candidate = analysis.candidates.find(c => c.type === tile.type && c.red === Boolean(tile.red)) || null;
    const postHand = handBefore.filter(t => t.uid !== uid);
    const riichiAllowed = canDeclareRiichi(postHand, player, state);
    if (declareRiichi && !riichiAllowed) return { ok: false, error: '이 타패로는 리치를 선언할 수 없습니다. 멘젠·1000점·텐파이가 필요합니다.' };
    if (player.riichi && declareRiichi) return { ok: false, error: '이미 리치 상태입니다.' };

    const decision = {
      id: state.decisions.length + 1,
      turnNumber: state.turnNumber,
      handBefore,
      drawnTile: player.lastDrawUid == null ? null : handBefore.find(t => t.uid === player.lastDrawUid) ? { ...handBefore.find(t => t.uid === player.lastDrawUid) } : null,
      selected: { ...tile },
      declareRiichi: Boolean(declareRiichi),
      riichiBefore: player.riichi,
      shantenBefore: calcShanten(countsFromTiles(handBefore), { specialHands: state.settings.specialHands }),
      selectedCandidate: candidate ? { ...candidate, effective: candidate.effective.map(x => ({ ...x })), shapeOnly: candidate.shapeOnly.map(x => ({ ...x })) } : null,
      analysis: analysis.ok ? JSON.parse(JSON.stringify(analysis)) : null,
      publicBefore,
      opponentsRiichi: state.players.slice(1).filter(p => p.riichi).map(p => p.id),
      wallRemaining: state.wall.length,
    };

    if (declareRiichi) {
      player.riichi = true;
      player.riichiTurn = state.turnNumber;
      player.riichiTile = tile.type;
      player.points -= 1000;
      state.riichiPot += 1000;
      state.eventLog.push({ type: 'riichi', player: 0, tile: { ...tile }, turnNumber: state.turnNumber, text: '플레이어 리치 선언' });
    }
    player.hand = postHand;
    if (state.settings.autoSort) sortHand(player.hand);
    player.lastDrawUid = null;
    player.river.push({ tile: { ...tile }, turnIndex: state.discards++, riichiDeclaration: Boolean(declareRiichi), turnNumber: state.turnNumber });
    decision.publicAfter = snapshotPublic(state);
    state.decisions.push(decision);
    state.lastAnalysis = {
      decisionId: decision.id,
      selected: { ...tile },
      selectedCandidate: decision.selectedCandidate,
      analysis: decision.analysis,
      shantenBefore: decision.shantenBefore,
      shantenAfter: candidate?.shanten ?? null,
      declareRiichi: Boolean(declareRiichi),
    };
    state.eventLog.push({ type: 'discard', player: 0, tile: { ...tile }, turnNumber: state.turnNumber, riichiDeclaration: Boolean(declareRiichi), text: `플레이어 타패 ${tileShort(tile.type, tile.red)}` });
    state.turnNumber++;
    const resolution = resolveDiscardResponses(state, tile, 0, 0);
    return { ok: true, tile, resolution };
  }

  function isTileSafeAgainstAnyRiichi(state, type) {
    const riichiPlayers = state.players.filter((p, i) => i !== 0 && p.riichi);
    if (!riichiPlayers.length) return false;
    return riichiPlayers.some(p => isGenbutsu(type, p));
  }

  function aiDiscardScore(state, playerIndex, tile, postCounts, postHand) {
    const sh = calcShanten(postCounts, { specialHands: state.settings.specialHands });
    const shape = shapePotential(postCounts);
    const redPenalty = tile.red ? 4 : 0;
    const doraTypes = new Set(getDoraTypes(state.doraIndicators));
    const doraPenalty = doraTypes.has(tile.type) ? 2.5 : 0;
    let safetyBonus = 0;
    if (state.settings.difficulty === 'advanced') {
      const attackers = state.players.filter((p, i) => i !== playerIndex && p.riichi);
      const anyUnclear = attackers.length && attackers.every(p => !isGenbutsu(tile.type, p));
      const shAfter = calcShanten(postCounts, { specialHands: state.settings.specialHands });
      if (anyUnclear && shAfter > 0) safetyBonus -= 1.5;
      if (attackers.some(p => isGenbutsu(tile.type, p))) safetyBonus += 1.2;
    }
    // Lower shanten dominates. Shape and bonus retention are inexpensive heuristic tie-breakers.
    return -sh * 100 + shape * 2.1 - redPenalty - doraPenalty + safetyBonus;
  }

  function chooseAIDiscard(state, playerIndex) {
    const player = state.players[playerIndex];
    if (player.riichi && player.lastDrawUid != null) {
      return player.hand.find(t => t.uid === player.lastDrawUid) || player.hand[player.hand.length - 1];
    }
    let bestScore = -Infinity;
    let best = [];
    const seen = new Set();
    for (const tile of player.hand) {
      const typeRedKey = `${tile.type}:${tile.red ? 1 : 0}`;
      if (seen.has(typeRedKey)) continue;
      seen.add(typeRedKey);
      const post = player.hand.filter(t => t.uid !== tile.uid);
      const postCounts = countsFromTiles(post);
      const score = aiDiscardScore(state, playerIndex, tile, postCounts, post);
      if (score > bestScore + 0.001) { bestScore = score; best = [tile]; }
      else if (Math.abs(score - bestScore) < 0.001) best.push(tile);
    }
    if (!best.length) return player.hand[player.hand.length - 1];
    if (state.settings.difficulty === 'beginner' && best.length === 1) {
      // Mildly forgiving beginner play: occasionally use another tile with no shanten loss.
      const ranked = player.hand.map(tile => ({ tile, score: aiDiscardScore(state, playerIndex, tile, countsFromTiles(player.hand.filter(t => t.uid !== tile.uid)), []) }));
      const top = Math.max(...ranked.map(x => x.score));
      const near = ranked.filter(x => x.score >= top - 2.1);
      if (near.length && Math.random() < 0.22) return near[Math.floor(Math.random() * near.length)].tile;
    }
    return best[Math.floor(Math.random() * best.length)];
  }

  function getResponseOrder(fromIndex) {
    const order = [];
    for (let step = 1; step < 4; step++) order.push((fromIndex + step) % 4);
    return order;
  }

  function finishWin(state, winnerIndex, method, fromIndex, winningTile, result) {
    const winner = state.players[winnerIndex];
    let payout = result.points;
    const transfers = [];
    if (method === 'ron') {
      const amount = payout.ron;
      state.players[fromIndex].points -= amount;
      winner.points += amount;
      transfers.push({ from: fromIndex, to: winnerIndex, amount });
    } else {
      for (const p of payout.payments || []) {
        state.players[p.from].points -= p.amount;
        winner.points += p.amount;
        transfers.push({ from: p.from, to: winnerIndex, amount: p.amount });
      }
    }
    if (state.riichiPot > 0) {
      winner.points += state.riichiPot;
      transfers.push({ from: null, to: winnerIndex, amount: state.riichiPot, label: '리치 공탁금' });
      state.riichiPot = 0;
    }
    state.phase = 'ended';
    state.pendingRon = null;
    state.final = {
      reason: method === 'tsumo' ? '쯔모 화료' : '론 화료',
      winner: winnerIndex,
      method,
      from: fromIndex,
      winningTile: { ...winningTile },
      result: JSON.parse(JSON.stringify(result)),
      transfers,
      scoresAfter: state.players.map(p => p.points),
      handsRevealed: true,
      endedAt: new Date().toISOString(),
    };
    state.eventLog.push({ type: 'win', player: winnerIndex, from: fromIndex, tile: { ...winningTile }, turnNumber: state.turnNumber, text: `${winner.name} ${method === 'tsumo' ? '쯔모' : '론'} 화료` });
    for (const p of state.players) p.finalHand = p.hand.map(t => ({ ...t }));
    return state.final;
  }

  function finishExhaustive(state) {
    if (state.phase === 'ended') return state.final;
    state.phase = 'ended';
    state.pendingRon = null;
    const shantens = state.players.map(p => ({ player: p.id, shanten: calcShanten(countsFromTiles(p.hand), { specialHands: state.settings.specialHands }), handCount: p.hand.length }));
    const tenpai = shantens.filter(x => x.shanten === 0 && x.handCount === 13).map(x => x.player);
    const deltas = [0, 0, 0, 0];
    // Standard noten payments are deliberately omitted rather than guessed; tenpai is displayed only.
    state.final = {
      reason: '유국 · 패산 소진',
      winner: null,
      method: 'exhaustive',
      tenpai,
      shantens,
      transfers: [],
      scoresAfter: state.players.map(p => p.points),
      pointsDelta: deltas,
      handsRevealed: true,
      endedAt: new Date().toISOString(),
      note: `유국 시 노텐 벌점·친 유지 규칙은 아직 적용하지 않았습니다. 점수 변화는 0으로 두고 텐파이 여부만 표시합니다. 리치 공탁금 ${state.riichiPot}점은 다음 국 이월을 구현하지 않아 미분배 상태로 남습니다.`,
    };
    state.eventLog.push({ type: 'draw', turnNumber: state.turnNumber, text: '패산 소진으로 유국' });
    for (const p of state.players) p.finalHand = p.hand.map(t => ({ ...t }));
    return state.final;
  }

  function resolveDiscardResponses(state, tile, fromIndex, startResponseIndex = 0) {
    const order = getResponseOrder(fromIndex);
    for (let i = startResponseIndex; i < order.length; i++) {
      const responder = order[i];
      const claim = canRonOnDiscard(state, responder, tile, fromIndex);
      if (!claim.can) continue;
      if (responder === 0) {
        state.phase = 'ronOffer';
        state.pendingRon = { tile: { ...tile }, from: fromIndex, responseOrder: order, responseIndex: i, result: claim.result };
        return { status: 'ronOffer', player: responder };
      }
      // Atamahane: the first valid ron in turn order wins. Multiple ron is not implemented.
      finishWin(state, responder, 'ron', fromIndex, tile, claim.result);
      return { status: 'ended', winner: responder };
    }
    state.pendingRon = null;
    state.phase = 'turn';
    state.currentTurn = (fromIndex + 1) % 4;
    return { status: 'continue', next: state.currentTurn };
  }

  function passRon(state) {
    if (state.phase !== 'ronOffer' || !state.pendingRon) return { status: 'error', error: '응답할 론 제안이 없습니다.' };
    const pending = state.pendingRon;
    const p = state.players[0];
    if (p.riichi) p.permanentFuriten = true;
    else p.tempFuriten = true;
    state.eventLog.push({ type: 'passRon', player: 0, tile: pending.tile, turnNumber: state.turnNumber, text: '플레이어 론 패스' });
    state.phase = 'turn';
    return resolveDiscardResponses(state, pending.tile, pending.from, pending.responseIndex + 1);
  }

  function claimRon(state) {
    if (state.phase !== 'ronOffer' || !state.pendingRon) return { status: 'error', error: '응답할 론 제안이 없습니다.' };
    const pending = state.pendingRon;
    const result = pending.result;
    finishWin(state, 0, 'ron', pending.from, pending.tile, result);
    return { status: 'ended', winner: 0 };
  }

  function claimTsumo(state, playerIndex = 0) {
    if (state.phase !== 'turn' || state.currentTurn !== playerIndex) return { status: 'error', error: '지금은 쯔모할 차례가 아닙니다.' };
    const check = canTsumo(state, playerIndex);
    if (!check.can) return { status: 'error', error: check.reason };
    finishWin(state, playerIndex, 'tsumo', null, check.tile, check.result);
    return { status: 'ended', winner: playerIndex };
  }

  function performAITurn(state) {
    if (state.phase !== 'turn' || state.currentTurn === 0) return { status: 'error', error: 'AI의 차례가 아닙니다.' };
    const index = state.currentTurn;
    if (state.wall.length === 0) {
      finishExhaustive(state);
      return { status: 'ended', reason: 'exhaustive' };
    }
    const player = state.players[index];
    const drawn = state.wall.pop();
    player.hand.push(drawn);
    player.lastDrawUid = drawn.uid;
    player.tempFuriten = false;
    if (state.settings.autoSort) sortHand(player.hand);

    const tsumo = canTsumo(state, index);
    if (tsumo.can) {
      finishWin(state, index, 'tsumo', null, tsumo.tile, tsumo.result);
      return { status: 'ended', winner: index, method: 'tsumo' };
    }

    const discard = chooseAIDiscard(state, index);
    if (!discard) {
      finishExhaustive(state);
      return { status: 'ended', reason: 'no-discard' };
    }
    const postHand = player.hand.filter(t => t.uid !== discard.uid);
    let declareRiichi = false;
    if (!player.riichi && player.closed && player.points >= 1000 && canDeclareRiichi(postHand, player, state)) {
      const threshold = state.settings.difficulty === 'beginner' ? 0.25 : state.settings.difficulty === 'advanced' ? 0.9 : 0.65;
      declareRiichi = Math.random() < threshold;
    }
    if (declareRiichi) {
      player.riichi = true;
      player.riichiTurn = state.turnNumber;
      player.riichiTile = discard.type;
      player.points -= 1000;
      state.riichiPot += 1000;
      state.eventLog.push({ type: 'riichi', player: index, tile: { ...discard }, turnNumber: state.turnNumber, text: `${player.name} 리치 선언` });
    }
    player.hand = postHand;
    if (state.settings.autoSort) sortHand(player.hand);
    player.lastDrawUid = null;
    player.river.push({ tile: { ...discard }, turnIndex: state.discards++, riichiDeclaration: declareRiichi, turnNumber: state.turnNumber });
    state.eventLog.push({ type: 'discard', player: index, tile: { ...discard }, turnNumber: state.turnNumber, riichiDeclaration: declareRiichi, text: `${player.name} 타패 ${tileShort(discard.type, discard.red)}` });
    state.turnNumber++;
    return resolveDiscardResponses(state, discard, index, 0);
  }

  function drawHumanTurn(state) {
    if (state.phase !== 'turn' || state.currentTurn !== 0) return { status: 'error', error: '플레이어의 차례가 아닙니다.' };
    if (state.wall.length === 0) {
      finishExhaustive(state);
      return { status: 'ended', reason: 'exhaustive' };
    }
    const player = state.players[0];
    const tile = state.wall.pop();
    player.hand.push(tile);
    player.lastDrawUid = tile.uid;
    player.tempFuriten = false;
    if (state.settings.autoSort) sortHand(player.hand);
    state.eventLog.push({ type: 'draw', player: 0, tile: { ...tile }, turnNumber: state.turnNumber, text: '플레이어 쯔모' });
    return { status: 'turn', tile };
  }

  function makePracticeHand(redFives = true, riverCount = 0) {
    const all = shuffle(buildTileSet(redFives));
    return {
      hand: sortHand(all.slice(0, 14)),
      river: all.slice(14, 14 + riverCount).map((tile, i) => ({ tile: { ...tile }, turnIndex: i, riichiDeclaration: i === Math.min(3, riverCount - 1) })),
      remaining: all.slice(14 + riverCount),
    };
  }

  function decisionEvaluation(decision) {
    const analysis = decision.analysis;
    const actual = decision.selectedCandidate;
    if (!analysis?.ok || !actual) return { label: '분석 불가', reason: '해당 턴의 분석 자료가 없습니다.' };
    const best = analysis.best;
    if (actual.shanten > best.shanten) {
      return { label: '샹텐 손실', reason: `선택한 타패는 샹텐 수가 ${actual.shanten - best.shanten} 늘어났습니다. 당시 보이는 정보 기준으로 샹텐을 유지하는 후보가 있었습니다.`, severity: 'poor' };
    }
    if (actual.shanten === best.shanten && actual.ukeire < best.ukeire) {
      return { label: '유효패 감소', reason: `샹텐 수는 같지만 미확인 유효패가 최선 후보보다 ${best.ukeire - actual.ukeire}장 적습니다. 수비·타점 목적이 있었다면 의도적 선택일 수 있습니다.`, severity: 'review' };
    }
    if (actual.shanten === best.shanten && actual.ukeire === best.ukeire && actual.shapeScore + 0.01 < best.shapeScore) {
      return { label: '형태 검토', reason: '샹텐과 유효패 매수는 같지만 단순 형태 점수에서 다른 후보가 앞섭니다. 이 점수는 학습용 휴리스틱이며 정답을 보장하지 않습니다.', severity: 'review' };
    }
    return { label: '효율 기준 양호', reason: '샹텐과 미확인 유효패 매수 기준으로 최선 후보와 동률입니다. 전략적 우열 전체를 증명하는 것은 아닙니다.', severity: 'good' };
  }

  function evaluateHandReview(state) {
    const decisions = state.decisions || [];
    let efficiencyPenalty = 0;
    let shapePenalty = 0;
    let attackScoreTotal = 0;
    let attackCount = 0;
    let defenseScoreTotal = 0;
    let defenseCount = 0;
    let shantenLosses = 0;
    let ukeireLosses = 0;
    let safetyRechecks = 0;
    let bestCalls = 0;

    for (const d of decisions) {
      const analysis = d.analysis;
      const selected = d.selectedCandidate;
      if (!analysis?.ok || !selected || !analysis.candidates.length) continue;
      const minSh = Math.min(...analysis.candidates.map(c => c.shanten));
      const bestAtSh = analysis.candidates.filter(c => c.shanten === minSh);
      const bestUkeire = Math.max(...bestAtSh.map(c => c.ukeire));
      const shapeMax = Math.max(...bestAtSh.filter(c => c.ukeire === bestUkeire).map(c => c.shapeScore));
      const shLoss = Math.max(0, selected.shanten - minSh);
      const ukLoss = selected.shanten === minSh ? Math.max(0, bestUkeire - selected.ukeire) : bestUkeire;
      efficiencyPenalty += Math.min(1, shLoss * 0.6 + (bestUkeire ? ukLoss / bestUkeire * 0.4 : 0));
      shapePenalty += shapeMax > 0 ? Math.min(1, Math.max(0, shapeMax - selected.shapeScore) / Math.max(1, shapeMax)) : 0;
      if (shLoss > 0) shantenLosses++;
      if (ukLoss > 0) ukeireLosses++;
      if (selected.shanten === minSh && selected.ukeire === bestUkeire) bestCalls++;

      const beforeHand = d.handBefore || [];
      const beforeCounts = countsFromTiles(beforeHand);
      const beforeSh = calcShanten(beforeCounts, { specialHands: state.settings.specialHands });
      if (!d.opponentsRiichi?.length && beforeSh <= 1) {
        attackScoreTotal += selected.shanten === minSh ? 100 : Math.max(0, 100 - shLoss * 45 - (ukLoss / Math.max(1, bestUkeire)) * 55);
        attackCount++;
      }

      if (d.opponentsRiichi?.length) {
        const snapshots = d.publicBefore?.players || [];
        const visible = [...beforeHand, ...(snapshots.flatMap(p => p.river.map(x => x.tile)) || []), ...(d.publicBefore?.doraIndicators || [])];
        const signals = d.opponentsRiichi.map(id => {
          const opponent = snapshots.find(p => p.index === id);
          return opponent ? getDefenseSignal(d.selected.type, opponent, visible) : { level: 'unclear' };
        });
        let score = 25;
        if (signals.some(s => s.level === 'safe')) score = 100;
        else if (signals.some(s => s.level === 'safer')) score = 72;
        else if (signals.some(s => s.level === 'clue')) score = 55;
        else safetyRechecks++;
        defenseScoreTotal += score;
        defenseCount++;
      }
    }
    const n = decisions.length || 1;
    const categories = {
      efficiency: { label: '패 효율', weight: 40, score: Math.round(40 * (1 - efficiencyPenalty / n)), evaluated: decisions.length > 0, detail: '샹텐 손실과 유효패 매수 감소를 기준으로 계산' },
      shape: { label: '형태 판단', weight: 20, score: Math.round(20 * (1 - shapePenalty / n)), evaluated: decisions.length > 0, detail: '연결·타츠·쌍을 세는 단순 휴리스틱; 완전한 형태 평가가 아님' },
      attack: { label: '공격 판단', weight: 20, score: attackCount ? Math.round(20 * (attackScoreTotal / attackCount / 100)) : null, evaluated: attackCount > 0, detail: attackCount ? `상대 리치가 없고 샹텐 1 이하였던 ${attackCount}회만 평가` : '평가할 공격 기회가 충분하지 않음' },
      defense: { label: '수비 판단', weight: 20, score: defenseCount ? Math.round(20 * (defenseScoreTotal / defenseCount / 100)) : null, evaluated: defenseCount > 0, detail: defenseCount ? `리치 상대가 있던 ${defenseCount}회에서 현물·스지·벽 단서 활용만 평가` : '상대 리치 상황이 없어 평가 제외' },
      situation: { label: '국 상황 판단', weight: 0, score: null, evaluated: false, detail: '단일 동1국만 지원하므로 반장전 순위·오라스 전략은 평가하지 않음' },
    };
    let weighted = 0; let weights = 0;
    for (const cat of Object.values(categories)) if (cat.evaluated && cat.score != null) {
      weighted += cat.score; weights += cat.weight;
    }
    // Normalize the points actually evaluated to a 100-point scale; omitted domains stay visibly omitted.
    const normalizedScores = {};
    for (const [key, cat] of Object.entries(categories)) normalizedScores[key] = cat.score == null ? null : Math.round((cat.score / Math.max(1, cat.weight)) * 100);
    return {
      total: weights ? Math.round((weighted / weights) * 100) : null,
      evaluatedWeight: weights,
      categories,
      normalizedScores,
      decisionCount: decisions.length,
      shantenLosses,
      ukeireLosses,
      safetyRechecks,
      bestCalls,
      notes: [
        '이 점수는 현재 구현된 효율·형태·안전 단서의 휴리스틱 지표이며, 실력이나 승률을 검증한 점수가 아닙니다.',
        '결과(화료·방총)와 의사결정 질을 분리합니다. 상대의 숨은 손패를 알고 있었다고 가정하지 않습니다.',
        '각 범주의 평가 가능한 배점만 100점으로 환산합니다. 제외된 범주는 점수가 아니라 미평가로 표시됩니다.',
      ],
    };
  }

  function summarizeHand(state) {
    const final = state.final || {};
    const before = state.players.map(p => 25000);
    const after = state.players.map(p => p.points);
    return {
      id: state.id,
      createdAt: state.createdAt,
      endedAt: final.endedAt || new Date().toISOString(),
      result: final.reason || '종료',
      winner: final.winner == null ? null : final.winner,
      winnerName: final.winner == null ? null : state.players[final.winner]?.name,
      method: final.method,
      pointDeltas: after.map((p, i) => p - before[i]),
      scoreAfter: after,
      humanWon: final.winner === 0,
      decisionCount: state.decisions.length,
      reviewScore: evaluateHandReview(state).total,
      shantenLosses: evaluateHandReview(state).shantenLosses,
      ukeireLosses: evaluateHandReview(state).ukeireLosses,
    };
  }

  return {
    TILE_COUNT, SUITS, HONORS, ORPHANS,
    tileShort, tileName, tileSort, sortHand,
    buildTileSet, shuffle, countsFromTiles, calcShanten, isCompleteStandard,
    isChiitoiComplete, isKokushiComplete, getWinningTiles, shapePotential,
    availableUnseenCounts, analyzeDiscards, getDecompositions,
    tileDoraSuccessor, getDoraTypes, countDora, evaluateWinningHand, pointsForHand,
    knownTypeCounts, getVisibleTiles, getRoundContext, hasStructuralFuriten,
    canTsumo, canRonOnDiscard, canDeclareRiichi, isGenbutsu, isSuji, isKabeClue, getDefenseSignal,
    newGame, applyHumanDiscard, chooseAIDiscard, performAITurn, drawHumanTurn,
    resolveDiscardResponses, passRon, claimRon, claimTsumo, finishExhaustive,
    makePracticeHand, decisionEvaluation, evaluateHandReview, summarizeHand,
  };
});

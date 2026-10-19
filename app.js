(function () {
  'use strict';
  const E = window.RiichiEngine;
  const STORAGE = {
    game: 'riichi-solo-trainer.game.v1',
    settings: 'riichi-solo-trainer.settings.v1',
    history: 'riichi-solo-trainer.history.v1',
  };
  const DEFAULT_SETTINGS = {
    redFives: true,
    specialHands: true,
    autoSort: true,
    showTileNumbers: true,
    showPostDiscardAnalysis: true,
    allowHints: true,
    difficulty: 'intermediate',
    textTiles: false,
    theme: 'light',
    startTurn: 'self',
  };
  let settings = loadJSON(STORAGE.settings, DEFAULT_SETTINGS);
  settings = { ...DEFAULT_SETTINGS, ...(settings && typeof settings === 'object' ? settings : {}) };
  let history = loadJSON(STORAGE.history, []);
  if (!Array.isArray(history)) history = [];
  let game = loadJSON(STORAGE.game, null);
  if (!game || !Array.isArray(game.players) || game.players.length !== 4 || !Array.isArray(game.wall)) {
    game = E.newGame(settings);
  }
  let selectedUid = null;
  let selectedDecisionId = null;
  let activeView = 'table';
  let liveHintVisible = false;
  let efficiencyTraining = null;
  let effTrainingSelectedUid = null;
  let effTrainingSubmitted = false;
  let defenseScenario = null;
  let defenseSelectedUid = null;
  let defenseSubmitted = false;
  let driving = false;
  let toastTimer = null;
  let confirmResolve = null;

  const $ = id => document.getElementById(id);

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) { return fallback; }
  }

  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (error) { showToast('저장 공간에 기록하지 못했습니다. 브라우저 저장 공간을 확인하세요.'); }
  }

  function saveAll() {
    saveJSON(STORAGE.game, game);
    saveJSON(STORAGE.settings, settings);
    saveJSON(STORAGE.history, history.slice(0, 60));
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function applyTheme(theme = settings.theme) {
    const normalized = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = normalized;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = normalized === 'dark' ? '#111916' : '#0d2420';
  }

  function tileTextFace(type, red = false) {
    if (type >= 27) return `<span class="tile-number">${E.HONORS[type - 27]}</span>`;
    const rank = type % 9 + 1;
    const suit = ['만', '통', '삭'][Math.floor(type / 9)];
    const displayRank = red ? 5 : rank;
    return `<span class="tile-number">${displayRank}</span><span class="tile-suit">${suit}</span>`;
  }

  function tileImageFile(type, red = false) {
    if (type < 27) {
      const rank = type % 9 + 1;
      const suitName = ['Man', 'Pin', 'Sou'][Math.floor(type / 9)];
      return rank === 5 && red ? `${suitName}5-Dora.svg` : `${suitName}${rank}.svg`;
    }
    return ['Ton.svg', 'Nan.svg', 'Shaa.svg', 'Pei.svg', 'Haku.svg', 'Hatsu.svg', 'Chun.svg'][type - 27];
  }

  function showToast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  }

  function askConfirm(title, message, actionLabel = '확인') {
    const dialog = $('confirmDialog');
    $('dialogTitle').textContent = title;
    $('dialogMessage').textContent = message;
    $('dialogConfirm').textContent = actionLabel;
    if (typeof dialog.showModal !== 'function') {
      return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    }
    return new Promise(resolve => {
      confirmResolve = resolve;
      dialog.addEventListener('close', () => {
        const accepted = dialog.returnValue === 'confirm';
        const done = confirmResolve;
        confirmResolve = null;
        if (done) done(accepted);
      }, { once: true });
      dialog.showModal();
    });
  }

  function activePlayerTurn() {
    return game.phase === 'turn' && game.currentTurn === 0 && game.players[0].hand.length === 14;
  }

  function shapeName(shanten) {
    if (shanten === -1) return '화료형';
    if (shanten === 0) return '텐파이';
    if (shanten === 1) return '1샹텐';
    return `${shanten}샹텐`;
  }

  function tileClasses(tile) {
    const type = typeof tile === 'number' ? tile : tile.type;
    const red = typeof tile === 'object' && Boolean(tile.red);
    if (type >= 27) {
      if (type === 31) return `honor dragon-white${red ? ' red-five' : ''}`;
      if (type === 32) return `honor dragon-green${red ? ' red-five' : ''}`;
      if (type === 33) return `honor dragon-red${red ? ' red-five' : ''}`;
      return 'honor';
    }
    return `suit-${['m', 'p', 's'][Math.floor(type / 9)]}${red ? ' red-five' : ''}`;
  }

  function tileFace(tile) {
    const type = typeof tile === 'number' ? tile : tile.type;
    const red = typeof tile === 'object' && Boolean(tile.red);
    if (settings.textTiles) return tileTextFace(type, red);
    const file = tileImageFile(type, red);
    const source = 'https://raw.githubusercontent.com/FluffyStuff/riichi-mahjong-tiles/master/Regular/' + file;
    const badge = type < 27 && settings.showTileNumbers
      ? '<span class="tile-rank-corner" aria-hidden="true">' + (type % 9 + 1) + '</span>'
      : '';
    return '<img class="tile-art" src="' + source + '" data-tile-type="' + type + '" data-tile-red="' + (red ? '1' : '0') + '" alt="" draggable="false" loading="lazy" decoding="async">' + badge;
  }

  function tileLabel(tile) {
    const type = typeof tile === 'number' ? tile : tile.type;
    const red = typeof tile === 'object' && Boolean(tile.red);
    return E.tileName(type, red);
  }

  function tileHTML(tile, options = {}) {
    const type = typeof tile === 'number' ? tile : tile.type;
    const uid = typeof tile === 'object' ? tile.uid : null;
    const classes = [options.button ? 'tile-button' : 'tile-static', tileClasses(tile), settings.textTiles ? 'tile-text-mode' : 'tile-image-mode'];
    if (options.selected) classes.push('selected');
    if (options.riichi) classes.push('riichi-discard');
    if (options.small) classes.push('small');
    if (options.dora) classes.push('dora-tile');
    if (options.extraClass) classes.push(options.extraClass);
    const label = escapeHTML(tileLabel(tile));
    const face = tileFace(tile);
    if (options.button) {
      return `<button type="button" class="${classes.join(' ')}" data-action="${escapeHTML(options.action || 'select-tile')}" data-uid="${escapeHTML(uid)}" aria-label="${label}${options.selected ? ' 선택됨' : ''}" title="${label}">${face}</button>`;
    }
    return `<span class="${classes.join(' ')}" aria-label="${label}" title="${label}">${face}</span>`;
  }

  function tileStaticList(tiles, options = {}) {
    if (!tiles || !tiles.length) return '<span class="river-empty">아직 없음</span>';
    return tiles.map(item => {
      const tile = item.tile || item;
      return tileHTML(tile, { small: options.small !== false, riichi: Boolean(item.riichiDeclaration), extraClass: options.extraClass });
    }).join('');
  }

  function stateText() {
    if (game.phase === 'ended') return '국 종료';
    if (game.phase === 'ronOffer') return '론 선택';
    if (game.currentTurn === 0) return '내 차례';
    return 'AI 진행 중';
  }

  function showMessage(message, type = 'normal') {
    const node = $('gameMessage');
    node.textContent = message;
    node.className = `message-bar${type === 'warning' ? ' warning' : type === 'error' ? ' error' : type === 'neutral' ? ' neutral' : ''}`;
  }

  function renderOpponentGrid() {
    const html = game.players.slice(1).map(player => {
      const riverHtml = (player.river || []).length
        ? player.river.map(discard => tileHTML(discard.tile, { small: true, extraClass: 'river-tile', riichi: discard.riichiDeclaration })).join('')
        : '<span class="river-empty">버림패 없음</span>';
      return `<article class="opponent-card">
        <div class="opponent-topline"><span class="opponent-name">${escapeHTML(player.name)}</span><span class="seat-chip">${escapeHTML(player.seat)}가</span></div>
        <div class="opponent-topline"><span class="opponent-points">${Number(player.points).toLocaleString('ko-KR')}점</span>${player.riichi ? '<span class="riichi-badge">立直</span>' : ''}</div>
        <div class="opponent-state">${player.riichi ? `리치 · 선언패 ${escapeHTML(E.tileShort(player.riichiTile))}` : `버림패 ${(player.river || []).length}장`}</div>
        <div class="river" aria-label="${escapeHTML(player.name)} 버림패">${riverHtml}</div>
      </article>`;
    }).join('');
    $('opponentGrid').innerHTML = html;
  }

  function canRiichiSelected() {
    if (!activePlayerTurn() || selectedUid == null) return false;
    const player = game.players[0];
    if (player.riichi) return false;
    const tile = player.hand.find(t => t.uid === selectedUid);
    if (!tile) return false;
    const postHand = player.hand.filter(t => t.uid !== selectedUid);
    return E.canDeclareRiichi(postHand, player, game);
  }

  function renderHand() {
    const player = game.players[0];
    const hand = player.hand || [];
    const turnActive = activePlayerTurn();
    let drawn = null;
    if (hand.length === 14 && player.lastDrawUid != null) drawn = hand.find(t => t.uid === player.lastDrawUid) || null;
    if (player.riichi && drawn) selectedUid = drawn.uid;
    if (!hand.some(t => t.uid === selectedUid) || !turnActive) selectedUid = null;
    if (player.riichi && drawn && turnActive) selectedUid = drawn.uid;
    const normal = drawn ? hand.filter(t => t.uid !== drawn.uid) : hand;
    $('handTiles').innerHTML = normal.map(tile => tileHTML(tile, { button: true, selected: tile.uid === selectedUid, action: 'select-tile' })).join('');
    $('drawnTile').innerHTML = drawn ? tileHTML(drawn, { button: true, selected: drawn.uid === selectedUid, action: 'select-tile' }) : '';
    $('handStateLabel').textContent = game.phase === 'ended'
      ? `국 종료 · ${hand.length}장`
      : game.phase === 'ronOffer'
        ? `13장 · 론 선택`
        : turnActive
          ? (player.riichi ? '리치 중 · 쯔모패 고정' : '14장 · 타패 대기')
          : `${hand.length}장 · 대기`;
    $('handHelp').textContent = game.phase === 'ended'
      ? '종료된 손패입니다. 국 복기에서 당시 상태와 최종 공개 정보를 확인하세요.'
      : player.riichi
        ? '리치 후에는 쯔모한 패만 버릴 수 있습니다. 화료 가능하면 쯔모 버튼이 활성화됩니다.'
        : '패를 터치해 선택하고, 아래 버튼으로 타패를 확정하세요.';
    $('selfRiichiBadge').classList.toggle('hidden', !player.riichi);
    $('selectionLabel').textContent = selectedUid == null ? '선택한 패 없음' : `선택: ${tileLabel(hand.find(t => t.uid === selectedUid))}`;
    $('shantenQuickLabel').textContent = game.phase === 'ended' ? '국 복기에서 타패 당시 샹텐을 확인' : '정답 미리보기 없이 직접 판단';

    const tsumo = turnActive ? E.canTsumo(game, 0) : { can: false, reason: '' };
    $('tsumoButton').disabled = !tsumo.can;
    $('tsumoButton').title = tsumo.can ? `화료 가능: ${tsumo.result.yaku.map(y => y.name).join(', ')}` : (tsumo.reason || '현재 쯔모 화료할 수 없습니다.');
    $('discardButton').disabled = !turnActive || selectedUid == null;
    $('riichiButton').disabled = !canRiichiSelected();
    $('riichiButton').textContent = player.riichi ? '리치 중' : '리치 선언';
    $('hintButton').disabled = !turnActive || !settings.allowHints;
    $('hintButton').textContent = liveHintVisible ? '힌트 숨기기' : '힌트 요청';
    $('analysisShortcut').disabled = game.decisions.length === 0;
  }

  function renderDora() {
    $('doraIndicators').innerHTML = game.doraIndicators.map(tile => tileHTML(tile, { dora: true })).join('');
    $('wallValue').textContent = `${game.wall.length}장`;
    $('roundValue').textContent = game.round;
    $('seatValue').textContent = `${game.players[0].seat}가`;
    $('pointsValue').textContent = `${game.players[0].points.toLocaleString('ko-KR')}`;
    $('riichiPotLabel').textContent = `공탁 ${game.riichiPot.toLocaleString('ko-KR')}점`;
    $('phaseLabel').textContent = stateText();
    $('gameSubtitle').textContent = game.phase === 'ended'
      ? `${game.final?.reason || '국 종료'} · 종료 후 복기 가능`
      : game.players[0].riichi ? '리치 상태: 쯔모패만 타패할 수 있습니다.' : '내 손패와 공개 정보만으로 판단하세요.';
  }

  function renderTurnContext() {
    const el = $('turnContext');
    const pending = game.pendingRon;
    if (game.phase === 'ended') {
      el.textContent = game.final?.reason || '국이 종료되었습니다.';
    } else if (game.phase === 'ronOffer' && pending) {
      const from = game.players[pending.from];
      el.textContent = `${from.name}의 ${E.tileShort(pending.tile.type, pending.tile.red)}에 론할 수 있습니다. 론 또는 패스를 선택하세요.`;
    } else if (game.currentTurn === 0) {
      el.textContent = game.players[0].riichi
        ? '리치 상태입니다. 쯔모가 아니면 방금 쯔모한 패를 버려야 합니다.'
        : '내 차례입니다. 패효율 버튼은 지난 타패를 복기하고, 힌트 요청은 원할 때만 후보를 공개합니다.';
    } else {
      el.textContent = `${game.players[game.currentTurn].name}의 차례입니다. AI는 기본 패효율·형태·일부 수비 단서를 사용합니다.`;
    }
    const showRon = game.phase === 'ronOffer' && Boolean(pending);
    $('ronOffer').classList.toggle('hidden', !showRon);
    if (showRon) {
      $('ronOfferText').textContent = `${game.players[pending.from].name}의 ${E.tileShort(pending.tile.type, pending.tile.red)}를 론할 수 있습니다. 패스를 선택하면 이번 국에서 일시적 후리텐이 적용됩니다.`;
    }
  }

  function candidateMetrics(candidate) {
    if (!candidate) return '분석 자료 없음';
    const eff = candidate.effective || [];
    const effNames = eff.slice(0, 6).map(x => `${E.tileShort(x.type)}×${x.count}`).join(' · ') || '없음';
    const shape = (candidate.shapeOnly || []).slice(0, 4).map(x => E.tileShort(x.type)).join(' · ');
    return `${shapeName(candidate.shanten)} · 유효패 ${eff.length}종 / 미확인 ${candidate.ukeire}장 · ${effNames}${shape ? ` · 샹텐 불변 형태 후보: ${shape}` : ''}`;
  }

  function candidateTableHTML(analysis, actual = null) {
    if (!analysis?.ok || !analysis.candidates?.length) return '<div class="empty-state">비교할 분석 자료가 없습니다.</div>';
    const selected = actual || null;
    const candidates = [...analysis.candidates].sort((a, b) => a.shanten - b.shanten || b.ukeire - a.ukeire || b.shapeScore - a.shapeScore);
    return `<div class="candidate-list">${candidates.map((c, i) => {
      const isSelected = selected && c.type === selected.type && Boolean(c.red) === Boolean(selected.red);
      const isBest = c.isBestEfficiency || (analysis.best && c.type === analysis.best.type && Boolean(c.red) === Boolean(analysis.best.red));
      const effective = (c.effective || []).slice(0, 6).map(x => `${E.tileShort(x.type)} ${x.count}장`).join(' · ') || '샹텐 개선 유효패 없음';
      const shape = (c.shapeOnly || []).slice(0, 4).map(x => `${E.tileShort(x.type)} ${x.count}장`).join(' · ');
      let badge = isBest ? '<span class="decision-tag good">효율 상위</span>' : '';
      if (isSelected) badge = '<span class="decision-tag review">실제 선택</span>';
      return `<div class="candidate-row ${isBest ? 'best' : ''}">
        <div class="candidate-tile">${tileHTML({ type: c.type, red: c.red }, { small: true })}<strong>${escapeHTML(E.tileShort(c.type, c.red))}</strong></div>
        <div class="candidate-detail"><strong>${shapeName(c.shanten)} · 유효패 ${c.effective?.length || 0}종</strong><small>${escapeHTML(effective)}${shape ? `<br>샹텐 불변 형태 후보: ${escapeHTML(shape)}` : ''}<br>${badge}</small></div>
        <div class="candidate-value"><strong>${c.ukeire}</strong><small>미확인 매수</small></div>
      </div>`;
    }).join('')}</div><p class="tiny-muted" style="margin:10px 0 0;line-height:1.5">‘효율 상위’는 샹텐 수와 미확인 유효패 매수 기준입니다. 수비·타점·국 상황을 모두 고려한 최적 타패라는 뜻은 아닙니다.</p>`;
  }

  function currentDecision() {
    if (!game.decisions.length) return null;
    if (selectedDecisionId != null) return game.decisions.find(d => d.id === selectedDecisionId) || game.decisions[game.decisions.length - 1];
    return game.decisions[game.decisions.length - 1];
  }

  function renderEfficiency() {
    const d = currentDecision();
    const box = $('efficiencySummary');
    $('decisionCountBadge').textContent = `${game.decisions.length}회`;
    if (!d) {
      box.innerHTML = `<div class="efficiency-score-card"><div class="score-circle"><strong>—</strong><span>NO DATA</span></div><div class="summary-copy"><h2>타패 기록이 아직 없습니다.</h2><p>탁자에서 한 번 타패하거나 아래 빠른 패효율 훈련으로 샹텐·유효패 후보를 직접 비교해 보세요.</p></div></div>`;
      $('decisionList').innerHTML = '<div class="empty-state">완료한 타패 기록이 여기에 쌓입니다.</div>';
      $('candidateTable').innerHTML = '<div class="empty-state">아직 비교할 턴이 없습니다.</div>';
      $('efficiencyDetailTitle').textContent = '선택한 턴의 후보 비교';
      $('efficiencyDetailSubtitle').textContent = '타패 후 분석을 여기에서 확인할 수 있습니다.';
    } else {
      const ev = E.decisionEvaluation(d);
      const c = d.selectedCandidate;
      const best = d.analysis?.best;
      box.innerHTML = `<div class="efficiency-score-card"><div class="score-circle"><strong>${c ? c.ukeire : '—'}</strong><span>OUTS</span></div><div class="summary-copy"><h2>턴 ${d.id} · ${escapeHTML(E.tileShort(d.selected.type, d.selected.red))} 타패</h2><p>${escapeHTML(ev.reason)}</p></div></div><div class="summary-metrics"><div class="summary-metric"><span>타패 후 샹텐</span><strong>${c ? shapeName(c.shanten) : '—'}</strong></div><div class="summary-metric"><span>효율 상위 후보</span><strong>${best ? escapeHTML(E.tileShort(best.type, best.red)) : '—'}</strong></div><div class="summary-metric"><span>미확인 매수 차이</span><strong>${best && c && c.shanten === best.shanten ? `${best.ukeire - c.ukeire}장` : best && c ? '샹텐 차이' : '—'}</strong></div></div>`;
      $('decisionList').innerHTML = game.decisions.slice().reverse().map(item => {
        const result = E.decisionEvaluation(item);
        const selected = item.id === d.id;
        const cnd = item.selectedCandidate;
        return `<button class="decision-row ${selected ? 'selected' : ''}" data-action="open-decision" data-id="${item.id}"><span class="decision-index">${item.id}</span><span class="decision-main"><strong>${escapeHTML(E.tileShort(item.selected.type, item.selected.red))} 타패 · ${cnd ? shapeName(cnd.shanten) : '—'}</strong><small>${escapeHTML(result.reason)}</small></span><span class="decision-tag ${result.severity || 'review'}">${escapeHTML(result.label)}</span></button>`;
      }).join('');
      $('efficiencyDetailTitle').textContent = `턴 ${d.id} 후보 비교`;
      $('efficiencyDetailSubtitle').textContent = `실제 타패: ${E.tileShort(d.selected.type, d.selected.red)} · 당시 공개 정보 스냅샷 사용`;
      $('candidateTable').innerHTML = candidateTableHTML(d.analysis, d.selected);
    }
    renderEfficiencyTraining();
  }

  function newEfficiencyTraining() {
    efficiencyTraining = E.makePracticeHand(settings.redFives, 0);
    effTrainingSelectedUid = null;
    effTrainingSubmitted = false;
    if ($('effTrainingResult')) $('effTrainingResult').classList.add('hidden');
    renderEfficiencyTraining();
  }

  function renderEfficiencyTraining() {
    if (!efficiencyTraining) efficiencyTraining = E.makePracticeHand(settings.redFives, 0);
    $('effTrainingHand').innerHTML = efficiencyTraining.hand.map(tile => tileHTML(tile, {
      button: true,
      action: 'select-efficiency-tile',
      selected: tile.uid === effTrainingSelectedUid,
    })).join('');
    $('submitEfficiencyTraining').disabled = effTrainingSelectedUid == null || effTrainingSubmitted;
    $('clearEfficiencySelection').disabled = effTrainingSelectedUid == null || effTrainingSubmitted;
  }

  function renderLiveHint() {
    const panel = $('liveHintPanel');
    panel.classList.toggle('hidden', !liveHintVisible);
    if (!liveHintVisible) { panel.innerHTML = ''; return; }
    const p = game.players[0];
    if (!activePlayerTurn()) {
      panel.innerHTML = '<h3>지금은 힌트를 볼 수 없습니다.</h3><p>내 차례에만 현재 손패를 분석합니다.</p>';
      return;
    }
    const analysis = E.analyzeDiscards(p.hand, E.getVisibleTiles(game, false), { specialHands: game.settings.specialHands });
    const top = analysis.candidates.slice(0, 4);
    panel.innerHTML = `<div class="hint-grid"><h3>요청한 타패 힌트</h3><p>샹텐 수 → 미확인 유효패 매수 순으로 정렬했습니다. 수비·타점은 반영되지 않습니다.</p>${top.map(c => `<div class="hint-option"><span>${E.tileShort(c.type, c.red)} · ${shapeName(c.shanten)}</span><strong>${c.ukeire}장</strong></div>`).join('')}</div>`;
  }

  function renderEndResult() {
    const box = $('endResultPanel');
    if (game.phase !== 'ended' || !game.final) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    const f = game.final;
    let summary = '';
    if (f.winner != null) {
      const winName = game.players[f.winner].name;
      const method = f.method === 'tsumo' ? '쯔모' : '론';
      summary = `${winName} · ${method} · ${f.result?.han ?? '—'}판${f.result?.fu ? ` ${f.result.fu}부` : ''}`;
    } else summary = `텐파이: ${(f.tenpai || []).map(i => game.players[i]?.name).join(', ') || '없음'}`;
    box.innerHTML = `<h2>${escapeHTML(f.reason || '국 종료')}</h2><p>${escapeHTML(summary)}. 아래에서 타패별 효율과 당시 공개 정보를 복기할 수 있습니다.</p>${f.note ? `<p>${escapeHTML(f.note)}</p>` : ''}<div class="end-result-actions"><button class="button button-primary" data-action="go-review">상세 복기</button><button class="button button-secondary" data-action="go-efficiency">타패 효율</button><button class="button button-quiet" data-action="new-game">새 국 시작</button></div>`;
  }

  function renderTable() {
    renderDora();
    renderOpponentGrid();
    renderHand();
    renderTurnContext();
    renderLiveHint();
    renderEndResult();
  }

  function renderReviewTop() {
    const top = $('reviewTop');
    if (game.phase !== 'ended' || !game.final) {
      top.innerHTML = `<div class="surface-card"><div class="empty-state">현재 국은 진행 중입니다. 국이 끝나면 결과와 판단 평가가 표시됩니다. 진행 중인 타패도 지금까지의 타임라인에서 확인할 수 있습니다.</div><div class="summary-metrics"><div class="summary-metric"><span>완료 타패</span><strong>${game.decisions.length}</strong></div><div class="summary-metric"><span>현재 내 샹텐</span><strong>${game.players[0].hand.length === 14 ? shapeName(E.calcShanten(E.countsFromTiles(game.players[0].hand), { specialHands: game.settings.specialHands })) : '—'}</strong></div><div class="summary-metric"><span>패산</span><strong>${game.wall.length}장</strong></div></div></div>`;
      $('finalReveal').classList.add('hidden');
      return;
    }
    const f = game.final;
    const review = f.review || E.evaluateHandReview(game);
    const humanDelta = game.players[0].points - 25000;
    const yaku = f.result?.yaku || [];
    const scoreText = review.total == null ? '평가 불가' : `${review.total}점`;
    const categories = Object.values(review.categories || {}).filter(c => c.weight > 0);
    const pointDeltas = game.players.map(p => p.points - 25000);
    top.innerHTML = `<div class="surface-card">
      <div class="card-heading"><div><p class="eyebrow">HAND RESULT</p><h2>${escapeHTML(f.reason)}</h2><p>${f.winner == null ? `유국 · 텐파이 ${escapeHTML((f.tenpai || []).map(i => game.players[i].name).join(', ') || '없음')}` : `${escapeHTML(game.players[f.winner].name)} ${f.method === 'tsumo' ? '쯔모' : '론'} 화료 · ${escapeHTML(E.tileShort(f.winningTile.type, f.winningTile.red))}`}</p></div><span class="count-badge">${game.decisions.length}회 타패</span></div>
      <div class="efficiency-score-card"><div class="score-circle"><strong>${escapeHTML(scoreText === '평가 불가' ? '—' : String(review.total))}</strong><span>REVIEW</span></div><div class="summary-copy"><h2>의사결정 지표</h2><p>승패 대신 기록된 타패의 효율·형태와 확인 가능한 안전 단서를 평가합니다. 평가하지 못한 항목은 제외했고, 계산된 항목만 100점으로 환산했습니다.</p></div></div>
      <div class="summary-metrics"><div class="summary-metric"><span>내 점수 변화</span><strong>${humanDelta >= 0 ? '+' : ''}${humanDelta.toLocaleString('ko-KR')}</strong></div><div class="summary-metric"><span>샹텐 손실 타패</span><strong>${review.shantenLosses}</strong></div><div class="summary-metric"><span>유효패 감소 타패</span><strong>${review.ukeireLosses}</strong></div></div>
      <div class="review-score-grid">${categories.map(c => `<div class="review-score-item"><span>${escapeHTML(c.label)} · 가중치 ${c.weight}</span><strong>${c.score == null ? '미평가' : `${Math.round(c.score / c.weight * 100)}/100`}</strong><small>${escapeHTML(c.detail)}</small></div>`).join('')}</div>
      <div class="replay-section-title">화료 정보</div>
      ${f.winner != null ? `<p class="section-subtitle" style="margin-bottom:8px">${yaku.length ? `역: ${yaku.map(y => escapeHTML(y.name)).join(' · ')}` : '역 정보 미지원'}${f.result?.han != null ? ` · ${f.result.han}판` : ''}${f.result?.fu ? ` · ${f.result.fu}부` : ''}${f.result?.dora ? ` · 도라 ${f.result.dora.total}장` : ''}${f.result?.points?.total ? ` · 점수 ${f.result.points.total.toLocaleString('ko-KR')}점` : ''}</p>` : '<p class="section-subtitle" style="margin-bottom:8px">유국 벌점과 친 유지 규칙은 미적용입니다.</p>'}
      <div class="replay-section-title">점수 변화</div><div class="summary-metrics">${game.players.map((p, i) => `<div class="summary-metric"><span>${escapeHTML(p.name)}</span><strong>${pointDeltas[i] >= 0 ? '+' : ''}${pointDeltas[i].toLocaleString('ko-KR')}</strong></div>`).join('')}</div>
      <div class="replay-section-title">평가 시 주의</div><p class="section-subtitle">${(review.notes || []).map(escapeHTML).join(' ')}</p>
    </div>`;
    renderFinalReveal();
  }

  function renderReviewTimeline() {
    const el = $('reviewTimeline');
    if (!game.decisions.length) { el.innerHTML = '<div class="empty-state">복기할 플레이어 타패 기록이 없습니다.</div>'; return; }
    el.innerHTML = game.decisions.slice().reverse().map(d => {
      const ev = E.decisionEvaluation(d);
      const selected = d.id === (selectedDecisionId || game.decisions[game.decisions.length - 1].id);
      return `<button class="decision-row ${selected ? 'selected' : ''}" data-action="open-review-decision" data-id="${d.id}"><span class="decision-index">${d.id}</span><span class="decision-main"><strong>${escapeHTML(E.tileShort(d.selected.type, d.selected.red))} 타패 · ${d.selectedCandidate ? shapeName(d.selectedCandidate.shanten) : '—'}</strong><small>${escapeHTML(ev.reason)}</small></span><span class="decision-tag ${ev.severity || 'review'}">${escapeHTML(ev.label)}</span></button>`;
    }).join('');
  }

  function replayRiversHTML(publicSnapshot) {
    const players = publicSnapshot?.players || [];
    return `<div class="replay-rivers">${players.map(p => `<div class="replay-river-block"><strong>${escapeHTML(p.name)} · ${p.riichi ? '리치' : p.seat + '가'}</strong><div class="river">${(p.river || []).length ? p.river.map(d => tileHTML(d.tile, { small: true, extraClass: 'river-tile', riichi: d.riichiDeclaration })).join('') : '<span class="river-empty">버림패 없음</span>'}</div></div>`).join('')}</div>`;
  }

  function renderReviewDetail() {
    const d = currentDecision();
    const container = $('reviewDetail');
    if (!d) {
      container.innerHTML = '<div class="empty-state">아직 선택할 턴이 없습니다.</div>';
      $('reviewDetailTitle').textContent = '턴 상세';
      $('reviewDetailSubtitle').textContent = '타임라인에서 턴을 선택하세요.';
      return;
    }
    const ev = E.decisionEvaluation(d);
    const sel = d.selectedCandidate;
    const best = d.analysis?.best;
    const eff = sel?.effective || [];
    $('reviewDetailTitle').textContent = `턴 ${d.id} 상세`;
    $('reviewDetailSubtitle').textContent = `당시 공개 정보 · 패산 ${d.wallRemaining}장 · 실제 타패 ${E.tileShort(d.selected.type, d.selected.red)}`;
    container.innerHTML = `<div class="review-assessment ${ev.severity || 'review'}"><strong>${escapeHTML(ev.label)}</strong><p>${escapeHTML(ev.reason)}</p></div>
      <div class="replay-section-title">당시 내 손패 (14장)</div><div class="replay-hand">${(d.handBefore || []).map(t => tileHTML(t)).join('')}</div>
      <div class="summary-metrics"><div class="summary-metric"><span>쯔모패</span><strong>${d.drawnTile ? escapeHTML(E.tileShort(d.drawnTile.type, d.drawnTile.red)) : '—'}</strong></div><div class="summary-metric"><span>실제 타패</span><strong>${escapeHTML(E.tileShort(d.selected.type, d.selected.red))}</strong></div><div class="summary-metric"><span>타패 후 샹텐</span><strong>${sel ? shapeName(sel.shanten) : '—'}</strong></div></div>
      <div class="replay-section-title">실제 선택의 유효패</div><p class="section-subtitle" style="margin-bottom:10px">${escapeHTML(eff.length ? eff.map(t => `${E.tileShort(t.type)} ${t.count}장`).join(' · ') : '샹텐을 개선하는 미확인 패 없음')} ${sel ? `— 총 ${sel.ukeire}장` : ''}</p>
      <div class="replay-section-title">당시 상대별 버림패와 공개 정보</div>${replayRiversHTML(d.publicBefore)}
      <div class="replay-section-title">당시 후보 비교</div>${candidateTableHTML(d.analysis, d.selected)}
      <div class="replay-section-title">복기 해석</div><p class="section-subtitle">${best ? `패효율 기준 상위 후보는 ${E.tileShort(best.type, best.red)}이며, 샹텐 ${shapeName(best.shanten)}, 미확인 유효패 ${best.ukeire}장입니다.` : '분석 가능한 후보 정보가 없습니다.'} ${d.declareRiichi ? '이 타패와 함께 리치를 선언했습니다.' : ''} 당시 이후에 공개된 패 정보는 이 판단의 근거에 포함하지 않았습니다. 상대 손패 추론은 국 종료 후 공개 정보와 별도로 비교하세요.</p>`;
  }

  function renderFinalReveal() {
    const box = $('finalReveal');
    if (game.phase !== 'ended' || !game.final?.handsRevealed) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    box.innerHTML = `<div class="card-heading"><div><h2>종료 후 공개된 상대 손패</h2><p>이 정보는 국 종료 후에만 표시합니다. 위 각 턴의 복기 스냅샷에는 포함하지 않았습니다.</p></div><span class="count-badge">종료 후 공개</span></div>${game.players.slice(1).map(p => {
      const hand = p.finalHand || p.hand || [];
      const counts = E.countsFromTiles(hand);
      const sh = E.calcShanten(counts, { specialHands: game.settings.specialHands });
      const waits = hand.length === 13 && sh === 0 ? E.getWinningTiles(counts, { specialHands: game.settings.specialHands }) : [];
      const wasWinner = game.final.winner === p.id;
      return `<div class="replay-section-title">${escapeHTML(p.name)} · ${escapeHTML(p.seat)}가 · ${wasWinner ? '화료자' : shapeName(sh)}</div><div class="replay-hand">${hand.map(t => tileHTML(t)).join('')}${wasWinner && game.final.method === 'ron' ? tileHTML(game.final.winningTile, { extraClass: 'riichi-discard' }) : ''}</div><p class="section-subtitle">${wasWinner ? `화료 · ${escapeHTML((game.final.result?.yaku || []).map(y => y.name).join(' · ') || '역 정보 없음')}` : waits.length ? `종료 시 대기: ${waits.map(t => E.tileShort(t)).join(' · ')}` : `종료 시 ${shapeName(sh)} · 대기패 분석 ${hand.length === 13 ? '가능' : '해당 장수 아님'}`}</p>`;
    }).join('')}`;
  }

  function renderReview() {
    renderReviewTop();
    renderReviewTimeline();
    renderReviewDetail();
  }

  function renderStatsAndSettings() {
    const validScores = history.map(x => x.reviewScore).filter(x => typeof x === 'number');
    const wins = history.filter(x => x.humanWon).length;
    const avg = validScores.length ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : null;
    const humanDelta = history.length ? Math.round(history.reduce((s, x) => s + (x.pointDeltas?.[0] || 0), 0) / history.length) : 0;
    const totalLosses = history.reduce((s, x) => s + (x.shantenLosses || 0), 0);
    $('statsGrid').innerHTML = [
      ['완료한 국', history.length, '브라우저에 저장된 기록'],
      ['내 화료', `${wins}`, history.length ? `화료 기록 ${Math.round(wins / history.length * 100)}%` : '아직 기록 없음'],
      ['평균 복기 점수', avg == null ? '—' : `${avg}`, '휴리스틱 지표'],
      ['평균 점수 변화', history.length ? `${humanDelta >= 0 ? '+' : ''}${humanDelta.toLocaleString('ko-KR')}` : '—', '국당 내 점수 변화'],
    ].map(x => `<div class="stat-tile"><span>${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small></div>`).join('');
    $('settingRedFives').checked = Boolean(settings.redFives);
    $('settingSpecialHands').checked = Boolean(settings.specialHands);
    $('settingAutoSort').checked = Boolean(settings.autoSort);
    $('settingTileNumbers').checked = Boolean(settings.showTileNumbers);
    $('settingPostAnalysis').checked = Boolean(settings.showPostDiscardAnalysis);
    $('settingAllowHints').checked = Boolean(settings.allowHints);
    $('settingDifficulty').value = settings.difficulty || 'intermediate';
    $('settingTextTiles').checked = Boolean(settings.textTiles);
    $('settingTheme').value = settings.theme === 'dark' ? 'dark' : 'light';
    $('settingStartTurn').value = settings.startTurn === 'opponent' ? 'opponent' : 'self';
    $('historyCount').textContent = `${history.length}국`;
    $('historyList').innerHTML = history.length ? history.slice(0, 15).map(item => `<div class="history-row"><div><strong>${escapeHTML(item.result || '완료')}</strong><small>${escapeHTML(new Date(item.endedAt || item.createdAt || Date.now()).toLocaleString('ko-KR'))} · ${item.decisionCount || 0}회 타패</small></div><div class="history-result"><strong>${item.reviewScore == null ? '미평가' : `${item.reviewScore}점`}</strong><small>${item.pointDeltas?.[0] >= 0 ? '+' : ''}${Number(item.pointDeltas?.[0] || 0).toLocaleString('ko-KR')}점</small></div></div>`).join('') : '<div class="empty-state">완료 기록이 아직 없습니다. 한 국을 끝내면 점수와 복기 지표가 자동 저장됩니다.</div>';
  }

  function renderAll() {
    if (game.phase === 'ended' && !game._completionRecorded) recordCompletion();
    renderTable();
    renderEfficiency();
    renderReview();
    renderStatsAndSettings();
    saveAll();
  }

  function recordCompletion() {
    if (game._completionRecorded || game.phase !== 'ended') return;
    const review = E.evaluateHandReview(game);
    game.final.review = review;
    const summary = E.summarizeHand(game);
    history.unshift(summary);
    history = history.slice(0, 60);
    game._completionRecorded = true;
  }

  function switchView(view) {
    activeView = view;
    document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
    document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `view-${view}`));
    if (view === 'efficiency') renderEfficiency();
    if (view === 'review') renderReview();
    if (view === 'settings') renderStatsAndSettings();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function drawAndDriveAfterPass() {
    if (game.phase === 'ended' || game.phase === 'ronOffer') { renderAll(); return; }
    if (game.currentTurn === 0 && game.players[0].hand.length === 13) E.drawHumanTurn(game);
    renderAll();
    driveToHuman();
  }

  async function driveToHuman() {
    if (driving) return;
    driving = true;
    try {
      while (game.phase === 'turn' && game.currentTurn !== 0) {
        const beforeTurn = game.currentTurn;
        E.performAITurn(game);
        renderAll();
        if (game.phase === 'ended' || game.phase === 'ronOffer') break;
        if (game.currentTurn === 0) {
          const drawResult = E.drawHumanTurn(game);
          renderAll();
          if (drawResult.status === 'ended') break;
          selectedUid = null;
          showMessage('쯔모했습니다. 손패를 확인하고 타패를 선택하세요.');
          renderTable();
          saveAll();
          break;
        }
        if (beforeTurn === game.currentTurn) break;
        await new Promise(resolve => setTimeout(resolve, 115));
      }
    } finally {
      driving = false;
      if (game.phase === 'turn' && game.currentTurn === 0 && game.players[0].hand.length === 13) {
        E.drawHumanTurn(game);
        renderAll();
      }
    }
  }

  async function startNewGame(force = false) {
    const active = game.phase !== 'ended' && game.decisions.length > 0;
    if (!force && active) {
      const yes = await askConfirm('새 국 시작', '현재 진행 중인 국과 타패 기록을 종료하고 새 국을 시작할까요?', '새 국 시작');
      if (!yes) return;
    }
    game = E.newGame(settings);
    selectedUid = null;
    selectedDecisionId = null;
    liveHintVisible = false;
    showMessage(game.currentTurn === 0 ? '새 국을 시작했습니다. 손패와 공개 정보를 확인하세요.' : '상대의 선공 차례를 진행합니다.');
    renderAll();
    switchView('table');
    if (game.phase === 'turn' && game.currentTurn !== 0) driveToHuman();
  }

  function openDecision(id, view = 'efficiency') {
    selectedDecisionId = Number(id);
    switchView(view);
  }

  function handleDiscard() {
    if (!activePlayerTurn() || selectedUid == null) return;
    const result = E.applyHumanDiscard(game, selectedUid, false);
    if (!result.ok) { showMessage(result.error, 'error'); return; }
    selectedUid = null;
    liveHintVisible = false;
    const chosenStats = game.lastAnalysis?.selectedCandidate;
    const quick = settings.showPostDiscardAnalysis && chosenStats ? ` · ${shapeName(chosenStats.shanten)}, 미확인 유효패 ${chosenStats.ukeire}장` : '';
    showMessage(`타패: ${E.tileShort(result.tile.type, result.tile.red)}${quick}. 상대의 공개 정보와 반응을 확인합니다.`);
    renderAll();
    if (game.phase === 'ended') return;
    if (game.phase === 'ronOffer') return;
    driveToHuman();
  }

  function handleRiichiDiscard() {
    if (!activePlayerTurn() || selectedUid == null) return;
    const result = E.applyHumanDiscard(game, selectedUid, true);
    if (!result.ok) { showMessage(result.error, 'error'); return; }
    selectedUid = null;
    liveHintVisible = false;
    showMessage(`리치를 선언하고 ${E.tileShort(result.tile.type, result.tile.red)}를 버렸습니다.`, 'warning');
    renderAll();
    if (game.phase === 'ended' || game.phase === 'ronOffer') return;
    driveToHuman();
  }

  function handleTsumo() {
    const result = E.claimTsumo(game, 0);
    if (result.status !== 'ended') { showMessage(result.error || '쯔모할 수 없습니다.', 'error'); return; }
    selectedUid = null;
    showMessage('쯔모 화료! 결과와 타패 판단을 복기할 수 있습니다.');
    renderAll();
  }

  function handleRonClaim() {
    const result = E.claimRon(game);
    if (result.status !== 'ended') { showMessage(result.error || '론할 수 없습니다.', 'error'); return; }
    showMessage('론 화료! 국을 종료하고 결과를 기록했습니다.');
    renderAll();
  }

  function handleRonPass() {
    const result = E.passRon(game);
    if (result.status === 'error') { showMessage(result.error, 'error'); return; }
    renderAll();
    if (game.phase === 'ended') return;
    if (game.currentTurn === 0 && game.players[0].hand.length === 13) E.drawHumanTurn(game);
    renderAll();
    driveToHuman();
  }

  function renderDefense() {
    if (!defenseScenario) newDefenseScenario();
    const { hand, opponent } = defenseScenario;
    $('defenseScenarioText').textContent = '상황: 상대 1명이 리치를 선언했습니다. 내 손패를 빠르게 화료시키는 것과 방총을 피하는 것 사이에서 버릴 패를 고릅니다. 위험 확률은 제공하지 않습니다.';
    $('defenseRiver').innerHTML = opponent.river.map((d, i) => tileHTML(d.tile, { small: true, extraClass: 'river-tile', riichi: d.riichiDeclaration || d.tile.type === opponent.riichiTile && i === opponent.riichiIndex })).join('');
    $('defenseHand').innerHTML = hand.map(tile => tileHTML(tile, { button: true, action: 'select-defense-tile', selected: tile.uid === defenseSelectedUid })).join('');
    $('defenseSelectedLabel').textContent = defenseSelectedUid == null ? '선택 없음' : escapeHTML(E.tileShort(hand.find(t => t.uid === defenseSelectedUid)?.type ?? -1));
    $('submitDefense').disabled = defenseSelectedUid == null || defenseSubmitted;
    if (!defenseSubmitted) $('defenseResult').classList.add('hidden');
  }

  function newDefenseScenario() {
    const sample = E.makePracticeHand(settings.redFives, 12);
    const river = sample.river.map((d, i) => ({ ...d, riichiDeclaration: i === 4 }));
    const riichiIndex = Math.min(4, river.length - 1);
    const opponent = {
      id: 1,
      name: '가상 리치 상대',
      seat: '남',
      riichi: true,
      riichiTile: river[riichiIndex]?.tile.type ?? 3,
      riichiIndex,
      river,
    };
    defenseScenario = { hand: sample.hand, opponent, visible: [...sample.hand, ...river.map(d => d.tile)] };
    defenseSelectedUid = null;
    defenseSubmitted = false;
    if ($('defenseResult')) { $('defenseResult').innerHTML = ''; $('defenseResult').classList.add('hidden'); }
    if ($('defenseHand')) renderDefense();
  }

  function submitDefense() {
    if (!defenseScenario || defenseSelectedUid == null || defenseSubmitted) return;
    const tile = defenseScenario.hand.find(t => t.uid === defenseSelectedUid);
    if (!tile) return;
    const signal = E.getDefenseSignal(tile.type, defenseScenario.opponent, defenseScenario.visible);
    const alternatives = [...new Map(defenseScenario.hand.map(t => [t.type, t])).values()].map(t => ({ tile: t, signal: E.getDefenseSignal(t.type, defenseScenario.opponent, defenseScenario.visible) }));
    const safe = alternatives.filter(x => x.signal.level === 'safe').map(x => E.tileShort(x.tile.type, x.tile.red));
    const safer = alternatives.filter(x => x.signal.level === 'safer').map(x => E.tileShort(x.tile.type, x.tile.red));
    const close = alternatives.filter(x => x.signal.level === 'clue').map(x => E.tileShort(x.tile.type, x.tile.red));
    const className = signal.level === 'safe' ? 'safe' : signal.level === 'safer' ? 'safer' : signal.level === 'clue' ? 'clue' : 'unclear';
    $('defenseResult').innerHTML = `<h3>선택 결과: ${escapeHTML(E.tileShort(tile.type, tile.red))} · <span class="signal-chip ${className}">${escapeHTML(signal.label)}</span></h3>${signal.reasons.map(r => `<p>${escapeHTML(r)}</p>`).join('')}<p><strong>이 손패에서 확인 가능한 다른 선택</strong><br>현물: ${escapeHTML(safe.join(' · ') || '없음')}<br>스지: ${escapeHTML(safer.join(' · ') || '없음')}<br>벽 단서: ${escapeHTML(close.join(' · ') || '없음')}</p><p>이 연습은 공개 정보의 종류를 식별합니다. 패 가치·샹텐·점수 상황까지 포함한 푸시/폴드 최적 판단은 계산하지 않습니다.</p>`;
    $('defenseResult').classList.remove('hidden');
    defenseSubmitted = true;
    renderDefense();
    $('defenseResult').classList.remove('hidden');
  }

  function submitEfficiencyTraining() {
    if (!efficiencyTraining || effTrainingSelectedUid == null || effTrainingSubmitted) return;
    const tile = efficiencyTraining.hand.find(t => t.uid === effTrainingSelectedUid);
    const analysis = E.analyzeDiscards(efficiencyTraining.hand, [], { specialHands: settings.specialHands });
    const actual = analysis.candidates.find(c => c.type === tile.type && Boolean(c.red) === Boolean(tile.red));
    const best = analysis.best;
    let text = '';
    let style = '';
    if (actual.shanten > best.shanten) { text = `선택한 타패는 최선 후보보다 샹텐 수가 ${actual.shanten - best.shanten} 높습니다.`; style = 'poor'; }
    else if (actual.ukeire < best.ukeire) { text = `샹텐 수는 같지만 최선 후보보다 미확인 유효패가 ${best.ukeire - actual.ukeire}장 적습니다.`; style = 'review'; }
    else { text = '샹텐 수와 유효패 매수 기준에서 최선 후보와 동률입니다.'; style = 'good'; }
    $('effTrainingResult').innerHTML = `<div class="review-assessment ${style}"><strong>선택: ${escapeHTML(E.tileShort(tile.type, tile.red))} · ${shapeName(actual.shanten)}</strong><p>${escapeHTML(text)}</p><p>효율 상위 후보: ${escapeHTML(E.tileShort(best.type, best.red))} · ${shapeName(best.shanten)} · 미확인 유효패 ${best.ukeire}장</p></div>${candidateTableHTML(analysis, tile)}`;
    $('effTrainingResult').classList.remove('hidden');
    effTrainingSubmitted = true;
    renderEfficiencyTraining();
    $('effTrainingResult').classList.remove('hidden');
  }

  function exportData() {
    const data = {
      format: 'riichi-solo-trainer-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      history,
      currentGameSummary: game.phase === 'ended' ? E.summarizeHand(game) : null,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `riichi-trainer-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast('기록 파일을 내보냈습니다.');
  }

  async function importData(file) {
    if (!file) return;
    if (file.size > 2_000_000) { showToast('파일이 너무 큽니다. 2MB 이하의 JSON만 가져올 수 있습니다.'); return; }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || data.format !== 'riichi-solo-trainer-export' || data.version !== 1 || !Array.isArray(data.history)) {
        throw new Error('지원하는 기록 파일 형식이 아닙니다.');
      }
      const normalizedHistory = data.history.filter(item => item && typeof item === 'object' && typeof item.id === 'string').slice(0, 60);
      history = [...normalizedHistory, ...history].reduce((acc, item) => {
        if (!acc.some(old => old.id === item.id)) acc.push(item);
        return acc;
      }, []).slice(0, 60);
      if (data.settings && typeof data.settings === 'object') settings = { ...DEFAULT_SETTINGS, ...data.settings };
      applyTheme(settings.theme);
      saveAll();
      renderAll();
      showToast(`기록 ${normalizedHistory.length}개를 가져왔습니다.`);
    } catch (error) {
      showToast(error.message || 'JSON 파일을 읽지 못했습니다.');
    } finally {
      $('importData').value = '';
    }
  }

  function saveSettingsFromForm() {
    settings = {
      redFives: $('settingRedFives').checked,
      specialHands: $('settingSpecialHands').checked,
      autoSort: $('settingAutoSort').checked,
      showTileNumbers: $('settingTileNumbers').checked,
      showPostDiscardAnalysis: $('settingPostAnalysis').checked,
      allowHints: $('settingAllowHints').checked,
      difficulty: $('settingDifficulty').value,
      textTiles: $('settingTextTiles').checked,
      theme: $('settingTheme').value === 'dark' ? 'dark' : 'light',
      startTurn: $('settingStartTurn').value === 'opponent' ? 'opponent' : 'self',
    };
    applyTheme(settings.theme);
    saveJSON(STORAGE.settings, settings);
    renderTable();
    showToast('설정을 저장했습니다. 시작 유형은 새 국부터 적용됩니다.');
    renderStatsAndSettings();
  }

  function attachEvents() {
    document.querySelectorAll('.nav-tab').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
    $('discardButton').addEventListener('click', handleDiscard);
    $('riichiButton').addEventListener('click', handleRiichiDiscard);
    $('tsumoButton').addEventListener('click', handleTsumo);
    $('claimRon').addEventListener('click', handleRonClaim);
    $('passRon').addEventListener('click', handleRonPass);
    $('newGameTop').addEventListener('click', () => startNewGame(false));
    $('hintButton').addEventListener('click', () => {
      if (!settings.allowHints) { showToast('기록·설정에서 힌트 요청을 허용하세요.'); return; }
      liveHintVisible = !liveHintVisible;
      renderLiveHint();
      $('hintButton').textContent = liveHintVisible ? '힌트 숨기기' : '힌트 요청';
    });
    $('analysisShortcut').addEventListener('click', () => {
      selectedDecisionId = game.decisions.length ? game.decisions[game.decisions.length - 1].id : null;
      switchView('efficiency');
    });
    $('refreshEfficiencyTraining').addEventListener('click', newEfficiencyTraining);
    $('submitEfficiencyTraining').addEventListener('click', submitEfficiencyTraining);
    $('clearEfficiencySelection').addEventListener('click', () => { effTrainingSelectedUid = null; renderEfficiencyTraining(); });
    $('newDefenseScenario').addEventListener('click', newDefenseScenario);
    $('refreshDefense').addEventListener('click', newDefenseScenario);
    $('submitDefense').addEventListener('click', submitDefense);
    $('saveSettings').addEventListener('click', saveSettingsFromForm);
    $('settingTheme').addEventListener('change', () => {
      settings.theme = $('settingTheme').value === 'dark' ? 'dark' : 'light';
      applyTheme(settings.theme);
      saveJSON(STORAGE.settings, settings);
      showToast(settings.theme === 'dark' ? '다크 모드를 적용했습니다.' : '라이트 모드를 적용했습니다.');
    });
    document.addEventListener('error', event => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement) || !img.classList.contains('tile-art') || img.dataset.fallbackApplied) return;
      img.dataset.fallbackApplied = 'true';
      const type = Number(img.dataset.tileType);
      const red = img.dataset.tileRed === '1';
      const fallback = document.createElement('span');
      fallback.className = 'tile-fallback-face';
      if (type >= 0 && type < 34) fallback.textContent = type >= 27 ? E.HONORS[type - 27] : `${type % 9 + 1}${['만', '통', '삭'][Math.floor(type / 9)]}`;
      else fallback.textContent = '?';
      if (red) fallback.classList.add('red-fallback');
      const badge = img.nextElementSibling;
      if (badge?.classList.contains('tile-rank-corner')) badge.remove();
      img.replaceWith(fallback);
    }, true);
    $('startWithSettings').addEventListener('click', async () => {
      saveSettingsFromForm();
      await startNewGame(false);
    });
    $('exportData').addEventListener('click', exportData);
    $('importData').addEventListener('change', event => importData(event.target.files?.[0]));
    $('clearHistory').addEventListener('click', async () => {
      const yes = await askConfirm('기록 초기화', '이 브라우저에 저장된 완료 국 기록을 모두 삭제할까요? 진행 중인 국은 유지됩니다.', '기록 삭제');
      if (!yes) return;
      history = [];
      saveAll();
      renderAll();
      showToast('완료 국 기록을 초기화했습니다.');
    });

    document.body.addEventListener('click', event => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'select-tile') {
        if (!activePlayerTurn()) return;
        const uid = Number(target.dataset.uid);
        const player = game.players[0];
        if (player.riichi && uid !== player.lastDrawUid) { showMessage('리치 후에는 쯔모패만 버릴 수 있습니다.', 'warning'); return; }
        selectedUid = selectedUid === uid ? null : uid;
        liveHintVisible = false;
        renderTable();
        return;
      }
      if (action === 'select-efficiency-tile') {
        if (effTrainingSubmitted) return;
        const uid = Number(target.dataset.uid);
        effTrainingSelectedUid = effTrainingSelectedUid === uid ? null : uid;
        renderEfficiencyTraining();
        return;
      }
      if (action === 'select-defense-tile') {
        if (defenseSubmitted) return;
        const uid = Number(target.dataset.uid);
        defenseSelectedUid = defenseSelectedUid === uid ? null : uid;
        renderDefense();
        return;
      }
      if (action === 'open-decision') {
        openDecision(target.dataset.id, 'efficiency');
        return;
      }
      if (action === 'open-review-decision') {
        selectedDecisionId = Number(target.dataset.id);
        renderReviewTimeline();
        renderReviewDetail();
        return;
      }
      if (action === 'go-review') { switchView('review'); return; }
      if (action === 'go-efficiency') { switchView('efficiency'); return; }
      if (action === 'new-game') { startNewGame(false); return; }
    });
  }

  function initialize() {
    applyTheme(settings.theme);
    attachEvents();
    newEfficiencyTraining();
    newDefenseScenario();
    if (game.phase === 'turn' && game.currentTurn === 0 && game.players[0].hand.length === 13) E.drawHumanTurn(game);
    renderAll();
    if (game.phase === 'turn' && game.currentTurn !== 0) {
      showMessage('저장된 진행 중인 국을 이어서 진행합니다.', 'neutral');
      driveToHuman();
    } else if (game.phase === 'turn' && game.currentTurn === 0 && game.players[0].hand.length === 14) {
      showMessage('국을 시작했습니다. 공개 정보와 내 손패를 확인하세요.');
    } else if (game.phase === 'ronOffer') {
      showMessage('저장된 론 선택 상황을 복원했습니다.', 'warning');
    }
  }

  initialize();
})();

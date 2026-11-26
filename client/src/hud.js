// DOM overlay: stats bar, toasts, aim readout, and the menu/clear/over/board
// screens. Pure view: it holds no game state, it just shows what main.js says.
const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'clear', 'over', 'board', 'pause'];

export function createHud() {
  let toastTimer = 0;

  function show(name) {
    for (const s of SCREENS) $(`screen-${s}`).classList.toggle('hidden', s !== name);
  }

  function setPlaying(on) {
    $('hud').classList.toggle('hidden', !on);
    if (!on) { aim(null); hint(null); }
  }

  function stats({ index, count, name, shotsLeft, shotsPerLevel, score }) {
    $('hud-level').textContent = `${index + 1}/${count}`;
    $('hud-level-name').textContent = name;
    $('hud-shots').innerHTML = Array.from({ length: shotsPerLevel }, (_, i) =>
      `<span class="${i < shotsLeft ? '' : 'used'}">●</span>`).join('');
    $('hud-score').textContent = score;
  }

  function aim(a) {
    const el = $('aim-readout');
    if (!a) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    let deg = -a.angle; // show "up" as positive, which feels natural on screen
    if (deg > 180) deg -= 360; if (deg <= -180) deg += 360;
    el.textContent = `angle ${deg.toFixed(1)}°   power ${Math.round(a.power * 100)}%`;
  }

  function hint(text) {
    const el = $('hint');
    el.classList.toggle('hidden', !text);
    if (text) el.textContent = text;
  }

  function toast(text, kind = 'warn', ms = 1600) {
    const el = $('toast');
    el.textContent = text;
    el.className = `show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = kind; }, ms);
  }

  function levelClear({ shotNo, points, stars, score, last }) {
    $('clear-title').textContent = shotNo === 1 ? 'Hole in one!' : 'Level cleared!';
    $('clear-detail').textContent =
      `Shot ${shotNo}: +${points}${stars ? ` (incl. ${stars}★)` : ''}. Total ${score}.`;
    $('btn-next').textContent = last ? 'See results' : 'Next level';
    show('clear');
    $('btn-next').focus();
  }

  function gameOver({ title, score, levelsCleared, count }) {
    $('over-title').textContent = title;
    $('over-detail').textContent = `Score ${score} · ${levelsCleared}/${count} levels cleared`;
    $('over-error').textContent = '';
    $('over-form').querySelector('button').disabled = false;
    show('over');
    setTimeout(() => $('over-name').focus(), 50);
  }

  function board(entries, highlight) {
    const list = $('board-list');
    if (!entries) { list.innerHTML = '<li class="empty">Loading…</li>'; show('board'); return; }
    if (!entries.length) { list.innerHTML = '<li class="empty">No scores yet. Be the first!</li>'; show('board'); return; }
    list.replaceChildren(...entries.map((e, i) => {
      const li = document.createElement('li');
      const rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = `${i + 1}.`;
      // textContent, never innerHTML, for player-supplied names.
      const n = document.createElement('span'); n.textContent = e.name;
      const s = document.createElement('span'); s.textContent = `${e.score}  (${e.levelsCleared} lv)`;
      n.prepend(rank);
      li.append(n, s);
      if (highlight && e.name === highlight.name && e.score === highlight.score) li.classList.add('me');
      return li;
    }));
    show('board');
  }

  function on(handlers) {
    const bind = (id, fn) => $(id).addEventListener('click', fn);
    bind('btn-start', handlers.start);
    bind('btn-again', handlers.start);
    bind('btn-board', handlers.board);
    bind('btn-back', handlers.menu);
    bind('btn-next', handlers.next);
    bind('btn-resume', handlers.resume);
    bind('btn-quit', handlers.quit);
    bind('btn-over-skip', handlers.board);
    $('over-form').addEventListener('submit', (e) => {
      e.preventDefault();
      handlers.submit($('over-name').value.trim());
    });
  }

  function submitError(msg) {
    $('over-error').textContent = msg;
    $('over-form').querySelector('button').disabled = false;
  }
  function submitting() { $('over-form').querySelector('button').disabled = true; }

  return { show, setPlaying, stats, aim, hint, toast, levelClear, gameOver, board, on, submitError, submitting };
}

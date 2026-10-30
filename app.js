/* =============================================
   設定
   ============================================= */
const CONFIG = {
  voicesFormUrl: 'https://forms.cloud.microsoft/r/TRF0TDuRkj',
};

const AUDIO_RELEASE_NOTICE = {
  id: '2026-11-audio',
  availableFrom: '2026-11-01',
};

const PAGE_TITLES = {
  home:       '自分に戻る時間',
  meditation: '瞑想',
  stories:    'ショートストーリー',
  journal:    'ジャーナル',
  voices:     'みんなの声',
  updates:    '新しい音声',
};

const MESSAGE_TYPE_LABELS = {
  affirmation: 'アファメーション',
  question:    '今日の問い',
  words:       'ひとこと',
};

const MEDITATION_CATEGORY_LABELS = {
  morning:     '朝の瞑想',
  anxiety:     '不安が強いとき',
  overthinking:'頭がぐるぐるするとき',
  sleep:       '寝る前にゆるみたいとき',
  reset:       '気持ちをリセットしたいとき',
  selfesteem:  '自己肯定感を回復したいとき',
  release:     '手放して眠りたいとき',
  return:      '人に振り回されたあと自分に戻りたいとき',
};

/* =============================================
   データストア
   ============================================= */
const data = {
  messages:       [],
  meditations:    [],
  stories:        [],
  journalPrompts: [],
  voices:         [],
  scheduledAudio: { meditations: [], stories: [] },
};

/* =============================================
   状態
   ============================================= */
let currentPromptIndex = 0;
let resizeBreathingCanvas = null;
let renderedAudioAvailability = null;
let releaseNoticeSeenThisSession = false;
let releaseAudioLoading = false;

/* =============================================
   データ読み込み
   ============================================= */
async function loadData({ forceRefresh = false } = {}) {
  const files = [
    ['messages',       'data/messages.json'],
    ['meditations',    'data/meditations.json'],
    ['stories',        'data/stories.json'],
    ['journalPrompts', 'data/journal-prompts.json'],
    ['voices',         'data/voices.json'],
    ['scheduledAudio', 'data/scheduled-audio.json'],
  ];

  const results = await Promise.allSettled(
    files.map(([, path]) => fetch(path, forceRefresh ? { cache: 'reload' } : undefined).then(r => r.json()))
  );

  results.forEach((result, i) => {
    const [key] = files[i];
    if (result.status === 'fulfilled') {
      data[key] = result.value;
    } else {
      console.warn(`${files[i][1]} の読み込みに失敗しました`);
    }
  });

  data.meditations = mergeAudioCatalog(data.meditations, data.scheduledAudio.meditations || []);
  data.stories = mergeAudioCatalog(data.stories, data.scheduledAudio.stories || []);
  refreshScheduledAudioContent();
  return { updated: results.filter(result => result.status === 'fulfilled').length, failed: results.flatMap((result, i) => result.status === 'rejected' ? [files[i][1]] : []) };
}

// 通常データにも同じ音声が入った場合は、二重に表示しない。
function mergeAudioCatalog(baseItems, scheduledItems) {
  const itemsByUrl = new Map(baseItems.map(item => [item.audioUrl, item]));
  scheduledItems.forEach(item => {
    const existing = itemsByUrl.get(item.audioUrl);
    itemsByUrl.set(item.audioUrl, existing
      ? { ...item, ...existing, availableFrom: item.availableFrom }
      : item);
  });
  return Array.from(itemsByUrl.values());
}

function isAudioAvailable(item) {
  if (!item.availableFrom) return true;
  const [year, month, day] = item.availableFrom.split('-').map(Number);
  const releaseDay = Date.UTC(year, month - 1, day) / 86400000;
  return getJstDayNumber() >= releaseDay;
}

// 公開対象が変わったときだけ一覧を更新し、同日中の再生を妨げない。
function refreshScheduledAudioContent() {
  renderReleaseNotice();
  const signature = JSON.stringify([
    data.meditations.filter(isAudioAvailable),
    data.stories.filter(isAudioAvailable),
  ]);
  if (signature === renderedAudioAvailability) return;
  renderMeditations();
  renderStories();
  renderedAudioAvailability = signature;
}

/* =============================================
   ナビゲーション
   ============================================= */
function navigateTo(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const page = document.getElementById(`page-${pageId}`);
  const btn  = document.querySelector(`.nav-btn[data-page="${pageId}"]`);
  if (page) page.classList.add('active');
  if (btn)  btn.classList.add('active');

  const titleEl = document.getElementById('header-title');
  if (titleEl) titleEl.textContent = PAGE_TITLES[pageId] || '小さな部屋';

  window.scrollTo?.({ top: 0, left: 0, behavior: 'instant' });

  // 画面ごとの描画
  if (pageId === 'home')       renderHome();
  if (pageId === 'meditation') renderMeditations();
  if (pageId === 'stories')    renderStories();
  if (pageId === 'journal')    renderJournal();
  if (pageId === 'voices')     renderVoices();
  if (pageId === 'updates')    return renderReleaseAudioPage();
}

/* =============================================
   呼吸のアニメーション
   ============================================= */
function startBreathing() {
  const circle = document.getElementById('breathing-circle');
  const text   = document.getElementById('breathing-text');
  if (!circle || !text) return;

  const phases = [
    { text: '息を吸って',     expanded: true,  ms: 4000 },
    { text: 'そのまま',       expanded: true,  ms: 4000 },
    { text: 'ゆっくり吐いて', expanded: false, ms: 4000 },
    { text: 'そのまま',       expanded: false, ms: 4000 },
  ];

  let i = 0;
  function tick() {
    const phase = phases[i];
    text.textContent = phase.text;
    circle.classList.toggle('expanded', phase.expanded);
    i = (i + 1) % phases.length;
    setTimeout(tick, phase.ms);
  }
  tick();
}

/* =============================================
   ホーム ── 今日のメッセージ
   ============================================= */
function renderHome() {
  renderHomeDailyMessage();
  renderReleaseNotice();
  if (resizeBreathingCanvas) resizeBreathingCanvas();
  if (data.messages.length === 0) return;

  const msg   = data.messages[Math.floor(Math.random() * data.messages.length)];
  const badge = document.getElementById('message-type');
  const textEl = document.getElementById('today-message');

  if (badge)  badge.textContent  = MESSAGE_TYPE_LABELS[msg.type] || '';
  if (textEl) textEl.textContent = msg.text;
}

/* =============================================
   瞑想リスト
   ============================================= */
function renderMeditations() {
  const quicknav = document.getElementById('meditation-quicknav');
  const list = document.getElementById('meditation-list');
  if (!list) return;
  list.innerHTML = '';
  if (quicknav) quicknav.innerHTML = '';

  const availableMeditations = data.meditations.filter(isAudioAvailable);
  if (availableMeditations.length === 0) {
    list.innerHTML = '<p class="empty-msg">瞑想コンテンツを準備中です。</p>';
    return;
  }

  const groups = {};

  availableMeditations.forEach(item => {
    const category = item.category || 'other';
    if (!groups[category]) groups[category] = [];
    groups[category].push(item);
  });

  const categoryOrder = [
  "朝の瞑想",
  "気分で選ぶ",
  "夜の瞑想"
];

categoryOrder
  .filter(category => groups[category])
  .forEach(category => {
    const label = MEDITATION_CATEGORY_LABELS[category] || category;
     
    const sectionId = `meditation-section-${category}`;
const icons = {
  "朝の瞑想": "🌅",
  "気分で選ぶ": "🌿",
  "夜の瞑想": "🌙"
};
    if (quicknav) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quick-nav-item';
      btn.dataset.target = sectionId;
      btn.innerHTML = `
        <span class="quick-nav-label">${escHtml(label)}</span>
        <span class="quick-nav-arrow" aria-hidden="true">›</span>
      `;
      quicknav.appendChild(btn);
    }

    const section = document.createElement('section');
    section.className = 'content-section';
    section.id = sectionId;

    const heading = document.createElement('h3');
    heading.className = 'section-title';
    heading.textContent = `${icons[category] || "🌸"} ${label}`;
    section.appendChild(heading);

    groups[category].forEach(item => {
      const cardId = `meditation-${item.category}-${item.title}`;

      const card = document.createElement('div');
      card.className = 'content-card';
      card.id = cardId;
      card.innerHTML = `
        <div class="card-title">${escHtml(item.title)}</div>
        <div class="card-desc">${escHtml(item.description)}</div>
        <div class="card-meta">${escHtml(item.duration)}</div>
        <button class="card-play-btn"
          data-url="${escAttr(item.audioUrl)}"
          data-title="${escAttr(item.title)}">
          ▶ 聴く
        </button>
      `;
      section.appendChild(card);
    });

    list.appendChild(section);
  });
}

/* =============================================
   小話リスト
   ============================================= */
function renderStories() {
  const quicknav = document.getElementById('story-quicknav');
  const list = document.getElementById('story-list');
  if (!list) return;
  list.innerHTML = '';
  if (quicknav) quicknav.innerHTML = '';

  const availableStories = data.stories.filter(isAudioAvailable);
  if (availableStories.length === 0) {
    list.innerHTML = '<p class="empty-msg">ショートストーリーを準備中です。</p>';
    return;
  }

  availableStories.forEach((item, i) => {
    const cardId = `story-${i}`;

    if (quicknav) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quick-nav-item';
      btn.dataset.target = cardId;
      btn.innerHTML = `
        <span class="quick-nav-label">${escHtml(item.title)}</span>
        <span class="quick-nav-arrow" aria-hidden="true">〉</span>
      `;
      quicknav.appendChild(btn);
    }

    const card = document.createElement('div');
    card.className = 'content-card';
    card.id = cardId;
    card.innerHTML = `
      <div class="card-title">${escHtml(item.title)}</div>
      <div class="card-desc">${escHtml(item.description)}</div>
      <div class="card-meta">${escHtml(item.duration)}</div>
      <button class="card-play-btn"
        data-url="${escAttr(item.audioUrl)}"
        data-title="${escAttr(item.title)}">
        ▶ 聴く
      </button>
    `;
    list.appendChild(card);
  });
}

/* =============================================
   11月の追加音声のお知らせ
   ============================================= */
function hasSeenReleaseNotice() {
  if (releaseNoticeSeenThisSession) return true;
  try {
    return localStorage.getItem('release-notice-seen:' + AUDIO_RELEASE_NOTICE.id) === 'seen';
  } catch (_) {
    return false;
  }
}

function markReleaseNoticeSeen() {
  releaseNoticeSeenThisSession = true;
  try {
    localStorage.setItem('release-notice-seen:' + AUDIO_RELEASE_NOTICE.id, 'seen');
  } catch (_) {
    // 保存できない端末でも、この画面では閉じられるようにする。
  }
  renderReleaseNotice();
}

function renderReleaseNotice() {
  const released = isAudioAvailable(AUDIO_RELEASE_NOTICE);
  const seen = hasSeenReleaseNotice();
  const notice = document.getElementById('release-notice');
  const entry = document.getElementById('release-audio-entry');
  if (notice) notice.hidden = !released || seen;
  if (entry) entry.hidden = !released || !seen;
}

function getReleaseAudioItems() {
  const scheduled = data.scheduledAudio || {};
  const releasedItems = items => mergeAudioCatalog([], items || [])
    .filter(item => item.availableFrom === AUDIO_RELEASE_NOTICE.availableFrom)
    .filter(isAudioAvailable);
  return {
    meditations: releasedItems(scheduled.meditations),
    stories: releasedItems(scheduled.stories),
  };
}

function renderReleaseAudioPage() {
  const list = document.getElementById('release-audio-list');
  if (!list) return 0;
  list.innerHTML = '';
  const items = getReleaseAudioItems();
  const sections = [
    ['瞑想', items.meditations],
    ['ショートストーリー', items.stories],
  ];
  let count = 0;
  sections.forEach(([label, audioItems]) => {
    if (audioItems.length === 0) return;
    const section = document.createElement('section');
    section.className = 'content-section';
    const heading = document.createElement('h3');
    heading.className = 'section-title';
    heading.textContent = label + '（' + audioItems.length + '本）';
    section.appendChild(heading);
    audioItems.forEach(item => {
      const card = document.createElement('div');
      card.className = 'content-card';
      card.innerHTML = `
        <div class="card-title">${escHtml(item.title)}</div>
        <div class="card-desc">${escHtml(item.description)}</div>
        <div class="card-meta">${escHtml(item.duration)}</div>
        <button type="button" class="card-play-btn"
          data-url="${escAttr(item.audioUrl)}"
          data-title="${escAttr(item.title)}">▶ 聴く</button>
      `;
      section.appendChild(card);
      count += 1;
    });
    list.appendChild(section);
  });
  if (count === 0) {
    list.innerHTML = '<p class="empty-msg">追加の音声は11月1日からお聴きいただけます。</p>';
  }
  return count;
}

function setReleaseAudioLoading(loading) {
  const labels = {
    'btn-open-release': '新しい音声を見る',
    'release-audio-entry': '11月に追加された音声を見る',
  };
  Object.entries(labels).forEach(([id, label]) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.disabled = loading;
    button.setAttribute('aria-busy', String(loading));
    button.textContent = loading ? '読み込んでいます…' : label;
  });
}

async function openReleaseAudio() {
  if (releaseAudioLoading || !isAudioAvailable(AUDIO_RELEASE_NOTICE)) return;
  releaseAudioLoading = true;
  setReleaseAudioLoading(true);
  const status = document.getElementById('release-load-status');
  if (status) status.textContent = '';
  try {
    await loadData({ forceRefresh: true });
    const items = getReleaseAudioItems();
    if (items.meditations.length !== 3 || items.stories.length !== 3) {
      throw new Error('追加の音声を読み込めませんでした');
    }
    const displayed = navigateTo('updates');
    if (displayed !== 6) throw new Error('追加の音声を表示できませんでした');
    markReleaseNoticeSeen();
    document.getElementById('release-audio-heading')?.focus();
    showToast('新しい音声を表示しました');
  } catch (error) {
    console.warn('追加音声の読み込みに失敗しました:', error);
    if (status) {
      status.textContent = '音声を読み込めませんでした。通信を確認して、もう一度お試しください。';
    }
  } finally {
    releaseAudioLoading = false;
    setReleaseAudioLoading(false);
  }
}

/* =============================================
   ジャーナル
   ============================================= */
function renderJournal() {
  if (data.journalPrompts.length > 0) {
    currentPromptIndex = Math.floor(Math.random() * data.journalPrompts.length);
    showCurrentPrompt();
  }

  // 今日の日付キーで保存済みを復元
  const textarea = document.getElementById('journal-entry');
  // 更新案内から戻った場合にも、書きかけの文章を上書きしない。
  if (journalSessionEdited) return;
  const saved = localStorage.getItem(`journal-${todayKey()}`);
  journalSavedValue = saved || '';
  if (textarea) textarea.value = journalSavedValue;
}

function showCurrentPrompt() {
  const el = document.getElementById('journal-prompt');
  if (el && data.journalPrompts.length > 0) {
    el.textContent = data.journalPrompts[currentPromptIndex];
  }
}

function saveJournal() {
  const textarea = document.getElementById('journal-entry');
  if (!textarea) return;
  const text = textarea.value.trim();
  if (!text) {
    showToast('何か書いてから保存してください');
    return;
  }
  localStorage.setItem(`journal-${todayKey()}`, textarea.value);
  journalSavedValue = textarea.value;
  journalSessionEdited = false;
  const restoreButton = document.getElementById('btn-restore-journal-for-update');
  if (restoreButton) restoreButton.hidden = true;
  showToast('保存しました');
}

function nextPrompt() {
  if (data.journalPrompts.length === 0) return;
  currentPromptIndex = (currentPromptIndex + 1) % data.journalPrompts.length;
  showCurrentPrompt();
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function exportJournal() {
  const entries = Object.keys(localStorage)
    .filter(key => /^journal-\d{4}-\d{2}-\d{2}$/.test(key))
    .map(key => ({ date: key.replace('journal-', ''), text: localStorage.getItem(key) }))
    .filter(entry => entry.text && entry.text.trim())
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  if (entries.length === 0) {
    showToast('まだ記録がありません');
    return;
  }

  const DIVIDER = '----------------------';
  const body = entries
    .map(entry => `日付: ${entry.date}\n\n${entry.text}`)
    .join(`\n\n${DIVIDER}\n\n`);

  const header = '自分に戻る時間\nジャーナルの記録\n\n' + DIVIDER + '\n\n';
  const blob = new Blob([header + body], { type: 'text/plain; charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'journal.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* =============================================
   みんなの声
   ============================================= */
function renderVoices() {
  // フォームリンクを設定
  const formLink = document.getElementById('voices-form-link');
  if (formLink) formLink.href = CONFIG.voicesFormUrl;

  const list = document.getElementById('voices-list');
  if (!list) return;
  list.innerHTML = '';

  if (data.voices.length === 0) {
    list.innerHTML = '<p class="empty-msg">まだ声が届いていません。</p>';
    return;
  }

  data.voices.forEach(item => {
    const card = document.createElement('div');
    card.className = 'voice-card';
    card.innerHTML = `
      <div class="voice-nickname">${escHtml(item.nickname)}</div>
      <div class="voice-text">${escHtml(item.text)}</div>
      ${item.rayComment ? `
        <div class="voice-ray">
          <span class="ray-label">RAY より — </span>${escHtml(item.rayComment)}
        </div>` : ''}
    `;
    list.appendChild(card);
  });
}

/* =============================================
   音声プレーヤー
   ============================================= */
function playAudio(url, title) {
  if (!url || url === '#') {
    showToast('音声ファイルは準備中です');
    return;
  }

  const player  = document.getElementById('audio-player');
  const titleEl = document.getElementById('audio-title-text');
  const frame   = document.getElementById('audio-frame');

  if (titleEl) titleEl.textContent = title;
  // アプリ内で完結させるため、別タブを開かずGoogle Driveのプレーヤーを埋め込む
  if (frame) frame.src = url;

  player.classList.remove('hidden');
  document.querySelector('.app-main').classList.add('audio-open');
}

function closeAudio() {
  const player = document.getElementById('audio-player');
  const frame  = document.getElementById('audio-frame');
  if (frame) frame.src = '';
  if (player) player.classList.add('hidden');
  document.querySelector('.app-main').classList.remove('audio-open');
}

/* =============================================
   トースト通知
   ============================================= */
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3200);
}

/* =============================================
   HTML エスケープ（XSS対策）
   ============================================= */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}

/* =============================================
   イベントリスナー設定
   ============================================= */
function setupListeners() {
  setupAppUpdateControls();
  document.getElementById('btn-open-release')?.addEventListener('click', openReleaseAudio);
  document.getElementById('release-audio-entry')?.addEventListener('click', openReleaseAudio);
  document.getElementById('btn-dismiss-release')?.addEventListener('click', () => {
    markReleaseNoticeSeen();
    document.getElementById('release-audio-entry')?.focus();
  });
  document.getElementById('btn-release-home')?.addEventListener('click', () => navigateTo('home'));

  // ナビゲーション
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  // ホーム ── メッセージ更新
  document.getElementById('btn-refresh-message')
    ?.addEventListener('click', renderHome);

  // ジャーナル
  document.getElementById('btn-save-journal')
    ?.addEventListener('click', saveJournal);
  document.getElementById('btn-next-prompt')
    ?.addEventListener('click', nextPrompt);
  document.getElementById('btn-export-journal')
    ?.addEventListener('click', exportJournal);

  // 音声プレーヤー操作
  document.getElementById('audio-close')
    ?.addEventListener('click', closeAudio);

  // カード内の再生ボタン（イベント委任）
  document.addEventListener('click', e => {
  if (e.target.classList.contains('card-play-btn')) {
    const url = e.target.dataset.url;
    const title = e.target.dataset.title;

    if (!url || url === '#') {
      showToast('この音声はまだ準備中です');
      return;
    }

    playAudio(url, title);
  }
});

  // 目次リスト → 該当カードまでスムーズスクロール（イベント委任）
  document.addEventListener('click', e => {
    const item = e.target.closest('.quick-nav-item');
    if (item) {
      const target = document.getElementById(item.dataset.target);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

/* =============================================
   Service Worker 登録
   ============================================= */
/* =============================================
   最新の内容を確認・画面を安全に更新
   ============================================= */
const APP_SHELL_VERSION = 'small-room-v13';
const appUpdateState = {
  registrationPromise: null,
  checking: null,
  ready: false,
  lastCheck: 0,
};
let journalSavedValue = '';
let journalSessionEdited = false;

function setAppUpdateCheckStatus(message) {
  const status = document.getElementById('app-update-check-status');
  if (status) status.textContent = message;
}

function renderAppUpdateNotice(message) {
  const notice = document.getElementById('app-update-notice');
  if (notice) notice.hidden = !appUpdateState.ready;
  const text = document.getElementById('app-update-message');
  if (text) text.textContent = message || '新しい画面の準備ができました。「最新の画面に更新」を押してください。';
}

function receiveAppVersion(event) {
  if (event.data?.type !== 'SELF_CARE_APP_VERSION') return;
  if (event.data.version && event.data.version !== APP_SHELL_VERSION) {
    appUpdateState.ready = true;
    renderAppUpdateNotice();
    setAppUpdateCheckStatus('新しい画面があります。画面上部の「最新の画面に更新」を押してください。');
  }
}

function requestActiveAppVersion() {
  navigator.serviceWorker?.controller?.postMessage({ type: 'GET_SELF_CARE_APP_VERSION' });
}

async function checkAppUpdates({ manual = false, refreshData = true } = {}) {
  if (appUpdateState.checking) return appUpdateState.checking;
  if (!manual && Date.now() - appUpdateState.lastCheck < 5 * 60 * 1000) return;
  appUpdateState.lastCheck = Date.now();
  const button = document.getElementById('btn-check-app-update');
  if (button) button.disabled = true;
  if (manual) setAppUpdateCheckStatus('新しい内容を確認しています…');
  appUpdateState.checking = (async () => {
    const registration = await appUpdateState.registrationPromise;
    const tasks = [];
    if (refreshData) tasks.push(loadData({ forceRefresh: true }));
    if (registration) tasks.push(registration.update());
    const results = await Promise.allSettled(tasks);
    requestActiveAppVersion();
    if (appUpdateState.ready) {
      renderAppUpdateNotice();
      if (manual) {
        setAppUpdateCheckStatus('新しい画面があります。画面上部の「最新の画面に更新」を押してください。');
        document.getElementById('app-update-notice')?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
      }
      return;
    }
    if (!manual) return;
    const dataResult = refreshData ? results[0] : null;
    if (dataResult?.status === 'rejected' || dataResult?.value?.updated === 0) {
      setAppUpdateCheckStatus('通信できませんでした。接続後に、もう一度「更新を確認」を押してください。');
    } else if (dataResult?.value?.failed?.length) {
      setAppUpdateCheckStatus('一部の内容を読み込めませんでした。少し待って、もう一度「更新を確認」を押してください。');
    } else if (results.some(result => result.status === 'rejected')) {
      setAppUpdateCheckStatus('音声などの内容を読み込みました。画面の更新は、次にオンラインで開いたときに確認します。');
    } else {
      setAppUpdateCheckStatus('音声・お知らせの内容を読み込みました。新しい画面がある場合は、上に更新ボタンが表示されます。');
    }
  })().finally(() => {
    appUpdateState.checking = null;
    if (button) button.disabled = false;
  });
  return appUpdateState.checking;
}

function applyAppUpdate() {
  if (!appUpdateState.ready) return;
  const restoreButton = document.getElementById('btn-restore-journal-for-update');
  if (restoreButton) restoreButton.hidden = true;
  const player = document.getElementById('audio-player');
  if (player && !player.classList.contains('hidden')) {
    renderAppUpdateNotice('音声はそのままお聴きいただけます。聴き終えて音声の「閉じる」を押してから、「最新の画面に更新」を押してください。');
    return;
  }
  if (journalSessionEdited) {
    const isEmpty = document.getElementById('journal-entry')?.value === '';
    if (restoreButton) restoreButton.hidden = !isEmpty;
    renderAppUpdateNotice(isEmpty
      ? 'ジャーナルが空欄になっています。「保存済みの文章に戻す」を押してから、「最新の画面に更新」を押してください。'
      : '書きかけのジャーナルがあります。「ジャーナル」で「保存する」を押してから、「最新の画面に更新」を押してください。');
    return;
  }
  // 自動では再読み込みしない。保存済みの記録は端末に残る。
  window.location.reload();
}

function setupAppUpdateControls() {
  document.getElementById('btn-open-app-help')?.addEventListener('click', () => {
    const guide = document.getElementById('install-help');
    if (guide) guide.open = true;
    const heading = document.getElementById('app-help-heading');
    heading?.scrollIntoView({ behavior: 'auto', block: 'start' });
    heading?.focus({ preventScroll: true });
  });
  document.getElementById('btn-check-app-update')?.addEventListener('click', () => checkAppUpdates({ manual: true }));
  document.getElementById('btn-apply-app-update')?.addEventListener('click', applyAppUpdate);
  document.getElementById('btn-restore-journal-for-update')?.addEventListener('click', () => {
    const textarea = document.getElementById('journal-entry');
    // 空欄になったときだけ復元ボタンを使う。入力済みの下書きは破棄しない。
    if (!textarea || textarea.value !== '') return;
    textarea.value = journalSavedValue;
    journalSessionEdited = false;
    const restoreButton = document.getElementById('btn-restore-journal-for-update');
    if (restoreButton) restoreButton.hidden = true;
    renderAppUpdateNotice();
  });
  document.getElementById('journal-entry')?.addEventListener('input', event => {
    journalSessionEdited = event.target.value !== journalSavedValue;
    const restoreButton = document.getElementById('btn-restore-journal-for-update');
    if (restoreButton && (!journalSessionEdited || event.target.value !== '')) restoreButton.hidden = true;
  });
  const checkAfterReturn = () => {
    if (!document.hidden) checkAppUpdates();
  };
  document.addEventListener('visibilitychange', checkAfterReturn);
  window.addEventListener('pageshow', checkAfterReturn);
  window.addEventListener('online', checkAfterReturn);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', receiveAppVersion);
    navigator.serviceWorker.addEventListener('controllerchange', requestActiveAppVersion);
  }
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    appUpdateState.registrationPromise = navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then(registration => {
        requestActiveAppVersion();
        return registration;
      })
      .catch(err => {
        console.warn('Service Worker 登録失敗:', err);
        return null;
      });
  }
  // 初回のデータ取得は init が済ませているので重ねて取得しない。
  checkAppUpdates({ refreshData: false });
}


/* =============================================
   初期化
   ============================================= */
async function init() {
  await loadData();
  setupListeners();
  startBreathing();
  renderHome();
  registerSW();
}

document.addEventListener('DOMContentLoaded', init);

/* ========================================
   ホーム：毎日届くメッセージ
   3カテゴリーを交互に表示（各40本・120日で一巡）
   2026年11月1日（日本時間）から追加90本を先に表示
   小さな実験 → 受け取る → 問いかけ
   ======================================== */

const DAILY_MESSAGES = {
  smallExperiments: [
    "鏡の中の自分に、やさしく笑いかけてみる日\n\nもしよかったら、今日は鏡を見た時に、自分に少しだけニッコリ笑いかけてみませんか。無理に元気な顔をしなくても大丈夫。ただ、「今日もここにいてくれてありがとう」と伝えるように、自分の顔を見てみる日です。\n\n読むだけでも、もちろん十分です。",
    "小さな自然に目を向けてみる日\n\nもしよかったら、今日は身近な自然をひとつ見つけてみませんか。道端の草、空の雲、風の音、窓辺の光。たんぽぽでも、葉っぱでも、小さな虫でも大丈夫です。\n\n自然はいつも、何かを頑張らなくても、そこに存在しています。今日はその静かな存在に、少しだけ意識を向けてみる日です。",
    "歯を丁寧に磨いてみる日\n\nもしできそうだったら、今日は歯を少し丁寧に磨いてみませんか。一つひとつの歯を、ゆっくり、やさしく。\n\n人生には、起き上がることさえ大変な日があります。そんな時、大きなことをしようとしなくて大丈夫。\n\n歯を磨くような小さな行動が、止まっていた何かを少しずつ動かしてくれることがあります。\n\n今日は、それだけで十分です。",
    "ゆっくり噛んで食べてみる日\n\nもしよかったら、今日は一口だけでも、ゆっくり味わってみませんか。一口食べたら、少しお箸を置いて、ゆっくり噛んでみる。\n\n味、香り、温かさ、食感。食べることは、体に「生きる力」を受け取らせてあげる時間でもあります。\n\n全部の食事でできなくても大丈夫。一口だけでも十分です。",
    "今まで感謝したことのないものに感謝してみる日\n\nもしよかったら、今日は普段あまり意識しないものに「ありがとう」を向けてみませんか。\n\nトイレ。ベッド。水道の水。電気。空気。毎日自分を支えてくれているものたち。\n\n当たり前だと思っていたものの中に、実はたくさんの豊かさが隠れているかもしれません。",
    "子どもの頃の「大好き」をひとつ思い出してみる日\n\nもしよかったら、今日は子どもの頃に好きだったことをひとつ思い出してみませんか。\n\nラムネ。ブランコ。シャボン玉。絵を描くこと。好きだったお菓子。空想する時間。\n\n今できる小さな形で、その「大好き」に触れてみるのも素敵です。昔の自分が、少し微笑んでくれるかもしれません。",
    "ウィンドウショッピングで、自分の好きを観察してみる日\n\nもし機会があれば、今日はお店やネットの画面を眺めながら、自分がどんな色や形に惹かれるのか観察してみませんか。\n\n買わなくても大丈夫です。選ばなくても大丈夫です。\n\nただ、「私は今、どんな色に目がいくんだろう」「どんな形に心が動くんだろう」と、自分の好きを眺めてみる日です。",
    "とにかく少し笑ってみる日\n\nもしよかったら、今日は少しだけ笑ってみませんか。理由がなくても、ほんの少し口角を上げてみるだけで大丈夫です。\n\n面白い動画を見る。誰かの変な言い間違いを思い出す。自分の失敗をちょっと笑ってみる。\n\n笑いは、心の窓を少し開けてくれることがあります。",
    "あえて全部やらない日\n\nもしできそうだったら、今日は何かひとつ、あえて残してみませんか。\n\n全部終わらせなくても大丈夫。完璧にしなくても大丈夫。「今日はここまで」と決めることも、自分を大切にする選択です。\n\nやり残しがあっても、あなたは大丈夫。今日のあなたは、それで100点です。",
    "ずっと気になっていたことに、小さく触れてみる日\n\nもしよかったら、今日は「いつかやってみたい」と思っていたことに、小さく触れてみませんか。\n\n気になっていた本を1ページ読む。行ってみたい場所を調べる。新しいお茶を飲んでみる。習ってみたいことを検索してみる。\n\n大きな一歩でなくて大丈夫です。ほんの少し近づくだけでも、心は動き始めます。",
    "肩や腕を、少しぶらぶらさせてみる日\n\n今日は、肩や腕を小さく揺らしてみませんか。座ったままでも、手だけでも。心地よいと思えるくらいの動きで十分です。\n\n考えることがいっぱいある時、体も一緒に力を入れていることがあります。上手に動こうとせず、ぶらぶら、ゆらゆら。\n\n何か変わるかどうかを確かめなくても大丈夫。今日は、体に少し自由をあげる日です。",
    "鼻歌で、自分の声を聞いてみる日\n\nもしよかったら、今日は小さく鼻歌を歌ってみませんか。好きな曲のほんの一節でも、その場で思いついた音でも。\n\n誰かに聴かせるためではないから、音が外れても、歌詞がわからなくても平気です。ふんふん、と自分の声が響くのを聞いてみる。\n\nうまく歌うことより、声を出す楽しさに少し触れてみる日です。",
    "自分の手を、やさしく包んでみる日\n\n今日、手が空いた時に、片方の手でもう片方の手をそっと包んでみませんか。指先の感触や、手のひらの温かさを感じてみる。\n\nこの手で、いろいろなことをしてきましたね。洗ったり、運んだり、誰かの背中に触れたり。\n\n「いつもありがとう」。そんな気持ちで、自分の手を少しだけいたわってみる日です。",
    "返事の前に、少し間を置く日\n\n頼まれごとに、すぐ「いいよ」と言ってしまうことはありませんか。今日は一度だけ、「少し考えてから返事をするね」と言ってみるのもよさそうです。\n\n相手の気持ちと同じように、自分の予定や疲れ具合も確かめてみる。その時間を、自分に渡してあげます。\n\n答えを急がずに選ぶことも、やさしい関わり方のひとつです。",
    "「ありがとう」で受け取ってみる日\n\n誰かに褒めてもらったり、親切にしてもらったりしたら、今日は「ありがとう」と、そのまま受け取ってみませんか。\n\n照れくさかったり、何か返さなきゃと思ったりするかもしれませんね。そんな自分の気持ちにも気づきながら、まずは受け取るだけ。\n\n人に渡すことが多いあなたにも、受け取る時間があっていいのです。",
    "スマホを少し休ませる日\n\n今日は、ほんの数分だけ、スマホを手の届かないところに置いてみませんか。お茶を飲む間や、椅子に座ってひと息つく間だけでも。\n\n何かを調べたり、誰かの様子を確かめたりしない時間。その間、自分がどんなふうに過ごしたくなるか、少し眺めてみます。\n\n退屈でも、落ち着かなくても大丈夫。いつもと少し違う時間を試してみるだけです。",
    "上手に描かない、落書きの日\n\n紙の端に、くるくると線を描いてみませんか。丸、波、意味のない形。何を描くか決めずに、手が動きたいほうへ。\n\n作品にしなくていいし、誰にも見せなくて大丈夫です。「これは何？」と説明できなくても、そのままで。\n\n役に立つかどうかを少しお休みして、ただ手を動かして遊んでみる日です。",
    "小さくお願いしてみる日\n\nもし頼めそうな人がいたら、今日は小さなお願いをひとつしてみませんか。「これを持ってもらえる？」「少し話を聞いてもらえる？」くらいのことで。\n\nいつも自分で何とかしていると、頼む言葉が出にくくなることもありますね。まずは、どんな助けがあったらうれしいかを言葉にしてみる。\n\n一人で全部を抱える以外のやり方も、少しずつ試していいのです。",
    "体が楽なほうを選ぶ日\n\n今日は、体に「今、どっちが楽？」と聞きながら、何かひとつ選んでみませんか。座る場所、着る服、部屋の明るさ。背中にクッションを入れるだけでも。\n\nいつもの習慣や見た目のよさより、今の自分の感覚を少し頼りにしてみます。\n\n「こっちのほうが好きだな」。そんな小さな返事が聞こえたら、今日はそれを大切にしてみましょう。",
    "お気に入りを、今日使う日\n\n大切にしまってあるカップや、気に入って買ったハンカチはありますか。今日は、そんなお気に入りをひとつ使ってみませんか。\n\n特別なお客様が来る日でなくても、お祝いの日でなくても。いつもの暮らしに、自分の好きなものを連れてきてあげます。\n\n「いつか」のために取っておいた小さな楽しみを、今日の自分に渡してみる日です。",
    "心に残った言葉を、ひとつ残す日\n\n今日、誰かの言葉や本の一文が心に残ったら、短くメモしてみませんか。正確に覚えていなくても、自分に届いた部分だけで大丈夫です。\n\nなぜ気になったのか、すぐに説明しなくてもかまいません。後から読み返して「ああ、今の私にこれが響いたんだな」と気づくこともあります。\n\n今日は、自分の心が立ち止まった場所に、小さなしおりを挟む日です。",
    "あの頃の自分に、一行届ける日\n\nふと思い浮かぶ昔の自分がいたら、短い言葉を一行、書いてみませんか。「あの時、大変だったね」「よくやっていたね」。今、かけてあげたい言葉で。\n\n写真には写っていなくても、人には見えていなくても、その時を一生懸命に生きていた自分がいました。\n\nうまくまとめなくていいのです。今日のあなたから、そっと一通の便りを届けるように。",
    "「私は」で始まる言葉を使う日\n\n今日は、何かを選ぶ時に「私は、こっちがいいな」と言ってみませんか。食べたいものや、座りたい場所など、小さなことでかまいません。\n\n誰かに伝えても、心の中でつぶやいても。「みんなはどうかな」の前に、自分の希望にも一度、声をかけてあげます。\n\nそのとおりにできるかどうかとは別に、自分の気持ちを知っておく。それも大切な時間です。",
    "予定に、小さな余白をつくる日\n\n今日か明日の予定に、短い空白をひとつ残してみませんか。移動のあと、用事と用事の間など、少しゆっくりできそうなところに。\n\nその時間に何をするかは、まだ決めなくて大丈夫。座るのかもしれないし、ぼんやりするのかもしれません。\n\n先の自分がその時の気分で選べるように、予定を詰めずに残しておく日です。",
    "音をひとつ、聞いてみる日\n\n少し手を止められる時に、今聞こえている音をひとつ探してみませんか。時計の音、遠くの生活音、衣服がこすれる小さな音。\n\n良い音を探さなくても、静かになろうとしなくても大丈夫です。「こんな音がしていたんだな」と、ただ気づいてみる。\n\n頭の中で考えていたことから、今いる場所へ。耳を通して、少し戻ってみる日です。",
    "目につく場所を、ひとつ整える日\n\n机の隅や、いつも座る場所のそば。今日は、小さな一か所だけ、自分が使いやすいようにしてみませんか。物をひとつ動かすだけでも十分です。\n\n部屋全体を片づける必要はありません。人に見せるためでもなく、「ここ、ちょっと気持ちいいな」と自分が思えるくらいで。\n\n暮らしの中に、自分の居場所を少しつくってあげる日です。",
    "小さな願いに、名前をつける日\n\n「こうだったらうれしいな」と思うことを、小さな紙にひとつ書いてみませんか。誰かとゆっくり話したい、好きな場所で過ごしたい。ささやかな願いで大丈夫です。\n\n今すぐかなえる方法まで考えなくてもかまいません。自分が何を望んでいるのか、まずは見える形にしてみます。\n\n願いを持っている自分を、そっと認めてあげる日です。",
    "今日の気持ちに、色をつける日\n\nもし今の気持ちに色があるとしたら、何色でしょう。紙にその色を少し塗っても、頭の中で思い浮かべてもかまいません。\n\n明るい色を選ばなくて大丈夫です。灰色の日も、いろいろな色が混ざる日もありますね。言葉にしにくい気持ちを、色に手伝ってもらいます。\n\n「今日はこんな感じなんだな」。直そうとせず、一度眺めてみる日です。",
    "小さなうれしさを、伝えてみる日\n\n今日、ちょっとうれしかったことがあったら、話せそうな人にひとつ伝えてみませんか。「こんなことがあったんだよ」と、短いひとことでも。\n\n大きなニュースでなくていいのです。おいしかったものや、思いがけず空いた時間。自分がうれしいと思ったことなら何でも。\n\n話す相手が浮かばなければ、メモに残してみても。小さな喜びに、もう一度出会う時間です。",
    "一日の終わりに、合図をつくる日\n\n今日は、用事を終えて休む前に、自分なりの小さな合図をつくってみませんか。手帳を閉じる、照明を少し落とす、「今日はここまで」と声にする。\n\n頭の中では、まだ続きを考えているかもしれませんね。それでも、一度区切りをつけてみます。\n\n「おつかれさま」。誰かを見送る時のように、今日を過ごした自分にも、やさしく声をかけてあげる日です。",
    "宇宙よ、今日は私にマジックを見せて\n\nもしよかったら、今日はそんなふうに心の中で呼びかけてみませんか。\n思いがけない出会いや、ふと目に入った美しいもの。小さな「おや？」を楽しむ一日に。何も見つからなくても、それで大丈夫です。",
    "足元の土地に、ありがとう\n\nもしよかったら、今いる土地にそっと「ありがとう」を。\nここには、私たちより前に、人や動物や草木が生きていました。名前を知らないいのちの続きを、少しだけ感じてみませんか。",
    "上手にできなくてもいい遊び\n\nもしよかったら、お手本を見ずに猫を描いたり、でたらめな歌を作ったりしてみませんか。\n「あれ、変になっちゃった」。そんな予想外を楽しむ日。完成しなくても、うまくできなくても大丈夫です。",
    "小さなものを、ひとつ作る日\n\nもし気が向いたら、おにぎり、短いお話、紙の端に描く模様など、小さなものを作ってみませんか。\n仕上がりは気にせず、手を動かす時間を楽しんでみる。途中のままでも大丈夫です。",
    "好きな香りに、気づいてみる日\n\n今日は、好きな香りに少し気づいてみませんか。\nお米が炊ける匂い、コーヒー、石けん。「ああ、これが好き」。そんな自分の反応を、そっと楽しんでみる日です。",
    "本当の気持ちを、ひとことだけ\n\nもし伝えられそうなら、「ありがとう」「手を貸して」「私はこっちが好き」。\n今日は、本当の気持ちをひとことだけ伝えてみませんか。心の中で言葉にするだけでも、大丈夫です。",
    "つながってきた命に、ありがとう\n\nもしよかったら、自分へと命をつないできた人たちに、心の中で「ありがとう」を。\n名前も顔も知らない人たちの、その先に今日の自分がいます。遠くから続く命に、そっと思いを向ける日です。",
    "心地よい音を、ひとつ\n\nもしよかったら、今日は好きな音に耳を澄ませてみませんか。\n鳥の声、雨の音、音楽、誰かの笑い声。「私はこんな音が好きなんだ」。そう気づくだけでも、うれしい発見です。",
    "木や草花に、「こんにちは」\n\nもし近くに木や草花があったら、心の中で挨拶してみませんか。\n同じ場所で、今日を生きているいのち。返事はなくても、少し親しみを感じられるかもしれません。",
    "いつもの中に、小さな冒険を\n\nもし気が向いたら、いつもの散歩でひとつだけ、違う曲がり角を選んでみませんか。\n知らなかった景色があるかもしれません。出かけない日なら、地図で気になる場所を眺めるだけでも十分です。"
  ],

  receivingMessages: [
    "あなたは、そのままで大丈夫です\n\n今日は、何かをしなくても大丈夫です。何かを変えようとしなくても大丈夫。\n\nただ、この言葉を受け取ってください。\n\nあなたは、そのままで大丈夫です。今日ここにいるあなたに、ちゃんと価値があります。\n\n何もできない日があっても、あなたの価値は少しも減りません。",
    "あなたは愛されています\n\n今日は、ただ受け取る日です。\n\nあなたは愛されています。誰かの役に立っているからではなく、何かを達成したからでもなく、あなたがここにいることそのものが、大切だからです。\n\n今はそう感じられなくても大丈夫。この言葉を、そっと胸の近くに置いてみてください。",
    "あなたは安全で、守られています\n\nもし今、不安や心配があったとしても、この言葉を少しだけ受け取ってみてください。\n\nあなたは安全です。あなたは守られています。\n\n大きな自然の流れ、目に見えない支え、あなたを想う人たち。あなたは、たくさんのつながりの中で生きています。\n\n深呼吸をひとつして、「私は大丈夫」と心の中でつぶやいてみてもいいかもしれません。",
    "あなたは、かけがえのない存在です\n\nどうか、この言葉を受け取ってください。\n\nあなたは、存在する価値のある大切な人です。あなたが今ここに生きていることは、奇跡のようなことです。\n\nあなたにしか見られない景色があります。あなたにしか感じられない心があります。あなたにしか歩めない人生があります。\n\nあなたは、かけがえのない存在です。",
    "あなたは愛のエネルギーそのものです\n\n今日は、何かを頑張らなくても大丈夫です。ただ、この言葉を受け取ってください。\n\nあなたは、愛を探している存在であると同時に、愛のエネルギーそのものでもあります。\n\n優しさ、思いやり、祈り、誰かを想う気持ち。それらは、あなたの中にある愛のあらわれです。\n\nあなたの中には、すでに愛があります。",
    "今の苦しみは、永遠には続きません\n\n今、難しさや辛さの中にいる方もいるかもしれません。この状況がずっと続くように感じる日もあるかもしれません。\n\nでも、すべては少しずつ変化しています。夜がずっと続かないように、雲の向こうに空があるように、また光を感じられる時が来ます。\n\n今は信じきれなくても大丈夫。この言葉を、心の片隅に置いてみてください。",
    "あなたは、幸せになっていい\n\n今日は、この言葉を受け取ってください。\n\nあなたは、苦しむためだけに生きているのではありません。頑張るためだけに生きているのでもありません。\n\nあなたは、豊かさを感じていい。幸せを味わっていい。楽しいことを体験していい。生きている喜びを感じていい。\n\nそして、その中で魂としての学びを深めていく存在です。\n\nあなたは、幸せになっていいのです。",
    "今日もここに来てくれてありがとう\n\nこのアプリを開いてくれて、ありがとうございます。自分に戻る時間を持とうとしていること。自分を大切にしようとしていること。それだけで、とても素晴らしいことです。\n\n何かをしなくても大丈夫。最後まで読めなくても大丈夫。\n\n今日ここに来てくれたあなたに、ありがとう。",
    "あなたは一人ではありません\n\n今日は、この言葉を受け取ってください。\n\nあなたは一人ではありません。\n\n今、誰にもわかってもらえないように感じる時があっても、あなたの存在は、見えないつながりの中にあります。\n\n自然、空、光、過去から続く命、あなたを想う人たち。そして、まだ出会っていない誰か。\n\nあなたは、つながりの中で生きています。どうか、少しだけ安心していてください。",
    "あなたの人生には、まだ美しいものが待っています\n\n今までいろいろなことがあったかもしれません。疲れてしまった日も、諦めそうになった日もあったかもしれません。\n\nそれでも、あなたの人生には、まだ美しいものが待っています。\n\nまだ見ていない景色。まだ出会っていない言葉。まだ感じていない喜び。まだ開いていない扉。\n\n急がなくて大丈夫です。あなたのペースで、少しずつ進んでいけば大丈夫です。",
    "誰にも見えなかった頑張りも、ここにあります\n\n写真に残っていなくても、誰かにほめられなくても、あなたが精一杯過ごした時間は、ちゃんとありました。\n\n言い返すのをこらえた日。何度もやり直した日。いつもどおりの暮らしを、なんとか続けた日。\n\n今日は、その一つひとつに点数をつけずに、「そうだったね」とうなずいてあげてもいいのです。",
    "頼ることも、あなたの力です\n\n自分でできることが増えると、うれしいですよね。でも、何でも一人でできることだけが、強さではありません。\n\n「ここを手伝ってもらえますか」と伝えること。誰かの得意なことを借りること。助けを受け取ること。\n\nこれまで人を支えてきたあなたも、支えてもらう側になっていいのです。",
    "気持ちは、ひとつに決めなくていい\n\nうれしいけれど、少し不安。大切に思っているけれど、今日は会いたくない。そんなふうに、違う気持ちが一緒にいることがあります。\n\nどちらかを消して、きれいにまとめなくてもかまいません。どちらも今のあなたが感じていることです。\n\n心の中に、いろいろな気持ちが座れる場所があってもいいのです。",
    "途中で道を変えてもいい\n\n始めた時には、これが自分の道だと思っていた。それでも、歩いてみて初めてわかることがあります。\n\n続けることも大切な選択です。そして、立ち止まること、別の道を選ぶことも、あなたにできる選択です。\n\nこれまでの時間を無駄にしたくないから、と今の気持ちを置き去りにしなくてもいいのです。",
    "あなたのペースには、あなたの事情があります\n\n周りの人が軽やかに進んで見える日がありますね。でも、その人とあなたでは、抱えているものも、使える時間も違います。\n\n休みながら進む日。ひとつのことに時間をかける日。暮らしを保つだけで精一杯の日。\n\n誰かの速さに合わせる前に、今日のあなたに無理のない歩幅を大切にしていいのです。",
    "「今はできません」と言ってもいい\n\n頼まれると、相手のことを考えて、つい引き受けてしまう。そんなやさしさを持っている方もいると思います。\n\nそのやさしさの中に、自分の体力や時間も入れてあげてください。「今日は難しいです」と伝えることは、相手を大切にしないこととは違います。\n\n引き受けられる範囲を選ぶ権利は、あなたにもあります。",
    "初めてのあなたを、急がせなくていい\n\n初めての場所。初めての役割。初めて自分の気持ちを伝えること。慣れていない時は、ぎこちなくなることもあります。\n\nいきなり上手にできなくても、そこであなたの向き不向きが決まるわけではありません。\n\nわからないところを尋ねながら、少しずつ慣れていく。そんな始まり方を、自分にも許してあげてください。",
    "うまく説明できなくても、気持ちはここにあります\n\nどうしてなのかはわからないけれど、今日は胸がいっぱい。言葉にしようとすると、なんだか違ってしまう。\n\nそんな時、筋の通った説明を完成させなくてもいいのです。「うまく言えないけれど、今はこんな感じ」。それも、あなたの大切な表現です。\n\n言葉になるまで、少し時間がかかる気持ちもあります。",
    "休息は、ごほうびだけではありません\n\n全部終わってから休もう。きちんとできたら、ゆっくりしよう。そう思っていると、休む順番がなかなか回ってこないことがあります。\n\n休息は、頑張った人だけが受け取れる賞品ではありません。何かを始める前にも、途中にも、必要になるものです。\n\n今日は、休むための立派な理由を探さなくてもいいのです。",
    "誰かと違う「好き」を持っていていい\n\nみんながいいと言うものに、心が動かないこともありますね。反対に、誰も気に留めないものが、自分にはとても魅力的なこともあります。\n\nその違いを、直す必要はありません。好みは、多数決で決めなくていいのです。\n\n自分でも説明できない小さな「好き」を、あなた自身が面白がってあげてもいいですね。",
    "何も特別なことがない日にも、暮らしがあります\n\n誰かに報告するほどの出来事がない日。新しいことを何もしていないように感じる日。\n\nそれでも、ごはんを食べたり、窓を開けたり、眠る場所を整えたり。あなたは今日という日を、暮らしてきました。\n\n毎日を特別な一日に仕上げなくてもいいのです。何気ない一日にも、あなたの時間が流れています。",
    "大切にしてきた気持ちは、あなたの中にあります\n\n場所が変わったり、役割を終えたりすると、前の自分が遠くなったように感じることがあります。\n\nけれど、その場所で誰かを思ったこと。夢中になったこと。大切にしようとした気持ちまで、なくなるわけではありません。\n\n形が変わっても、持っていきたいものは選べます。今は、何を持っていくか決めずにいてもいいのです。",
    "うまくいかなかった一日で、あなたの全部は決まりません\n\n言い方を間違えた。予定どおりに進まなかった。そんな一場面が、頭の中で大きくなることがあります。\n\n必要なことを見直したり、伝え直したりすることはできます。でも、自分の全部に「だめ」と判を押さなくてもいいのです。\n\n一つの出来事を、一つの出来事として扱う。今日は、それくらいのやさしさを自分に向けてもいいですね。",
    "比べたあとにも、自分に戻れます\n\n人と比べないようにしようと思っていても、比べてしまう日はありますね。そんな自分を、さらに責めなくてかまいません。\n\nうらやましいと感じたものの中に、自分が大切にしたいことが隠れている場合もあります。\n\n誰かの暮らしから少し目を離して、「私はどうしたいかな」と、自分の方へ戻ってきていいのです。",
    "あなたの意見が、ここにあっていい\n\n人の話をよく聞けることは、素敵な力です。そして、聞いたあとに自分が何を感じたかも、同じように大切です。\n\n「私は少し違うふうに思う」「もう少し考えたい」。そんな言葉を持っていても、誰かとつながることはできます。\n\nすぐに口に出せない時も、心の中の自分の席を、空けておいてあげてください。",
    "小さな「できた」を、受け取っていい\n\nまだ終わっていないことに目が向くと、今日できたことが見えにくくなることがあります。\n\n気になっていた連絡をした。疲れたと伝えた。いったん手を止めた。人からは見えにくい、あなたなりの一歩もあります。\n\n「このくらい誰でもできる」と片づけずに、今日はひとつ受け取ってみてもいいですね。あなたにとっての一歩で十分です。",
    "心が動かない日も、急がなくていい\n\n好きなものを見ても、いつもほど楽しめない。何がしたいか聞かれても、思い浮かばない。そんな日もあります。\n\n今すぐワクワクを見つけて、元気な自分に戻らなくてもかまいません。今日は、心に次の返事を急がせない日でもいいのです。\n\n温かいもの、楽な姿勢、静かな場所。今の自分に合うものがひとつあれば、それを選んでみてください。",
    "心配していた自分にも、やさしさを\n\nあとから振り返ると、「あんなに心配しなくてもよかった」と思うことがありますね。\n\nでも、その時のあなたには、その時に見えていた景色がありました。大切なものを守りたくて、あれこれ考えていたのかもしれません。\n\n「また心配していた」と笑う前に、「気になっていたんだね」と一度うなずいてあげてもいいのです。",
    "「わからない」は、途中の言葉です\n\nこれからどうしたいのか。何を選べばいいのか。すぐには答えが出ないことがあります。\n\n「わからない」と言えることは、自分に正直でいることでもあります。わかったふりをして、急いで結論を出さなくてもいいのです。\n\n少し調べる。誰かと話す。いったん置いておく。答えの手前にも、過ごし方はいろいろあります。",
    "あなたの遊び心に、出番があっていい\n\n役に立つかどうか、上手かどうか。大人になると、始める前にいろいろ考えますね。\n\nでも、面白そうだから触ってみる、なんとなく歌ってみる、少しふざけてみる。そんな時間にも、場所をあげていいのです。\n\n何かを完成させなくても、誰かに見せなくてもかまいません。あなたの中の遊び心は、成果を待っているわけではないのです。",
    "あなたは、愛を受け取っていい\n\n誰かのために動けない日も、うまく笑えない日も。\nあなたが愛ややさしさを受け取っていいことは、変わりません。何かを返さなきゃ、と急がなくても大丈夫です。",
    "今日は、何もしなくていい日\n\n何かを試さなくても、答えを出さなくても大丈夫です。\n何もしない時間にも、あなたはちゃんと存在しています。休んでいるあなたも、大切なあなたです。",
    "知らないところにも、温かなつながりが\n\nふと交わした挨拶や、何気なく笑い合った時間。あなたには小さなことでも、誰かの記憶に温かく残っているかもしれません。全部を確かめなくても、人とのつながりを、そっと信じていていいのです。",
    "ひとりで全部を背負わなくていい\n\nあなたを支えるものは、目に見えるものだけではないのかもしれません。\n大きな自然の中で、誰かの祈りの中で。ひとりで全部を背負わずに、支えてもらっていいのです。",
    "呼吸のように、任せていいこともあります\n\nあなたが眠っている間も、呼吸や心臓の働きは続いています。いのちには、考えて指示しなくても続いている営みがあります。全部を自分で動かし続けなくてもいい。任せられるものに、支えられていていいのです。",
    "誰かの笑顔を、少し借りてもいい\n\n誰かの笑いにつられて、こちらも笑ってしまう。そんなふうに、喜びは人から人へ広がることがあります。自分だけで楽しい気分を作れない日も、誰かの明るさを少し借りていい。受け取った喜びに、お返しは急がなくて大丈夫です。",
    "言葉が届くまで、時間がかかってもいい\n\n読んだ時には、よくわからなかった言葉が、何日かあとにふと思い出されることがあります。今すぐ深く感じたり、意味を見つけたりしなくても大丈夫。心には、心の受け取るタイミングがあるのかもしれません。",
    "できなくても、それで100点\n\n今日のメッセージを試せなくても、大丈夫です。\n読んだだけの日も、途中で閉じた日も。あなたの大切さに、できた数は関係ありません。今日のあなたに、「それで100点」を贈ります。",
    "あなたの人生は、学びの途中です\n\nうれしかった日も、思うようにいかなかった日も。\n笑うこと、迷うこと、誰かと出会うことも、魂の学びの一部。立派な答えを出さなくても、あなたの旅は続いています。",
    "声を交わさない、静かな仲間\n\nここでは、何かを説明したり、うまく話したりしなくてもかまいません。同じ空の下で、誰かも自分に戻ろうとしているかもしれません。声を交わさなくても、静かな仲間がいるように、この時間を過ごしていいのです。"
  ],

  questionMessages: [
    "今の私は、本当は何を求めているんだろう？\n\n今日は、答えを出そうとしなくても大丈夫です。ただ、心の中にそっと問いを置いてみてください。\n\n今の私は、本当は何を求めているんだろう？\n\n休みたいのかもしれない。安心したいのかもしれない。誰かにわかってほしいのかもしれない。\n\n答えが出なくても、問いを持つだけで十分です。",
    "最近、心が少し動いた瞬間はいつでしたか？\n\n今日は、こんな問いを心に置いてみませんか。\n\n最近、心が少し動いた瞬間はいつでしたか？\n\nきれいだなと思った景色。おいしいと感じたもの。誰かの言葉。ふと涙が出そうになった瞬間。\n\n小さな心の動きは、あなたの内側からのサインかもしれません。",
    "私がもっと自分に許してあげたいことは何だろう？\n\n今日は、こんな問いをそっと置いてみてください。\n\n私がもっと自分に許してあげたいことは何だろう？\n\n休むこと。間違えること。人に頼ること。完璧でいないこと。楽しむこと。\n\nすぐに答えが出なくても大丈夫です。問いを持つだけで、心の扉が少し開くことがあります。",
    "今日の私に、本当に必要なものは何だろう？\n\n今日は、こんな問いを自分に向けてみませんか。\n\n今日の私に、本当に必要なものは何だろう？\n\n休息。安心。静かな時間。誰かとの会話。温かい飲み物。ひとりになること。\n\n大きな答えでなくて大丈夫です。今の自分に必要なものを、少しだけ聞いてみる日です。",
    "私は、どんな時にほっとするんだろう？\n\n今日は、自分の「ほっとする感覚」に意識を向けてみませんか。\n\nどんな場所にいると、安心しますか。どんな音を聞くと、落ち着きますか。どんな人といると、力が抜けますか。どんな香りが好きですか。\n\n自分がほっとするものを知ることは、自分を大切にする第一歩です。",
    "私が本当は「もう十分」と言ってあげたいことは何だろう？\n\n今日は、こんな問いを置いてみてください。\n\n私が本当は「もう十分」と言ってあげたいことは何だろう？\n\n頑張りすぎていること。抱え込みすぎていること。気にしすぎていること。自分を責め続けていること。\n\n全部終わっていなくても、今日のあなたは、ここまでよくやってきました。",
    "私の中に、まだ眠っている喜びは何だろう？\n\n今日は、こんな問いを心に置いてみませんか。\n\n私の中に、まだ眠っている喜びは何だろう？\n\n昔好きだったこと。いつかやってみたいこと。本当はもっと味わいたいこと。心の奥で小さく光っている願い。\n\nすぐに行動しなくても大丈夫です。今日は、その存在に気づくだけで十分です。",
    "もし何も制限がなかったら、私は何をしてみたい？\n\n今日は、少しだけ自由に想像してみませんか。\n\nもしお金も、年齢も、時間も、人の目も気にしなくてよかったら、私は何をしてみたいだろう？\n\nどこに行きたいだろう。何を学びたいだろう。誰と過ごしたいだろう。どんなふうに生きたいだろう。\n\n現実的かどうかは、今日は考えなくて大丈夫です。自由に想像するだけの日です。",
    "私は、誰にどんな言葉をかけてほしかったんだろう？\n\n今日は、少しやさしく自分に問いかけてみませんか。\n\n私は、誰にどんな言葉をかけてほしかったんだろう？\n\n「よく頑張ったね」「大丈夫だよ」「そばにいるよ」「そのままでいいよ」\n\nもし思い浮かんだ言葉があったら、今日は自分にその言葉をかけてあげてもいいかもしれません。",
    "この1か月、私の中で小さく変わったことは何だろう？\n\n今日は、少しだけ振り返ってみませんか。\n\nこの1か月、私の中で小さく変わったことは何だろう？\n\n少し休めた日。少し笑えた瞬間。少し自分に優しくできたこと。何もできなかったけれど、ここまで来たこと。\n\n大きな変化でなくて大丈夫です。小さな気づきも、ちゃんとあなたの歩みです。\n\n今日のあなたも、それで十分です。",
    "誰にも見せなくても、やってみたいことは何だろう？\n\n評価も発表もない、自分だけの時間があったら。どんなことに手を伸ばしてみたくなりますか。\n\n上手ではない絵。途中までの物語。覚えきれない歌。写真に撮らずに楽しむ景色。\n\n人に見せる形にしなくても、好きでいていいものがありますね。今日は、結果を誰かに届けなくてもよい楽しみを、自由に思い浮かべてみませんか。",
    "自分で選んでもいいことを、誰かに預けていないだろうか？\n\n今日のお茶、週末の過ごし方、身につける色。小さな選択のたびに、誰かの正解を待っていることはあるでしょうか。\n\n相談したいことは相談しながら、自分の気持ちで決められる部分も探してみる。そんな選び方があってもいいですね。\n\n大きな決断を急ぐ必要はありません。今日は、暮らしの中の小さな選択をひとつ眺めてみる問いです。",
    "今日、心に残った言葉は何だろう？\n\n人との会話、本の一行、何気なく聞こえたひとこと。今日は、あとからもう一度思い出した言葉がありましたか。\n\nうれしかった言葉でも、少し引っかかった言葉でもかまいません。そのどこに自分の心が反応したのでしょう。\n\n隠れた意味を見つけなくても大丈夫です。ただ、「私はここが気になったんだな」と気づくための問いです。",
    "自分を急がせている声は、何と言っているだろう？\n\n「早くしなきゃ」「もう遅い」「みんなはできている」。慌ただしい時、心の中ではどんな言葉が流れているでしょう。\n\nその声は、今の状況をそのまま伝えていますか。それとも、少し厳しくなっているでしょうか。\n\n声を消そうとしなくてもかまいません。隣にもう一つ、今の自分に合う声を置くなら、何と言ってあげたいですか。",
    "苦手なことを、一つ楽にする工夫はあるだろう？\n\n苦手なことを、いつも気合いだけで乗り切ろうとしていませんか。\n\n順番を変える。メモを使う。得意な人に一部分を頼む。時間を短く区切る。自分を変える前に、やり方を変えられることもあります。\n\n今日は、頑張りを増やすためではなく、少し楽にするための問いです。思いつかなければ、誰かと一緒に考えてもいいですね。",
    "私が人から受け取ってきたものは、何だろう？\n\n教えてもらったこと。待ってもらった時間。忙しい日にかけてもらった一言。今の自分につながっているものを、ひとつ思い浮かべてみませんか。\n\n大きな恩でなくても、ほんの小さなやりとりでかまいません。\n\nすぐにお返しを考えなくてもいいのです。今日は「受け取っていたんだな」と、そのことに気づくだけの時間です。",
    "私は、どんなふうに人とつながりたいだろう？\n\nたくさん話すのがうれしい日も、同じ場所で静かに過ごしたい日もありますね。\n\n毎日連絡を取りたいのか、時々近況を聞き合いたいのか。人とのつながり方にも、自分なりの心地よさがあるかもしれません。\n\n誰とでも同じでなくてかまいません。今の自分は、どんな関わり方を望んでいるだろう、とそっと尋ねてみる問いです。",
    "「できなかった」のそばに、何があっただろう？\n\n予定していたことができなかった時、理由を聞く前に、自分を責めてしまうことはありませんか。\n\nその日は、ほかに何をしていたでしょう。体力はどれくらいあったでしょう。急に入った用事や、気にかかることはあったでしょうか。\n\n言い訳を探すためではなく、起きていたことを知るために。結果だけでは見えない自分の一日を、少し広く眺めてみませんか。",
    "私が今、選び直せる小さなことは何だろう？\n\n一度決めたことは、ずっと同じように続けなければいけない。そんなふうに感じていることはありますか。\n\n予定を少し減らす。違うやり方を試す。今の気持ちを伝え直す。暮らしの中には、途中で調整できることもありますね。\n\n全部を変える必要はありません。今の自分に合わせて、ひとつだけ選び直せるとしたら、何でしょう。",
    "今日の暮らしに、どんな余白があったらうれしい？\n\n予定と予定の間に、少し時間があること。机の上に何も置かない場所があること。会話の中に、黙っていられる時間があること。\n\nあなたが今ほしい余白は、どんなものでしょう。空いているところを、すぐに埋めなくてもいいとしたら。\n\n実際に作れるかどうかは、あとで考えてもかまいません。今日は、ほしい余白の形を思い浮かべてみる問いです。",
    "私が「自分らしい」と感じるのは、どんな時だろう？\n\n肩書きや役割を少し横に置いたら、自分らしさはどんなところに顔を出すでしょう。\n\n話し始めると止まらない話題。つい手をかけたくなること。誰かが困っている時の関わり方。ひとりでいる時の過ごし方。\n\nひとつの言葉にまとめなくてもかまいません。「これも私だな」と思う場面を、いくつか眺めてみる問いです。",
    "今日、人生は私に何を返してくれた？\n\n今日という一日を、少し違う角度から眺めてみませんか。自分がしたことだけでなく、出会ったものにも目を向けてみる問いです。\n\n思いがけない会話。予定変更でできた時間。知りたかったことにつながる言葉。そんな出会いはあったでしょうか。\n\n何も思い浮かばない日もあります。特別な意味があっても、なくても。ふと思い出すものを、ひとつ眺めてみる時間です。",
    "私がこれからも大切にしたいことは何だろう？\n\n毎日が忙しいと、目の前のことに追われて、自分が大切にしたいものを後回しにしてしまうことがあります。\n\n人との温かな会話。自由に考える時間。正直でいること。美しいものに触れること。あなたの暮らしの中では、何でしょう。\n\n立派な目標にしなくてもかまいません。これからの日々にも連れていきたいものを、ひとつ思い浮かべてみませんか。",
    "写真には写らなかった、私の頑張りは何だろう？\n\n写真を見ると、その前後にあった時間までは写っていないことに気づきます。\n\n準備していたこと。気を配っていたこと。写る人のために動いていたこと。最近の暮らしにも、そんな見えない働きがあるでしょうか。\n\n今日はひとつだけ、思い出せる範囲で。大きな出来事でなくても、今週の小さな場面で十分です。",
    "今日は、どんな気持ちと一緒にいるだろう？\n\n朝と今とでは、気持ちが少し違うかもしれません。ほっとしているところと、気がかりなところが、両方あるかもしれません。\n\nもし今の気持ちを天気にたとえたら、どんな空でしょう。晴れ、曇り、雨、その間のような空もありますね。\n\n名前をつけるのが難しければ、「こんな感じ」のままで。今日は気持ちを変えるより、眺めてみる問いです。",
    "私は何に「正解」を探し続けているんだろう？\n\n情報を集めても、誰かに聞いても、まだ決められないことはありますか。\n\nそのことに一つだけの正解があるのか、それとも、自分の好みで選んでもいい部分があるのか。少し離れて眺めてみませんか。\n\n今すぐ決めるための問いではありません。「私はどう感じる？」という声も、話し合いに加えてあげるような時間です。",
    "私が守りたい、小さな境目はどこだろう？\n\n人と気持ちよく過ごすために、自分にはどんな時間や距離があるとうれしいでしょう。\n\n食事中は連絡を見ないこと。頼まれたら一度予定を確かめること。話したくないことは、今日は話さないこと。\n\n大きなルールを作らなくてもかまいません。自分をすり減らさずにいられる、小さな境目を探してみる問いです。",
    "「助かった」と感じたのは、どんな時だっただろう？\n\n荷物を持ってもらった時。話を最後まで聞いてもらった時。何も聞かずに、そばにいてもらった時。\n\nあなたにとって助けになるのは、どんな関わり方でしょう。人が良かれと思ってしてくれることと、自分が望むことは、違う場合もありますね。\n\n思い当たるものがあれば、覚えておくだけでも。いつか頼みたい時の、小さな手がかりになります。",
    "今日、私を通して何が生きたがっている？\n\n少し不思議な問いかもしれません。今日は、頭できれいな答えを作らずに、この言葉をそっと置いてみませんか。\n\n表に出たがっている好奇心。誰かに向けたい思いやり。描いてみたい色。静かにしていたいという願い。\n\n大きな使命を見つける必要はありません。今の自分の内側で、小さく動いているものがあるかな、と耳を澄ませてみる問いです。",
    "今の私に、合わなくなった習慣はあるだろう？\n\n以前は助けになっていたことが、今は少し窮屈に感じる。そんな変化はありますか。\n\n毎日の予定の入れ方。人への返事の速さ。休みの日の過ごし方。「いつもこうしてきた」を、一度眺めてみるのもよいかもしれません。\n\n変えなければいけない、という問いではありません。今の自分にも合っているかな、と確かめる時間です。",
    "体のどこに「ありがとう」を伝えたい？\n\n見てくれる目、支えてくれる足、休まず動く心臓。\n今日は、体のどこに「ありがとう」を伝えたいですか。調子のよくないところも、あなたと一緒に今日を生きています。",
    "手元に届くまでに、誰の手を通っただろう？\n\n今日の食べものや、いつもの服。手元に届くまでに、どんな人の手を通ってきたのでしょう。顔を知らない誰かの仕事を、少し想像してみる問いです。正しい答えを調べず、思い浮かぶままで大丈夫です。",
    "今日のあなたが選びたい色は？\n\n誰かの好みや流行を、少し横に置いたら。\n今日は、どんな色を身につけたいですか。着慣れた色でも、意外な色でも。「私はこれが好き」という声を、聞いてみる問いです。",
    "小さな頃の私には、何が不思議だろう？\n\nもし、子どもの頃のあなたが今の暮らしをのぞいたら、何を不思議に思うでしょう。「その道具は何？」「今日はどこへ行くの？」。昔の自分の目で、見慣れた今日を少し眺めてみる問いです。",
    "ひとつ「しなくてもいい」にするとしたら？\n\n終わらせること、きちんと答えること、上手に見せること。\n今日ひとつだけ「しなくてもいい」にするとしたら、何でしょう。少し残したままでもよければ、どこで手を止めたいですか。",
    "あなたを支えてくれた存在は？\n\n家族や友人、本の登場人物、大好きなアニメのキャラクター。\nあなたを支えてくれた存在は、誰でしょう。その存在の、どんなところに助けられてきましたか。思い浮かべるだけの日です。",
    "宇宙のどこかに、言葉を届けるなら？\n\n広い宇宙のどこかに、話を聞いてくれる存在がいるとしたら。\n今日は、どんな言葉を届けたいですか。返事を探さなくても大丈夫。想像の中で、自由に話しかけてみる問いです。",
    "今、心地よさそうな手触りは？\n\n柔らかなタオル、なめらかなカップ、着慣れた服。\n今、どんな手触りが心地よさそうですか。体が「これ、好き」と感じるものを、ひとつ思い浮かべてみる問いです。",
    "心に残っている「いつか」は？\n\n「いつかやってみたい」と思っていることは、何でしょう。\n大きな夢でなくていいのです。少し学びたいこと、行ってみたい場所。今も心に残っている、小さな楽しみはありますか。",
    "小さな喜びは、どこにありましたか？\n\nおいしかった一口、誰かのひとこと、ひと息つけた時間。\n今日、ほんの少し心がゆるんだのは、どんな時でしたか。思い浮かばなければ、そのままでも。喜びを探すことも、お休みして大丈夫です。"
  ]
};

// getJstDayNumber() と同じ、日本時間の日付を表す通算日。
const NEW_DAILY_MESSAGES_START_DAY = Date.UTC(2026, 10, 1) / 86400000;
const ORIGINAL_DAILY_MESSAGES_PER_GROUP = 10;

function getJstDayNumber() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  return Math.floor(
    Date.UTC(
      jst.getUTCFullYear(),
      jst.getUTCMonth(),
      jst.getUTCDate()
    ) / 86400000
  );
}

function getTodayDailyMessage() {
  const groups = [
    DAILY_MESSAGES.smallExperiments,
    DAILY_MESSAGES.receivingMessages,
    DAILY_MESSAGES.questionMessages
  ];

  const dayNumber = getJstDayNumber();
  const daysSinceStart = dayNumber - NEW_DAILY_MESSAGES_START_DAY;

  // 10月31日までは、従来の30本をこれまでと同じ順序で表示する。
  if (daysSinceStart < 0) {
    const group = groups[dayNumber % groups.length];
    const messageIndex = Math.floor(dayNumber / groups.length) % ORIGINAL_DAILY_MESSAGES_PER_GROUP;
    return group[messageIndex];
  }

  // 11月1日を追加分の初日にし、既存の追加60本 → 今回の追加30本 → 従来30本の順で一巡する。
  const group = groups[daysSinceStart % groups.length];
  const messageIndex = (ORIGINAL_DAILY_MESSAGES_PER_GROUP + Math.floor(daysSinceStart / groups.length)) % group.length;

  return group[messageIndex];
}

function renderHomeDailyMessage() {
  const message = getTodayDailyMessage();
  const homeMessage = document.getElementById("home-daily-message");
  if (homeMessage && homeMessage.textContent !== message) {
    homeMessage.textContent = message;
  }

  const breathingMessage = document.getElementById("breathing-daily-message");
  if (breathingMessage) {
    const messageHtml = "「" + message.replace(/\n/g, "<br>") + "」";
    if (breathingMessage.innerHTML !== messageHtml) {
      breathingMessage.innerHTML = messageHtml;
    }
  }
}

let dailyMessageRefreshTimer = null;

function scheduleDailyMessageRefresh() {
  if (dailyMessageRefreshTimer !== null) {
    clearTimeout(dailyMessageRefreshTimer);
  }

  // 日本時間の翌日0時に更新する。端末のタイムゾーンには依存しない。
  const nextMidnightUtc = (getJstDayNumber() + 1) * 86400000 - 9 * 60 * 60 * 1000;
  const delay = Math.max(0, nextMidnightUtc - Date.now()) + 100;
  dailyMessageRefreshTimer = setTimeout(() => {
    renderHomeDailyMessage();
    refreshScheduledAudioContent();
    scheduleDailyMessageRefresh();
  }, delay);
}

function refreshDailyMessageSchedule() {
  renderHomeDailyMessage();
  refreshScheduledAudioContent();
  scheduleDailyMessageRefresh();
}

document.addEventListener("DOMContentLoaded", refreshDailyMessageSchedule);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshDailyMessageSchedule();
});

window.addEventListener('focus', refreshDailyMessageSchedule);
window.addEventListener('pageshow', refreshDailyMessageSchedule);
/* ========================================
   ホーム本文メニュー：クリックでページ移動
   ======================================== */

function setupHomeMenuNavigation() {
  const menuButtons = document.querySelectorAll(".home-menu-card");

  menuButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      const page = button.getAttribute("data-page");
      if (!page) return;

      navigateTo(page);
    });
  });
}

document.addEventListener("DOMContentLoaded", function () {
  setupHomeMenuNavigation();
});
/* =============================================
   導入フロー
   イントロ → 呼吸 → 今日の一言 → 通常アプリ
   ============================================= */
/* =============================================
   導入フロー
   イントロ → 呼吸＋今日の一言 → 通常アプリ
   ============================================= */
document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;

  const introScreen = document.getElementById('intro-screen');
  const breathingScreen = document.getElementById('breathing-screen');
  const messageScreen = document.getElementById('message-screen');

  const guideCircle = document.getElementById('breathing-guide-circle');
  const guidePhase = document.getElementById('breathing-guide-phase');
  const guideCount = document.getElementById('breathing-guide-count');

  const skipBreathingBtn = document.getElementById('btn-skip-breathing');

  const breathingDailyMessage = document.getElementById('breathing-daily-message');

  if (!introScreen || !breathingScreen || !guideCircle || !guidePhase || !guideCount) return;

  const todayMessage = getTodayDailyMessage();

  if (breathingDailyMessage) {
    breathingDailyMessage.innerHTML = "「" + todayMessage.replace(/\n/g, "<br>") + "」";
  }

  let breathingTimer = null;
  let flowFinished = false;
  let currentStepIndex = 0;
  let currentCount = 1;
  let completedCycles = 0;

  const breathingSteps = [
    { phase: '吸って', seconds: 3, className: 'inhale' },
    { phase: '止めて', seconds: 3, className: 'hold' },
    { phase: '吐いて', seconds: 6, className: 'exhale' }
  ];

  function showIntro() {
    introScreen.classList.remove('hidden');
    breathingScreen.classList.add('hidden');
    if (messageScreen) messageScreen.classList.add('hidden');
  }

  function showBreathing() {
    introScreen.classList.add('hidden');
    breathingScreen.classList.remove('hidden');
    if (messageScreen) messageScreen.classList.add('hidden');
    startBreathingGuide();
  }

  function finishOnboarding() {
    if (flowFinished) return;
    flowFinished = true;

    clearInterval(breathingTimer);

    introScreen.classList.add('hidden');
    breathingScreen.classList.add('hidden');
    if (messageScreen) messageScreen.classList.add('hidden');

    body.classList.remove('onboarding-active');
  }

  let lastBreathingClassName = '';

function updateBreathingDisplay() {
  const step = breathingSteps[currentStepIndex];

  guidePhase.textContent = step.phase;
  guideCount.textContent = currentCount;

  // フェーズが変わった時だけ、円の動きを切り替える
  if (lastBreathingClassName !== step.className) {
    guideCircle.classList.remove('inhale', 'hold', 'exhale', 'expand');
    guideCircle.classList.add(step.className);
    lastBreathingClassName = step.className;
  }
}

  function startBreathingGuide() {
    clearInterval(breathingTimer);

    currentStepIndex = 0;
    currentCount = 1;
    completedCycles = 0;

    updateBreathingDisplay();

    breathingTimer = setInterval(() => {
      const step = breathingSteps[currentStepIndex];

      currentCount++;

      if (currentCount > step.seconds) {
        currentStepIndex++;
        currentCount = 1;

        if (currentStepIndex >= breathingSteps.length) {
          currentStepIndex = 0;
          completedCycles++;

          // 1サイクル終わったらホーム画面へ
          if (completedCycles >= 1) {
            finishOnboarding();
            return;
          }
        }
      }

      updateBreathingDisplay();
    }, 1000);
  }

if (skipBreathingBtn) {
  const skipBreathing = (event) => {
    event.preventDefault();
    event.stopPropagation();
    finishOnboarding();
  };

  skipBreathingBtn.onclick = skipBreathing;
  skipBreathingBtn.addEventListener('click', skipBreathing);
  skipBreathingBtn.addEventListener('pointerup', skipBreathing);
  skipBreathingBtn.addEventListener('touchend', skipBreathing, { passive: false });
}
  body.classList.add('onboarding-active');
  showIntro();

  setTimeout(() => {
    if (!flowFinished) {
      showBreathing();
    }
  }, 1800);
});



/* =============================================
   設定
   ============================================= */
const CONFIG = {
  // みんなの声フォームのURLをここに入れてください
  voicesFormUrl: '#',
};

const PAGE_TITLES = {
  home:       '自分に戻る時間',
  meditation: '瞑想',
  stories:    '小話',
  journal:    'ジャーナル',
  voices:     'みんなの声',
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
};

/* =============================================
   状態
   ============================================= */
let currentPromptIndex = 0;
let isPlaying = false;
let resizeBreathingCanvas = null;

/* =============================================
   データ読み込み
   ============================================= */
async function loadData() {
  const files = [
    ['messages',       'data/messages.json'],
    ['meditations',    'data/meditations.json'],
    ['stories',        'data/stories.json'],
    ['journalPrompts', 'data/journal-prompts.json'],
    ['voices',         'data/voices.json'],
  ];

  const results = await Promise.allSettled(
    files.map(([, path]) => fetch(path).then(r => r.json()))
  );

  results.forEach((result, i) => {
    const [key] = files[i];
    if (result.status === 'fulfilled') {
      data[key] = result.value;
    } else {
      console.warn(`${files[i][1]} の読み込みに失敗しました`);
    }
  });
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

  // 画面ごとの描画
  if (pageId === 'home')       renderHome();
  if (pageId === 'meditation') renderMeditations();
  if (pageId === 'stories')    renderStories();
  if (pageId === 'journal')    renderJournal();
  if (pageId === 'voices')     renderVoices();
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

  if (data.meditations.length === 0) {
    list.innerHTML = '<p class="empty-msg">瞑想コンテンツを準備中です。</p>';
    return;
  }

  data.meditations.forEach(item => {
    const cardId = `meditation-${item.category}`;
    const label  = MEDITATION_CATEGORY_LABELS[item.category] || item.category;

    if (quicknav) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quick-nav-item';
      btn.dataset.target = cardId;
      btn.innerHTML = `
        <span class="quick-nav-label">${escHtml(label)}</span>
        <span class="quick-nav-arrow" aria-hidden="true">〉</span>
      `;
      quicknav.appendChild(btn);
    }

    const card = document.createElement('div');
    card.className = 'content-card';
    card.id = cardId;
    card.innerHTML = `
      <div class="card-category">${escHtml(label)}</div>
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
   小話リスト
   ============================================= */
function renderStories() {
  const quicknav = document.getElementById('story-quicknav');
  const list = document.getElementById('story-list');
  if (!list) return;
  list.innerHTML = '';
  if (quicknav) quicknav.innerHTML = '';

  if (data.stories.length === 0) {
    list.innerHTML = '<p class="empty-msg">小話コンテンツを準備中です。</p>';
    return;
  }

  data.stories.forEach((item, i) => {
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
   ジャーナル
   ============================================= */
function renderJournal() {
  if (data.journalPrompts.length > 0) {
    currentPromptIndex = Math.floor(Math.random() * data.journalPrompts.length);
    showCurrentPrompt();
  }

  // 今日の日付キーで保存済みを復元
  const saved = localStorage.getItem(`journal-${todayKey()}`);
  const textarea = document.getElementById('journal-entry');
  if (textarea) textarea.value = saved || '';
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

  const audio    = document.getElementById('audio-element');
  const player   = document.getElementById('audio-player');
  const titleEl  = document.getElementById('audio-title-text');
  const playBtn  = document.getElementById('audio-play-pause');

  // Google Drive 共有リンクを直接再生用URLに変換
  let audioUrl = url;
  const driveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) {
    audioUrl = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
  }

  if (titleEl) titleEl.textContent = title;
  audio.src = audioUrl;
  audio.play().catch(() => showToast('音声の再生に失敗しました'));

  isPlaying = true;
  if (playBtn) playBtn.textContent = '⏸ 一時停止';
  player.classList.remove('hidden');
  document.querySelector('.app-main').classList.add('audio-open');

  audio.onended = () => {
    isPlaying = false;
    if (playBtn) playBtn.textContent = '▶ 聴く';
  };
}

function togglePlayPause() {
  const audio   = document.getElementById('audio-element');
  const playBtn = document.getElementById('audio-play-pause');
  if (!audio) return;

  if (isPlaying) {
    audio.pause();
    isPlaying = false;
    if (playBtn) playBtn.textContent = '▶ 聴く';
  } else {
    audio.play().catch(() => showToast('音声の再生に失敗しました'));
    isPlaying = true;
    if (playBtn) playBtn.textContent = '⏸ 一時停止';
  }
}

function closeAudio() {
  const audio  = document.getElementById('audio-element');
  const player = document.getElementById('audio-player');
  if (audio) { audio.pause(); audio.src = ''; }
  isPlaying = false;
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
  setTimeout(() => toast.classList.remove('show'), 2500);
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

  // 音声プレーヤー操作
  document.getElementById('audio-play-pause')
    ?.addEventListener('click', togglePlayPause);
  document.getElementById('audio-close')
    ?.addEventListener('click', closeAudio);

  // カード内の再生ボタン（イベント委任）
  document.addEventListener('click', e => {
    if (e.target.classList.contains('card-play-btn')) {
      playAudio(e.target.dataset.url, e.target.dataset.title);
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
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('Service Worker 登録失敗:', err);
    });
  }
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
   3日サイクル
   小さな実験 → 受け取る → 問いかけ
   ======================================== */

const DAILY_MESSAGES = {
  smallExperiments: [
    "今日は、ほんの1分だけ、何もしない時間を作ってみませんか。\nただ座って、呼吸を感じるだけで大丈夫です。",
    "今日は、空を一度見上げてみましょう。\n広い空を見ながら、「今ここにいる私」に戻ってみてください。",
    "今日は、自分にやさしい言葉をひとつだけかけてみましょう。\n「よくやってるよ」その一言だけでも十分です。",
    "今日は、何かを急ぎたくなった時に、一度だけ深呼吸してみましょう。\n急がなくても大丈夫、と思い出す小さな実験です。",
    "今日は、誰かに向けていた意識を、少しだけ自分に戻してみましょう。\n「私は今、どう感じているかな」と感じてみてください。",
    "今日は、ひとつだけ「やらなければ」ではなく「やってみようかな」で動いてみましょう。\n小さな選び直しの実験です。",
    "今日は、体のどこか一か所にやさしく意識を向けてみましょう。\n肩、胸、お腹、手のひら。どこでも大丈夫です。",
    "今日は、目に入った小さな美しさをひとつ見つけてみましょう。\n光、花、空、猫のしぐさ。気づくだけで、心は少し戻ってきます。",
    "今日は、完璧にやろうとしなくて大丈夫。\nひとつだけ、少しゆるめてみましょう。",
    "今日は、寝る前にひとつだけ、「今日できたこと」を思い出してみましょう。\n小さなことでも、ちゃんとあなたの力です。"
  ],

  receivingMessages: [
    "あなたは、今のままで、もう十分にがんばっています。\n今日は少し、そのことを受け取ってみてください。",
    "急がなくても大丈夫です。\nあなたには、あなたのペースがあります。\nその歩みは、ちゃんと進んでいます。",
    "何かができた日も、思うようにできなかった日も、\nあなたの価値は変わりません。",
    "今日は、全部を整えようとしなくて大丈夫。\n今ここに戻るだけで、もう十分な一歩です。",
    "あなたの中には、ちゃんと戻る場所があります。\n静かな呼吸の奥に、いつでも自分に戻る道があります。",
    "心が揺れる日があっても大丈夫です。\n揺れていることに気づけるあなたは、\nもう自分を見失ってはいません。",
    "小さなやさしさは、ちゃんと自分の内側に届いています。\n今日も少しだけ、自分にやさしくしてあげてください。",
    "すぐに答えが出なくても大丈夫。\nわからないまま、やさしくそこにいる時間も大切です。",
    "あなたは、誰かの期待に応えるためだけに\n生きているのではありません。\n自分の声を聞いていいのです。",
    "今日ここに来たこと。\nこのメッセージを読んだこと。\nそれだけでも、自分に戻る小さな選択です。"
  ],

  questionMessages: [
    "今の私は、\n本当は何を必要としているだろう？",
    "今日、私が少しだけ\nゆるめてもいいことは何だろう？",
    "私は今、誰かの気持ちを\n背負いすぎていないだろうか？",
    "今日の私に、\nどんな言葉をかけてあげたいだろう？",
    "今、私の体は\n何を伝えてくれているだろう？",
    "もし完璧にできなくてもいいとしたら、\n私は何を選ぶだろう？",
    "今日、私が受け取ってもいい\n小さなやさしさは何だろう？",
    "今の私が、\nもう手放してもいい思い込みは何だろう？",
    "今日の中にあった\n小さな光は何だっただろう？",
    "私は、どんな時に\n「自分に戻っている」と感じるだろう？"
  ]
};

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
  const dayNumber = getJstDayNumber();

  const categoryIndex = dayNumber % 3;
  const messageIndex = Math.floor(dayNumber / 3) % 10;

  const groups = [
    DAILY_MESSAGES.smallExperiments,
    DAILY_MESSAGES.receivingMessages,
    DAILY_MESSAGES.questionMessages
  ];

  return groups[categoryIndex][messageIndex];
}

function renderHomeDailyMessage() {
  const el = document.getElementById("home-daily-message");
  if (!el) return;

  el.textContent = getTodayDailyMessage();
}

document.addEventListener("DOMContentLoaded", function () {
  renderHomeDailyMessage();
});
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
  const homeDailyMessage = document.getElementById('home-daily-message');

  if (!introScreen || !breathingScreen || !guideCircle || !guidePhase || !guideCount) return;

  const dailyMessages = [
    "小さな一歩が、\n未来の大きな自分を\nつくっていきます。",
    "今日は、\nひとつ深く呼吸するたびに、\n心が整っていきます。",
    "完璧じゃなくて大丈夫。\nやさしく進むことが、\nいちばんの力になります。",
    "今ここに戻るだけで、\nあなたの中の静けさは\nちゃんと見つかります。",
    "今日のあなたに必要なのは、\nがんばることより、\n少しゆるむことかもしれません。"
  ];

  const todayIndex = new Date().getDate() % dailyMessages.length;
  const todayMessage = dailyMessages[todayIndex];

  if (breathingDailyMessage) {
    breathingDailyMessage.innerHTML = "「" + todayMessage.replace(/\n/g, "<br>") + "」";
  }

  if (homeDailyMessage) {
    homeDailyMessage.textContent = todayMessage;
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
    skipBreathingBtn.addEventListener('click', finishOnboarding);
  }

  body.classList.add('onboarding-active');
  showIntro();

  setTimeout(() => {
    if (!flowFinished) {
      showBreathing();
    }
  }, 1800);
});
/* =============================================
   設定
   ============================================= */
const CONFIG = {
  voicesFormUrl: 'https://forms.cloud.microsoft/r/TRF0TDuRkj',
};

const PAGE_TITLES = {
  home:       '自分に戻る時間',
  meditation: '瞑想',
  stories:    'ショートストーリー',
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

  const groups = {};

  data.meditations.forEach(item => {
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

  if (data.stories.length === 0) {
    list.innerHTML = '<p class="empty-msg">ショートストーリーを準備中です。</p>';
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
    const url = e.target.dataset.url;

    if (!url || url === '#') {
      alert('この音声はまだ準備中です。');
      return;
    }

    window.open(url, '_blank');
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
    "鏡の中の自分に、やさしく笑いかけてみる日\n\nもしよかったら、今日は鏡を見た時に、自分に少しだけニッコリ笑いかけてみませんか。無理に元気な顔をしなくても大丈夫。ただ、「今日もここにいてくれてありがとう」と伝えるように、自分の顔を見てみる日です。\n\n読むだけでも、もちろん十分です。",
    "小さな自然に目を向けてみる日\n\nもしよかったら、今日は身近な自然をひとつ見つけてみませんか。道端の草、空の雲、風の音、窓辺の光。たんぽぽでも、葉っぱでも、小さな虫でも大丈夫です。\n\n自然はいつも、何かを頑張らなくても、そこに存在しています。今日はその静かな存在に、少しだけ意識を向けてみる日です。",
    "歯を丁寧に磨いてみる日\n\nもしできそうだったら、今日は歯を少し丁寧に磨いてみませんか。一つひとつの歯を、ゆっくり、やさしく。\n\n人生には、起き上がることさえ大変な日があります。そんな時、大きなことをしようとしなくて大丈夫。\n\n歯を磨くような小さな行動が、止まっていた何かを少しずつ動かしてくれることがあります。\n\n今日は、それだけで十分です。",
    "ゆっくり噛んで食べてみる日\n\nもしよかったら、今日は一口だけでも、ゆっくり味わってみませんか。一口食べたら、少しお箸を置いて、ゆっくり噛んでみる。\n\n味、香り、温かさ、食感。食べることは、体に「生きる力」を受け取らせてあげる時間でもあります。\n\n全部の食事でできなくても大丈夫。一口だけでも十分です。",
    "今まで感謝したことのないものに感謝してみる日\n\nもしよかったら、今日は普段あまり意識しないものに「ありがとう」を向けてみませんか。\n\nトイレ。ベッド。水道の水。電気。空気。毎日自分を支えてくれているものたち。\n\n当たり前だと思っていたものの中に、実はたくさんの豊かさが隠れているかもしれません。",
    "子どもの頃の「大好き」をひとつ思い出してみる日\n\nもしよかったら、今日は子どもの頃に好きだったことをひとつ思い出してみませんか。\n\nラムネ。ブランコ。シャボン玉。絵を描くこと。好きだったお菓子。空想する時間。\n\n今できる小さな形で、その「大好き」に触れてみるのも素敵です。昔の自分が、少し微笑んでくれるかもしれません。",
    "ウィンドウショッピングで、自分の好きを観察してみる日\n\nもし機会があれば、今日はお店やネットの画面を眺めながら、自分がどんな色や形に惹かれるのか観察してみませんか。\n\n買わなくても大丈夫です。選ばなくても大丈夫です。\n\nただ、「私は今、どんな色に目がいくんだろう」「どんな形に心が動くんだろう」と、自分の好きを眺めてみる日です。",
    "とにかく少し笑ってみる日\n\nもしよかったら、今日は少しだけ笑ってみませんか。理由がなくても、ほんの少し口角を上げてみるだけで大丈夫です。\n\n面白い動画を見る。誰かの変な言い間違いを思い出す。自分の失敗をちょっと笑ってみる。\n\n笑いは、心の窓を少し開けてくれることがあります。",
    "あえて全部やらない日\n\nもしできそうだったら、今日は何かひとつ、あえて残してみませんか。\n\n全部終わらせなくても大丈夫。完璧にしなくても大丈夫。「今日はここまで」と決めることも、自分を大切にする選択です。\n\nやり残しがあっても、あなたは大丈夫。今日のあなたは、それで100点です。",
    "ずっと気になっていたことに、小さく触れてみる日\n\nもしよかったら、今日は「いつかやってみたい」と思っていたことに、小さく触れてみませんか。\n\n気になっていた本を1ページ読む。行ってみたい場所を調べる。新しいお茶を飲んでみる。習ってみたいことを検索してみる。\n\n大きな一歩でなくて大丈夫です。ほんの少し近づくだけでも、心は動き始めます。"
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
    "あなたの人生には、まだ美しいものが待っています\n\n今までいろいろなことがあったかもしれません。疲れてしまった日も、諦めそうになった日もあったかもしれません。\n\nそれでも、あなたの人生には、まだ美しいものが待っています。\n\nまだ見ていない景色。まだ出会っていない言葉。まだ感じていない喜び。まだ開いていない扉。\n\n急がなくて大丈夫です。あなたのペースで、少しずつ進んでいけば大丈夫です。"
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
    "この1か月、私の中で小さく変わったことは何だろう？\n\n今日は、少しだけ振り返ってみませんか。\n\nこの1か月、私の中で小さく変わったことは何だろう？\n\n少し休めた日。少し笑えた瞬間。少し自分に優しくできたこと。何もできなかったけれど、ここまで来たこと。\n\n大きな変化でなくて大丈夫です。小さな気づきも、ちゃんとあなたの歩みです。\n\n今日のあなたも、それで十分です。"
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

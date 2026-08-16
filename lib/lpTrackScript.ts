// LP計測のクライアント側スニペット（素のJS）。
//
// トップLP（React）と診断LP（public/golmoti.html の素のHTML）の両方から
// 同じロジックを使いたいので、文字列として持って <script> で注入する。
// 依存ゼロ・例外は全て飲み込む（計測が原因でLPが壊れないこと）。
//
// 使い方：window.__lpTrack('top') で初期化。
//   - view を1回送る
//   - スクロール深度 25/50/75/100 をそれぞれ1回送る
//   - [data-lp] を持つ要素のクリックで click を送る（data-lp が target 名）
//   - [data-lp-goal] のクリックで goal を送る（LINE公式への遷移＝最終ゴール）
//   - 離脱時に exit（滞在時間・最大スクロール）を送る
export const LP_TRACK_SCRIPT = `
(function(){
  if (window.__lpTrackReady) return;
  window.__lpTrackReady = true;
  var EP = 'https://app.goltomo.com/api/lp/track';

  function ls(k){ try { return localStorage.getItem(k) || ''; } catch(e){ return ''; } }
  function lsSet(k,v){ try { localStorage.setItem(k,v); } catch(e){} }

  function id(){
    var v = ls('gb_vid');
    if (!v) {
      v = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2,10);
      lsSet('gb_vid', v);
    }
    return v;
  }
  function sid(){
    try {
      var v = sessionStorage.getItem('gb_sid');
      if (!v) { v = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2,8); sessionStorage.setItem('gb_sid', v); }
      return v;
    } catch(e){ return ''; }
  }

  var sp = new URLSearchParams(location.search);
  var rawRef = (sp.get('ref') || sp.get('utm_source') || sp.get('source') || '').toLowerCase().replace(/[^a-z0-9_\\-]/g,'').slice(0,40);
  var menu = (sp.get('e') || '').toLowerCase().replace(/[^a-z0-9_\\-]/g,'').slice(0,40);
  // ?ref= は初回だけ記憶する（回遊しても最初の入口を保つ）
  if (rawRef && !ls('gb_ref')) { lsSet('gb_ref', rawRef); lsSet('gb_ref_at', String(Date.now())); }
  var ref = rawRef || ls('gb_ref') || '';

  var rHost = '';
  try { rHost = document.referrer ? new URL(document.referrer).hostname.replace(/^www\\./,'') : ''; } catch(e){}

  // 入口の判定。?e=（リッチメニュー）→ ?ref= → referrer → direct の順に強い。
  function entryOf(){
    if (menu) return 'richmenu';
    if (/^ig(_|$)|^insta/.test(ref)) return 'instagram';
    if (ref === 'share_img') return 'instagram';
    if (/^line(_|$)/.test(ref) || ref === 'richmenu') return 'richmenu';
    if (rHost) {
      if (/instagram\\.com$/.test(rHost) || /^l\\.instagram/.test(rHost)) return 'instagram';
      if (/(google|yahoo|bing|duckduckgo)\\./.test(rHost)) return 'search';
      if (/(line\\.me|liff\\.line\\.me)$/.test(rHost)) return 'line';
      if (/goltomo\\.com$/.test(rHost)) return 'internal';
      return 'other';
    }
    if (ref) return 'other';
    return 'direct';
  }

  var VID = id(), SID = sid(), ENTRY = entryOf();

  // A/Bテストの割り当て。visitorId から決めるので同じ人には常に同じ面が出る。
  // 決めた結果を <html data-lpv="a|b"> に載せ、CSSで出し分ける（描画後の差し替えが
  // 無いのでチラつかない）。?lpv=a|b を付ければ手元で確認できる。
  var VARIANT = '';
  try {
    var forced = (sp.get('lpv') || '').toLowerCase();
    if (forced === 'a' || forced === 'b') { VARIANT = forced; lsSet('gb_lpv', forced); }
    else {
      VARIANT = ls('gb_lpv');
      if (VARIANT !== 'a' && VARIANT !== 'b') {
        var s = 0;
        for (var i = 0; i < VID.length; i++) s = (s * 31 + VID.charCodeAt(i)) % 100000;
        VARIANT = (s % 2 === 0) ? 'a' : 'b';
        lsSet('gb_lpv', VARIANT);
      }
    }
    document.documentElement.setAttribute('data-lpv', VARIANT);
  } catch(e) { VARIANT = 'a'; }
  var RETURNING = ls('gb_seen') ? 1 : 0;
  lsSet('gb_seen', '1');
  var PAGE = window.__lpPage || 'top';
  var T0 = Date.now();
  var MAX = 0;
  var sentDepth = {};
  var sentGoal = false;
  var left = false;

  function send(event, extra){
    var p = {
      visitorId: VID, sessionId: SID, event: event, page: PAGE, entry: ENTRY,
      ref: ref, referrerHost: rHost, menu: menu,
      isMobile: /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent) ? 1 : 0,
      returning: RETURNING, variant: VARIANT
    };
    if (extra) for (var k in extra) p[k] = extra[k];
    var body = JSON.stringify(p);
    try {
      if (navigator.sendBeacon) { navigator.sendBeacon(EP, new Blob([body], {type:'text/plain'})); return; }
    } catch(e){}
    try { fetch(EP, {method:'POST', headers:{'Content-Type':'text/plain'}, body:body, keepalive:true, mode:'no-cors'}).catch(function(){}); } catch(e){}
  }

  function depthNow(){
    var doc = document.documentElement;
    var sc = window.scrollY || doc.scrollTop || 0;
    var h = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0) - window.innerHeight;
    if (h <= 0) return 100;
    return Math.min(100, Math.round((sc / h) * 100));
  }
  function onScroll(){
    var d = depthNow();
    if (d > MAX) MAX = d;
    [25,50,75,100].forEach(function(m){
      if (MAX >= m && !sentDepth[m]) { sentDepth[m] = 1; send('scroll', {depth:m}); }
    });
  }

  send('view');
  onScroll();
  window.addEventListener('scroll', onScroll, {passive:true});

  // クリック計測。data-lp="名前" が付いた要素、または祖先に付いた要素を拾う。
  document.addEventListener('click', function(ev){
    try {
      var el = ev.target;
      while (el && el !== document.body) {
        if (el.hasAttribute && el.hasAttribute('data-lp')) {
          var name = el.getAttribute('data-lp') || 'unknown';
          var isGoal = el.hasAttribute('data-lp-goal');
          send('click', {target: name});
          if (isGoal && !sentGoal) { sentGoal = true; send('goal', {target: name}); }
          return;
        }
        el = el.parentNode;
      }
    } catch(e){}
  }, true);

  function bye(){
    if (left) return; left = true;
    send('exit', {dwellMs: Date.now() - T0, maxScroll: MAX});
  }
  window.addEventListener('pagehide', bye);
  document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden') bye(); });
})();
`;

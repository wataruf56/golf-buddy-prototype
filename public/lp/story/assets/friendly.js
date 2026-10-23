/* Goltomo friendly story LP (E/F) - shared script */
/*
 * ゴルトモ 親しみ型ストーリーLP（E・F）の動き
 * - あるある：タップで「わかる！」を付け外し。数を下に出す
 * - 行ける日の体験：これから先の土日4日を出す（見本の人数つき）。日付を選ぶとその日に行ける人が並び、
 *   「この日に行ける」を押すと自分が加わる。3人そろったら「チャットが始まります」を出す（実際の仕組みと同じ人数）
 * - 下部の追従バー、ダッシュボードから #dash 付きで開いたときの「一覧へ戻る」
 */
(function () {
  // ---- 一覧へ戻る（確認用） ----
  if (location.hash === "#dash") {
    var back = document.createElement("a");
    back.href = "../index.html";
    back.textContent = "← 一覧へ戻る";
    back.style.cssText = "position:fixed;left:10px;top:10px;z-index:60;background:#2b2620;color:#fff;font-size:12.5px;font-weight:700;" +
      "text-decoration:none;border-radius:999px;padding:6px 12px;box-shadow:0 2px 8px rgba(0,0,0,.25)";
    document.body.appendChild(back);
  }

  // ---- あるある ----
  var aru = document.querySelector(".aru");
  if (aru) {
    var cnt = aru.querySelector(".count");
    var btns = aru.querySelectorAll("button");
    var upd = function () {
      var n = aru.querySelectorAll("button.on").length;
      cnt.innerHTML = n === 0 ? "当てはまるものを、<wbr>タップしてみて<wbr>ください" :
        "わかる！が <b>" + n + "つ</b>" + (n >= 2 ? "<br>続きは、<wbr>あなたの話かも<wbr>しれません。" : "");
    };
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        b.classList.toggle("on");
        b.setAttribute("aria-pressed", b.classList.contains("on") ? "true" : "false");
        upd();
      });
    });
    upd();
  }

  // ---- 行ける日の体験 ----
  var demo = document.querySelector(".demo .box");
  if (demo) {
    var W = ["日", "月", "火", "水", "木", "金", "土"];
    // 見本の人（実在の会員ではない）。f＝女性
    var SAMPLE = [
      [{ n: "ゆい", a: 28, f: 1 }, { n: "けんた", a: 31 }],
      [{ n: "そうた", a: 33 }],
      [{ n: "まな", a: 26, f: 1 }, { n: "りょう", a: 29 }],
      [{ n: "だいき", a: 34 }]
    ];
    // これから先の土日を4日ぶん（来週以降）
    var days = [], d = new Date();
    d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 7);
    while (days.length < 4) { if (d.getDay() === 0 || d.getDay() === 6) days.push(new Date(d)); d.setDate(d.getDate() + 1); }
    var mine = {}, sel = 0;
    var grid = demo.querySelector(".days"), list = demo.querySelector(".who-list"), go = demo.querySelector(".go"),
        hint = demo.querySelector(".hint"), done = demo.querySelector(".done"), doneText = done.querySelector("p");
    var label = function (x) { return (x.getMonth() + 1) + "/" + x.getDate() + "（" + W[x.getDay()] + "）"; };
    function render() {
      grid.innerHTML = days.map(function (x, i) {
        var ppl = SAMPLE[i], dots = ppl.map(function (p) { return '<i class="' + (p.f ? "f" : "") + '"></i>'; }).join("") + (mine[i] ? '<i class="me"></i>' : "");
        return '<button type="button" class="day' + (i === sel ? " sel" : "") + (mine[i] ? " mine" : "") + '" data-i="' + i + '" aria-pressed="' + (i === sel) + '">' +
          '<span class="d">' + (x.getMonth() + 1) + "/" + x.getDate() + '</span><span class="w">' + W[x.getDay()] + '曜</span><span class="dots">' + dots + "</span></button>";
      }).join("");
      var ppl = SAMPLE[sel], total = ppl.length + (mine[sel] ? 1 : 0);
      list.innerHTML = ppl.map(function (p) { return '<span><i class="' + (p.f ? "f" : "") + '"></i>' + p.n + " " + p.a + "</span>"; }).join("") +
        (mine[sel] ? '<span class="me"><i></i>あなた</span>' : "");
      go.textContent = mine[sel] ? "この日に行ける（押すと取り消し）" : label(days[sel]) + "に行ける";
      go.setAttribute("aria-pressed", mine[sel] ? "true" : "false");
      var left = 3 - total;
      hint.innerHTML = left > 0 ? label(days[sel]) + "は、<wbr>あと" + left + "人で<wbr>チャットが<wbr>始まります" : label(days[sel]) + "は、<wbr>3人<wbr>そろいました";
      done.hidden = !(mine[sel] && total >= 3);
      doneText.innerHTML = label(days[sel]) + "に<wbr>行ける人が<wbr>" + total + "人に<wbr>なったので、<wbr>その日の<wbr>チャットが<wbr>始まります。<wbr>運営が<wbr>メンバーを<wbr>紹介します。";
    }
    grid.addEventListener("click", function (e) {
      var b = e.target.closest(".day"); if (!b) return;
      sel = +b.getAttribute("data-i"); render();
    });
    go.addEventListener("click", function () { mine[sel] = !mine[sel]; render(); });
    render();
  }

  // ---- いま募集中（本物の募集。読めなければセクションごと出さない） ----
  var live = document.querySelector(".live");
  if (live && window.fetch) {
    fetch("https://app.goltomo.com/api/rounds/open", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      var W = ["日", "月", "火", "水", "木", "金", "土"], now = Date.now();
      var rs = (d.rounds || []).filter(function (r) { return (r.eventType || "golf") === "golf" && r.date && new Date(r.date).getTime() > now; }).slice(0, 4);
      if (rs.length < 2) return;
      var esc = function (s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
      live.querySelector(".rounds").innerHTML = rs.map(function (r) {
        var x = new Date(r.date), md = (x.getMonth() + 1) + "/" + x.getDate() + "（" + W[x.getDay()] + "）";
        var place = esc(r.area || "") + (r.courseName ? " ・ " + esc(r.courseName) : "");
        var tag = r.beginnerOnly ? "初心者のみ" : (r.isOfficial ? "公式" : "");
        return '<li><span class="dt">' + md + '</span><span class="pl">' + (place || esc(r.title)) + (tag ? "<small>" + tag + "</small>" : "") +
          '</span><span class="nm">' + (r.currentCount || 0) + "/" + (r.maxSpots || "-") + "人</span></li>";
      }).join("");
      var t = new Date();
      live.querySelector(".note").textContent = "実際の募集です（" + (t.getMonth() + 1) + "/" + t.getDate() + " " + t.getHours() + ":" + ("0" + t.getMinutes()).slice(-2) + " 時点）";
      live.hidden = false;
    }).catch(function () {});
  }

  // ---- 下部の追従バー ----
  var fl = document.querySelector(".float");
  if (fl) {
    var closed = false;
    try { closed = sessionStorage.getItem("float_closed") === "1"; } catch (e) {}
    var x = fl.querySelector(".x");
    if (x) x.addEventListener("click", function () {
      closed = true; fl.classList.remove("show");
      try { sessionStorage.setItem("float_closed", "1"); } catch (e) {}
    });
    var hideNear = document.querySelectorAll("[data-hide-float]");
    var updF = function () {
      if (closed) return;
      var near = false;
      hideNear.forEach(function (el) { var r = el.getBoundingClientRect(); if (r.top < window.innerHeight && r.bottom > 0) near = true; });
      fl.classList.toggle("show", window.scrollY > 500 && !near);
    };
    window.addEventListener("scroll", updF, { passive: true });
    updF();
  }
})();

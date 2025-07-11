// ==UserScript==
// @name              ココフォリア追加チャットパレット
// @version           1.3.4
// @description       ココフォリア上に追加されるいい感じの追加チャットパレット
// @author            Apocrypha
// @match             https://ccfolia.com/rooms/*
// @grant             GM_getValue
// @grant             GM_setValue
// @updateURL         https://github.com/Kanimiso221/CCFOLIA_ADD_PALLET/raw/main/%E3%82%B3%E3%82%B3%E3%83%95%E3%82%A9%E3%83%AA%E3%82%A2%E8%BF%BD%E5%8A%A0%E3%83%81%E3%83%A3%E3%83%83%E3%83%88%E3%83%91%E3%83%AC%E3%83%83%E3%83%88-1.0.0.user.js
// @downloadURL       https://github.com/Kanimiso221/CCFOLIA_ADD_PALLET/raw/main/%E3%82%B3%E3%82%B3%E3%83%95%E3%82%A9%E3%83%AA%E3%82%A2%E8%BF%BD%E5%8A%A0%E3%83%81%E3%83%A3%E3%83%83%E3%83%88%E3%83%91%E3%83%AC%E3%83%83%E3%83%88-1.0.0.user.js
// @require           https://cdn.jsdelivr.net/npm/codemirror@5/lib/codemirror.js
// @require           https://cdn.jsdelivr.net/npm/codemirror@5/mode/javascript/javascript.js
// @require           https://cdn.jsdelivr.net/npm/codemirror@5/addon/fold/foldcode.js
// @require           https://cdn.jsdelivr.net/npm/codemirror@5/addon/fold/foldgutter.js
// @require           https://cdn.jsdelivr.net/npm/codemirror@5/addon/fold/brace-fold.js
// @require           https://cdn.jsdelivr.net/npm/codemirror@5/addon/fold/comment-fold.js
// @require           https://cdn.jsdelivr.net/npm/codemirror@5/addon/fold/indent-fold.js
// @require           https://cdn.jsdelivr.net/npm/marked/marked.min.js
// @require           https://cdn.jsdelivr.net/npm/dompurify@3.1.0/dist/purify.min.js
// @resource CM_BASE  https://cdn.jsdelivr.net/npm/codemirror@5/lib/codemirror.css
// @resource CM_MONO  https://cdn.jsdelivr.net/npm/codemirror@5/theme/monokai.css
// @resource CM_FOLD  https://cdn.jsdelivr.net/npm/codemirror@5/addon/fold/foldgutter.css
// @grant             GM_getResourceText
// @grant             GM_addStyle
// @license           MIT
// ==/UserScript==

/* eslint no-return-assign: 0 */

(() => {
    'use strict';

    GM_addStyle(GM_getResourceText('CM_BASE'));
    GM_addStyle(GM_getResourceText('CM_MONO'));
    GM_addStyle(GM_getResourceText('CM_FOLD'));

    const curVer = GM_info.script.version, KEY = 'myScript_prev_ver', prevVer = localStorage.getItem(KEY);

    if (prevVer && prevVer !== curVer) {
        if (confirm(`拡張を ${prevVer} → ${curVer} に更新しました。\nページを再読込しますか？`)) { localStorage.setItem(KEY, curVer); location.reload(); }
        else { localStorage.setItem(KEY, curVer); }
    }

    /* ========== 設定 ========== */
    const CMD_KEY = 'tmPaletteCmds_v3', VAR_KEY = 'tmPaletteVars_v3', AUTO_KEY = 'tmPaletteAuto_v3', HELP_KEY = 'tmPaletteHelp_v1', POS_KEY = 'tmPaletteWinPos_v1';
    const DEF_CMDS = [{ label: '1D100', lines: ['1D100', '1d100<=50', 'CCB<=50'] }];
    const DEF_VARS = [{ name: 'NUM', value: '1' }];
    const TXT_SEL = 'textarea[name="text"]';
    const DICEBAR = 'div.sc-igOlGb';
    const HK_VIEW = 'p', HK_EDIT = 'o', HK_VARS = 'v';
    const SEND_DELAY = 500;
    const ROW_STAT = 'div[data-testid="CharacterStatus__row"]';
    const ROW_PARAM = 'div[data-testid="CharacterParam__row"]';
    const CHAT_CACHE = 50;
    const KW_ALIAS = { 'M': /失敗/, 'S': /(?<!決定的)成功|(?<!決定的成功\/)スペシャル/, 'F': /致命的失敗/, '100F': /(100.*致命的失敗|致命的失敗.*100)/, 'C': /(クリティカル|決定的成功(?:\/スペシャル)?)/, '1C': /(1.*(?:クリティカル|決定的成功)|(?:クリティカル|決定的成功).*1)/ };
    const CONF_MIME = 'application/x-ccp+json';
    const CONF_VER = 1;
    const EXPORT_FILE = () => `追加チャット情報${new Date().toISOString().replace(/[:.]/g, '-')}.ccp`;
    const AUTO_ATTR = 'data-auto-card';
    const CARD_SEL = `div.MuiPaper-root`;
    /* ========================== */

    /* ========== 基本 util ========== */
    const clamp = (v, mi, ma) => Math.min(Math.max(v, mi), ma);
    const wait = sel => new Promise(r => { const f = () => { const n = document.querySelector(sel); n ? r(n) : requestAnimationFrame(f) }; f() });
    const setVal = (ta, val) => Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, val);
    const sendLine = (ta, txt) => { setVal(ta, txt); ta.dispatchEvent(new Event('input', { bubbles: true })); requestAnimationFrame(() => ta.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }))); };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const load = (k, d) => { try { const j = localStorage.getItem(k); return j ? JSON.parse(j) : d } catch { return d } };
    const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
    const escReg = s => s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
    const idle = window.requestIdleCallback ? f => requestIdleCallback(f, { timeout: 100 }) : f => setTimeout(f, 16);
    const highlightPaletteKW = (() => {
        const WORDS = [
            'SEnd',
            'CMessage',
            'CharBox',
            'CharBoxMax',
            'CharBoxRaw',
            'Actor',
            'Actor\\.Set'
        ];
        const re = new RegExp(`^(?:${WORDS.join('|')})\\b`);

        return {
            token(stream) {
                if (stream.match(re)) return 'tm-kw';
                while (stream.next() != null && !stream.match(re, false)) {/*skip*/}
                return null;
            }
        };
    })();
    const HELP_HTML =
          `<!--  ─────────────────────────────  -->
          <style>
            #tm-help { color:#ddd; }
            /* コードブロック全体 */
            #tm-help pre{
              background:#1b1b1b;     /* わずかに濃いめ */
              color:#d0ffcf;          /* 既存の #cfc を少し明度アップ */
              font-family:Consolas, Menlo, monospace;
              font-size:12.5px;       /* ＋0.5px だけ大きく */
              line-height:1.45;       /* 行間を空けて詰まりを解消 */
              padding:10px 12px;      /* ゆとりを持たせる */
              border-radius:4px;
              overflow-x:auto;        /* 横長でもはみ出さない */
              white-space:pre;        /* Firefox 対策（折返し無効化） */
            }

            #tm-help .CodeMirror,
            #tm-help .CodeMirror-lines   { padding:0 !important; }

            #tm-help pre,
            #tm-help .CodeMirror         {
              font-family:Consolas,Menlo,'Source Code Pro','Fira Code',monospace;
              font-size:13px;
              letter-spacing:.03em;
              line-height:1.55;
              background:#1b1b1b;
              color:#d0ffcf;
              border-radius:4px;
            }
            /* pre 内のインライン code（強調）を少し暗めのパネルで */
            #tm-help pre code{
              background:#252525;
              color:#9ff;             /* 水色寄りで差別化 */
              padding:0 2px;
              border-radius:3px;
            }
            /* ─────────────────────── */
            #tm-help code        { background:#222;padding:1px 4px;border-radius:3px;color:#9cf; }
            /* 既存の code はそのまま。他と被らないよう上書き順を調整 */
            #tm-help table       { border-collapse:collapse;font-size:12px; }
            #tm-help th,#tm-help td{ border:1px solid #555;padding:4px; }
            #tm-help thead th    { background:#333;color:#fff; }
            #tm-help tbody tr:nth-child(odd){ background:#2a2a2a; }
         </style>

         <h2 style="margin-top:0">拡張チャットパレット&nbsp;—&nbsp;かんたんヘルプ</h2>

         <!-- ──────────────────────────── -->
         <h3>◆ ウィンドウ＆ショートカット</h3>
         <ul>
         <li><b>Alt&nbsp;+&nbsp;P</b> … パレットの表示 / 非表示</li>
         <li><b>Alt&nbsp;+&nbsp;O</b> … コマンド編集ウィンドウ</li>
         <li><b>Alt&nbsp;+&nbsp;V</b> … 変数編集ウィンドウ</li>
         <li><b>A キー</b> … Auto スクリプト（※開発中）</li>
         </ul>

         <!-- ──────────────────────────── -->
         <h3>◆ コマンド編集の基本</h3>
         <p>
         テキストエリア１行＝１コマンドとして登録。<br>
         改行すれば次のコマンドになります。登録後はボタンをクリックして発射。
         </p>

         <h4 style="margin-bottom:4px">WAITディレクティブ</h4>
         <table>
         <thead><tr><th>記法</th><th>効果</th></tr></thead>
         <tbody>
         <tr><td><code>[ WAIT&nbsp;500 ]</code></td><td>0.5 秒待機して次へ</td></tr>
         <tr><td><code>[ WAIT&nbsp;1000 ]</code></td><td>1 秒待機</td></tr>
         </tbody>
         </table>

         <!-- ──────────────────────────── -->
         <h3>◆ コマンド内スクリプト</h3>
         <p><code>[ ... ]</code> で囲んだ部分は JavaScript として実行されます。</p>

         <details>
         <summary><b>組み込みオブジェクト</b>（クリックで展開）</summary>

         <table>
         <thead><tr><th>名前</th><th>戻り値</th><th>用途</th></tr></thead>
         <tbody>
         <tr><td><code>SEnd()</code></td><td>void</td><td>以降の行をスキップ</td></tr>
         <tr><td colspan="3"><b>CMessage[n] — 直近メッセージラッパ</b></td></tr>
         <tr><td style="padding-left:20px"><code>.Find(kw)</code></td><td>bool</td><td>kw を含む？</td></tr>
         <tr><td style="padding-left:20px"><code>.Lines()</code></td><td>string[]</td><td>改行で配列化</td></tr>
         <tr><td style="padding-left:20px"><code>.FindAt(kw)</code></td><td>number</td><td>kw 出現数</td></tr>
         <tr><td style="padding-left:20px"><code>.Match(re)</code></td><td>match[]/null</td><td>最初の正規表現マッチ</td></tr>
         <tr><td style="padding-left:20px"><code>.MatchAll(re)</code></td><td>match[]</td><td>全マッチ</td></tr>
         <tr><td style="padding-left:20px"><code>.GetNum()</code></td><td>number</td><td>「…＞ 12」の 12 を取得</td></tr>
         <tr><td style="padding-left:20px"><code>.Send(...txt)</code></td><td>void</td><td>引数を順に送信</td></tr>
         <tr><td colspan="3"><b>キャラクターボックス参照</b></td></tr>
         <tr>
           <td style="padding-left:20px"><code>CharBox(lbl,&nbsp;idx=0)</code></td>
           <td>number/string<br><small>null</small></td>
           <td>
             <code>&quot;HP&quot;</code>&nbsp;などラベル名で<br>
             <b>現在値</b> を取得。<br>
             パーティ順で <code>idx</code> 指定も可
           </td>
         </tr>
         <tr>
           <td style="padding-left:20px"><code>CharBoxMax(lbl,&nbsp;idx=0)</code></td>
           <td>number/string<br><small>null</small></td>
           <td>ラベルの <b>最大値</b> を取得</td>
         </tr>
         <tr>
           <td style="padding-left:20px"><code>CharBoxRaw(lbl,&nbsp;idx=0)</code></td>
           <td>string<br><small>null</small></td>
           <td><code>&quot;20/35&quot;</code> のような<br>「現在/最大」文字列をそのまま</td>
         </tr>
         <tr><td colspan="3"><b>アクター切替</b></td></tr>
         <tr>
           <td style="padding-left:20px"><code>Actor(name)</code><br><code>Actor.Set(name)</code></td>
           <td>void</td>
           <td>
             <b>指定キャラクターをアクティブ化</b><br>
             例：<code>Actor('PC-A')</code><br>
             （非同期処理は内部で済むので <code>await</code> 不要）
           </td>
         </tr>
         </tbody>
         </table>
         </details>

         <!-- ──────────────────────────── -->
         <h3>◆ KW_ALIAS — 特殊キーワード</h3>
         <table>
         <thead><tr><th style="width:3em">記号</th><th>マッチする語</th></tr></thead>
         <tbody>
         <tr><td>M</td><td>失敗</td></tr>
         <tr><td>S</td><td>成功 / スペシャル（※決定的系は除外）</td></tr>
         <tr><td>F</td><td>致命的失敗</td></tr>
         <tr><td>100F</td><td>致命的失敗 + 100</td></tr>
         <tr><td>C</td><td>クリティカル / 決定的成功 / 決定的成功/スペシャル</td></tr>
         <tr><td>1C</td><td>C のうち先頭 or 末尾が 1</td></tr>
         </tbody>
         </table>
         <p>単文字を <code>.Find('S')</code> のように渡すと上記の正規表現で検索します。</p>

         <!-- ──────────────────────────── -->
         <h3>◆ 変数編集（グローバル変数）</h3>
         <p>
         「変数編集」で作った <code>NAME / 値</code> はコマンド中で<br>
         <code>{NAME}</code> と書くか、スクリプト内で普通に <code>NAME</code> 変数として使えます。<br>
         例：<code>NUM += 2;</code>
         </p>

         <!-- ──────────────────────────── -->
         <h3>◆ 使用例（４パターン）</h3>

         <pre>
         // ① シンプル：AP-1 → 成功ならダメージ
         :AP-1
         CCB<=70 【パンチ】
         [ if (CMessage[0].Find('S')) CMessage[0].Send('1d6 【ダメージ】'); ]
         </pre>

         <pre>
         // ② WAIT を挟みテンポ調整
         :AP-1
         [ WAIT 500 ]
         CCB<=60 【蹴り】
         [ WAIT 300 ]
         1d6 【ダメージ】
         </pre>

         <pre>
         // ③ スクリプトで致命的チェック & 途中終了
         :MP-3
         CCB<=50 【魔法弾】
         [
           const res = CMessage[0];
           if (res.Find('F')) {               // 致命的失敗なら MP 返却して終了
              res.Send(':MP+3');
              SEnd();
           }
         ]
         1d10 【ダメージ】
         </pre>

         <pre>
         // ④ GetNum を使って消費 HP を抜き取る
         :AP-1
         1d5 【HP消費】
         [
           const res = CMessage[0];
           const hp = res.GetNum();
           res.Send(\`:+HP-\${hp}\`);
         ]
         </pre>

         <hr>
         <p style="text-align:center;font-size:11px">
           MIT License / Script by Apocrypha (ぬべ太郎)
         </p>`;

    /* ========== データ========== */
    let cmds = load(CMD_KEY, DEF_CMDS).map(c => { if ('label' in c) return { auto: false, ...c }; const [label, ...lines] = c.lines ?? []; return { auto: false, label: label || 'Cmd', lines }; });
    let vars = load(VAR_KEY, DEF_VARS);
    let winPos = load(POS_KEY, {});
    let autoCmd = load(AUTO_KEY, ['// Auto script here\n(まだ何も出来ないよ)']);
    let hl = null;
    let hideAutoCards = true;
    let autoAst = [];
    let autoTicker = null;

    /* ========== キャラステータス DOM 収集 ========== */
    const buildStatMap = () => {
        const m = {};
        document.querySelectorAll(`${ROW_STAT},${ROW_PARAM}`).forEach(r => {
            const lab = r.querySelector('span:first-child')?.textContent?.trim();
            const val = r.querySelector('span:last-child')?.textContent?.trim();
            if (lab) m[lab] = val;
        }); return m;
    };
    let statCache = buildStatMap();
    new MutationObserver(() => { statCache = buildStatMap(); }).observe(document.body, { childList: true, subtree: true });

    /* ========== 変数オブジェクトヘルパ ========== */
    const varsObj = () => Object.fromEntries(vars.map(v => [v.name, Number(v.value) || 0]));
    const saveVarsObj = obj => { vars = Object.entries(obj).map(([name, v]) => ({ name, value: String(Math.trunc(v)) })); save(VAR_KEY, vars); };

    /* ========== チャットメッセージ取得 ========== */
    let _sendChain = Promise.resolve();
    const enqueueSend = lines => { _sendChain = _sendChain.then(() => sendMulti(lines)); return _sendChain; };
    const getLastMessages = (n = CHAT_CACHE) => {
        return Array.from(document.querySelectorAll('div.MuiListItem-root'))
            .slice(-n)
            .reverse()
            .map(el => {
            const body = el.querySelector('div[data-testid=\"RoomMessage__body\"], p');
            return body ? body.innerText.trim() : '';
        });
    };
    const wrapMessages = arr => arr.map(txt => {
        const Find = kw => (KW_ALIAS[kw] ?? new RegExp(escReg(kw))).test(txt);
        const Lines = () => txt.split(/\\r?\\n/);
        const FindAt = kw => {
            const base = KW_ALIAS[kw] ?? new RegExp(escReg(kw), 'g');
            const re = base.global ? base : new RegExp(base.source, base.flags + 'g');
            return (txt.match(re) || []).length;
        };
        const Match = re => (typeof re === 'string' ? txt.match(new RegExp(re)) : txt.match(re));
        const MatchAll = re => { if (typeof re === 'string') re = new RegExp(re, 'g'); if (!re.global) re = new RegExp(re.source, re.flags + 'g'); return [...txt.matchAll(re)]; };
        const GetNum = () => { const m = txt.match(/＞\s*(-?\d+(?:\.\d+)?)/); return m ? Number(m[1]) : NaN; };
        return { text: txt, Find, Lines, Match, MatchAll, FindAt, GetNum, Send: (...lines) => enqueueSend(lines.flat()) };
    });

    /* ========== キャラクターボックスの値取得 ========== */
    function collectCharStats() {
        const out = Object.create(null);
        document.querySelectorAll('.sc-iKUUEK').forEach((box, idx) => {
            box.querySelectorAll('.sc-cTsLrp').forEach(bl => {
                const pList = bl.querySelectorAll('p');
                const key = pList[0].textContent.trim();
                if (pList.length < 2) return;
                const val = pList[1].textContent.trim();
                if (key) (out[key] ??= [])[idx] = val;
            });
            const badge = box.querySelector('.MuiBadge-badge:not(.MuiBadge-invisible)');
            if (badge) (out['イニシアチブ'] ??= [])[idx] = badge.textContent.trim();
        });
        return out;
    }

    //  ==== アクター選択ヘルパ =========================
    async function _selectActor(label){
        const btn = document.querySelector('button[aria-label="キャラクター選択"]');
        if(!btn) return console.warn('Actor button not found');

        btn.click();

        const ul = await new Promise(res => {
            const iv = setInterval(() => {
                const el = document.querySelector('.MuiPopover-paper ul');
                if(el){ clearInterval(iv); res(el); }
            },50);
            setTimeout(() => { clearInterval(iv); res(null); }, 2000);
        });
        if(!ul) return console.warn('Actor list not found');

        const rex = label instanceof RegExp ? label : new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');

        const row = [...ul.querySelectorAll('.MuiListItemButton-root')].find(r => rex.test(r.querySelector('.MuiListItemText-primary')?.textContent || ''));

        (row||document.body).click();
        if(!row) console.warn('Actor "'+label+'" not found');
    }

    let _actorChain = Promise.resolve();
    function Actor(label){ _actorChain = _actorChain.then(()=>_selectActor(label)); }
    Actor.Set = Actor; window.Actor = Actor;

    /* ========== 共通パーサ ========== */
    function __splitVal(val){
        const m = String(val).match(/^(-?\d+(?:\.\d+)?)(?:\s*\/\s*(-?\d+(?:\.\d+)?))?$/);
        return m ? [Number(m[1]), m[2]!==undefined?Number(m[2]):undefined] : [val, undefined];
    }

    /* ========== 現在値（既定） ========== */
    function CharBox(label, idx = 0){
        if (!window.__charStatCache || Date.now()-window.__charStatTime>2000){
            window.__charStatCache = collectCharStats();
            window.__charStatTime = Date.now();
        }
        const raw = (window.__charStatCache[label]||[])[idx];
        if(raw===undefined) return null;
        const [cur] = __splitVal(raw);
        return cur;
    }

    /* ========== 最大値 ========== */
    function CharBoxMax(label, idx = 0){
        const raw = (window.__charStatCache?.[label]||[])[idx];
        if(raw===undefined) return null;
        const [, max] = __splitVal(raw);
        return max!==undefined ? max : CharBox(label,idx);
    }

    /* ========== 生文字列 ========== */
    function CharBoxRaw(label, idx = 0) { return (window.__charStatCache?.[label]||[])[idx] ?? null; }

    /* ========== 再帰展開 ========== */
    const expOnce = (s, d) => s.replace(/\{([^{}]+?)}/g, (m, p) => d[p] !== undefined ? d[p] : m);
    const expRec = (s, d) => { let p; do { p = s; s = expOnce(s, d); } while (s !== p); return s; };

    /* ========== スクリプト行実行 ========== */
    const runScript = (code, ctx) => {
        try {
            // ミニ JS 方言: ctx を with でバインド
            const fn = new Function('ctx', `with(ctx){${code}}`);
            fn(ctx);
        } catch (e) {
            alert('[ScriptError]' + e); return;
        }
    };

    /* ========== 送信ラッパ ========== */
    const sendMulti = async rawLines => {
        const ta = await wait(TXT_SEL);
        const ctx = varsObj();

        let stop = false;
        Object.defineProperty(ctx, 'SEnd', { value: () => { stop = true; }, writable: false });
        Object.defineProperty(ctx, 'CMessage', { get: () => wrapMessages(getLastMessages()), enumerable: false });
        Object.defineProperty(ctx, 'CharBox', { value: CharBox, writable: false, enumerable: false });
        Object.defineProperty(ctx, 'CharBoxMax', { value: CharBoxMax,enumerable: false});
        Object.defineProperty(ctx, 'CharBoxRaw', { value: CharBoxRaw,enumerable: false});
        Object.defineProperty(ctx, 'Actor', { value: Actor, writable:false });

        for (let i = 0; i < rawLines.length; i++) {
            let raw = rawLines[i];
            if (!raw) continue;
            let trimmed = String(raw).trim();
            if (/^\\[\\s*SEnd\\s*\\]$/.test(trimmed)) break;
            const m = trimmed.match(/^\[\s*WAITMSG\s+"([^"]+)"\s+(\d+)\s*\]$/);
            if (m) {
                const kw = m[1], need = +m[2];
                while (true) {
                    const msgs = wrapMessages(getLastMessages(need));
                    if (msgs.length >= need && msgs[0].FindAt(kw) > 0) break;
                    await sleep(200);
                }
                continue;
            }
            const w = trimmed.match(/^\[\s*WAIT\s+(\d+)\s*\]$/);
            if (w) { await sleep(Number(w[1])); continue; }

            if (trimmed.startsWith('[')) {
                let codeLines = [trimmed];
                while (!trimmed.endsWith(']')) {
                    i++;
                    if (i >= rawLines.length) {
                        alert('Script block missing closing \"]\"'); return;
                    }
                    trimmed = String(rawLines[i]).trim();
                    codeLines.push(trimmed);
                }
                const scriptBody = codeLines.join('\n').slice(1, -1);
                runScript(scriptBody, ctx);
                if (stop) break;
                continue;
            }

            const expanded = expRec(raw, {
                ...statCache,
                ...Object.fromEntries(Object.entries(ctx).map(([k, v]) => [k, String(Math.trunc(v))]))
            });
            if (!expanded) continue;
            sendLine(ta, expanded);
            await sleep(SEND_DELAY);
        }

        saveVarsObj(ctx);
    };

    /* ========== ランタイム環境（変数テーブル） ========== */
    const RT = {
        /* ① 変数テーブル（ユーザ変数） */
        vars: Object.create(null),

        /* ② 組込み数学関数 */
        funcs: {
            max: Math.max,
            min: Math.min,
            clamp: (x, lo, hi) => Math.min(Math.max(x, lo), hi),
            abs:  Math.abs,
            ceil: Math.ceil,
            floor: Math.floor,
            print: console.log
        },

        roomchat: (() => {
            /** 内部ヘルパ：最新 n 件の wrap 済みメッセージ配列を返す */
            const latest = (n = CHAT_CACHE) => wrapMessages(getLastMessages(n));

            return {
                /** .at(idx) ─ 0=直近, 1=1つ前 … の Message オブジェクト */
                at          : idx => latest(idx + 1)[idx] ?? { text: '' },

                /** .contents(kw) ─ 直近ログ群に kw が含まれるか */
                contents    : kw => latest().some(m => m.Find(kw)),

                /** .contents_at(kw) ─ 直近ログ 1 件で kw の出現数 */
                contents_at : kw => latest(1)[0]?.FindAt(kw) ?? 0,

                /** .send(txt) ─ チャットへ送信 */
                send        : txt => enqueueSend([txt]),

                /** .num() ─ 直近ログから「＞ 123」形式の数値を取得 */
                num         : () => latest(1)[0]?.GetNum() ?? NaN
            };
        })()
    };

    /* ========== GUI から変数を取り込む ========== */
    function buildRTfromGui() {
        RT.vars = Object.create(null);
        vars.forEach(v => {
            const n = v.name;
            const raw = v.value.trim();
            RT.vars[n] = {
                value: (/^\d+$/.test(raw) ? Number(raw) : raw),
                type : v.type ?? 'int'
            };
        });
    }

    /* ========== 字句解析（Tokenizer）========== */
    function tokenize(src) {
        const TOK_PATTERNS = [
            '\\/\\*[^]*?\\*\\/',
            '\\/\\/[^\\n\\r]*',
            '\\s+',
            '"(?:[^"\\\\]|\\\\.)*"',
            '\\d+\\.\\d+','\\d+',
            '\\|\\||&&|==|!=|<=|>=|\\+\\+|--|\\+=|-=|\\*=|\\/=|%=',
            '[A-Za-z_]\\w*',
            '[(){};,.+\\-*/%<>=|&?:]'
        ];
        const TOKEN_RE = new RegExp(TOK_PATTERNS.join('|'), 'g');
        const out = [];
        let m;
        while ((m = TOKEN_RE.exec(src))) {
            const tk = m[0];
            if (/^\s+$/.test(tk) || tk.startsWith('/*') || tk.startsWith('//')) continue;
            out.push(tk);
        }
        return out;
    }

    /* ========== 構文パーサー ========== */
    function parse(tokens) {
        let i = 0;
        const peek = () => tokens[i], next = () => tokens[i++];
        const expect = t => {
            const got = next();
            if (got !== t) {
                alert('期待:', t, ' でも実際は', got, ' 残り', tokens.slice(i));
                throw `期待: ${t}`;
            }
        };

        const prog = [];
        function parseExpr() {
            let node = parseAnd();
            while (peek() === '||') {
                const op = next();
                const rhs = parseAnd();
                node = { kind:'bin', op, lhs:node, rhs };
            }
            return node;
        }
        function parseAnd() {
            let node = parseEquality();
            while (peek() === '&&') {
                const op = next();
                const rhs = parseEquality();
                node = { kind:'bin', op, lhs:node, rhs };
            }
            return node;
        }
        function parseEquality() {
            let node = parseAdditive();
            while (['==','!=','<','>','<=','>='].includes(peek())) {
                const op = next();
                const rhs = parseAdditive();
                node = { kind:'bin', op, lhs:node, rhs };
            }
            return node;
        }
        function parseAdditive() {
            let node = parseTerm();
            while (['+','-'].includes(peek())) {
                const op = next();
                const rhs = parseTerm();
                node = { kind:'bin', op, lhs:node, rhs };
            }
            return node;
        }
        function parseTerm() {
            let lhs = parseFactor();
            while (['*', '/', '%'].includes(peek())) {
                const op = next(), rhs = parseFactor();
                lhs = { kind: 'bin', op, lhs, rhs };
            }
            return lhs;
        }
        function parseStmt() {
            const tk = peek();

            if (['int','float','string','array','readonly','const','memory'].includes(tk)) {
                let attr = { ro:false, const:false, mem:false };
                while (['readonly','const','memory'].includes(peek())) {
                    const w = next();
                    if (w==='readonly') attr.ro = true;
                    if (w==='const') attr.const = true;
                    if (w==='memory') attr.mem = true;
                }
                const type = next();
                const name = next();
                let init = null;
                if (peek() === '='){ next(); init = parseExpr(); }
                expect(';');
                return { kind:'decl', type, name, init, attr };
            }

            if (tk === 'if') {
                next(); expect('('); const cond = parseExpr(); expect(')');
                const body = parseBlock();
                return { kind: 'if', cond, body };
            }

            if (tk === 'while') {
                next(); expect('('); const cond =parseExpr(); expect(')');
                const body = parseBlock();
                return { kind: 'while', cond, body };
            }

            if (tk === 'for') {
                next(); expect('(');
                const init = parseExpr(); expect(';');
                const cond = parseExpr(); expect(';');
                const step = parseExpr(); expect(')');
                const body = parseBlock();
                return { kind: 'for', init, cond, step, body };
            }

            if (tk === 'do') {
                next();
                const body = parseBlock();
                expect('while'); expect('('); const cond = parseExpr(); expect(')'); expect(';');
                return { kind: 'do', cond, body };
            }

            if (tk === 'switch') {
                next(); expect('('); const expr = parseExpr(); expect(')');
                expect('{'); const cases = [];
                while (peek() !== '}') {
                    expect('case'); const val = parseExpr(); expect(':');
                    const body = []; while (peek() !== 'case' && peek() !== '}'){
                        body.push(parseExpr()); expect(';');
                    }
                    cases.push({val,body});
                } expect('}');
                return { kind: 'switch', expr, cases};
            }

            if (tk === 'trigger') {
                next(); expect('('); const cond = parseExpr(); expect(')');
                const body = parseBlock();
                return { kind: 'trigger', cond, body, runned: false};
            }

            const expr = parseExpr();
            expect(';');
            return { kind:'expr', expr };
        }
        function parseBlock() {
            expect('{');
            const body = [];
            while (peek() !== '}') body.push(parseStmt());
            expect('}');
            return body;
        }
        function parseFactor() {
            if (peek() === '++' || peek() === '--') {
                const op = next();
                const expr = parseFactor();
                return { kind: 'unary', op, pre: true, expr };
            }

            let node;
            const tk = next();

            if (tk === '(') { node = parseExpr(); expect(')'); }
            else if (/^\d/.test(tk)) { node = { kind: 'num', val: +tk }; }
            else if (/^"/.test(tk)) { node = { kind: 'str', val: tk.slice(1, -1) }; }
            else { node = { kind: 'var', name: tk }; }

            while (true) {
                if (peek() === '++' || peek() === '--') {
                    const op = next();
                    node = { kind: 'unary', op, pre: false, expr: node };
                } else if (peek() === '.') {
                    next();
                    const prop = next();
                    node = { kind: 'prop', obj: node, prop };
                } else if (peek() === '(') {
                    next();
                    const args = [];
                    if (peek() !== ')') {
                        args.push(parseExpr());
                        while (peek() === ',') { next(); args.push(parseExpr()); }
                    }
                    expect(')');
                    node = { kind: 'call', func: node, args };
                } else break;
            }
            return node;
        }


        while (i < tokens.length) { prog.push(parseStmt()); }

        return prog;
    }

    /* ========== インタープリタ ========== */
    function evalNode(node, env) {
        switch (node.kind) {
            case 'num': return node.val;
            case 'str': return node.val;
            case 'var': {
                const n = node.name;
                if (n in env) return env[n];
                if (n in env.funcs) return env.funcs[n];
                if (n in env.vars) return env.vars[n].value;
                return 0;
            }
            case 'bin': {
                const l = evalNode(node.lhs, env);
                switch (node.op) {
                    case '<' : return l < evalNode(node.rhs, env);
                    case '>' : return l > evalNode(node.rhs, env);
                    case '<=': return l <= evalNode(node.rhs, env);
                    case '>=': return l >= evalNode(node.rhs, env);
                    case '+': return l + evalNode(node.rhs, env);
                    case '-': return l - evalNode(node.rhs, env);
                    case '*': return l * evalNode(node.rhs, env);
                    case '/': return l / evalNode(node.rhs, env);
                    case '%': return l % evalNode(node.rhs, env);
                    case '==': return l == evalNode(node.rhs, env);
                    case '!=': return l != evalNode(node.rhs, env);
                    case '||': return l || evalNode(node.rhs, env);
                    case '&&': return l && evalNode(node.rhs, env);
                } break;
            }
            case 'prop': return evalNode(node.obj, env)[node.prop];
            case 'assign': {
                const name=node.lhs.name;
                const v = env.vars[name];
                if (v?.attr?.ro || v?.attr?.const) throw `書換禁止 ${name}`;
                if (!(name in env.vars) && (name in env || name in env.funcs)) { alert(`組込み名 ${name} は書き換え禁止`); throw `組込み名 ${name} は書き換え禁止`; }
                const cur = env.vars[name]?.value ?? 0;
                const rhs = evalNode(node.rhs, env);

                let val;
                switch (node.op) {
                    case '=': val = rhs; break;
                    case '+=': val = cur + rhs; break;
                    case '-=': val = cur - rhs; break;
                    case '*=': val = cur * rhs; break;
                    case '/=': val = cur / rhs; break;
                    case '%=': val = cur % rhs; break;
                }
                env.vars[name] = { value: val, type: 'int' };
                return val;
            }
            case 'call': {
                const fn = evalNode(node.func, env);
                if (typeof fn !== 'function' ||
                    fn === Function || fn === Function.prototype) {
                    throw `呼び出し禁止: unsafe function`;
                }
                const banned = [eval, setTimeout, setInterval, Function];
                if (banned.includes(fn)) throw `呼び出し禁止: ${fn.name}`;

                const args = node.args.map(a => evalNode(a, env));
                return fn.apply(null, args);
            }
            case 'decl': {
                env.vars[node.name] = { value: node.init ? evalNode(node.init, env) : 0, type: node.type };
                return;
            }
            case 'expr': evalNode(node.expr, env); return;
            case 'if':
                if (evalNode(node.cond, env)) node.body.forEach(n => evalNode(n, env));
                return;
            case 'trigger':
                if (!node.runned && evalNode(node.cond, env)) {
                    node.runned = true;
                    node.body.forEach(n => evalNode(n, env));
                }
                return;
            case 'unary': {
                const n = node.expr.name;
                const cur = env.vars[n]?.value ?? 0;
                const val = node.op==='++' ? cur+1 : cur-1;
                env.vars[n].value = val;
                return node.pre ? val : cur;
            }
            case 'while':
                while (evalNode(node.cond,env)) node.body.forEach(n=>evalNode(n,env));
                return;
            case 'for':
                evalNode(node.init,env);
                while (evalNode(node.cond,env)) {
                    node.body.forEach(n=>evalNode(n,env));
                    evalNode(node.step,env);
                } return;
            case 'do':
                do { node.body.forEach(n=>evalNode(n,env)); }
                while (evalNode(node.cond,env));
                return;
            case 'switch': {
                const v=evalNode(node.expr,env);
                for (const c of node.cases){
                    if (evalNode(c.val,env)===v){
                        c.body.forEach(n=>evalNode(n,env));
                        break;
                    }
                } return;
            }
        }
    }

    function syncVarsToStorage(){
        for (const [k,v] of Object.entries(RT.vars)){
            if (v.attr?.mem){
                GM_setValue('mem_'+k, JSON.stringify(v.value));
            }
        }
        // 普通の vars も保存するならここで…
    }

    function restoreMemory(){
        for (const k of GM_listValues()){
            if (k.startsWith('mem_')){
                const name = k.slice(4);
                RT.vars[name]={value:JSON.parse(GM_getValue(k)),type:'int',attr:{mem:true}};
            }
        }
    }

    /* ========== Auto 実行ループ＋メモリリーク対策 ========== */
    function startAutoLoop() { if (autoTicker || au) return; if (!autoAst.length) return; autoTicker = setInterval(runAuto, 200); }

    function stopAutoLoop() { if (autoTicker) { clearInterval(autoTicker); autoTicker = null; } }

    function runAuto () {
        if (au) return;
        for (const n of autoAst) {
            if (n.kind === 'trigger') {
                if (!n.runned && evalNode(n.cond, RT)) {
                    n.runned = true;
                    n.body.forEach(b => evalNode(b, RT));
                }
            } else if (n.kind !== 'decl') {
                evalNode(n, RT);
            }
        }
        syncVarsToStorage();
    }

    /* タブが非表示になったら停止 → 戻ったら再開 */
    document.addEventListener('visibilitychange', () => { if (document.hidden || au) stopAutoLoop(); else startAutoLoop(); });

    /* ========== 設定オブジェクト ========== */
    function collectConfig() { return { version: CONF_VER, cmds: cmds, vars: vars, autoCmd: autoCmd } }

    /* ========== エクスポート（ダウンロード） ========== */
    async function doDownload(blob, suggestedName = 'config.ccp') {
        const picker = window.showSaveFilePicker || unsafeWindow?.showSaveFilePicker;
        if (picker) {
            const handle = await picker({ suggestedName, types: [{ description: 'Chat-Palette Config', accept: { [CONF_MIME]: ['.ccp'] } }] });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return;
        }
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: suggestedName });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    async function exportConfig() {
        const blob = new Blob([JSON.stringify(collectConfig(), null, 2)], { type: CONF_MIME });
        try { await doDownload(blob, EXPORT_FILE()); } catch (e) { console.warn('save cancelled', e); return; }
        localStorage.removeItem(CMD_KEY);
        localStorage.removeItem(VAR_KEY);
        localStorage.removeItem(AUTO_KEY);
        location.reload();
    }

    /* ========== インポート（ファイル読み込み） ========== */
    function importConfig() {
        const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.ccp' });
        inp.onchange = () => {
            const file = inp.files[0];
            if (!file) return;
            const fr = new FileReader();
            fr.onload = e => {
                try {
                    const cfg = JSON.parse(e.target.result);
                    if (cfg.version !== CONF_VER) throw 'version mismatch';
                    if (cfg.cmds) localStorage.setItem(CMD_KEY, JSON.stringify(cfg.cmds));
                    if (cfg.vars) localStorage.setItem(VAR_KEY, JSON.stringify(cfg.vars));
                    if (cfg.autoCmd) localStorage.setItem(AUTO_KEY, JSON.stringify(cfg.autoCmd));
                    alert('設定を読み込みました。ページを再読み込みします');
                    location.reload();
                } catch (err) {
                    alert('読み込み失敗: ' + err);
                }
            };
            fr.readAsText(file);
        };
        inp.click();
    }

    function applyPos(name, el, defX = 60, defY = 60) { const p = winPos[name]; el.style.left = (p?.x ?? defX) + 'px'; el.style.top = (p?.y ?? defY) + 'px'; }

    function storePos(name, x, y) { winPos[name] = { x, y }; save(POS_KEY, winPos); }

    /* ========== 自動スクリプトカード非表示 ========== */
    function isAutoScriptCard(card) { return !!card.querySelector('button[aria-label="閉じる"]'); }

    function markAndToggle(card) {
        if (!card.hasAttribute(AUTO_ATTR)) {
            card.setAttribute(AUTO_ATTR, isAutoScriptCard(card));
        }
        if (hideAutoCards && card.getAttribute(AUTO_ATTR) === 'true') {
            card.style.display = 'none';
        } else {
            card.style.display = '';
        }
    }

    // ―― 既存カードを一斉チェック
    document.querySelectorAll(CARD_SEL).forEach(markAndToggle);

    // ―― 新着カードを監視
    new MutationObserver(muts => {
        muts.forEach(m => {
            m.addedNodes.forEach(n => {
                if (n.nodeType !== 1) return;
                if (n.matches?.(CARD_SEL)) markAndToggle(n);
                n.querySelectorAll?.(CARD_SEL).forEach(markAndToggle);
            });
        });
    }).observe(document.body, { childList: true, subtree: true });

    /* Alt + R で表示/非表示トグル ----------------------- */
    document.addEventListener('keydown', e => {
        if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'r') {
            hideAutoCards = !hideAutoCards;
            document.querySelectorAll(`${CARD_SEL}[${AUTO_ATTR}]`)
                .forEach(el => {
                el.style.display =
                    (hideAutoCards && el.getAttribute(AUTO_ATTR) === 'true')
                    ? 'none' : '';
            });
        }
    });

    /* ------------------------------------------------------------------ */
    /* ↓↓↓                UI（パレット／編集／変数）                   ↓↓↓ */
    /* ------------------------------------------------------------------ */

    const css = `
#tm-win,#tm-ed,#tm-var{position:fixed;background:rgba(44,44,44,.87);color:#fff;z-index:99999;box-shadow:0 2px 6px rgba(0,0,0,.4);border-radius:4px;font-family:sans-serif;display:flex;flex-direction:column;}
#tm-win{top:60px;left:60px;width:280px;min-width:260px;max-height:70vh;overflow:auto;}
#tm-ed {top:90px;left:90px;width:700px;min-width:320px;max-height:70vh;overflow:auto;}
#tm-var{top:120px;left:120px;width:350px;min-width:280px;max-height:70vh;overflow:auto;}
.head{height:28px;display:flex;align-items:center;padding:0 6px;border-bottom:1px solid #555;cursor:move;}
.head>span{flex:1;font-size:12px;font-weight:600;user-select:none;}
.b{background:none;border:none;color:#ccc;font-size:13px;height:22px;padding:0 6px;cursor:pointer;}
.b:hover{color:#fff;}
.g{display:grid;grid-template-columns:repeat(2,1fr);gap:4px;flex:1 1 auto;min-height:0;padding:6px;overflow:auto;}
.g button{font-size:12px;padding:4px 6px;background:rgba(255,255,255,.05);border:none;border-radius:2px;color:#fff;word-break:break-all;white-space:normal;cursor:pointer;}
.g button:hover{background:rgba(255,255,255,.15);}
.rs{position:absolute;right:0;bottom:0;width:12px;height:12px;cursor:nwse-resize;}
.list{flex:1 1 auto;min-height:0;overflow:auto;padding:8px;display:flex;flex-direction:column;gap:6px;}
.row{display:flex;gap:4px;}
.row input{flex:1;padding:4px;font-size:12px;background:#555;border:1px solid #777;border-radius:2px;color:#fff;}
.del{width:22px;background:#833;}
.dock{flex-shrink:0;display:flex;justify-content:space-between;gap:8px;margin:8px;}
.add{background:#3a5;padding:4px 12px;}
.save{background:#357;padding:4px 12px;}
.del:hover,.add:hover,.save:hover{filter:brightness(1.2);}
#tm-launch{margin-left:12px;}
.row{display:flex;flex-direction:column;gap:4px;position:relative;overflow:visible;}
.row .ctrl{position:absolute;top:0;right:0;display:flex;flex-direction:column;gap:2px;}
.row .ctrl .b{width:22px;background:#555;color:#ccc;line-height:18px;padding:0;}
.row .ctrl .b:hover{color:#fff;filter:brightness(1.2);}
.row .ctrl .del{background:#833;}
.row textarea{resize:none;overflow:hidden;background:transparent;border:1px solid #777;border-radius:2px;color:#fff;}
.row.type-cmd    { background:rgba( 90, 90, 90,.25); }
.row.type-wait   { background:rgba(255,200,  0,.15); }
.row.type-script { background:rgba( 80,180,255,.15); }
.row.type-script textarea{ border-left:4px solid #4aaaff; }
.CodeMirror { background:#1e1e1e; }
#tm-au{position:fixed;top:180px;left:180px;width:400px;height:280px;background:rgba(44,44,44,.87);color:#fff;z-index:99999;box-shadow:0 2px 6px rgba(0,0,0,.4);border-radius:4px;font-family:sans-serif;display:flex;flex-direction:column;}
#tm-help{position:fixed;top:210px;left:210px;width:750px;height:500px;background:rgba(44,44,44,.87);color:#fff;z-index:99999;box-shadow:0 2px 6px rgba(0,0,0,.4);border-radius:4px;font-family:sans-serif;display:flex;flex-direction:column;}
#tm-ed .cm-tm-kw,
#tm-help .cm-tm-kw { color:#FFD166; font-weight:bold; }
#tm-ed .ctrl .b:hover { background:#444; color:#fff; }
`;
    document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }));

    /* ========== ドラッグ／リサイズ ========== */
    const drag = (el) => {
        const hd = el.querySelector('.head'); let sx = 0, sy = 0, ox = 0, oy = 0, d = false;
        hd.addEventListener('pointerdown', e => {
            if (e.target.closest('.b')) return;
            d = true; sx = e.clientX; sy = e.clientY; const r = el.getBoundingClientRect(); ox = r.left; oy = r.top;
            hd.setPointerCapture(e.pointerId);
        });
        hd.addEventListener('pointermove', e => {
            if (!d) return; el.style.left = `${clamp(ox + e.clientX - sx, 0, innerWidth - 100)}px`;
            el.style.top = `${clamp(oy + e.clientY - sy, 0, innerHeight - 40)}px`;
        });
        hd.addEventListener('pointerup', () => { d = false; const r = el.getBoundingClientRect(); storePos(name, Math.round(r.left), Math.round(r.top)); });
    };
    const resz = (el) => {
        const g = el.querySelector('.rs'); let w = 0, h = 0, sx = 0, sy = 0, r = false;
        g.addEventListener('pointerdown', e => {
            r = true; sx = e.clientX; sy = e.clientY; const rt = el.getBoundingClientRect(); w = rt.width; h = rt.height;
            g.setPointerCapture(e.pointerId);
        });
        g.addEventListener('pointermove', e => {
            if (!r) return; el.style.width = `${Math.max(w + e.clientX - sx, 240)}px`;
            el.style.height = `${Math.max(h + e.clientY - sy, 160)}px`;
        });
        g.addEventListener('pointerup', () => r = false);
    };

    /* ========== パレット ========== */
    let win = null, ed = null, vr = null, au = null;
    const buildWin = () => {
        if (win) win.remove();
        win = document.createElement('div'); win.id = 'tm-win';
        win.innerHTML = `<div class="head"><span>パレット</span><button class="b" id="autoHideB">🎲</button><button class="b" id="impB">⤒</button><button class="b" id="expB">⤓</button>
                       <button class="b" id="hB">？</button><button class="b" id="aB">A</button><button class="b" id="vB">Φ</button>
                       <button class="b" id="eB">⚙</button><button class="b" id="cB">✕</button></div><div class="g" id="gp"></div><div class="rs"></div>`;
        drag(win); resz(win);
        const gp = win.querySelector('#gp');
        cmds.forEach(({ label, lines }, i) => {
            const btn = document.createElement('button');
            btn.textContent = label || `Button${i + 1}`;
            btn.onclick = () => sendMulti(lines);
            gp.appendChild(btn);
            win.querySelector('#cB').onclick = () => win.remove();
        });
        win.querySelector('#eB').onclick = toggleEd;
        win.querySelector('#vB').onclick = toggleVar;
        win.querySelector('#aB').onclick = toggleAuto;
        win.querySelector('#hB').onclick = toggleHelp;
        win.querySelector('#impB').onclick = importConfig;
        win.querySelector('#expB').onclick = exportConfig;
        win.querySelector('#autoHideB').onclick = () => {
            hideAutoCards = !hideAutoCards;
            document.querySelectorAll(`${CARD_SEL}[${AUTO_ATTR}]`)
                .forEach(el => {
                el.style.display =
                    (hideAutoCards && el.getAttribute(AUTO_ATTR) === 'true')
                    ? 'none' : '';
            });
        };
        document.body.appendChild(win);
    };
    const toggleWin = () => document.body.contains(win) ? win.remove() : buildWin();

    /* ========== コマンド編集 ========== */
    const toggleEd = () => {
        if (ed) { ed.remove(); ed = null; return; }

        // ----------  ウィンドウ骨格 ----------
        ed = document.createElement('div'); ed.id = 'tm-ed';
        ed.innerHTML = `<div class="head"><span>コマンド編集</span><button class="b" id="x">✕</button></div>
                        <div class="list" id="ls"></div><div class="dock"><button class="b add"id="ad">■ 追加</button><button class="b save" id="sv">■ 保存</button></div><div class="rs"></div>`;
        drag(ed); resz(ed);
        document.body.appendChild(ed);

        const ls = ed.querySelector('#ls');
        const editors = new WeakMap();
        const cmQueue = [];
        let idleToken = null;

        const rIdle = window.requestIdleCallback || (cb => setTimeout(() => cb({timeRemaining:() => 0}), 80));

        function queueCM(row){ cmQueue.push(row); if(!idleToken) idleToken = rIdle(runQueue,{timeout:500}); }

        function runQueue(deadline){
            let count = 0;
            while(cmQueue.length && (deadline.timeRemaining() > 5) && count < 3) {
                createCM(cmQueue.shift());
                count++;
            }
            if(cmQueue.length) { idleToken = rIdle(runQueue,{timeout:500}); }
            else{ idleToken = null; }
        }

        function createCM(row) {
            row.classList.remove('pending-cm');
            const ta = row.querySelector('.cmd-lines');
            ta.style.display = 'none';

            const cm = CodeMirror.fromTextArea(ta, { theme: 'monokai', mode: 'javascript', lineWrapping: true });
            cm.addOverlay(highlightPaletteKW);
            cm.setSize('100%', 'auto');
            // ───────────────────────────────
            const ls = row.parentElement;
            const keepView = () =>{
                const yInRow = cm.cursorCoords(null,'local').top;
                const top = row.offsetTop + yInRow;
                const bottom = top + cm.defaultTextHeight();
                const viewTop = ls.scrollTop;
                const viewBot = viewTop + ls.clientHeight;
                if (top < viewTop) ls.scrollTop = top - 8;
                else if (bottom> viewBot) ls.scrollTop = bottom - ls.clientHeight + 8;
            };

            cm.on('cursorActivity', keepView);
            cm.on('change', keepView);
            // ───────────────────────────────

            cm.on('change', () => {
                classifyRow(row, cm.getLine(0).trim());
                cm.setSize('100%', 'auto');
            });
            editors.set(row, cm);
            classifyRow(row, cm.getLine(0).trim());
        }

        // ――― アイドル時間に 3 行ずつ処理 ―――
        function buildEditorsGradually() {
            const pending = ls.querySelectorAll('.pending-cm');
            if (!pending.length) return;

            [...pending].slice(0, 3).forEach(createCM);
            idle(buildEditorsGradually);
        }

        // ----------  行タイプ判定 ----------
        const classifyRow = (row, firstLine = '') => {
            row.classList.remove('type-cmd', 'type-wait', 'type-script');
            if (/^\[\s*(WAIT|WAITMSG)\b/i.test(firstLine)) row.classList.add('type-wait');
            else if (/^\[\s*$/.test(firstLine)) row.classList.add('type-script');
            else row.classList.add('type-cmd');
        };

        // ----------  行（row）生成 ----------
        const addRow = (c = { label: '', lines: [] }) => {
            const row = document.createElement('div');
            row.className = 'row pending-cm';
            row.innerHTML = `<input class="cmd-label" value="${c.label}"><textarea class="cmd-lines">${c.lines.join('\n')}</textarea><div class="ctrl"><button class="b up" title="上へ">▲</button><button class="b down" title="下へ">▼</button><button class="b del" title="削除">✕</button></div>`;
            row.querySelector('.del').onclick = () => { editors.delete(row); row.remove(); };
            row.querySelector('.up').onclick = () => { const prev = row.previousElementSibling; if (prev) ls.insertBefore(row, prev); };
            row.querySelector('.down').onclick = () => { const next = row.nextElementSibling?.nextElementSibling; if (next) ls.insertBefore(row, next); else ls.appendChild(row); };
            ls.appendChild(row);
            classifyRow(row, (c.lines[0] || '').trim());
            queueCM(row);
        };

        cmds.forEach(addRow);
        ed.querySelector('#ad').onclick = () => addRow();

        // ----------  保存 ----------
        ed.querySelector('#sv').onclick = () => {
            cmds = [...ls.querySelectorAll('.row')].map(row => {
                const label = row.querySelector('.cmd-label').value.trim();
                const srcTxt = editors.has(row) ? editors.get(row).getValue() : row.querySelector('.cmd-lines').value;
                const lines = srcTxt.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter((l, i, a) => !((i === 0 || i === a.length - 1) && l === ''));
                while (lines[0] !== undefined && lines[0].trim() === '') lines.shift();
                while (lines[lines.length - 1] !== undefined && lines[lines.length - 1].trim() === '') lines.pop();
                return label && lines.length ? { label, lines } : null;
            }).filter(Boolean);

            save(CMD_KEY, cmds);
            buildWin();
            ed.remove(); ed = null;
        };
        ed.querySelector('#x').onclick = () => { ed.remove(); ed = null; };
    };

    /* ========== 変数編集 ========== */
    const toggleVar = () => {
        if (vr) { vr.remove(); vr = null; return; }
        vr = document.createElement('div'); vr.id = 'tm-var';
        vr.innerHTML = `<div class="head"><span>変数編集</span><button class="b" id="x">✕</button></div>
                      <div class="list" id="vl"></div>
                      <div class="dock"><button class="b add" id="ad">■ 追加</button><button class="b save" id="sv">■ 保存</button></div>
                      <div class="rs"></div>`;
        drag(vr); resz(vr);
        const vl = vr.querySelector('#vl');
        const addRow = (v = { name: '', value: '' }) => {
            const r = document.createElement('div'); r.className = 'row';
            r.innerHTML = `<input placeholder="名前" value="${v.name}">
                         <input placeholder="値"   value="${v.value}">
                         <button class="b del">✕</button>`;
            r.querySelector('.del').onclick = () => r.remove();
            vl.appendChild(r);
        };
        vars.forEach(addRow);
        vr.querySelector('#ad').onclick = () => addRow();
        vr.querySelector('#sv').onclick = () => {
            vars = [...vl.querySelectorAll('.row')].map(r => {
                const [n, v] = r.querySelectorAll('input'); return { name: n.value.trim(), value: v.value.trim() };
            }).filter(o => o.name);
            save(VAR_KEY, vars); vr.remove(); vr = null;
        };
        vr.querySelector('#x').onclick = () => { vr.remove(); vr = null; };
        document.body.appendChild(vr);
    };

    /* ========== Auto コマンド編集 ========== */
    const toggleAuto = () => {
        if (au) { au.remove(); au = null; startAutoLoop(); return; }
        stopAutoLoop();
        au = document.createElement('div'); au.id = 'tm-au';
        au.innerHTML = `<div class="head"><span>AUTO コマンド</span><button class="b" id="x">✕</button></div>
                        <textarea id="au-ta"style="flex:1;min-height:0;margin:8px;background:#555;color:#fff;
                                                   border:1px solid #777;font-family:monospace;font-size:12px;resize:none;white-space:pre;"></textarea>
                        <div class="dock"><button class="b save" id="sv">■ 保存</button></div><div class="rs"></div>`;
        drag(au); resz(au);
        const ta = au.querySelector('#au-ta');
        ta.value = autoCmd.join('\n');
        buildRTfromGui();
        au.querySelector('#sv').onclick = () => {
            autoCmd = ta.value.split(/\r?\n/);
            save(AUTO_KEY, autoCmd);
            const tokens = tokenize(autoCmd.join('\n'));
            console.log('tokens=', tokens);
            autoAst = parse(tokens);
            autoAst.forEach(n => {
                if (n.kind === 'decl' || (n.kind === 'expr' && n.immediate)) {
                    evalNode(n, RT);
                }
            });
            au.remove(); au = null;
            startAutoLoop();
            console.log('autoTicker=', autoTicker);
            console.log('autoAst=', autoAst);
        };
        au.querySelector('#x').onclick = () => { au.remove(); au = null; startAutoLoop(); };
        document.body.appendChild(au);
    };

    /* ========== Help ウインドウ ========== */
    function beautifyHelpCode () {
        if (typeof CodeMirror !== 'function') return;

        document.querySelectorAll('#tm-help pre').forEach(pre => {
            let src = pre.textContent.replace(/^\s*\n|\n\s*$/g, '');

            const indents = src.split('\n')
            .filter(l => l.trim())
            .map(l => l.match(/^ */)[0].length);
            const min = Math.min(...indents, 0);
            if (min) src = src.split('\n').map(l => l.slice(min)).join('\n');

            const ta = document.createElement('textarea');
            ta.value = src;
            pre.replaceWith(ta);

            const cm = CodeMirror.fromTextArea(ta, {
                theme          : 'monokai',
                mode           : 'javascript',
                readOnly       : true,
                lineNumbers    : false,
                viewportMargin : Infinity,
                lineWrapping   : true
            });
            cm.addOverlay(highlightPaletteKW);
            cm.setSize('100%', 'auto');
        });
    }

    const toggleHelp = () => {
        if (hl) { hl.remove(); hl = null; return; }

        hl = document.createElement('div'); hl.id = 'tm-help';
        hl.innerHTML = `<div class="head"><span>ヘルプ</span><button class="b" id="x">✕</button></div>
                        <div style="flex:1;overflow:auto;padding:8px;font-size:12px;line-height:1.4;">${HELP_HTML}</div>
                        <div class="rs"></div>`;
        drag(hl); resz(hl);
        hl.querySelector('#x').onclick = () => { hl.remove(); hl = null; };
        document.body.appendChild(hl);
        beautifyHelpCode();
    };

    /* ========== ランチャーボタン ========== */
    const injectLaunch = () => wait(DICEBAR).then(bar => {
        if (bar.querySelector('#tm-launch')) return;
        const b = document.createElement('button');
        b.id = 'tm-launch'; b.type = 'button';
        b.className = 'MuiButtonBase-root MuiIconButton-root MuiIconButton-sizeSmall';
        b.innerHTML = `<span class="MuiSvgIcon-root" style="width:20px;height:20px;fill:#ACACAC;">
                     <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><rect x="9" y="11" width="6" height="2" fill="#202020"/></svg></span>`;
        b.onclick = toggleWin;
        bar.appendChild(b);
    });
    injectLaunch(); setInterval(injectLaunch, 1500);

    /* ========== Hotkeys ========== */
    document.addEventListener('keydown', e => {
        if (e.altKey && !e.ctrlKey && !e.shiftKey) {
            const k = e.key.toLowerCase();
            if (k === HK_VIEW) toggleWin();
            if (k === HK_EDIT) toggleEd();
            if (k === HK_VARS) toggleVar();
            if (e.key === 'e') win.style.display = (win.style.display === 'none') ? '' : 'none';
        }
    });

    /* ========== URL 遷移 クリーンアップ ========== */
    let path = location.pathname;
    setInterval(() => { if (location.pathname !== path) { path = location.pathname; win?.remove(); ed?.remove(); vr?.remove(); } }, 800);

    /* ========== 起動時にパレット自動表示したくなければ下行をコメントアウト ========== */
    buildWin();
})();

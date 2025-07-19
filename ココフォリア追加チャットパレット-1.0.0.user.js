// ==UserScript==
// @name              ココフォリア追加チャットパレット
// @version           1.4.9
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
// @require           https://cdn.jsdelivr.net/npm/codemirror@5/addon/edit/closebrackets.js
// @require           https://cdn.jsdelivr.net/npm/codemirror@5/addon/edit/matchbrackets.js
// @require           https://cdn.jsdelivr.net/npm/codemirror@5/addon/hint/show-hint.js
// @require           https://cdn.jsdelivr.net/npm/codemirror@5/addon/hint/javascript-hint.js
// @resource CM_BASE  https://cdn.jsdelivr.net/npm/codemirror@5/lib/codemirror.css
// @resource CM_MONO  https://cdn.jsdelivr.net/npm/codemirror@5/theme/monokai.css
// @resource CM_FOLD  https://cdn.jsdelivr.net/npm/codemirror@5/addon/fold/foldgutter.css
// @resource CM_HINT  https://cdn.jsdelivr.net/npm/codemirror@5/addon/hint/show-hint.css
// @grant             GM_getResourceText
// @grant             GM_addStyle
// @license           MIT
// ==/UserScript==

/* global CodeMirror */
/* eslint no-return-assign: 0 */

(() => {
    'use strict';

    GM_addStyle(GM_getResourceText('CM_BASE'));
    GM_addStyle(GM_getResourceText('CM_MONO'));
    GM_addStyle(GM_getResourceText('CM_FOLD'));
    GM_addStyle(GM_getResourceText('CM_HINT'));

    /* ========== 設定 ========== */
    const CMD_KEY = 'tmPaletteCmds_v3', VAR_KEY = 'tmPaletteVars_v3', AUTO_KEY = 'tmPaletteAuto_v3', HELP_KEY = 'tmPaletteHelp_v1', POS_KEY = 'tmPaletteWinPos_v1';
    const DEF_CMDS = [{ label: '1D100', lines: ['1D100', '1d100<=50', 'CCB<=50'] }];
    const DEF_VARS = [{ name: 'NUM', value: '1' }];
    const TXT_SEL = 'textarea[name="text"]';
    const DICEBAR = 'div.sc-igOlGb';
    const HK_VIEW = 'p', HK_EDIT = 'o', HK_VARS = 'v';
    const SEND_DELAY = 500;
    const CACHE_SPAN = 12_000;
    const CHAT_CACHE = 50;
    const KW_ALIAS = { 'M': /失敗/, 'S': /(?<!決定的)成功|(?<!決定的成功\/)スペシャル/, 'F': /致命的失敗/, '100F': /(100.*致命的失敗|致命的失敗.*100)/, 'C': /(クリティカル|決定的成功(?:\/スペシャル)?)/, '1C': /(1.*(?:クリティカル|決定的成功)|(?:クリティカル|決定的成功).*1)/ };
    const CONF_MIME = 'application/x-ccp+json';
    const CONF_VER = 1;
    const EXPORT_FILE = () => `追加チャット情報${new Date().toISOString().replace(/[:.]/g, '-')}.ccp`;
    const AUTO_ATTR = 'data-auto-card';
    const CARD_SEL = `div.MuiPaper-root`;
    const STOP = Symbol('STOP');
    const CM_SET = new Map();
    const SEEN_RC_IDX = new Set();
    const BASE_API = [
        { text: 'SEnd()', label: '後続の行をスキップして即終了' },
        { text: 'Wait()', label: ' ...秒の待機 ' },
        { text: 'Wait(500)', label: '0.5 秒待機' },
        { text: 'LoadNames()', label: '現在のパーティタブから名前のキャッシュを獲得する' },
        { text: 'CMessage[]', label: '何番目までのルームチャットの内容' },
        { text: 'CMessage[0]', label: '一番最新のルームチャットの内容' },
        { text: 'CMessage[].Find()', label: '何番目までのルームチャットの内容から探す' },
        { text: 'CMessage[0].Find()', label: '一番最新のルームチャットの内容から探す' },
        { text: 'CMessage[].Lines()', label: '何番目までのルームチャットの内容をすべて取得する' },
        { text: 'CMessage[0].Lines()', label: '一番最新のルームチャットの内容をすべて取得する' },
        { text: 'CMessage[].FindAt()', label: '何番目までのルームチャットの内容から数える' },
        { text: 'CMessage[0].FindAt()', label: '一番最新のルームチャットの内容から数える' },
        { text: 'CMessage[].Match()', label: '何番目までのルームチャットの内容から一致するかを見る' },
        { text: 'CMessage[0].Match()', label: '一番最新のルームチャットの内容から一致するかを見る' },
        { text: 'CMessage[].MatchAll()', label: '何番目までのルームチャットの内容から一致するものを全て抜き出す' },
        { text: 'CMessage[0].MatchAll()', label: '一番最新のルームチャットの内容から一致するものを全て抜き出す' },
        { text: 'CMessage[].GetNum()', label: '何番目までのルームチャットの内容から最後の数字をとる' },
        { text: 'CMessage[0].GetNum()', label: '一番最新のルームチャットの内容から最後の数字をとる' },
        { text: 'CMessage[].Send()', label: 'ルームチャットに文字列を投げる' },
        { text: 'CMessage[0].Send()', label: 'ルームチャットに文字列を投げる' },
    ];
    const ACTOR_API = [
        { text: 'Actor.Now()', label: '現在アクター名を返す' },
        { text: 'Actor()', label: 'アクターを設定する' },
        { text: 'Actor("PC-A")', label: 'アクターを PC-A に切替' },
        { text: 'Actor.Set()', label: 'アクターを設定する' },
        { text: 'Actor.Set("PC-A")', label: 'アクターを PC-A に切替' },
    ];
    const CHARBOX_API = [
        { text: 'CharBox()', label: '現在値を取得' },
        { text: 'CharBoxMax()', label: '最大値を取得' },
        { text: 'CharBoxRaw()', label: '“現在/最大”文字列' },
        { text: 'CharBoxNumber()', label: '何番目にいるかを取得する' },
        { text: 'CharBox("HP")', label: 'HP 現在値を取得' },
        { text: 'CharBoxMax("HP")', label: 'HP 最大値を取得' },
        { text: 'CharBoxRaw("HP")', label: 'HP “現在/最大”文字列' },
        { text: 'CharBoxNumber("TEST")', label: 'TEST が何番目にいるかを取得する' },
        { text: 'CharBox("HP", 0)', label: '0番目の HP 現在値を取得' },
        { text: 'CharBoxMax("HP", 0)', label: '0番目の HP 最大値を取得' },
        { text: 'CharBoxRaw("HP", 0)', label: '0番目の HP “現在/最大”文字列' },
    ];
    const DICE_API = [
        { text: 'd4', label: '4面ダイス(合計値)' },
        { text: 'd6', label: '6面ダイス(合計値)' },
        { text: 'd8', label: '8面ダイス(合計値)' },
        { text: 'd10', label: '10面ダイス(合計値)' },
        { text: 'd12', label: '12面ダイス(合計値)' },
        { text: 'd20', label: '20面ダイス(合計値)' },
        { text: 'd100', label: '100面ダイス(合計値)' },
        { text: 'b4', label: '4面ダイス(分離値)' },
        { text: 'b6', label: '6面ダイス(分離値)' },
        { text: 'b8', label: '8面ダイス(分離値)' },
        { text: 'b10', label: '10面ダイス(分離値)' },
        { text: 'b12', label: '12面ダイス(分離値)' },
        { text: 'b20', label: '20面ダイス(分離値)' },
        { text: 'b100', label: '100面ダイス(分離値)' },
        { text: 'CCB<=', label: 'クトゥルフダイス判定コマンド' },
        { text: 'CCB()<=', label: 'クトゥルフダイス判定コマンド(故障ナンバー)' },
        { text: 'CBRB(, )', label: 'クトゥルフダイス判定組み合わせロール' },
        { text: 'CBRB(x, y)', label: 'クトゥルフダイス判定組み合わせロール(使用例)' },
        { text: 'REBS( - )', label: 'クトゥルフダイス判定対抗ロール' },
        { text: 'REBS(x - y)', label: 'クトゥルフダイス判定対抗ロール(使用例)' },
        { text: 'choice', label: '選択ダイス(半角空白区切り)' },
        { text: 'choice[]', label: '選択ダイス(カンマ区切り)' },
        { text: '/scene', label: 'ココフォリアシーン移動コマンド' },
        { text: '/scene [scene]', label: 'ココフォリアシーン移動コマンド(使用例)' },
        { text: '/save', label: 'ココフォリアルームセーブコマンド' },
        { text: '/save [save]', label: 'ココフォリアルームセーブコマンド(使用例)' },
        { text: '/load', label: 'ココフォリアルームロードコマンド' },
        { text: '/load [load]', label: 'ココフォリアルームロードコマンド(使用例)' },
        { text: '/pdf', label: 'ココフォリアPDF表示コマンド' },
        { text: '/pdf [URL]', label: 'ココフォリアPDF表示コマンド(使用例)' },
        { text: '/var', label: 'ココフォリアルーム変数変更コマンド' },
        { text: '/var [label][value]', label: 'ココフォリアルーム変数変更コマンド(使用例)' },
        { text: '/play', label: 'ココフォリアYoutube動画再生コマンド' },
        { text: '/play [URL]', label: 'ココフォリアYoutube動画再生コマンド(使用例)' },
        { text: '/roll-table', label: 'ココフォリアダイス表コマンド' },
        { text: '/roll-table [diceTable]', label: 'ココフォリアダイス表コマンド(使用例)' },
        { text: '/omikuji', label: 'おみくじコマンド。プロ限定' },
        { text: ':initiative', label: 'パラメータ編集コマンド（イニシアチブ操作）' },
        { text: ':HP', label: 'パラメータ編集コマンド（HP 操作）' },
        { text: ':MP', label: 'パラメータ編集コマンド（MP 操作）' },
        { text: ':SAN', label: 'パラメータ編集コマンド（SAN 操作）' },
        { text: '', label: '' },
    ];
    const PALETTE_DICT = [ ...BASE_API, ...ACTOR_API, ...CHARBOX_API, ...DICE_API ];
    const API_MEMBERS = {
        Actor    : ['Set()', 'Now()'],
        CMessage : ['Find()', 'Lines()', 'FindAt()', 'Match()', 'MatchAll()',
                    'GetNum()', 'Send()'],
    };
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
    const varReg = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const idle = window.requestIdleCallback ? f => requestIdleCallback(f, { timeout: 100 }) : f => setTimeout(f, 16);
    const paletteOverlay = {
        token(stream) {
            if (stream.sol()) {
                // ── [ WAIT ... ] / [ WAITMSG ... ] ----------------
                if (stream.match(/^\s*\[\s*(WAIT|WAITMSG)\b/i)) {
                    stream.skipToEnd();
                    return 'wait-dir';
                }
                // ── [ ... ] スクリプトブロック -------------------
                if (stream.peek() === '[' || stream.peek() === ']') {
                    stream.skipToEnd();
                    return 'script-block';
                }
                // ── /scene などスラッシュコマンド ----------------
                if (stream.match(/^\/\w+/)) {
                    stream.skipToEnd();
                    return 'slash-cmd';
                }
                // ── :HP や :AP+3 など コロンコマンド ----------------
                if (stream.match(/^:[^\s]+/)) {
                    stream.skipToEnd();
                    return 'param-cmd';
                }
                // ── CCB<=70, 3d6/2 などダイス or 計算 ------------
                if (stream.match(/^(?:\d+[dD]|[Cc][CcBbRr]?|RESB?|choice\[)/)) {
                    stream.skipToEnd();
                    return 'dice-cmd';
                }
            }
            stream.skipToEnd();
            return null;
        }
    };
    const highlightPaletteKW = (() => {
        const WORDS = [
            'SEnd',
            'Wait',
            'LoadNames',
            'CMessage',
            'CharBox',
            'CharBoxMax',
            'CharBoxRaw',
            'CharBoxNumber',
            'Actor',
            'Actor\\.Set',
            'Actor\\.Now'
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
    const HELP_HTML = `
<div id="tm-help-body">
    <!-- === NAV ============================================ -->
    <aside id="tm-help-nav-box">
        <h3>目次</h3>
        <ul id="tm-help-nav"></ul>
    </aside>

    <!-- === ARTICLE ======================================== -->
    <article id="tm-help-article">

        <!-- ▽ Shortcut -->
        <section data-ref="shortcut">
            <h2>ショートカット</h2>
            <table>
                <thead>
                    <tr>
                        <th>キー</th>
                        <th>機能</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><kbd>Alt+P</kbd></td>
                        <td>パレット表示 / 非表示</td>
                    </tr>
                    <tr>
                        <td><kbd>Alt+O</kbd></td>
                        <td>コマンド編集</td>
                    </tr>
                    <tr>
                        <td><kbd>Alt+V</kbd></td>
                        <td>変数編集</td>
                    </tr>
                    <tr>
                        <td><kbd>A</kbd></td>
                        <td>Auto スクリプト（開発中）</td>
                    </tr>
                </tbody>
            </table>
        </section>

        <!-- ▽ Toolbar icons -->
        <section data-ref="toolbar">
            <h2>ツールバーアイコン</h2>
            <table>
                <thead>
                    <tr>
                        <th style="width:4em">アイコン</th>
                        <th>機能</th>
                        <th style="width:9em">同等ショートカット</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="text-align:center;font-size:18px">🎲</td>
                        <td>
                            <b>自動ダイスカードの表示 / 非表示</b><br>
                            <code>data-auto="true"</code> が付いたカードを一括で隠し、再クリックで復帰。
                        </td>
                        <td>–</td>
                    </tr>
                    <tr>
                        <td style="text-align:center;font-size:18px">⤒</td>
                        <td>
                            <b>.ccp インポート</b><br>
                            事前にエクスポートした <code>*.ccp</code> を読み込み、<br>
                            パレット / 変数 / Auto スクリプトを上書きします。
                        </td>
                        <td>–</td>
                    </tr>
                    <tr>
                        <td style="text-align:center;font-size:18px">⤓</td>
                        <td>
                            <b>.ccp エクスポート</b><br>
                            現在の設定をまとめて保存。ファイル名はデフォルトで<br>
                            <code>追加チャット情報YYYY-MM-DDTHH-MM-SS.ccp</code>。
                        </td>
                        <td>–</td>
                    </tr>
                    <tr>
                        <td style="text-align:center;font-size:18px">？</td>
                        <td><b>ヘルプ表示 / 非表示</b></td>
                        <td><kbd>Alt+P</kbd> → <kbd>?</kbd></td>
                    </tr>
                    <tr>
                        <td style="text-align:center;font-size:18px">A</td>
                        <td><b>Auto スクリプトウィンドウ</b>（開発中）</td>
                        <td><kbd>A</kbd></td>
                    </tr>
                    <tr>
                        <td style="text-align:center;font-size:18px">Φ</td>
                        <td><b>変数編集ウィンドウ</b></td>
                        <td><kbd>Alt+V</kbd></td>
                    </tr>
                    <tr>
                        <td style="text-align:center;font-size:18px">⚙</td>
                        <td><b>コマンド編集ウィンドウ</b></td>
                        <td><kbd>Alt+O</kbd></td>
                    </tr>
                    <tr>
                        <td style="text-align:center;font-size:18px">✕</td>
                        <td><b>パレットを閉じる</b>（ウィンドウ自体は非表示に）</td>
                        <td>–</td>
                    </tr>
                </tbody>
            </table>
        </section>

        <!-- ▽ Basics -->
        <section data-ref="command">
            <h2>コマンド編集 – 基本</h2>
            <p>テキストエリア 1 行 = 1 コマンド。改行すると次の行になります。</p>
            <h3>WAIT ディレクティブ</h3>
            <dl>
                <dt><code>[ WAIT&nbsp;500 ]</code></dt>
                <dd>0.5 秒待機</dd>
                <dt><code>[ WAIT&nbsp;1000 ]</code></dt>
                <dd>1 秒待機</dd>
            </dl>
        </section>

        <!-- ▽ Script API -->
        <section data-ref="api">
            <h2>コマンド内スクリプト API</h2>
            <p>
                <code>[ … ]</code> で囲んだブロックは <strong>純粋な JavaScript</strong> として実行されます。<br>
                下記シンボルは <code>import</code> や <code>this</code> 参照なしで即呼び出せます。
            </p>

            <!-- ================================================================ -->
            <h3>1. 制御フロー</h3>
            <table class="api">
                <thead>
                    <tr>
                        <th style="width:11em">シンボル</th>
                        <th>機能</th>
                        <th style="width:7em">戻り値</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>SEnd()</code></td>
                        <td>呼び出し以降のコマンド行を<strong>即座にスキップ</strong>（関数で言う <code>return</code>）。</td>
                        <td><code>void</code></td>
                    </tr>
                    <tr>
                        <td><code>Wait(ms)</code></td>
                        <td>指定ミリ秒だけ<strong>非同期ウェイトを登録</strong>。
                            キューに積むだけなので <code>await</code> 不要。</td>
                        <td><code>void</code></td>
                    </tr>
                </tbody>
            </table>

            <!-- ================================================================ -->
            <h3>2. メッセージラッパ <code>CMessage[n]</code></h3>
            <p>
                直近の投稿履歴をラップしたオブジェクト配列。<br>
                <code>CMessage[0]</code> が「直前」、<code>[1]</code> が 1 つ前 … というインデックス順。
            </p>

            <table class="api">
                <thead>
                    <tr>
                        <th style="width:12em">メソッド</th>
                        <th>用途</th>
                        <th style="width:7em">戻り値</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>.text</code></td>
                        <td>生テキスト</td>
                        <td><code>string</code></td>
                    </tr>
                    <tr>
                        <td><code>.Find(kw)</code></td>
                        <td>キーワード <code>kw</code> を含む？
                            <small>単文字 <code>M / S / F / C…</code> は <a href="#kw-alias">KW_ALIAS</a> を自動展開</small>
                        </td>
                        <td><code>boolean</code></td>
                    </tr>
                    <tr>
                        <td><code>.Lines()</code></td>
                        <td>改行で分割した配列を返す</td>
                        <td><code>string[]</code></td>
                    </tr>
                    <tr>
                        <td><code>.FindAt(kw)</code></td>
                        <td><code>kw</code> の出現回数</td>
                        <td><code>number</code></td>
                    </tr>
                    <tr>
                        <td><code>.Match(re)</code></td>
                        <td>正規表現 <code>re</code> の最初のマッチ</td>
                        <td><code>RegExpMatchArray | null</code></td>
                    </tr>
                    <tr>
                        <td><code>.MatchAll(re)</code></td>
                        <td>全マッチ配列（<code>[...str.matchAll()]</code> 相当）</td>
                        <td><code>RegExpMatchArray[]</code></td>
                    </tr>
                    <tr>
                        <td><code>.GetNum()</code></td>
                        <td>行末の「&gt; 12」の数値だけ抜き取る</td>
                        <td><code>number | NaN</code></td>
                    </tr>
                    <tr>
                        <td><code>.Send(...txt)</code></td>
                        <td>引数文字列を<strong>即座に送信キューへ</strong></td>
                        <td><code>void</code></td>
                    </tr>
                </tbody>
            </table>

            <!-- ================================================================ -->
            <h3>3. キャラクターボックス</h3>
            <table class="api">
                <thead>
                    <tr>
                        <th style="width:14em">関数</th>
                        <th>機能</th>
                        <th style="width:7em">戻り値</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>CharBox(label,&nbsp;idx=0)</code></td>
                        <td>現在値を数値（変換不可なら文字列）で返す。
                            例：<code>CharBox('HP')</code> → 20</td>
                        <td><code>number | string | null</code></td>
                    </tr>
                    <tr>
                        <td><code>CharBoxMax(label,&nbsp;idx=0)</code></td>
                        <td>最大値を取得。最大が無い場合は <code>CharBox</code> と同じ。</td>
                        <td><code>number | string | null</code></td>
                    </tr>
                    <tr>
                        <td><code>CharBoxRaw(label,&nbsp;idx=0)</code></td>
                        <td>「20/35」等の生文字列をそのまま</td>
                        <td><code>string | null</code></td>
                    </tr>
                    <tr>
                        <td><code>CharBoxNumber(label)</code></td>
                        <td>
                            パーティ表示順（0&nbsp;=&nbsp;先頭）を返す。<br>
                            事前に <code>LoadNames()</code> でキャッシュされていることが前提。
                        </td>
                        <td><code>number (0-based) | -1</code></td>
                    </tr>
                    <tr>
                        <td><code>LoadNames()</code></td>
                        <td>パーティ全員の<strong>表示名</strong>を再取得してキャッシュを更新</td>
                        <td><code>string[]</code></td>
                    </tr>
                </tbody>
            </table>

            <!-- ================================================================ -->
            <h3>4. アクター操作</h3>
            <table class="api">
                <thead>
                    <tr>
                        <th style="width:10em">シンボル</th>
                        <th>機能</th>
                        <th style="width:7em">戻り値</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>Actor(name)</code></td>
                        <td>キャラクター選択 UI を操作して<strong>アクティブを切替</strong>。</td>
                        <td><code>void</code></td>
                    </tr>
                    <tr>
                        <td><code>Actor.Set(name)</code></td>
                        <td class="hint">エイリアス（後方互換）</td>
                        <td><code>void</code></td>
                    </tr>
                    <tr>
                        <td><code>Actor.Now()</code></td>
                        <td>現在パレットで選択中の<strong>キャラ名を即取得</strong></td>
                        <td><code>string | null</code></td>
                    </tr>
                </tbody>
            </table>

            <!-- ================================================================ -->
            <h3 id="kw-alias">5. KW_ALIAS — 成否ワイルドカード</h3>
            <p>単文字を渡すだけで代表的な判定語を広範に拾えます。</p>

            <table class="api">
                <thead>
                    <tr>
                        <th style="width:4em">記号</th>
                        <th>展開される正規表現</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>M</td>
                        <td><code>/失敗/</code></td>
                    </tr>
                    <tr>
                        <td>S</td>
                        <td><code>/成功|スペシャル/</code></td>
                    </tr>
                    <tr>
                        <td>F</td>
                        <td><code>/致命的失敗/</code></td>
                    </tr>
                    <tr>
                        <td>C</td>
                        <td><code>/クリティカル|決定的成功/</code></td>
                    </tr>
                    <tr>
                        <td>…</td>
                        <td>他にも <code>100F</code> / <code>1C</code> などを同梱</td>
                    </tr>
                </tbody>
            </table>

            <p class="note">
                例：<code>CMessage[0].Find('S')</code> は「成功」「スペシャル」のどちらかにマッチすれば <code>true</code>。
            </p>

            <!-- ================================================================ -->
            <h3>6. 変数展開</h3>
            <p>
                変数編集ウィンドウで定義した <code>NAME → 値</code> は<br>
                <code>{NAME}</code> と書けばその場で文字列展開されます。<br>
                スクリプトからはグローバル変数として直接アクセス可。
            </p>

        </section>

        <!-- ▽ KW_ALIAS -->
        <section data-ref="kw">
            <h2>KW_ALIAS — 特殊キーワード</h2>
            <table>
                <thead>
                    <tr>
                        <th style="width:4em">記号</th>
                        <th>マッチ語</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>M</code></td>
                        <td>失敗</td>
                    </tr>
                    <tr>
                        <td><code>S</code></td>
                        <td>成功 / スペシャル</td>
                    </tr>
                    <tr>
                        <td><code>F</code></td>
                        <td>致命的失敗</td>
                    </tr>
                    <tr>
                        <td><code>100F</code></td>
                        <td>致命的失敗 + 100</td>
                    </tr>
                    <tr>
                        <td><code>C</code></td>
                        <td>クリティカル</td>
                    </tr>
                    <tr>
                        <td><code>1C</code></td>
                        <td>クリティカルかつ 1 始/終</td>
                    </tr>
                </tbody>
            </table>
        </section>

        <!-- ▽ Variables -->
        <section data-ref="vars">
            <h2>変数（グローバル）</h2>
            <p><code>{NAME}</code> と書くか、スクリプト内で <code>NAME</code> 変数として直接使えます。</p>
        </section>

        <!-- ▽ Samples -->
        <section data-ref="samples">
            <h2>使用例</h2>

            <!-- ① 成功時だけダメージ  -->
            <details open>
                <summary>① 成功時だけダメージ</summary>
<pre>
:AP-1
CCB<=70 【パンチ】
[ if (CMessage[0].Find('S')) CMessage[0].Send('1d6 【ダメージ】'); ]
</pre>
            </details>

            <!-- ② WAIT ディレクティブでテンポ調整 -->
            <details>
                <summary>② WAIT でテンポ調整</summary>
<pre>
:AP-1
[ WAIT 500 ]         // 0.5 秒待つ
CCB<=60 【蹴り】
[ WAIT 300 ]         // さらに 0.3 秒
1d6 【ダメージ】
</pre>
            </details>

            <!-- ③ 致命的失敗で途中終了（SEnd） -->
            <details>
                <summary>③ 致命的失敗で途中終了</summary>
<pre>
:MP-3
CCB<=50 【魔法弾】
[
  const res = CMessage[0];
  if (res.Find('F')) {     // F = 致命的失敗
    res.Send(':MP+3');     // MP 返却
    SEnd();                // これ以降をスキップ
  }
]
1d10 【ダメージ】
</pre>
            </details>

            <!-- ④ HP 消費値を抜き取って自動減算 -->
            <details>
                <summary>④ HP 消費値を抜き取る</summary>
<pre>
:AP-1
1d5 【HP消費】
[
  const hp = CMessage[0].GetNum();   // "…＞ 3" → 3
  if (!isNaN(hp)) CMessage[0].Send(\`:+HP-\${hp}\`);
]
</pre>
            </details>

            <!-- ⑤ 変数と式展開（{NUM} / NUM） -->
            <details>
                <summary>⑤ 変数と式展開</summary>
<pre>
// 変数 NUM を {NUM} で参照
:AP-{NUM}
[ NUM += 1; ] // スクリプト内では通常の変数
// 変更は自動保存され次回に引き継がれる
</pre>
            </details>

            <!-- ⑥ Actor 切替と復帰 -->
            <details>
                <summary>⑥ Actor 切替と復帰</summary>
<pre>
[
  const self = Actor.Now();        // 現在アクター名を保存
  Actor('召喚獣');                 // 召喚獣に切替
  CMessage[0].Send('咆哮！');      // 召喚獣の発言
  Actor(self);                     // 元アクターへ戻す
]
</pre>
            </details>

            <!-- ⑦ CharBox 系 API 利用例 -->
            <details>
                <summary>⑦ CharBox / CharBoxMax の利用</summary>
<pre>
[
  const curHP  = CharBox('HP');       // 現在 HP
  const maxHP  = CharBoxMax('HP');    // 最大 HP
  const ratio  = (curHP / maxHP) * 100;

  if (ratio &lt; 30) {
    // HP 30% 未満なら自動で治療コマンドを送信
    CMessage[0].Send(':MP-5', '1d8 【応急手当】');
  }
]
</pre>
            </details>

            <!-- ⑧ WAIT(ms) ヘルパで非ディレクティブ待機 -->
            <details>
                <summary>⑧ Wait(ms) ヘルパ（スクリプト内待機）</summary>
<pre>
[
  CMessage[0].Send('詠唱開始…');
  Wait(1500);                     // 1.5 秒だけ待つ
  CMessage[0].Send('詠唱完了！');
]
</pre>
            </details>
            <details>
                <summary>⑨ CharBoxNumber でターゲット指定</summary>
                <pre>
// 事前に一覧をキャッシュ
[ LoadNames(); ]

// 0.3 秒だけ待機（キャッシュ完了を確実に）
[ WAIT 300 ]

[
  // 「かに」が何番目か取得
  const idx = CharBoxNumber('かに');
  if (idx &gt;= 0) {
    // そのキャラの現在 HP / 最大 HP を取得
    const cur = CharBox('HP', idx);
    const max = CharBoxMax('HP', idx);

    CMessage[0].Send(${'`'}かにの HP は ${'${cur}'}/${'${max}'}${'`'});
    // 例：ピンポイント回復
    if (cur &lt; max) CMessage[0].Send(${'`'}:+HP+5${'`'});
  } else {
    CMessage[0].Send('かにが見つかりませんでした');
  }
]
                </pre>
            </details>
        </section>

        <footer>MIT License / Script by Apocrypha (ぬべ太郎)</footer>
    </article>
</div>
    `;

    /* ========== データ========== */
    let cmds = load(CMD_KEY, DEF_CMDS).map(c => { if ('label' in c) return { auto: false, ...c }; const [label, ...lines] = c.lines ?? []; return { auto: false, label: label || 'Cmd', lines }; });
    let vars = load(VAR_KEY, DEF_VARS);
    let winPos = load(POS_KEY, {});
    let autoCmd = load(AUTO_KEY, ['// Auto script here\n(まだ何も出来ないよ)']);
    let hideAutoCards = true;
    let autoAst = [];
    let autoTicker = null;
    let nameCache = [];
    let cacheTime = 0;

    /* ---------- “1 本だけ”のタスクチェーン ---------- */
    let _taskChain = Promise.resolve();
    const queue = fn => (_taskChain = _taskChain.then(fn));

    /* ========== 変数オブジェクトヘルパ ========== */
    const varsObj = () => Object.fromEntries(vars.map(v => [v.name, Number(v.value) || 0]));
    const saveVarsObj = obj => { vars = Object.entries(obj).map(([name, v]) => ({ name, value: String(Math.trunc(v)) })); save(VAR_KEY, vars); };

    /* ========== チャットメッセージ取得 ========== */
    const getLastMessages = (n = CHAT_CACHE) => {
        return Array.from(document.querySelectorAll('div.MuiListItem-root'))
            .slice(-n)
            .reverse()
            .map(el => {
            const body = el.querySelector('div[data-testid=\"RoomMessage__body\"], p');
            return body ? body.innerText.trim() : '';
        });
    };
    const wrapMessages = (arr, ctx) => arr.map(txt => {
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
        return { text: txt, Find, Lines, Match, MatchAll, FindAt, GetNum, Send: (...lines) => enqueueSend(lines.flat(), ctx) };
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

    function Actor(label){ queue(() => _selectActor(label)); }
    Actor.Set = Actor;
    Actor.Now = () =>{
        const inp = document.querySelector('input[name="name"]');
        return inp ? inp.value.trim() : null;
    };
    window.Actor = Actor;

    //  ==== ウェイトヘルパ =========================
    function Wait(ms){ return new Promise(res => setTimeout(res, Number(ms))); }

    function preprocessWait(src){
        const store = [];
        const push = m => { store.push(m); return `__KEEP${store.length-1}__`; };
        src = src
            .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, push)
            .replace(/\/\/[^\n]*/g, push)
            .replace(/\/\*[\s\S]*?\*\//g, push);
        src = src.replace(/(^|[^\w$])(Wait\s*\()/g, (m, pre, rest) => {
            if(/\bawait\s*$/.test(pre)) return m;
            return pre + 'await ' + rest;
        });
        src = src.replace(/__KEEP(\d+)__/g, (_,i)=>store[+i]);
        return src;
    }

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

    /* ========== 存在位置 ========== */
    async function grabNames () {
        const btns = [...document.querySelectorAll('button.sc-hHSjTJ')];
        const names = new Array(btns.length).fill('');
        for (let i = 0; i < btns.length; i++) {
            const b = btns[i];
            b.click();
            names[i] = await new Promise(res => {
                const iv = setInterval(() => {
                    const h6 = document.querySelector('h6.sc-dPyGX');
                    if (h6 && h6.textContent.trim()) {
                        clearInterval(iv); res(h6.textContent.trim());
                    }
                }, 40);
                setTimeout(() => { clearInterval(iv); res(''); }, 1000);
            });
            b.click();
        }
        return names;
    }

    async function LoadNames () { nameCache = await grabNames(); cacheTime = Date.now(); return nameCache; }

    function CharBoxNumber (label) { if (Date.now() - cacheTime > CACHE_SPAN) return -1; return nameCache.findIndex(n => n === label); }

    /* ========== 再帰展開 ========== */
    const expOnce = (s, d) => s.replace(/\{([^{}]+?)}/g, (m, p) => d[p] !== undefined ? d[p] : m);
    const expRec = (s, d) => { let p; do { p = s; s = expOnce(s, d); } while (s !== p); return s; };

    /* ========== スクリプト行実行 ========== */
    const runScript = async (code, ctx) => {
        try {
            code = preprocessWait(code);
            const fn = new Function('ctx', `return (async () => {with(ctx){${code}}})();`);
            await fn(ctx);
        } catch(e) {
            if (e === STOP) throw STOP;
            alert('[ScriptError] ' + e);
            console.error('[ScriptError]', e);
        }
    };

    /* ========== 送信ラッパ ========== */
    function chunkLines(rawLines){
        const out = [];
        for(let i = 0; i < rawLines.length; i++){
            let line = String(rawLines[i]||'');
            if(!line.trim()) continue;
            if(line.trim().startsWith('[') && !line.trim().endsWith(']')){
                const buf = [line];
                while(i+1 < rawLines.length){
                    line = String(rawLines[++i]);
                    buf.push(line);
                    if(line.trim().endsWith(']')) break;
                }
                out.push(buf.join('\n'));
            } else{ out.push(line); }
        }
        return out;
    }

    async function processOneChunk(chunk, ctx){
        try {
            const txt = String(chunk).trim();

            if(/^\[\s*End\s*\]$/.test(txt)){ ctx.__stop = true; return; }

            let m = txt.match(/^\[\s*WAITMSG\s+"([^"]+)"\s+(\d+)\s*\]$/);
            if(m){
                const kw = m[1], need = +m[2];
                while(true){
                    const msgs = wrapMessages(getLastMessages(need));
                    if(msgs.length >= need && msgs[0].FindAt(kw) > 0) break;
                    await sleep(500);
                }
                return;
            }

            m = txt.match(/^\[\s*WAIT\s+(\d+)\s*\]$/);
            if(m){ await sleep(+m[1]); return; }

            if(txt.startsWith('[') && txt.endsWith(']')){ await runScript(txt.slice(1,-1), ctx); return; }

            const expanded = expRec(chunk, {
                ...Object.fromEntries(Object.entries(ctx)
                                      .map(([k,v]) => [k, (typeof v === 'number' ? String(Math.trunc(v)) : String(v))]))
            });
            if(!expanded) return;

            const ta = await wait(TXT_SEL);
            sendLine(ta, expanded);
            await sleep(SEND_DELAY);
        } catch (e) {
            if (e === STOP) throw STOP;
            throw e;
        }
    }

    function enqueueSend(rawLines, existingCtx){
        const isNested = !!existingCtx;
        const ctx = existingCtx || varsObj();

        if(!ctx.__ctxTagged){
            Object.defineProperties(ctx,{
                __ctxTagged    : { value: true },
                SEnd           : { value: () => { throw STOP; } },
                CMessage       : { get  : () => wrapMessages(getLastMessages(), ctx) },
                CharBox        : { value: CharBox },
                CharBoxMax     : { value: CharBoxMax },
                CharBoxRaw     : { value: CharBoxRaw },
                CharBoxNumber  : { value: CharBoxNumber },
                Actor          : { value: Actor },
                Wait           : { value: Wait },
                LoadNames      : { value: LoadNames },
            });
        }

        const chunks = chunkLines(rawLines);

        return queue(async () => {
            for (let i = 0; i < chunks.length; i++){
                try{
                    await processOneChunk(chunks[i], ctx);
                    if(ctx.__stop) break;
                } catch(e) {
                    if (e === STOP) break;
                    throw e;
                }
            }
            // トップレベルのみ最終保存
            if(!isNested) saveVarsObj(ctx);
        });
    }

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

    document.querySelectorAll(CARD_SEL).forEach(markAndToggle);

    new MutationObserver(muts => {
        muts.forEach(m => {
            m.addedNodes.forEach(n => {
                if (n.nodeType !== 1) return;
                if (n.matches?.(CARD_SEL)) markAndToggle(n);
                n.querySelectorAll?.(CARD_SEL).forEach(markAndToggle);
            });
        });
    }).observe(document.body, { childList: true, subtree: true });

    /* ========== 簡易確認ダイアログ ========== */
    function askDiscard(cb){
        if (document.getElementById('tm-confirm')) return;
        const box = document.createElement('div');
        box.id = 'tm-confirm';
        box.innerHTML = `<div class="cf-back"></div><div class="cf-panel"><p>変更が保存されていません。<br>破棄して閉じますか？</p><footer><button class="cf-ok">破棄して閉じる</button><button class="cf-cancel">戻る</button></footer></div>`;
        document.body.appendChild(box);
        box.querySelector('.cf-ok').onclick = () => { box.remove(); cb(true); };
        box.querySelector('.cf-cancel').onclick = () => { box.remove(); cb(false); };
        const onKey = e => { if (e.key === 'Escape'){ box.remove(); cb(false); } };
        document.addEventListener('keydown', onKey, { once:true });
    }

    /* ========== CodeMirrorの補完を動かせるように設定 ========== */
    function beautifyHelpCode () {
        if (typeof CodeMirror === 'undefined') return;
        hl.querySelectorAll('#tm-help-article pre').forEach(pre => {
            const cm = CodeMirror(function(elt){
                pre.replaceWith(elt);
            },{
                value : pre.textContent,
                mode  : 'javascript',
                theme : 'monokai',
                readOnly : true,
                lineNumbers : true,
                viewportMargin : Infinity
            });
            cm.getScrollerElement().style.background = '#1e1e1e';
        });
    }

    function buildWordList(){
        const varNames = vars.map(v => v.name);
        const kw_alias = Object.keys(KW_ALIAS||{});
        const dicExtra = [...varNames, ...kw_alias].map(w => ({text:w, label:'変数 / エイリアス'}));
        return [...PALETTE_DICT, ...dicExtra];
    }

    function buildVarsOverlay() {
        const names = vars.map(v => v.name).filter(Boolean);
        if (!names.length) return null;
        names.sort((a, b) => b.length - a.length);
        const re = new RegExp(`\\b(?:${names.map(varReg).join('|')})\\b`);
        return {
            token(stream) {
                if (stream.match(re)) return 'tm-var';
                while (stream.next() != null && !stream.match(re, false)) {}
                return null;
            }
        };
    }

    CodeMirror.registerHelper('hint','palette', cm=>{
        const cur = cm.getCursor();
        const token = cm.getTokenAt(cur);
        const start = token.start, end = cur.ch;
        const word = token.string.slice(0, end - start);

        const candidates = buildWordList().filter(o => o.text.toLowerCase().startsWith(word.toLowerCase()));

        const list = candidates.map(o => ({
            text        : o.text,
            displayText : o.text,
            className   : 'cm-hint-own',
            render(el, self, data){ el.innerHTML = `<span class="cm-hint-main">${o.text}</span><span class="cm-hint-note">${o.label}</span>`; }
        }));

        return {
            list,
            from : CodeMirror.Pos(cur.line, start),
            to   : CodeMirror.Pos(cur.line, end)
        };
    });

    CodeMirror.registerHelper('hint', 'dotPalette', cm => {
        const cur = cm.getCursor();
        const line = cm.getLine(cur.line).slice(0, cur.ch);
        const m = line.match(/([A-Za-z_$][\w$]*)\.$/);
        if (!m) return;
        const obj = m[1];
        const items = API_MEMBERS[obj] || [];
        const list = items.map(txt => ({ text: txt }));
        return { list, from : cur, to : cur };
    });

    CodeMirror.registerHelper('hint', 'member', cm => {
        const cur = cm.getCursor();
        const line = cm.getLine(cur.line).slice(0, cur.ch);
        const m = line.match(/([\w$]+)(?:\[[^\]]*])*\.\s*$/);
        if (!m) return;
        const base = m[1];
        const items = API_MEMBERS[base] || [];
        const list = items.map(txt => ({
            text       : txt.replace(/\(.*$/, ''),
            displayText: txt,
            className  : 'cm-hint-own',
            render(el){ el.innerHTML =
                `<span class="cm-hint-main">${txt}</span>`; }
        }));
        return {
            list,
            from: CodeMirror.Pos(cur.line, line.length),
            to  : cur,
            completeSingle: false
        };
    });

    /* ------------------------------------------------------------------ */
    /* ↓↓↓                UI（パレット／編集／変数）                   ↓↓↓ */
    /* ------------------------------------------------------------------ */

    const css = `
        /* ───────────────────── 共通レイアウト ───────────────────── */
        #tm-win, #tm-ed, #tm-var {
            position       : fixed;
            background     : rgba(44, 44, 44, .87);
            color          : #fff;
            z-index        : 1200;
            box-shadow     : 0 2px 6px rgba(0, 0, 0, .4);
            border-radius  : 4px;
            font-family    : sans-serif;
            display        : flex;
            flex-direction : column;
        }

        /* ───────────────────── 各ウィンドウサイズ ───────────────────── */
        #tm-win { /* ランチャー                     */
            top        : 60px;
            left       : 60px;
            width      : 280px;
            min-width  : 260px;
            max-height : 70vh;
            overflow   : auto;
        }
        #tm-ed { /* コマンドエディタ               */
            top        : 90px;
            left       : 90px;
            width      : 700px;
            min-width  : 320px;
            max-height : 70vh;
            overflow   : auto;
        }
        /* 上下ボタンの hover 着色強調 */
        #tm-ed .ctrl .b:hover {
            background : #444;
            color      : #fff;
        }
        #tm-var {  /* 変数エディタ                   */
            top        : 120px;
            left       : 120px;
            width      : 370px;
            min-width  : 280px;
            max-height : 70vh;
            overflow   : auto;
        }
        #tm-help {  /* ヘルプ                        */
            position       : fixed;
            top            : 210px;
            left           : 210px;
            width          : 750px;
            height         : 500px;
            background     : rgba(44, 44, 44, 1);
            color          : #ddd;
            z-index        : 1200;
            box-shadow     : 0 2px 6px rgba(0, 0, 0, .4);
            border-radius  : 4px;
            font-family    : sans-serif;
            display        : flex;
            flex-direction : column;
        }

        /* ───────────────────── ヘルプウィンドウ内部の設定 ───────────────────── */
        #tm-help-body {
            display               : grid;
            grid-template-columns : 180px 1fr;
            height                : 100%;
        }

        #tm-help-nav-box {
            border-right : 1px solid #555;
            padding      : 8px 10px;
            overflow     : auto;
            font-size    : 12px;
        }

        #tm-help-nav-box h3 {
            margin    : 0 0 6px;
            font-size : 13px;
        }

        #tm-help-nav {
            list-style : none;
            margin     : 0;
            padding    : 0;
            font-size  : 12px;
        }

        #tm-help-nav li {
            margin : 4px 0;
        }

        #tm-help-nav a {
            color           : #8cf;
            text-decoration : none;
        }

        #tm-help-nav a:hover {
            color : #bef;
        }

        #tm-help-article {
            padding     : 10px 16px;
            overflow    : auto;
            font-size   : 12px;
            line-height : 1.55;
        }

        #tm-help-article section {
            background    : rgba(255, 255, 255, .04);
            border        : 1px solid #444;
            border-radius : 4px;
            padding       : 12px 14px;
            margin        : 0 0 22px;
        }

        #tm-help-article h2 {
            margin         : 0 0 8px;
            font-size      : 15px;
            border-bottom  : 1px dashed #555;
            padding-bottom : 2px;
        }

        #tm-help-article h3 {
            margin    : 14px 0 6px;
            font-size : 13px;
        }

        #tm-help-article table {
            width           : 100%;
            border-collapse : collapse;
            font-size       : 11px;
        }

        #tm-help-article th, #tm-help-article td {
            border         : 1px solid #555;
            padding        : 4px 6px;
            vertical-align : top;
        }

        #tm-help-article thead {
            background : #333;
        }

        #tm-help-article code, #tm-help-article kbd {
            background    : #222;
            padding       : 2px 4px;
            border-radius : 3px;
            font-family   : Consolas, monospace;
        }

        #tm-help-article pre {
            border        : 1px solid #444;
            border-radius : 4px;
            overflow      : hidden;
            margin        : 6px 0;
        }

        #tm-help-article details {
            margin : 10px 0;
        }

        #tm-help-article footer {
            text-align : center;
            font-size  : 10px;
            color      : #999;
            margin-top : 4px;
        }

        #tm-help table.api {
            width           : 100%;
            border-collapse : collapse;
            margin          : 4px 0 10px;
            font-size       : 12px;
            line-height     : 1.4;
        }

        #tm-help table.api th, #tm-help table.api td {
            border     : 1px solid #666;
            padding    : 4px 6px;
            text-align : left;
        }

        #tm-help table.api thead {
            background  : #444;
            font-weight : bold;
        }

        #tm-help table.api tbody tr.sub td {
            background  : #333;
            font-style  : italic;
            font-weight : bold;
        }

        #tm-help .note {
            font-size : 11px;
            color     : #ccc;
            margin    : 4px 0 10px;
        }

        #tm-help .hint {
            color      : #aaa;
            font-style : italic;
        }

        .sub td {
            background  : rgba(255, 255, 255, .07);
            font-weight : bold;
        }

        /* ───────────────────── ヘッダーバー ───────────────────── */
        .head {
            height        : 28px;
            display       : flex;
            align-items   : center;
            padding       : 0 6px;
            border-bottom : 1px solid #555;
            cursor        : move;
        }
        .head > span {
            flex        : 1;
            font-size   : 12px;
            font-weight : 600;
            user-select : none;
        }

        /* ───────────────────── 汎用ボタン (.b) ───────────────────── */
        .b {
            background : none;
            border     : none;
            color      : #ccc;
            font-size  : 13px;
            height     : 22px;
            padding    : 0 6px;
            cursor     : pointer;
        }
        .b:hover {
            color : #fff;
        }

        /* ───────────────────── ランチャーのボタン格子 (.g) ───────────────────── */
        .g {
            display               : grid;
            grid-template-columns : repeat(2, 1fr);
            gap                   : 4px;
            flex                  : 1 1 auto;
            min-height            : 0;
            padding               : 6px;
            overflow              : auto;
        }
        .g button {
            font-size     : 12px;
            padding       : 4px 6px;
            background    : rgba(255, 255, 255, .05);
            border        : none;
            border-radius : 2px;
            color         : #fff;
            word-break    : break-all;
            white-space   : normal;
            cursor        : pointer;
        }
        .g button:hover {
            background:rgba(255,255,255,.15);
        }

        /* リサイズハンドル */
        .rs {
            position : absolute;
            right    : 0;
            bottom   : 0;
            width    : 12px;
            height   : 12px;
            cursor   : nwse-resize;
        }

        /* ─────────────────────  エディタ行（.row） ───────────────────── */
        .row {
            display               : flex;
            flex-direction        : column;
            gap                   : 4px;
            position              : relative;
            overflow              : visible;
            grid-template-columns : 1fr 28px;
        }
        .row .ctrl {
            position       : absolute;
            top            : 1px;
            right          : 2px;
            display        : flex;
            flex-direction : row;
            gap            : 4px;
            grid-column    : 2;
        }
        .row .ctrl .b {
          display         : inline-flex;
          align-items     : center;
          justify-content : center;
          width           : 22px;
          height          : 22px;
          padding         : 0;
          font-size       : 13px;
          line-height     : 1;
          border          : none;
          border-radius   : 4px;
          background      : #555;
          color           : #ccc;
          cursor          : pointer;
          transition      : filter .15s ease, transform .08s ease;
        }
        .row .ctrl .b:hover   { color : #fff; filter : brightness(1.15); }
        .row .ctrl .b:active  { transform : translateY(1px); }
        .row .ctrl .del { background : #833; }
        .row .ctrl .up,
        .row .ctrl .down { background : #444; }
        .row textarea {
            resize        : none;
            overflow      : hidden;
            background    : transparent;
            border        : 1px solid #777;
            border-radius : 2px;
            color         : #fff;
            grid-column   : 1;
            padding       : 4px;
            font-size     : 12px;
        }
        .row input.cmd-label {
          flex          : 1 1 auto;
          min-width     : 0;
          margin-right  : 80px;
          height        : 24px;
          line-height   : 24px;
          padding       : 0 8px;
          padding-right : 88px;
          background    : #555;
          border        : 1px solid #777;
          border-radius : 4px;
          color         : #fff;
          box-sizing    : border-box;
          font-size     : 13px;
          font-weight   : 600;
          white-space   : nowrap;
          overflow-x    : auto;
        }
        .row input.cmd-label:focus {
          outline        : 2px solid #a0d8ff;
          outline-offset : 1px;
        }
        /* 変数エディタ用 1 行 */
        .var-row {
          display               : grid;
          grid-template-columns : 120px 1fr 28px;
          align-items           : center;
          gap                   : 6px;
        }
        /* 2 つの入力欄共通 */
        .var-row input {
          height        : 26px;
          padding       : 0 8px;
          background    : #555;
          border        : 1px solid #777;
          border-radius : 4px;
          color         : #fff;
          font-size     : 13px;
          font-weight   : 600;
          box-sizing    : border-box;
        }
        .var-row input:focus {
          outline        : 2px solid #a0d8ff;
          outline-offset : 1px;
        }

        /* ───────────────────── その他パーツ ───────────────────── */
        .list {  /* 変数エディタのリストパネル */
            flex           : 1 1 auto;
            min-height     : 0;
            overflow       : auto;
            padding        : 8px;
            display        : flex;
            flex-direction : column;
            gap            : 6px;
        }
        .dock {  /* フッタードック */
            flex-shrink     : 0;
            display         : flex;
            justify-content : space-between;
            gap             : 8px;
            margin          : 8px;
        }
        /* 基本ボタン共通 ――――――――――――――――――― */
        .del {
          display         : inline-flex;
          align-items     : center;
          justify-content : center;
          width           : 22px;
          height          : 22px;
          padding         : 0;
          font-size       : 13px;
          line-height     : 1;
          border          : none;
          border-radius   : 4px;
          background      : #555;
          color           : #ccc;
          cursor          : pointer;
          transition      : filter .15s ease, transform .08s ease;
        }
        .add,
        .save {
          display          : inline-flex;
          align-items      : center;
          justify-content  : center;
          gap              : 4px;
          min-width        : 22px;
          height           : 24px;
          padding          : 0 12px;
          font-size        : 13px;
          font-weight      : 600;
          line-height      : 1;
          color            : #fff;
          border           : none;
          border-radius    : 4px;
          box-shadow       : 0 1px 2px rgba(0,0,0,.4);
          cursor           : pointer;
          transition       : filter .15s ease, transform .08s ease;
        }

        /* 各色 ――――――――――――――――――――――――― */
        .del  { background: #833; }
        .add  { background: #3a5; }
        .save { background: #357; }

        /* ホバー / アクティブ ――――――――――――― */
        .del:hover,  .b.add:hover,  .b.save:hover  { filter: brightness(1.15); }
        .del:active, .b.add:active, .b.save:active { transform: translateY(1px); }

        /* キーボードフォーカスも分かりやすく */
        .del:focus-visible,
        .add:focus-visible,
        .save:focus-visible {
          outline        : 2px solid #fff;
          outline-offset : 2px;
        }

        #tm-launch {
            margin-left : 12px;
        }

        .tm-launch-btn {
            width            : 28px;
            height           : 28px;
            display          : flex;
            align-items      : center;
            justify-content  : center;
            border-radius    : 4px;
            background       : transparent;
            transition       : background .15s, transform .15s;
        }

        .tm-launch-btn:hover {
            background : rgba(255,255,255,.15);
            transform  : scale(1.07);
        }

        .tm-launch-btn:active {
            transform : scale(0.95);
        }

        .tm-launch-ico {
            width  : 20px;
            height : 20px;
            stroke : #e0e0e0;
            fill   : none;
            stroke-width : 1.8;
        }

        /* ── 確認モーダル ────────────────── */
        #tm-confirm {
            position        : fixed;
            inset           : 0;
            z-index         : 2000;
            display         : flex;
            align-items     : center;
            justify-content : center;
        }
        #tm-confirm .cf-back {
            position        : absolute;
            inset           : 0;
            background      : rgba(0, 0, 0, .55);
            backdrop-filter : blur(2px);
        }
        #tm-confirm .cf-panel {
            position      : relative;
            min-width     : 240px;
            background    : #2d2d2d;
            border        : 1px solid #666;
            border-radius : 6px;
            padding       : 16px 20px;
            color         : #eee;
            font-size     : 14px;
            box-shadow    : 0 4px 12px rgba(0, 0, 0, .4);
        }
        #tm-confirm footer {
            margin-top : 14px;
            text-align : right;
        }
        #tm-confirm button {
            margin-left   : 6px;
            padding       : 4px 10px;
            border        : none;
            border-radius : 4px;
            font-size     : 13px;
            cursor        : pointer;
            transition    : filter .1s;
        }
        #tm-confirm .cf-ok {
            background : #b33;
            color      : #fff;
        }
        #tm-confirm .cf-cancel {
            background : #555;
            color      : #fff;
        }
        #tm-confirm button:hover {
            filter : brightness(1.15);
        }

        /* ─────────────────────  CodeMirror  ───────────────────── */
        .CodeMirror {
            background : #1e1e1e;
        }

        /* ▼ ポップアップ全体 */
        .CodeMirror-hints {
            z-index    : 100000 !important;
            background : #222;
            color      : #eee;
            border     : 1px solid #444;
        }

        /* ▼ アイテム共通 */
        .CodeMirror-hint {
            padding : 2px 6px;
        }

        /* CodeMirror のキーワード着色を薄黄で強調 */
        #tm-ed   .cm-tm-kw,
        #tm-help .cm-tm-kw {
            color       : #FFD166 !important;
            font-weight : bold;
        }

        /* ▼ アクティブ行 */
        li.CodeMirror-hint-active {
            background : #005bbb;
            color      : #fff;
        }

        .cm-tm-kw {
            color       : #6cf !important;
            font-weight : bold;
        }

        .cm-dice-cmd {
            color       : #ffd166 !important;
            font-weight : bold;
        }

        .cm-param-cmd {
            color       : #ff9e64 !important;
            font-weight : bold;
        }

        .cm-slash-cmd {
            color       : #a5d6ff !important;
            font-weight : bold;
        }

        .cm-wait-dir {
            color       : #ffb300 !important;
            font-weight : bold;
            background  : rgba(255, 200, 0, .10);
        }

        .cm-tm-var {
            color       : #c792ea !important;
            font-weight : bold;
        }

        .cm-script-block {
            color       : #4aaaff;
            font-weight : bold;
            background  : rgba(80, 180, 255, .10);
        }

        .CodeMirror span.cm-string-2 {
            color : #e6db74 !important;
        }

        .cm-hint-own .cm-hint-main {
            font-weight : bold;
        }

        /* ▼ 説明テキスト（通常行）*/
        .cm-hint-own .cm-hint-note {
            color       : #6cf;
            font-size   : 11px;
            margin-left : 6px;
        }

        /* ▼ 説明テキスト（選択行）*/
        li.CodeMirror-hint-active .cm-hint-note {
            color : #ffe066;
        }
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
let win = null, ed = null, vr = null, hl = null;
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
        btn.onclick = () => enqueueSend(lines);
        gp.appendChild(btn);
        win.querySelector('#cB').onclick = () => win.remove();
    });
    win.querySelector('#eB').onclick = toggleEd;
    win.querySelector('#vB').onclick = toggleVar;
    win.querySelector('#hB').onclick = toggleHelp;
    win.querySelector('#impB').onclick = importConfig;
    win.querySelector('#expB').onclick = exportConfig;
    win.querySelector('#autoHideB').onclick = () => {
        hideAutoCards = !hideAutoCards;
        document.querySelectorAll(`${CARD_SEL}[${AUTO_ATTR}]`).forEach(el => { el.style.display = (hideAutoCards && el.getAttribute(AUTO_ATTR) === 'true') ? 'none' : ''; });
    };
    document.body.appendChild(win);
};
const toggleWin = () => document.body.contains(win) ? win.remove() : buildWin();

/* ========== コマンド編集 ========== */
const toggleEd = () => {
    if (ed) { ed.remove(); ed = null; return; }
    let isWrite = false;
    // ----------  ウィンドウ骨格 ----------
    ed = document.createElement('div'); ed.id = 'tm-ed';
    ed.innerHTML = `<div class="head"><span>コマンド編集</span><button class="b" id="x">✕</button></div><div class="list" id="ls"></div><div class="dock"><button class="b add"id="ad">■ 追加</button><button class="b save" id="sv">■ 保存</button></div><div class="rs"></div>`;
    drag(ed); resz(ed);
    document.body.appendChild(ed);

    const ls = ed.querySelector('#ls');
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

        const cm = CodeMirror.fromTextArea(ta, {
            theme             : 'monokai',
            mode              : 'javascript',
            lineNumbers       : true,
            lineWrapping      : true,
            autoCloseBrackets : true,
            matchBrackets     : true,
            foldGutter        : true,
            gutters           : [ "CodeMirror-linenumbers", "CodeMirror-foldgutter" ],
            extraKeys         : { 'Ctrl-Space': 'autocomplete', 'Tab': cm => cm.showHint({hint: CodeMirror.hint.palette, completeSingle: false}) },
            hintOptions       : { hint: CodeMirror.hint.palette, completeSingle:false }
        });
        cm.addOverlay(highlightPaletteKW);
        cm.addOverlay(paletteOverlay);
        const varOv = buildVarsOverlay();
        if (varOv) cm.addOverlay(varOv);
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

        cm.on('change', () => { isWrite = true; classifyRow(row, cm.getLine(0).trim()); cm.setSize('100%', 'auto'); });
        cm.on('inputRead', (cm, change) => {
            if (change.text[0] === '.') {
                setTimeout(() => cm.showHint({
                    hint : CodeMirror.hint.member,
                    completeSingle: false
                }), 0);
            }
        });
        CM_SET.set(row, cm);
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
        row.querySelector('.del').onclick = () => { CM_SET.delete(row); row.remove(); };
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
            const srcTxt = CM_SET.has(row) ? CM_SET.get(row).getValue() : row.querySelector('.cmd-lines').value;
            const lines = srcTxt.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter((l, i, a) => !((i === 0 || i === a.length - 1) && l === ''));
            while (lines[0] !== undefined && lines[0].trim() === '') lines.shift();
            while (lines[lines.length - 1] !== undefined && lines[lines.length - 1].trim() === '') lines.pop();
            return label && lines.length ? { label, lines } : null;
        }).filter(Boolean);

        save(CMD_KEY, cmds);
        buildWin();
        ed.remove(); ed = null;
    };
    const closeEd = () => {
        if (!isWrite) { ed.remove(); ed = null; return; }
        askDiscard(ok => { if (ok) { isWrite = false; ed.remove(); ed = null; } });
    };
    ed.querySelector('#x').onclick = closeEd;
};

/* ========== 変数編集 ========== */
const toggleVar = () => {
    if (vr) { vr.remove(); vr = null; return; }
    let isWrite = false;
    vr = document.createElement('div'); vr.id = 'tm-var';
    vr.innerHTML = `<div class="head"><span>変数編集</span><button class="b" id="x">✕</button></div>
                            <div class="list" id="vl"></div>
                            <div class="dock"><button class="b add" id="ad">■ 追加</button><button class="b save" id="sv">■ 保存</button></div>
                            <div class="rs"></div>`;
        drag(vr); resz(vr);
        function refreshAllEditorsVarOverlay() {
            const newOv = buildVarsOverlay();
            CM_SET.forEach(cm => {
                if (cm.state.varOverlay) cm.removeOverlay(cm.state.varOverlay);
                if (newOv) {
                    cm.addOverlay(newOv);
                    cm.state.varOverlay = newOv;
                } else {
                    delete cm.state.varOverlay;
                }
            });
        }
        const vl = vr.querySelector('#vl');
        const addRow = (v = { name: '', value: '' }) => {
            const r = document.createElement('div');
            r.className = 'var-row';
            r.innerHTML = `<input class="var-key" placeholder="名前" value="${v.name}"><input class="var-value" placeholder="値" value="${v.value}"><button class="b del">✕</button>`;
            r.querySelector('.del').onclick = () => r.remove();
            r.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => isWrite = true));
            vl.appendChild(r);
        };
        vars.forEach(addRow);
        vr.querySelector('#ad').onclick = () => addRow();
        vr.querySelector('#sv').onclick = () => {
            vars = [...vl.querySelectorAll('.var-row')].map(r => {
                const [n, v] = r.querySelectorAll('input'); return { name: n.value.trim(), value: v.value.trim() };
            }).filter(o => o.name);
            save(VAR_KEY, vars);
            refreshAllEditorsVarOverlay();
            vr.remove(); vr = null;
        };
        const closeVar = () => {
            if (!isWrite) { vr.remove(); vr = null; return; }
            askDiscard(ok => { if (ok) { isWrite = false; vr.remove(); vr = null; } });
        };
        vr.querySelector('#x').onclick = closeVar;
        document.body.appendChild(vr);
    };

/* ========== Help ウインドウ ========== */
const toggleHelp = () => {
    if (hl) { hl.remove(); hl = null; return; }

    hl = document.createElement('div'); hl.id = 'tm-help';
    hl.innerHTML = `<div class="head"><span>ヘルプ</span><button class="b" id="x">✕</button></div>
                            <div style="flex:1;overflow:auto;padding:8px;font-size:12px;line-height:1.4;">${HELP_HTML}</div>
                            <div class="rs"></div>`;
        drag(hl); resz(hl);
        hl.querySelector('#x').onclick = () => { hl.remove(); hl = null; };
        document.body.appendChild(hl);

        const navUl = hl.querySelector('#tm-help-nav');
        hl.querySelectorAll('[data-ref]').forEach(sec => {
            const id = sec.dataset.ref;
            sec.id = 'hlp-' + id;
            const li = document.createElement('li');
            li.innerHTML = `<a href="#hlp-${id}">${sec.querySelector('h2').textContent}</a>`;
            navUl.appendChild(li);
        });

        beautifyHelpCode();
    };

/* ========== ランチャーボタン ========== */
const injectLaunch = () => wait(DICEBAR).then(bar => {
    if (bar.querySelector('#tm-launch')) return;

    const btn = document.createElement('button');
    btn.id = 'tm-launch'; btn.type = 'button'; btn.title = '拡張チャットパレット (Alt+P)';
    btn.className = 'MuiButtonBase-root tm-launch-btn';
    btn.innerHTML = `<svg viewBox="0 0 24 24" class="tm-launch-ico">
                           <rect x="4" y="3"  width="16" height="18" rx="2" ry="2"/>
                           <rect x="9" y="1"  width="6"  height="4"  rx="1" ry="1"/>
                           <line  x1="7" y1="8" x2="17" y2="8"/>
                           <line  x1="7" y1="12" x2="17" y2="12"/>
                           <line  x1="7" y1="16" x2="13" y2="16"/>
                         </svg>`;
        btn.onclick = toggleWin;
        bar.appendChild(btn);
    });
injectLaunch();
setInterval(injectLaunch, 1500);

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
})();

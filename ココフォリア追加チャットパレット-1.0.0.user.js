// ==UserScript==
// @name              CCUnipo
// @version           1.5.0
// @description:ja    ココフォリア上で使用できるいるか分からない機能を追加！
// @author            Apocrypha
// @match             https://ccfolia.com/rooms/*
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
// @require           https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js
// @require           https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js
// @require           https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js
// @resource CM_BASE  https://cdn.jsdelivr.net/npm/codemirror@5/lib/codemirror.css
// @resource CM_MONO  https://cdn.jsdelivr.net/npm/codemirror@5/theme/monokai.css
// @resource CM_FOLD  https://cdn.jsdelivr.net/npm/codemirror@5/addon/fold/foldgutter.css
// @resource CM_HINT  https://cdn.jsdelivr.net/npm/codemirror@5/addon/hint/show-hint.css
// @grant             GM_getValue
// @grant             GM_setValue
// @grant             GM_addStyle
// @grant             GM_xmlhttpRequest
// @grant             GM_getResourceText
// @connect           *
// @connect           talto.cc
// @connect           www.pixiv.net
// @license           MIT
// ==/UserScript==

/* global CodeMirror marked */
/* eslint no-multi-spaces: 0 */
/* eslint no-return-assign: 0 */

(() => {
    'use strict';

    /* ========== 読み込み部分 ========== */
    GM_addStyle(GM_getResourceText('CM_BASE'));
    GM_addStyle(GM_getResourceText('CM_MONO'));
    GM_addStyle(GM_getResourceText('CM_FOLD'));
    GM_addStyle(GM_getResourceText('CM_HINT'));
    /* ================================= */

    /* ===========================================================
     *                    設定用グローバル定数
     * ===========================================================
     * ・localStorage に保存するキー名やデフォルト値
     * ・UI のセレクタ／ホットキー／色々な閾値など
     * --------------------------------------------------------- */
    const CMD_KEY  = 'tmPaletteCmds_v3', // コマンド(ボタン)定義の保存キー
          VAR_KEY  = 'tmPaletteVars_v3', // コマンド(ボタン)定義の保存キー
          AUTO_KEY = 'tmPaletteAuto_v3'; // 変数テーブルの保存キー

    // 設定が空のときに入れる “お試し” ボタン
    const DEF_CMDS = [{ label: '1D100', lines: ['1D100', '1d100<=50', 'CCB<=50'] }];

    // デフォルト変数
    const DEF_VARS = [{ name: 'NUM', value: '1' }];

    /* ── UI / DOM 関係 ───────────────────────────── */
    const TXT_SEL = 'textarea[name="text"]'; // チャット入力欄セレクタ
    const DICEBAR = 'div.sc-igOlGb';         // ボタンを差し込むバー

    /* ── キーボードショートカット ─────────────────── */
    const HK_VIEW = 'p', // Alt+P : ランチャー表示
          HK_EDIT = 'o', // Alt+O : コマンド編集
          HK_VARS = 'v'; // Alt+V : 変数編集

    /* ── 各種タイミング＆キャッシュ ───────────────── */
    const SEND_DELAY = 500;    // 行送信インターバル(ms)
    const CACHE_SPAN = 12_000; // 名前キャッシュの寿命(ms)
    const CHAT_CACHE = 50;     // getLastMessages の既定行数

    /* ── チャット判定用のエイリアス正規表現 ──────── */
    const KW_ALIAS = { // “S” → <成功|スペ> など短縮
        'M'    : /失敗/,
        'S'    : /(?<!決定的)成功|(?<!決定的成功\/)スペシャル/,
        'F'    : /致命的失敗/,
        '100F' : /(100.*致命的失敗|致命的失敗.*100)/,
        'C'    : /(クリティカル|決定的成功(?:\/スペシャル)?)/,
        '1C'   : /(1.*(?:クリティカル|決定的成功)|(?:クリティカル|決定的成功).*1)/
    };

    // 設定エクスポート時の MIME
    const CONF_MIME = 'application/x-ccp+json';
    // 互換性チェック用バージョン
    const CONF_VER = 1;
    // DL 時のファイル名
    const EXPORT_FILE = () => `追加チャット情報${new Date().toISOString().replace(/[:.]/g, '-')}.ccp`;

    // 自動判定カード判定用 attribute
    const AUTO_ATTR = 'data-auto-card';
    // ポップアップカード共通セレクタ
    const CARD_SEL = `div.MuiPaper-root`;
    // enqueueSend の強制停止トークン
    const STOP = Symbol('STOP');
    // row ⇔ CodeMirror 対応表
    const CM_SET = new Map();

    const BASE_API     = [
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
    const ACTOR_API    = [
        { text: 'Actor.Now()', label: '現在アクター名を返す' },
        { text: 'Actor()', label: 'アクターを設定する' },
        { text: 'Actor("PC-A")', label: 'アクターを PC-A に切替' },
        { text: 'Actor.Set()', label: 'アクターを設定する' },
        { text: 'Actor.Set("PC-A")', label: 'アクターを PC-A に切替' },
    ];
    const CHARBOX_API  = [
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
    const DICE_API     = [
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
    const API_MEMBERS  = {
        Actor    : ['Set()', 'Now()'],
        CMessage : ['Find()', 'Lines()', 'FindAt()', 'Match()', 'MatchAll()',
                    'GetNum()', 'Send()'],
    };
    const HELP_HTML    = `
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
    /* ============================= */

    /* =========================================================
     *              いろいろ使い回す “小ネタ関数”
     * ======================================================= */

    /* 数値を [min–max] に丸める --------------------------------*/
    const clamp = (v, mi, ma) => Math.min(Math.max(v, mi), ma);

    /* querySelector 待ち  ------------------------------------ */
    const wait = sel => new Promise(r => { const f = () => { const n = document.querySelector(sel); n ? r(n) : requestAnimationFrame(f) }; f() });

    /* textarea.value を直接書き換えつつ、input イベントも発火 */
    const setVal = (ta, val) => Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, val);

    /* 1 行送信（Enter キー押下をエミュレート）------------------*/
    const sendLine = (ta, txt) => { setVal(ta, txt); ta.dispatchEvent(new Event('input', { bubbles: true })); requestAnimationFrame(() => ta.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }))); };

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    /* JSON save / load（try…catch 付き） ----------------------*/
    const load = (k, d) => { try { const j = localStorage.getItem(k); return j ? JSON.parse(j) : d } catch { return d } };
    const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));


    /* 正規表現エスケープ（1 文字版 / 変数名版） ---------------*/
    const escReg = s => s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
    const varReg = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    /* ---------------------------------------------------------
     * CodeMirror overlay: パレット用ハイライト
     *  行頭のダイス式 / [WAIT] などをシンタックス着色
     * ------------------------------------------------------- */
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

    /* CodeMirror overlay: 予約語ハイライト（パレット API） -------------*/
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

    /* enqueueSend で “順番待ち実行” させるための内部キュー ------------*/
    const queue = fn => (_taskChain = _taskChain.then(fn));

    /* 文字列テンプレート展開（ {VAR} → 値 ） ---------------------------*/
    const expOnce = (s, d) => s.replace(/\{([^{}]+?)}/g, (m, p) => d[p] !== undefined ? d[p] : m);

    /* 再帰的展開（{A} が {B} を含む etc... を収束するまで繰り返し）*/
    const expRec             = (s, d) => { let p; do { p = s; s = expOnce(s, d); } while (s !== p); return s; };
    /* ============================== */

    /* =========================================================
     *                 ローカル保存されるデータ
     * ======================================================= */
    let cmds = load(CMD_KEY, DEF_CMDS).map(c => {
        // v2→v3 互換：古い形式なら label を 1 行目へ退避
        if ('label' in c) return { auto: false, ...c };
        const [label, ...lines] = c.lines ?? [];
        return { auto: false, label: label || 'Cmd', lines };
    });

    // 変数テーブル
    let vars = load(VAR_KEY, DEF_VARS);

    let autoCmd = load(AUTO_KEY, ['// Auto script here\n(まだ何も出来ないよ)']);

    // “自動スクリプトカード” を隠すか
    let hideAutoCards = true;

    // キャラクター名キャッシュ
    let nameCache = [];

    // nameCache 取得時刻
    let cacheTime = 0;

    // enqueueSend 用プライベートキュー
    let _taskChain = Promise.resolve();

    // 開いているセッション全部
    const sessions = [];

    // 現在表示しているタブのセッション (null=タブなし)
    let active = null;

    // PDF ページ切替時に “自動でウィンドウを開くか” フラグ
    let autoShow = true;

    // 一番最初にビューワを開いたかのフラグ
    let firstOpen = false;
    /* ================================ */

    /* ========== コマンド変数 ========== */

    /**
     * 変数配列 `vars` から
     *   [{ name:'hp', value:'12' }, …]
     * を
     *   { hp: 12, … }
     * の “扱いやすい通常オブジェクト” へ変換して返す。
     *
     * - 数値化できない値は 0 に置き換える。
     * - 参照専用。書き込むときは saveVarsObj() を使う。
     */
    const varsObj = () => Object.fromEntries(vars.map(v => [v.name, Number(v.value) || 0]));

    /**------------------------------------------------------------------
     * { 変数名: 数値 } 形式のオブジェクトを受け取り、
     * 内部で使う配列形式へ変換して保存するユーティリティ。
     *
     * 処理概要
     * 1. Object.entries() で [ [name, value], … ] へ展開
     * 2. 小数は Math.trunc() で整数化し文字列に変換
     * 3. グローバル変数 `vars` を上書き
     * 4. save(VAR_KEY, vars) で永続化
     *
     * @param {Object} obj 例: { hp: 20, mp: 5 }
     */
    const saveVarsObj = obj => {
        vars = Object
            .entries(obj)
            .map(([name, v]) => ({
                name,
                // ※ 小数点以下は不要
                value: String(Math.trunc(v))
            }));

        // 永続ストレージへ保存
        save(VAR_KEY, vars);
    };
    /* ================================= */

    /* ========== コマンド内ミニスクリプト利用可能関数 ========== */

    /* ------------------------------------------------------------------
     * 直近ログ取得
     * ------------------------------------------------------------------
     * DOM から直近 N 件のチャットメッセージを取り出し文字列配列で返す。
     * - デフォルトの N は定数 CHAT_CACHE（省略可）
     * - 表示順を新しい順にしたいため、 slice(-n).reverse()
     * - 取得要素：
     *     div.MuiListItem-root                    … 1 メッセージ行
     *     div[data-testid="RoomMessage__body"], p … 本文ノード
     * ------------------------------------------------------------------ */
    const getLastMessages = (n = CHAT_CACHE) =>
        Array
            .from(document.querySelectorAll('div.MuiListItem-root'))
            .slice(-n) // 末尾 n 件
            .reverse() // 新→旧 の順に
            .map(el => {
                const body = el.querySelector('div[data-testid="RoomMessage__body"], p');
                return body ? body.innerText.trim() : '';
            });

    /* ------------------------------------------------------------------
     * メッセージをラップして便利メソッド付与
     * ------------------------------------------------------------------
     * wrapMessages(['text1', 'text2'], ctx) =>
     * [
     *   {
     *     text    : 'text1',
     *     Find    : kw => boolean
     *     FindAt  : kw => count
     *     Lines   : () => ['line1', 'line2']
     *     Match   : re => match / null
     *     MatchAll: re => [match, …]
     *     GetNum  : () => ＞ 123 の数値 or NaN
     *     Send    : (...lines) => enqueueSend([...], ctx)
     *   },
     *   …
     * ]
     * ------------------------------------------------------------------ */
    const wrapMessages = (arr, ctx) => arr.map(txt => {

        /** キーワード検索（KW_ALIAS があれば正規表現へ置換） */
        const Find = kw => (KW_ALIAS[kw] ?? new RegExp(escReg(kw))).test(txt);

        /** 行分割（CRLF/ LF 両対応） */
        const Lines = () => txt.split(/\\r?\\n/);

        /** キーワード出現数を数える */
        const FindAt = kw => {
            const base = KW_ALIAS[kw] ?? new RegExp(escReg(kw), 'g');
            const re = base.global ? base : new RegExp(base.source, base.flags + 'g');
            return (txt.match(re) || []).length;
        };

        /** 正規表現１件 match（文字列なら RegExp 化） */
        const Match = re => (typeof re === 'string' ? txt.match(new RegExp(re)) : txt.match(re));

        /** 全件 matchAll（global 無ければ付与） */
        const MatchAll = re => { if (typeof re === 'string') re = new RegExp(re, 'g'); if (!re.global) re = new RegExp(re.source, re.flags + 'g'); return [...txt.matchAll(re)]; };

        /** “＞ 12.3” と書かれた数値取得 */
        const GetNum = () => { const m = txt.match(/＞\s*(-?\d+(?:\.\d+)?)/); return m ? Number(m[1]) : NaN; };

        /** 同一 ctx で送信キューへ追加 */
        const Send = (...lines) => enqueueSend(lines.flat(), ctx);

        return { text: txt, Find, Lines, Match, MatchAll, FindAt, GetNum, Send };
    });

    /* ------------------------------------------------------------------
     * キャラクターステータス収集
     * ------------------------------------------------------------------
     * 盤面右サイドのキャラクター一覧パネルから各種数値を拾い
     *   { 'HP':[idx⇒値,…], 'SAN':[...], 'イニシアチブ':[...], … }
     * の形で返す。
     *   - .sc-iKUUEK     : キャラクター１人のボックス
     *   - .sc-cTsLrp p   : p(0)=ラベル / p(1)=値   のペア
     *   - .MuiBadge-badge: イニシアチブ値
     * ------------------------------------------------------------------ */
    function collectCharStats() {

        const out = Object.create(null);

        document.querySelectorAll('.sc-iKUUEK').forEach((box, idx) => {

            box.querySelectorAll('.sc-cTsLrp').forEach(bl => {

                const pList = bl.querySelectorAll('p');
                const key = pList[0].textContent.trim(); // ラベル
                if (pList.length < 2) return;

                const val = pList[1].textContent.trim(); // 値
                if (key) (out[key] ??= [])[idx] = val;

            });

            // イニシアチブ（バッジ）
            const badge = box.querySelector('.MuiBadge-badge:not(.MuiBadge-invisible)');
            if (badge) (out['イニシアチブ'] ??= [])[idx] = badge.textContent.trim();
        });
        return out;
    }

    /* ------------------------------------------------------------------
     * 俳優（アクター）選択ヘルパ
     *   Actor(label or RegExp)
     *   Actor.Now()  → 現在選択中の名前
     * ------------------------------------------------------------------ */
    async function _selectActor(label) {

        // キャラクター選択ボタン
        const btn = document.querySelector('button[aria-label="キャラクター選択"]');
        if(!btn) return console.warn('Actor button not found');
        btn.click();

        // ポップアップ ul が出るまで待機
        const ul = await new Promise(res => {
            const iv = setInterval(() => {
                const el = document.querySelector('.MuiPopover-paper ul');
                if(el){ clearInterval(iv); res(el); }
            },50);
            setTimeout(() => { clearInterval(iv); res(null); }, 2000);
        });
        if(!ul) return console.warn('Actor list not found');

        // 行を正規表現で検索
        const rex = label instanceof RegExp ? label : new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');

        const row = [...ul.querySelectorAll('.MuiListItemButton-root')].find(r => rex.test(r.querySelector('.MuiListItemText-primary')?.textContent || ''));

        (row || document.body).click(); // 未ヒット時：閉じるため body click

        if(!row) console.warn('Actor "'+label+'" not found');
    }

    /* キューに入れて順番実行できる API として公開 */
    function Actor(label){ queue(() => _selectActor(label)); }
    Actor.Set = Actor;

    /** 現在選択中の名前を取得 */
    Actor.Now = () =>{
        const inp = document.querySelector('input[name="name"]');
        return inp ? inp.value.trim() : null;
    };
    window.Actor = Actor;

    /* ------------------------------------------------------------------
     * ユーティリティ（Wait / コード整形）
     * ------------------------------------------------------------------ */

    /** 非同期 Wait(ms)  */
    function Wait(ms){ return new Promise(res => setTimeout(res, Number(ms))); }

    /**
     * ユーザーが書く一時スクリプト中の Wait() を
     *   await Wait()
     * へ自動変換するプリプロセッサ。
     *
     * - 文字列 / コメント を一旦 __KEEPxx__ で退避
     * - “Wait( … )” を見つけたら await を前置
     * - 退避した部分を戻す
     */
    function preprocessWait(src){
        const store = [];
        const push = m => { store.push(m); return `__KEEP${store.length - 1}__`; };

        src = src
            .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, push) // 文字列
            .replace(/\/\/[^\n]*/g, push)                // 行コメント
            .replace(/\/\*[\s\S]*?\*\//g, push);         // ブロックコメント

        src = src.replace(/(^|[^\w$])(Wait\s*\()/g, (m, pre, rest) => {
            // 直前に await が無い Wait を await Wait へ
            if(/\bawait\s*$/.test(pre)) return m;
            return pre + 'await ' + rest;
        });

        // 退避文字列を元に戻す
        src = src.replace(/__KEEP(\d+)__/g, (_,i)=>store[+i]);
        return src;
    }

    /* ------------------------------------------------------------------
     * キャラクターボックス値取得
     * ------------------------------------------------------------------ */

    /** “cur / max” のような書式を [cur,max] にパース */
    function __splitVal(val){
        const m = String(val).match(/^(-?\d+(?:\.\d+)?)(?:\s*\/\s*(-?\d+(?:\.\d+)?))?$/);
        return m ? [Number(m[1]), m[2]!==undefined?Number(m[2]):undefined] : [val, undefined];
    }

    /**
     * ステータス値を取得
     *  - label: 'HP' など
     *  - idx  : 0=先頭プレイヤー、1=2人目 …
     * 返り値: 現在値 or null
     */
    function CharBox(label, idx = 0) {

        // 2 秒以上経過すればキャッシュ更新
        if (!window.__charStatCache || Date.now()-window.__charStatTime>2000){
            window.__charStatCache = collectCharStats();
            window.__charStatTime = Date.now();
        }

        const raw = (window.__charStatCache[label]||[])[idx];
        if (raw === undefined) return null;

        const [cur] = __splitVal(raw);
        return cur;
    }

    /** 最大値のみ取得（cur/max の max） */
    function CharBoxMax(label, idx = 0){
        const raw = (window.__charStatCache?.[label]||[])[idx];
        if (raw === undefined) return null;

        const [, max] = __splitVal(raw);
        return max!==undefined ? max : CharBox(label,idx);
    }


    /** 生文字列をそのまま返す */
    function CharBoxRaw(label, idx = 0) { return (window.__charStatCache?.[label]||[])[idx] ?? null; }

    /* ------------------------------------------------------------------
     * プレイヤー名取得ユーティリティ
     * ------------------------------------------------------------------ */

    /** 盤面左上アイコンを順番にクリックし、名前一覧を収集 */
    async function grabNames () {
        const btns = [...document.querySelectorAll('button.sc-hHSjTJ')];
        const names = new Array(btns.length).fill('');

        for (let i = 0; i < btns.length; i++) {
            const b = btns[i];
            b.click(); // プロフィールを開く

            names[i] = await new Promise(res => {
                const iv = setInterval(() => {
                    const h6 = document.querySelector('h6.sc-dPyGX');
                    if (h6 && h6.textContent.trim()) {
                        clearInterval(iv);
                        res(h6.textContent.trim()); // 名前取得
                    }
                }, 40);
                setTimeout(() => { clearInterval(iv); res(''); }, 1000);
            });

            b.click(); // 閉じる
        }

        return names;
    }

    /* ------------------------------------------------------------------
     * 名前リスト（キャッシュ）を最新化して返す
     * ------------------------------------------------------------------
     *  - grabNames()   : DOM を巡回して全プレイヤー名を取得（非同期）
     *  - nameCache     : グローバル配列に上書き
     *  - cacheTime     : 取得した時刻を記録（ミリ秒）
     *  - 返り値        : 最新の nameCache
     * ------------------------------------------------------------------ */
    async function LoadNames () { nameCache = await grabNames(); cacheTime = Date.now(); return nameCache; }

    /** 名前文字列を index に変換（キャッシュ失効時は -1） */
    function CharBoxNumber(label) { if (Date.now() - cacheTime > CACHE_SPAN) return -1; return nameCache.findIndex(n => n === label); }

    /* ======================================================= */

    /* ========== コマンド内ミニスクリプト実行部分 ========== */

    /* ------------------------------------------------------------------
     * コマンド内ミニスクリプトを “安全に” 実行するユーティリティ
     * ------------------------------------------------------------------
     * runScript(code, ctx)
     *   ● code …… 角括弧 [ … ] 内に書かれた即席 JavaScript 文字列
     *   ● ctx  …… with(ctx){ … } で参照される実行スコープ
     *   ▼ 流れ
     *     ⓪ 予処理    : preprocessWait() で `Wait(` を自動 await 化
     *     ① Function  : new Function で async 関数を即時生成・実行
     *     ② 例外処理  : STOP は上位へ投げ直し／その他はアラート＋コンソール
     * ------------------------------------------------------------------ */
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

    /* ==================================================== */

    /* ========== コマンド実行部分 ========== */

    /* ------------------------------------------------------------------
     * コマンド実行メインルーチン
     * ------------------------------------------------------------------
     *   ─ chunkLines()      : 行配列を “[] ブロック” 単位に再分割
     *   ─ processOneChunk() : １チャンクを解釈して実行
     *   ─ enqueueSend()     : 非同期キューへ登録（再帰ネスト対応）
     * ------------------------------------------------------------------ */

    /* ---------- [] ブロック単位にまとめ直す ---------- */
    function chunkLines(rawLines){
        const out = [];

        for(let i = 0; i < rawLines.length; i++){
            let line = String(rawLines[i]||'');
            if (!line.trim()) continue; // 空行スキップ

            // 開き [ ... 改行 ... ] は１チャンクへ連結
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

    /* ---------- 単チャンクを実行 ---------- */
    async function processOneChunk(chunk, ctx){
        try {
            const txt = String(chunk).trim();

            /* 制御系タグ ----------------------------------------- */
            if(/^\[\s*End\s*\]$/.test(txt)){ ctx.__stop = true; return; }

            /* [WAITMSG "KW" N]  …… KW を含む最新 N 件が来るまで待機 */
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

            /* [WAIT ms] …… 指定ミリ秒停止 */
            m = txt.match(/^\[\s*WAIT\s+(\d+)\s*\]$/);
            if(m){ await sleep(+m[1]); return; }

            /* [ …js… ] …… ミニスクリプト実行 */
            if(txt.startsWith('[') && txt.endsWith(']')){ await runScript(txt.slice(1,-1), ctx); return; }

            /* 送信文生成 ----------------------------------------- */
            const expanded = expRec(chunk, {
                ...Object.fromEntries(Object.entries(ctx)
                                      .map(([k,v]) => [k, (typeof v === 'number' ? String(Math.trunc(v)) : String(v))]))
            });
            if(!expanded) return;

            const ta = await wait(TXT_SEL); // 発言欄が現れるまで待機
            sendLine(ta, expanded);         // 実際に入力して送信
            await sleep(SEND_DELAY);
        } catch (e) {
            if (e === STOP) throw STOP;
            throw e;
        }
    }

    /* ---------- 行列をキューへ登録（外部 API） ---------- */
    function enqueueSend(rawLines, existingCtx) {

        // 再帰呼び出し判定
        const isNested = !!existingCtx;
        const ctx = existingCtx || varsObj();

        /* …… ctx にユーティリティ関数を注入（１回だけ） …… */
        if(!ctx.__ctxTagged){
            Object.defineProperties(ctx,{
                __ctxTagged    : { value: true },
                SEnd           : { value: () => { throw STOP; } }, // 強制終了トークン
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

        /* …… ブロック分割 → キュー投入 …… */
        const chunks = chunkLines(rawLines);

        return queue(async () => {
            for (let i = 0; i < chunks.length; i++){
                try{
                    await processOneChunk(chunks[i], ctx);
                    if (ctx.__stop) break; // [End] が来たら脱出
                } catch(e) {
                    if (e === STOP) break;
                    throw e; // それ以外は上位へ
                }
            }

            /* 最上位呼び出しの場合のみ、最終変数を保存 */
            if(!isNested) saveVarsObj(ctx);
        });
    }

    /* ===================================== */

    /* ========== 設定のセーブロード ========== */

    /* ------------------------------------------------------------------ *
     * 設定ファイル（コマンド／変数／自動実行）のセーブ & ロード周り
     *     ─ ローカル保存は localStorage
     *     ─ バックアップ／移行用に *.ccp ファイルの Export / Import も可
     * -------------------------------------------------------------------- */

    /* ------------------------------------------------------------------ *
     * collectConfig()
     *    現在メモリ上にある config 値をまとめて Object で返すだけ
     * ------------------------------------------------------------------ */
    function collectConfig() {
        return {

            // バージョン識別子（将来の互換管理用）
            version : CONF_VER,

            // コマンド配列
            cmds    : cmds,

            // 変数配列
            vars    : vars,

            // 自動起動コマンド
            autoCmd : autoCmd
        }
    }

    /* ------------------------------------------------------------------ *
     * doDownload(blob, suggestedName)
     *    Blob → ユーザ OS へ保存
     *    File System Access API が使えるブラウザなら showSaveFilePicker
     *    古い環境は <a download …> にフォールバック
     * ------------------------------------------------------------------ */
    async function doDownload(blob, suggestedName = 'config.ccp') {

        /* showSaveFilePicker があれば使用（ユーザに保存ダイアログを出す） */
        const picker = window.showSaveFilePicker || unsafeWindow?.showSaveFilePicker;
        if (picker) {
            const handle = await picker({ suggestedName, types: [{ description: 'Chat-Palette Config', accept: { [CONF_MIME]: ['.ccp'] } }] });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return; // ここで正常保存完了
        }

        /* Fallback: 一時 URL→download 属性リンク */
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: suggestedName });
        a.click();

        /* メモリ掃除（1 秒後に revoke） */
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    /* ------------------------------------------------------------------ *
     * exportConfig()
     *      現在設定を JSON → Blob 化
     *      doDownload() でファイル保存
     *      成功したら localStorage を掃除してリロード
     * ------------------------------------------------------------------ */
    async function exportConfig() {
        const blob = new Blob([JSON.stringify(collectConfig(), null, 2)], { type: CONF_MIME });

        try {
            // 保存ダイアログ
            await doDownload(blob, EXPORT_FILE());
        } catch (e) {
            // ユーザキャンセルなど
            console.warn('save cancelled', e); return;
        }

        /* 保存後はブラウザ localStorage から一旦消去 → 再読込 */
        localStorage.removeItem(CMD_KEY);
        localStorage.removeItem(VAR_KEY);
        localStorage.removeItem(AUTO_KEY);
        location.reload();
    }

    /* ------------------------------------------------------------------ *
     * importConfig()
     *      input[type=file] で *.ccp を選択
     *      JSON を parse → localStorage に書き戻し
     *      ページ再読込
     * ------------------------------------------------------------------ */
    function importConfig() {

        /* ★ 動的に <input type="file"> を作成してクリック */
        const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.ccp' });
        inp.onchange = () => {
            const file = inp.files[0];
            if (!file) return;// 何も選ばれなかった

            const fr = new FileReader();
            fr.onload = e => {
                try {
                    const cfg = JSON.parse(e.target.result);

                    /* ▼ バージョン互換チェック */
                    if (cfg.version !== CONF_VER) throw 'version mismatch';

                    /* ▼ 各キーが存在していれば localStorage へ保存 */
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

        inp.click(); // 実際にファイル選択ダイアログを開く
    }

    /* ====================================== */

    /* ========== ポップアップカードの非表示化 ========== */

    /* -------------------------------------------------------------------- *
     * “ポップアップカード”の自動非表示制御
     *   ─ CocoFolia はカード（メモ/判定結果など）を DOM に追加する。
     *   ─ ミニスクリプト実行や自動送信で生まれる “自動カード” は
     *     プレイ時に邪魔なので、設定次第で即座に非表示にする。
     * -------------------------------------------------------------------- */

    /* ------------------------------------------------------------------ *
     * isAutoScriptCard(card)
     *    カード内に「×（閉じる）」ボタンがあるかで
     *    “自動生成カード” かどうかを判定
     *    （手動入力のカードには無い）
     * ------------------------------------------------------------------ */
    function isAutoScriptCard(card) { return !!card.querySelector('button[aria-label="閉じる"]'); }

    /* ------------------------------------------------------------------ *
     * markAndToggle(card)
     *      初めて見たカードなら data‑属性に種類をマーク
     *       （AUTO_ATTR=true / false）
     *      hideAutoCards 設定がオンなら
     *       AUTO_ATTR=true のカードだけ display:none に
     * ------------------------------------------------------------------ */
    function markAndToggle(card) {

        /* 種別マークが無ければ判定して追記 */
        if (!card.hasAttribute(AUTO_ATTR)) {
            card.setAttribute(AUTO_ATTR, isAutoScriptCard(card));
        }

        /* 設定に応じて表示 / 非表示を切替 */
        if (hideAutoCards && card.getAttribute(AUTO_ATTR) === 'true') {
            card.style.display = 'none'; // 自動カードは隠す
        } else {
            card.style.display = '';     // 通常カードはそのまま
        }
    }

    /* ------------------------------------------------------------------ *
     * 既に存在するカード全てに対して 1 回チェック
     * ------------------------------------------------------------------ */
    document.querySelectorAll(CARD_SEL).forEach(markAndToggle);

    /* ------------------------------------------------------------------ *
     * MutationObserver
     *    body 下に “新しいカード要素” が追加されるたびに
     *    markAndToggle() で即時判定 → 非表示化
     *    （子孫ノードも再帰的に検査）
     * ------------------------------------------------------------------ */
    new MutationObserver(muts => {
        muts.forEach(m => {

            /* 追加ノードを走査 */
            m.addedNodes.forEach(n => {
                if (n.nodeType !== 1) return; // 要素ノード以外は無視

                /* 追加されたノード自身がカードだった場合 */
                if (n.matches?.(CARD_SEL)) markAndToggle(n);

                /* さらにその子孫のカードも対象 */
                n.querySelectorAll?.(CARD_SEL).forEach(markAndToggle);
            });
        });
    }).observe(document.body, { childList: true, subtree: true });

    /* =============================================== */

    /* ========== セーブ表示のポップアップ ========== */

    /* -------------------------------------------------------------------- *
     * “保存せずに閉じる？”確認ポップアップ
     * -------------------------------------------------------------------- *
     *  • 編集ウィンドウを閉じようとしたときに呼び出すヘルパー。
     *  • 未保存の変更がある場合、破棄するかキャンセルするかを
     *    ユーザーに選択させる。
     *  • 結果はコールバック cb(true/false) で返す。
     * -------------------------------------------------------------------- */

    /**
     * askDiscard(cb)
     * ----------------------------------------------------------
     * @param {Function} cb … ユーザー選択を返すコールバック
     *                       true  – 破棄して閉じる
     *                       false – 何もしない（編集に戻る）
     * ----------------------------------------------------------
     */
    function askDiscard(cb) {

        /* 既にポップアップが出ているなら二重生成を防ぐ */
        if (document.getElementById('tm-confirm')) return;

        /* DOM 構築 -------------- */
        const box = document.createElement('div');
        box.id = 'tm-confirm';
        box.innerHTML = `
            <!-- 背景の半透明黒幕 -->
            <div class="cf-back"></div>

            <!-- 中央の確認ダイアログ -->
            <div class="cf-panel">
                <p>変更が保存されていません。<br>破棄して閉じますか？</p>
                <footer>
                    <button class="cf-ok">破棄して閉じる</button>
                    <button class="cf-cancel">戻る</button>
                </footer>
            </div>`;
        document.body.appendChild(box);

        /* ③ ボタンクリックハンドラ ---- */
        box.querySelector('.cf-ok').onclick = () => { box.remove(); cb(true); };      // 破棄して閉じる
        box.querySelector('.cf-cancel').onclick = () => { box.remove(); cb(false); }; // 戻る

        /* ④ ESC キーで “戻る” と同じ挙動 ------------------ */
        const onKey = e => { if (e.key === 'Escape'){ box.remove(); cb(false); } };
        document.addEventListener('keydown', onKey, { once:true });
    }
    /* ============================================= */

    /* ========== CodeMirror の各種設定 ========== */

    /* -------------------------------------------------------------------- *
     * CodeMirror ― エディタ／ヘルプ内のハイライト & 補完まわり
     * -------------------------------------------------------------------- *
     *   “コマンド‐エディタ”と“ヘルプ記事”で利用している CodeMirror
     *   に、色付け・補完などの便利機能を追加するセクション。
     *
     *   1. beautifyHelpCode()  …… ヘルプ記事 <pre> を CM に置換
     *   2. buildWordList()     …… 変数／エイリアス込みの補完辞書生成
     *   3. buildVarsOverlay()  …… 変数だけ色付けする簡易オーバレイ
     *   4. 各種 registerHelper … 補完ロジック（通常・「.」補完 等）
     * -------------------------------------------------------------------- */

    /* ------------------------------------------------------------------ */
    /* ヘルプ記事 (<pre>) を CodeMirror に置き換えてシンタックスハイライト   */
    /* ------------------------------------------------------------------ */
    function beautifyHelpCode() {

        // CM 未読込なら無視
        if (typeof CodeMirror === 'undefined') return;

        hl.querySelectorAll('#tm-help-article pre').forEach(pre => {

            /* CodeMirror の生成。DOM に挿入するコールバックで <pre> と差し替え */
            const cm = CodeMirror(elt => pre.replaceWith(elt) ,{
                value          : pre.textContent, // 元テキスト
                mode           : 'javascript',    // js ハイライト
                theme          : 'monokai',       // 暗色テーマ
                readOnly       : true,
                lineNumbers    : true,
                viewportMargin : Infinity         // 全行描画（折返し対策）
            });

            /* 背景を dark UI に合わせて統一 */
            cm.getScrollerElement().style.background = '#1e1e1e';
        });
    }

    /* ------------------------------------------------------------------ */
    /* “変数 / キーワード”リストを動的に生成（補完ポップアップ用）            */
    /* ------------------------------------------------------------------ */
    function buildWordList() {

        // 変数名
        const varNames = vars.map(v => v.name);

        // エイリアス名
        const kw_alias = Object.keys(KW_ALIAS || {});

        /* “変数 / エイリアス”は後で区別が付くよう label を保持 */
        const dicExtra = [...varNames, ...kw_alias].map(w => ({ text: w, label: '変数 / エイリアス' }));

        // 定義済み + 追加分
        return [...PALETTE_DICT, ...dicExtra];
    }

    /* ------------------------------------------------------------------ */
    /* 変数名だけ色を変える簡易オーバレイ（CodeMirror addOverlay 用）        */
    /* ------------------------------------------------------------------ */
    function buildVarsOverlay() {
        const names = vars.map(v => v.name).filter(Boolean);
        if (!names.length) return null;

        /* 長い変数ほど先に評価して誤マッチ防止 */
        names.sort((a, b) => b.length - a.length);
        const re = new RegExp(`\\b(?:${names.map(varReg).join('|')})\\b`);

        return {
            token(stream) {

                // CSS .cm-tm-var に色設定
                if (stream.match(re)) return 'tm-var';

                /* マッチするまで1文字ずつ進む */
                while (stream.next() != null && !stream.match(re, false)) { }

                return null;
            }
        };
    }

    /* ------------------------------------------------------------------ */
    /* Palette 補完（任意位置：変数・キーワード）                           */
    /* ------------------------------------------------------------------ */
    CodeMirror.registerHelper('hint','palette', cm=>{
        const cur = cm.getCursor();
        const token = cm.getTokenAt(cur); // カーソル位置のトークン
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

    /* ------------------------------------------------------------------ */
    /* “obj.” 直後のメンバー補完（dotPalette）                       */
    /* ------------------------------------------------------------------ */
    CodeMirror.registerHelper('hint', 'dotPalette', cm => {
        const cur = cm.getCursor();
        const line = cm.getLine(cur.line).slice(0, cur.ch);
        const m = line.match(/([A-Za-z_$][\w$]*)\.$/); // foo.
        if (!m) return;

        const obj = m[1];
        const items = API_MEMBERS[obj] || []; // 定義済みメンバー
        const list = items.map(txt => ({ text: txt }));

        return { list, from : cur, to : cur };
    });

    /* ------------------------------------------------------------------ */
    /* ネストプロパティ “obj.xxx.” でも補完（member）                */
    /* ------------------------------------------------------------------ */
    CodeMirror.registerHelper('hint', 'member', cm => {
        const cur = cm.getCursor();
        const line = cm.getLine(cur.line).slice(0, cur.ch);

        /* foo.bar. の “foo” 部分を取得 */
        const m = line.match(/([\w$]+)(?:\[[^\]]*])*\.\s*$/);
        if (!m) return;

        const base = m[1];
        const items = API_MEMBERS[base] || [];

        const list = items.map(txt => ({
            text        : txt.replace(/\(.*$/, ''), // () が付いていたら除去して挿入
            displayText : txt,
            className   : 'cm-hint-own',
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
    /* ============================================= */

    /* ========== ビューア 設定部分  ========== */

    /* -----------------------------------------------------------
     *           PDF.js の読み込みとワーカー設定
     * -----------------------------------------------------------
     * 1.  cdn.jsdelivr から pdf.js の「ビルド済み UMD 版」を使用。
     * 2.  PDF をレンダリングする際はワーカー（pdf.worker.min.js）が
     *     必須なので、その URL を GlobalWorkerOptions へ登録。
     * --------------------------------------------------------- */
    const pdfjsLib = window['pdfjs-dist/build/pdf'];              // pdf.js のメインモジュール
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

    /* -----------------------------------------------------------
     *           Shadow DOM ホスト要素の作成
     * -----------------------------------------------------------
     * ・ユーザースクリプトが複数回実行されても 2 重生成しないよう
     *   hostId で存在確認（duplicate guard）。
     * ・document.documentElement（= <html>）直下に
     *   <div id="cf-pdf-viewer-host"> を追加し、そこへ
     *   Shadow DOM（mode:'open'）を attach。
     *   └ 以降の UI / CSS は Shadow DOM 内に隔離して描画。
     * --------------------------------------------------------- */
    const hostId = 'cf-pdf-viewer-host';

    // 既にホストがあれば早期リターン（再実行ガード）
    if (document.getElementById(hostId)) return;

    const host = document.createElement('div');
    host.id = hostId;
    document.documentElement.appendChild(host);      // <html> 直下へ挿入

    // ここから先は shadowRoot 配下に DOM/CSS を組み立てていく
    const shadow = host.attachShadow({ mode: 'open' });

    /* ------------------------------------------------------------
 *  ▼ 影 DOM に注入する “HTML + CSS” テンプレート
 * ------------------------------------------------------------
 *   - 上半分 : <style> 〜 CSS                          (dark‑UI)
 *   - 下半分 : ランチャーボタン / ビューワ本体の HTML
 *   ──────────────────────────────────────────────── */
    shadow.innerHTML =
        `
        <!-- ========== 1. 全体スタイル ========== -->
        <style>
        /* 基本リセット -------------------------------------------------- */
        :host, * {
            box-sizing : border-box
        }

        /* ───────── ビューワ本体 ───────── */
        /*   draggable + resizable。既存ツールと同じ暗色ガラス風。 */
        .viewer {
            position       : fixed;
            top            : 60px;
            left           : 60px;
            width          : 760px;
            height         : 640px;
            min-width      : 320px;
            background     : rgba(44, 44, 44, .87);
            color          : #fff;
            border-radius  : 4px;
            display        : flex;
            flex-direction : column;
            overflow       : hidden;
            font-family    : sans-serif;
            z-index        : 1200;
            box-shadow     : 0 2px 6px rgba(0, 0, 0, .4);
            resize         : both;
        }
        .viewer[hidden] { display : none }

        /* ───────── タイトルバー ───────── */
        .titlebar {
            height      : 28px;
            background  : #2c2c2c;
            display     : flex;
            align-items : center;
            cursor      : move;
            padding     : 0 8px;
            user-select : none;
        }
        .title {
            flex      : 1;
            font-size : 13px
        }
        .close {
            width         : 22px;
            height        : 22px;
            line-height   : 22px;
            text-align    : center;
            border-radius : 3px;
            cursor        : pointer
        }
        .close:hover {
            background : #555
        }

        /* ───────── タブバー ───────── */
        .tabbar {
            display    : flex;
            gap        : 2px;
            overflow-x : auto;
            background : #3a3a3a;
            padding    : 4px 6px;
        }
        .tab {
            padding       : 2px 6px;
            border-radius : 3px;
            font-size     : 12px;
            display       : flex;
            align-items   : center;
            gap           : 4px;
            background    : #555;
            color         : #eee;
            cursor        : pointer;
            white-space   : nowrap;
        }
        .tab.active {
            background : #1f1f1f;
            color      : #fff;
            border     : 1px solid #777;
        }
        .tab .x {
            font-weight : bold;
            cursor      : pointer
        }

        /* ─────────  左:Sidebar / 右:Main  ───────── */
        .body {
            flex     : 1;
            display  : flex;
            overflow : hidden
        }

        /* ----- Sidebar (ボタン＋ Outline) ----- */
        .sidebar {
            width        : 260px;
            padding      : 8px;
            overflow-y   : auto;
            background   : #2d2d2d;
            border-right : 1px solid #555;
        }

        /* ----- Main (Control + Canvas) ----- */
        .main {
            flex           : 1;
            display        : flex;
            flex-direction : column;
            overflow       : hidden
        }

        /* ▼ Control Bar (ページ送り / ズーム) --------------------- */
        .controls {
            display     : flex;
            gap         : 6px;
            align-items : center;
            flex-wrap   : wrap;
            font-size   : 12px;
            padding     : 6px 8px;
            background  : #3d3d3d;
        }
        .controls button {
            padding       : 2px 8px;
            border        : none;
            border-radius : 3px;
            background    : #555;
            color         : #fff;
            cursor        : pointer;
        }
        .controls button:hover {
            background : #666
        }
        .controls input[type=range] {
            accent-color : #888
        }
        .controls select {
            background    : #555;
            color         : #fff;
            border        : 1px solid #777;
            border-radius : 3px;
            padding       : 2px 6px;
            font-size     : 12px;
        }
        .controls select:focus {
            outline : 1px solid #4dabf7
        }

        /* ▼ Canvas / iframe 埋込部 ------------------------------- */
        .canvas-wrap {
            flex            : 1;
            display         : flex;
            justify-content : center;
            align-items     : flex-start;
            overflow        : auto;
            background      : #222;
            padding         : 12px;
        }
        .canvas-wrap.iframe {
            background : #222;
            padding    : 0
        }
        canvas {
            background : #111;
            box-shadow : 0 2px 6px rgba(0, 0, 0, .4)
        }
        .webFrame {
            position : relative;
            inset    : 0;
            border   : none;
            width    : 100%;
            height   : 100%
        }

        /* ▼ Outline (サイドバー内見出し一覧) --------------------- */
        .outline-item {
            font-size     : 12px;
            margin        : 2px 0;
            padding       : 1px 4px;
            color         : #b6c2ff;
            border-radius : 3px;
            cursor        : pointer;
            transition    : background .15s, color .15s;
        }
        .outline-item:hover {
            background : #2c3a5a;
            color      : #fff
        }
        .outline-item:active {
            background : #1e2840
        }

        /*  階層レベル別で文字色をグラデーション */
        .outline-item[data-depth="0"] { color : #b6c9ff }
        .outline-item[data-depth="1"] { color : #9cb4ff }
        .outline-item[data-depth="2"] { color : #8fa1d9 }
        .outline-item[data-depth="3"] { color : #7f8ab3 }
        .outline-item[data-depth="4"] { color : #6c7690 }
        .outline-item[data-depth="5"] { color : #5a5d70 }

        /* ▼ D&D オーバレイ ------------------------------------ */
        .drop-overlay {
            position        : fixed;
            inset           : 0;
            background      : rgba(0,0,0,.7);
            color           : #fff;
            font-size       : 24px;
            display         : flex;
            align-items     : center;
            justify-content : center;
            z-index         : 1300;
            pointer-events  : none;
            opacity         : 0;
            transition      : opacity .15s;
        }
        .drop-overlay.active {
            opacity        : 1;
            pointer-events : auto
        }

        /* ▼ Sidebar 内のボタン & 入力フォーム ------------------- */
        .file-btn, .url-load {
            padding       : 5px 10px;
            border        : none;
            border-radius : 3px;
            background    : #555;
            color         : #fff;
            cursor        : pointer;
        }
        .file-btn:hover, .url-load:hover {
            background : #666
        }

        .url-form {
            display       : flex;
            gap           : 6px;
            margin-bottom : 10px
        }
        .url-input {
          flex          : 1;
          padding       : 5px 7px;
          font-size     : 13px;
          border-radius : 3px;
          background    : #2d2d2d;
          border        : 1px solid #555;
          color         : #ddd;
        }
        .url-input:focus {
            outline : 1px solid #4dabf7
        }

        input[type=file] { display : none }

        </style>

        <!-- ========== 2. ランチャーボタン ========== -->
        <div class="launch">PDF</div>

        <!-- ========== 3. ビューワ本体 ========== -->
        <div class="viewer" hidden>

            <!-- タイトルバー -->
            <div class="titlebar">
                <div class="title">Viewer</div>
                <div class="close">✕</div>
            </div>

            <!-- タブバー -->
            <div class="tabbar"></div>

            <!-- メイン Body（sidebar + main） -->
            <div class="body">

              <!-- ▽ Sidebar ▽ -->
              <div class="sidebar">
                <button class="file-btn">ローカル選択</button>
                <!-- accept で pdf / md / txt のみ許可 -->
                <input type="file"
                       accept=".pdf,.md,.txt,application/pdf,text/markdown,text/plain"
                       class="file-input">

                <div style="font-weight:bold;margin:8px 0 4px">URL読み込み</div>
                <form class="url-form" onsubmit="return false;">
                  <input class="url-input" type="text"
                         placeholder="https://example.com/x.pdf">
                  <button class="url-load">Load</button>
                </form>

                <hr style="margin:8px 0">

                <div style="font-weight:bold;margin-bottom:4px">Outline</div>
                <div class="outline"></div>
              </div><!-- /sidebar -->

              <!-- ▽ Main ▽ -->
              <div class="main">

                <!-- ▲ コントロールバー ▲ -->
                <div class="controls">
                  <button class="prev">Prev</button>
                  <span class="page-info">- / -</span>
                  <button class="next">Next</button>

                  <span style="margin-left:8px">Zoom:</span>
                  <button class="zoom-out">‑</button>
                  <input  class="zoom-range" type="range" min="50" max="300" value="150">
                  <button class="zoom-in">+</button>

                  <select class="fit-select">
                    <option value="fit-width" selected>Fit Width</option>
                    <option value="fit-page">Fit Page</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <!-- ▲ PDF Canvas / HTML iframe ▲ -->
                <div class="canvas-wrap">
                  <canvas class="canvas"></canvas>
                  <iframe class="webFrame" hidden></iframe>
                </div>

              </div><!-- /main -->

              <!-- D&D ドロップエリアのオーバレイ -->
              <div class="drop-overlay">
                PDF / MD / TXT をここにドロップ
              </div>

            </div><!-- /body -->
        </div><!-- /viewer -->
        `; // ← shadow.innerHTML 終了


    /* =========================================================
     *            DOM 要素への “早見表” を作るセクション
     * ======================================================= */

    /* ---------- シャドウ DOM 内で querySelector を短縮 ---------- */
    const $ = sel => shadow.querySelector(sel);   // shadow.querySelector の省略版

    /* ---------- UI の主要ノードを事前に全部握っておく ---------- */
    const btnLaunch  = $('.launch');      // 右下の「PDF」ランチャーボタン
    const viewer     = $('.viewer');      // メインウィンドウ<div>
    const btnClose   = $('.close');       // ウィンドウ右上 ✕ ボタン
    const tabbar     = $('.tabbar');      // タブを並べるバー
    const outlineBox = $('.outline');     // サイドバー：アウトライン挿入先

    /* “次/前/ズーム” などコントロールバーの子要素 */
    const ctrl = {
        prev     : $('.prev'),       // ＜ Prev
        next     : $('.next'),       // Next ＞
        pageInfo : $('.page-info'),  // 「1 / 10」表示
        zOut     : $('.zoom-out'),   // ズーム－
        zIn      : $('.zoom-in'),    // ズーム＋
        zRange   : $('.zoom-range'), // range input
        fitSel   : $('.fit-select')  // Fit‑select <select>
    };

    const canvas    = $('.canvas');            // PDF 描画キャンバス
    const ctx       = canvas.getContext('2d'); // キャンバス 2D コンテキスト
    const wrap      = $('.canvas-wrap');       // キャンバス＋iframe を包む<div>
    const fileBtn   = $('.file-btn');          // 「ローカル選択」ボタン
    const fileInput = $('.file-input');        // <input type=file>
    const urlInput  = $('.url-input');         // URL 入力ボックス
    const urlLoad   = $('.url-load');          // 「Load」ボタン
    const dropOL    = $('.drop-overlay');      // ドロップ時に出す暗転オーバレイ

    /* =========================================================
     *                   汎用ユーティリティ
     * ======================================================= */

    /* 描画キャンセル検知用ヘルパ（pdf.js が投げる例外名を判定） */
    const isCancel = e => e && e.name === 'RenderingCancelledException';

    /* GM_xmlhttpRequest で CORS 無視＆arraybuffer 取得 -------------*/
    const fetchPdf = url => new Promise((res, rej) =>
        GM_xmlhttpRequest({
            method: 'GET',
            url,
            responseType: 'arraybuffer',
            onload: r => (r.status >= 200 && r.status < 300)
                ? res(new Uint8Array(r.response))
                : rej('HTTP ' + r.status),
            onerror: rej
        })
    );

    /* “次の requestAnimationFrame まで待つ” 小ネタ */
    const nextFrame = () => new Promise(r => requestAnimationFrame(r));

    /* =========================================================
     *            ビューワ 1 タブ = 1 セッションという扱い
     * ======================================================= */

    /** 1 つの PDF / Markdown / iframe を束ねるクラス */
    class PdfSession {
        constructor(id, title, bytes) {
            this.id         = id;          // 一意キー (url:~, file:~, …)
            this.title      = title;       // タブの表示名
            this.bytes      = bytes;       // Uint8Array (PDF の原データ) ※iframe/MD は空
            this.pdf        = null;        // pdf.js の Document インスタンス
            this.page       = 1;           // 現在ページ
            this.scale      = 1.5;         // 描画倍率
            this.fit        = 'fit-width'; // fit‑select 現在値
            this.renderTask = null;        // 描画中タスク (cancel 用)
            /* isIframe / isText / outline などは用途に応じて後付けプロパティ */
        }
    }

    /* =========================================================
     *                     ▼ Tab helpers ▼
     * ---------------------------------------------------------
     * 1 tab ＝ 1 PdfSession。タブ切り替え／追加／削除と
     * サイドバー Outline の構築を司るセクション。
     * ======================================================= */

    /* ---------------------------------------------------------
     * setActive(id)
     * ---------------------------------------------------------
     *  ■ id で指定されたセッションを “表示中” に切り替える
     *  ■ iframe / Markdown / PDF で描画方法が変わる
     *  ■ アウトラインもここで描き直す
     * ------------------------------------------------------- */
    function setActive(id) {
        /* 現在アクティブを更新（該当が無ければ null） */
        active = sessions.find(s => s.id === id) || null;

        /* タブバーのハイライト切替 */
        [...tabbar.children]
            .forEach(t => t.classList
                .toggle('active', t.dataset.id === id));

        /* キャンバス or iframe の表示を切り替える */
        const frame = shadow.querySelector('.webFrame');

        /* --- タブが 0 枚のとき（全面クリア） -------- */
        if (!active) {
            wrap.classList.remove('iframe');
            frame.hidden              = true;
            canvas.hidden             = true;
            canvas.style.display      = 'none';
            outlineBox.innerHTML      = '';
            ctrl.pageInfo.textContent = '- / -';
            return;
        }

        /* --- Web ページ表示用 iframe ------------------ */
        if (active.isIframe) {
            wrap.classList.add('iframe');
            frame.hidden         = false;
            canvas.hidden        = true;
            canvas.style.display = 'none';
            outlineBox.innerHTML = '(no outline)';
            return;
        }

        /* --- Markdown / TXT --------------------------- */
        if (active.isText) {
            wrap.classList.add('iframe');
            frame.hidden         = false;
            canvas.hidden        = true;
            canvas.style.display = 'none';
            buildOutline();                 // MD 用 Outline
            return;
        }

        /* --- PDF -------------------------------------- */
        wrap.classList.remove('iframe');
        frame.hidden         = true;
        canvas.hidden        = false;
        canvas.style.display = '';
        buildOutline();                   // PDF 用 Outline
        renderPage(active.page, true);    // 現ページ再描画
    }

    /* ---------------------------------------------------------
     * addTab(sess)
     * ---------------------------------------------------------
     *  新しいタブをタブバーに追加するだけのヘルパ
     * ------------------------------------------------------- */
    function addTab(sess) {
        const tab      = document.createElement('div');
        tab.className  = 'tab';
        tab.dataset.id = sess.id;
        tab.innerHTML  =
            `<span class="label">${sess.title}</span><span class="x">×</span>`;

        /* タブクリックで選択、✕クリックで閉じる */
        tab.onclick = e => {
            if (e.target.classList.contains('x')) closeSession(sess.id);
            else setActive(sess.id);
        };
        tabbar.appendChild(tab);
    }

    /* ---------------------------------------------------------
     * closeSession(id)
     * ---------------------------------------------------------
     *  指定 id のセッションを配列・タブから削除し、
     *  必要なら次のタブへフォーカスを移す。
     * ------------------------------------------------------- */
    function closeSession(id) {
        const idx = sessions.findIndex(s => s.id === id);
        if (idx === -1) return;                // 見つからない

        const sess = sessions[idx];
        /* 描画中なら pdf.js のタスクをキャンセル */
        if (sess.renderTask?.cancel) {
            try { sess.renderTask.cancel(); } catch { }
        }
        sessions.splice(idx, 1);                // 配列から除去
        tabbar.querySelector(`[data-id="${id}"]`)?.remove(); // DOM も

        /* 表示していたタブだった場合は次をアクティブに */
        if (active?.id === id) {
            active = sessions[0] || null;
            setActive(active?.id ?? null);
        }
    }

    /* =========================================================
     *                     ▼ Outline 関連 ▼
     * ======================================================= */

    /* Outline を再構築してサイドバーへ描画 */
    async function buildOutline() {
        outlineBox.innerHTML = '';
        if (!active) return;

        /* --- PDF (pdf.js の Outline を使う) --------------- */
        if (active.pdf) {
            const list = await active.pdf.getOutline();
            return renderOutline(list);
        }

        /* --- Markdown / TXT -------------------------------- */
        if (active.isText && active.outline?.length) {
            return renderOutline(active.outline, true); // true=iframe
        }

        outlineBox.textContent = '(no outline)';
    }

    /* list ＝ 階層ツリーを HTML に落とし込む */
    function renderOutline(list, isIframe = false) {
        if (!list?.length) { outlineBox.textContent = '(no outline)'; return; }

        const make = (item, depth) => {
            const div = document.createElement('div');
            div.className = 'outline-item';
            div.dataset.depth = depth;            // 色分け用 data 属性
            div.style.paddingLeft = `${depth * 12}px`;
            div.textContent = item.title || '(untitled)';

            /* クリックでジャンプ */
            div.onclick = async () => {
                if (isIframe) {
                    /* iframe 内要素へスクロール */
                    const frameDoc = shadow.querySelector('.webFrame').contentWindow?.document;
                    frameDoc?.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' });
                } else {
                    /* PDF ならページジャンプ */
                    let dest = item.dest;
                    if (typeof dest === 'string') dest = await active.pdf.getDestination(dest);
                    if (Array.isArray(dest)) {
                        const ref = dest[0];
                        const idx = await active.pdf.getPageIndex(ref);
                        renderPage(idx + 1);
                    }
                }
            };

            outlineBox.appendChild(div);
            item.items?.forEach(ch => make(ch, depth + 1));
        };

        list.forEach(i => make(i, 0));
    }

    /* ---------------------------------------------------------
     * buildMdOutline(html)
     * ---------------------------------------------------------
     *  Markdown を HTML に変換後、
     *  h1‑h6 を走査して “階層ツリー” ＆ “id 付き HTML” を生成。
     *  return { outline:Array, html:String }
     * ------------------------------------------------------- */
    function buildMdOutline(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const tops = [];          // ルート階層
        const stack = [];          // 現在の親スタック

        doc.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(el => {
            const lvl = +el.tagName[1];         // 1〜6
            const item = {
                level: lvl,
                title: el.textContent.trim() || '(untitled)',
                id: el.id || ('h_' + Math.random().toString(36).slice(2)),
                items: []
            };
            if (!el.id) el.id = item.id;         // アンカー用 id を付与

            /* スタックを階層レベルに合わせて縮める */
            while (stack.length && stack.at(-1).level >= lvl) stack.pop();
            (stack.at(-1)?.items || tops).push(item);
            stack.push(item);
        });

        return { outline: tops, html: doc.body.innerHTML };
    }

    /* =========================================================
     *            URL 入力ハンドラ（PDF or iframe）
     * ======================================================= */
    async function handleUrl(raw) {
        if (!raw) return;

        /* 1) .pdf なら PDF として開く ----------------------- */
        if (/\.pdf($|\?)/i.test(raw)) {
            const bytes = await fetchPdf(raw);
            openBytes(bytes, `url:${raw}`, raw.split('/').pop() || raw);
            return;
        }

        /* 2) それ以外は iframe 表示 ------------------------ */
        openIFrameSession(raw);
    }

    /* =========================================================
     *  ▼ iframe／テキストモード（MD / TXT）セッション生成
     * ---------------------------------------------------------
     *    openIFrameSession() :   外部 URL をそのまま <iframe> で表示
     *    openTextSession()  :   ローカルの .md / .txt を HTML に変換
     *                            ＋ Outline やコードハイライトを注入
     * ======================================================= */

    /* ---------- 外部 URL を iframe として開く ---------- */
    function openIFrameSession(url) {
        /* 同じ URL のタブが既にあればそれを選択して終了 */
        const id = `iframe:${url}`;
        if (sessions.some(s => s.id === id)) { setActive(id); return; }

        /* 空の PdfSession を作り、iframe モードフラグを付与 */
        const sess    = new PdfSession(id, '(Web)', new Uint8Array());
        sess.isIframe = true; // ← PDF ではなく iframe と判定する目印
        sessions.push(sess);
        addTab(sess);
        setActive(id);

        /* webFrame を表示して URL を流し込む */
        const frame  = shadow.querySelector('.webFrame');
        frame.src    = url;
        frame.hidden = false;

        /* 既存の PDF 用 canvas は隠す */
        canvas.style.display = 'none';
    }

    /* ---------- ローカル .md / .txt を HTML 化して開く ---------- */
    function openTextSession(sourceText, title = '(text)') {
        /* 同名タブがあれば再利用 */
        const id = `text:${title}`;
        if (sessions.some(s => s.id === id)) { setActive(id); return; }

        /* セッション生成（ここでは実際の PDF バイト列は不要） */
        const sess = new PdfSession(id, title, new Uint8Array());
        sess.isText = true; // ← テキストモード

        /* ---------- Markdown → HTML / TXT → <pre> ---------- */
        let htmlBody = title.endsWith('.md')
            ? marked.parse(sourceText) // Markdown をパース
            : `<pre style="white-space:pre-wrap;font-family:monospace">
               ${escapeHtml(sourceText)}
               </pre>`;

        /* ---------- Markdown の場合は Outline（見出しツリー）生成 */
        if (title.endsWith('.md')) {
            const { outline, html } = buildMdOutline(htmlBody); // h1‑h6 抽出
            sess.outline            = outline;                  // サイドバー用
            htmlBody                = html;                     // id が付与された本体
        }

        /* セッションを登録してタブを追加（addTab が走る） */
        sessions.push(sess);
        addTab(sess);

        /* ---------- iframe 向けに HTML＋CSS＋Script を合成 ---------- */

        /* ベースとなるダークテーマ CSS（GitHub Dark っぽい配色） */
        const styleBlock =
            `
            <style>
            /* ───── ベースカラー ───── */
            :root {
              --c-bg      : #1e1e1e; /* 背景 */
              --c-fg      : #dcdcdc; /* 通常文字 */
              --c-heading : #4dabf7; /* h1‑h3 */
              --c-sub     : #89d185; /* h4‑h6 / check */
              --c-border  : #3a3a3a; /* 線・テーブル枠 */
              --c-quote   : #9aa0a6; /* blockquote */
              --c-mark    : #665c00; /* <mark> 背景 */
              --c-mark-fg : #fffbe7; /* <mark> 文字 */
              --c-code-bg : #2d2d2d; /* pre/code 背景 */
            }

            /* -------------- 全体 -------------- */
            body {
                margin     : 1.2rem;
                font       : 15px/1.7 system-ui, sans-serif;
                background : var(--c-bg);
                color      : var(--c-fg);
            }

            /* -------------- 見出し -------------- */
            h1, h2, h3, h4,h5, h6 {
                scroll-margin-top : 80px;
                margin            : 1.2rem 0 .6rem
            }
            h1 {
                font-size : 1.8rem;
                color     : var(--c-heading)
            }
            h2 {
                font-size     : 1.55rem;
                color         : var(--c-heading);
                border-bottom : 1px solid var(--c-border)
            }
            h3 {
                font-size : 1.3rem;
                color     : var(--c-heading)
            }
            h4, h5, h6 {
                font-size : 1.15rem;
                color     : var(--c-sub)
            }

            /* アンカー (#) */
            h1:hover a.anchor,
            h2:hover a.anchor,
            h3:hover a.anchor { visibility : visible }
            a.anchor{
                float           : left;
                margin-left     : -1.2rem;
                padding-right   : .2rem;
                text-decoration : none;
                visibility      : hidden;
                color           : var(--c-border);
            }

            /* -------------- 段落・リスト -------------- */
            p, ul, ol{ margin : .5rem 0 }
            ul, ol { padding-left : 1.5rem }
            ul { list-style : square }
            li+li { margin-top : .25rem }

            /* チェックリスト */
            ul input[type=checkbox] {
              accent-color : var(--c-sub);
              margin-right : .4rem;
            }

            /* -------------- テーブル -------------- */
            table {
              border-collapse : collapse;
              margin          : .9rem 0;
              width           : 100%;
            }
            th, td {
              border  : 1px solid var(--c-border);
              padding : .5rem .7rem;
            }
            thead th {
                background : #262626;
                color      : var(--c-fg)
            }

            /* -------------- 引用 -------------- */
            blockquote {
              margin      : .7rem 0;
              padding     : .5rem .85rem;
              border-left : 4px solid var(--c-heading);
              background  : #262626;
              color       : var(--c-quote);
            }

            /* -------------- コード -------------- */
            pre {
              background    : var(--c-code-bg);
              padding       : .7rem 1rem;
              overflow      : auto;
              border-radius : 6px;
            }
            code {
                font-family : ui-monospace, Consolas, "Courier New", monospace
            }

            /* -------------- 強調・マーク -------------- */
            em { color : #c792ea }
            mark {
              background    : var(--c-mark);
              color         : var(--c-mark-fg);
              padding       : 0 .25rem;
              border-radius : 3px
            }
            </style>`;

        /* highlight.js 読み込み → onload で initHL() 呼出 */
        const extraScripts = `
            <!-- 関数を先に定義して global に晒す（CDN 読込後に呼ばれる） -->
            <script>
              window.initHL = function(){
                if(!window.hljs){ console.error('hljs load failed'); return; }
                hljs.highlightAll();                     // 全 <pre><code> を着色
                /* 各見出しに “#” アンカーを付けて、Outline からの scroll 用 */
                document.querySelectorAll('h1,h2,h3').forEach(h=>{
                  if(!h.id) return;
                  const a = document.createElement('a');
                  a.href='#'+h.id; a.className='anchor'; a.textContent='#';
                  h.prepend(a);
                });
              };
            </script>

            <!-- highlight.js の CSS と本体 JS（GitHub Dark テーマ）-->
            <link rel="stylesheet"
                  href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css">
            <script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js"
                    onload="initHL()" crossorigin="anonymous"></script>`;

        /* style + body + script を 1 つの Blob にして iframe.src へ */
        const blobHtml = `<!doctype html><meta charset="utf-8">
                     ${styleBlock}${htmlBody}${extraScripts}`;
        const frame = shadow.querySelector('.webFrame');
        frame.src = URL.createObjectURL(new Blob([blobHtml], { type: 'text/html' }));

        /* アクティブにしてアウトライン描画をトリガ */
        setActive(sess.id);
    }

    /* ---------- helper: HTML エスケープ for <pre> ---------- */
    function escapeHtml(s) {
        return s.replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    }

    /* =========================================================
     *  ▼ PDF １ページを描画する
     * ---------------------------------------------------------
     *    renderPage(num , keepFit=false)
     *      num      : 描画したいページ番号 (1‑based)
     *      keepFit  : true ⇒ 画面サイズが変わっても拡大率を維持
     *
     *   - active.pdf から該当ページを取得し、canvas にレンダリング
     *   - フィット種別（幅 / 全体 / カスタム）に応じて拡大率を再計算
     *   - 拡大率スライダー等の UI を同期
     * ======================================================= */
    async function renderPage(num, keepFit = false) {
        /* --- 関連セッションが無い・PDF 未ロードなら何もしない --- */
        if (!active || !active.pdf) return;

        /* --- 前回の描画タスクが残っていれば中断 --- */
        if (active.renderTask?.cancel) {
            try { active.renderTask.cancel(); } catch { }
        }

        /* --- 対象ページを取得し、閲覧ページ番号を更新 --- */
        active.page = num;
        const page = await active.pdf.getPage(num);

        /* --- オート表示が有効なら、隠れている Viewer を自動で開く --- */
        if (viewer.hidden && autoShow) {
            viewer.hidden = false;
            await nextFrame();                // repaint 待ち
        }

        /* ---------- 拡大率（active.scale）を決定 ---------- */
        const base = page.getViewport({ scale: 1 }); // 原寸サイズ
        if (!keepFit && active.fit !== 'custom') { // 自由拡大時以外
            const pad = 24; // 余白
            const cw = wrap.clientWidth - pad; // 表示領域の横幅
            const ch = wrap.clientHeight - pad; // 表示領域の縦高
            active.scale = (active.fit === 'fit-width')
                ? cw / base.width // 幅優先
                : Math.min(cw / base.width, // 全体フィット
                    ch / base.height);
            ctrl.zRange.value = Math.round(active.scale * 100);
        }
        ctrl.fitSel.value = active.fit; // セレクト反映

        /* ---------- Canvas サイズをデバイスピクセルで確保 ---------- */
        const vp = page.getViewport({ scale: active.scale }); // 実際の描画 VP
        const dpr = window.devicePixelRatio || 1; // Retina 等対応
        canvas.width = Math.floor(vp.width * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        canvas.style.width = `${vp.width}px`;
        canvas.style.height = `${vp.height}px`;

        /* ---------- キャンバスを初期化しページを描画 ---------- */
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.scale(dpr, dpr); // DPR スケール
        active.renderTask = page.render({ canvasContext: ctx, viewport: vp });

        try { // レンダリング完了待ち
            await active.renderTask.promise;
        } catch (e) {
            if (!isCancel(e)) console.error(e);
        }

        /* ---------- ページ情報ラベルを更新 ---------- */
        ctrl.pageInfo.textContent = `${active.page} / ${active.pdf.numPages}`;
    }

    /* =========================================================
     *  ▼ PDF バイト列を読み込み、タブを追加して１ページ目を描画
     * ---------------------------------------------------------
     *    openBytes(bytes , id , title)
     *      bytes  : Uint8Array (PDF ファイルの中身)
     *      id     : 一意識別子（重複防止用）
     *      title  : タブに表示するラベル
     * ======================================================= */
    async function openBytes(bytes, id, title) {

        /* --- 同じ PDF が既に開かれている場合は警告して終了 --- */
        if (sessions.some(s => s.id === id)) {
            alert('同じPDFは既に開いています');
            return;
        }

        /* --- Viewer を開き、次フレームでレイアウト確定を待つ --- */
        autoShow = true;
        viewer.hidden = false;
        await nextFrame();

        /* --- セッションを作成し、タブへ追加 & 選択 --- */
        const sess = new PdfSession(id, title, bytes);
        sessions.push(sess);
        addTab(sess);
        setActive(sess.id);

        /* --- pdf.js で Document をロード → アウトライン生成 → 描画 --- */
        try {
            sess.pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
            await buildOutline();     // 目次生成（非同期で OK）
            renderPage(1);            // 最初のページを表示
        } catch (e) {
            alert('PDF読み込み失敗: ' + e);
            closeSession(sess.id);    // タブを閉じて後始末
        }
    }

    /* =========================================================
     *  ▼ 画面下部「Prev / Next / Zoom」各 UI のイベントハンドラ
     * ---------------------------------------------------------
     *     ctrl.prev      … 前ページへ
     *     ctrl.next      … 次ページへ
     *     ctrl.zOut      … 10 % ずつズームアウト
     *     ctrl.zIn       … 10 % ずつズームイン
     *     ctrl.zRange    … スライダーで任意倍率に変更
     *     ctrl.fitSel    … 「Fit‑Width / Fit‑Page / Custom」切替
     * ======================================================= */

    /* ------- ← １ページ戻る --------------- */
    ctrl.prev.onclick = () => {
        if (!active) return;
        if (active.page > 1) renderPage(active.page - 1, /*keepFit=*/true);
    };

    /* ------- → １ページ進む --------------- */
    ctrl.next.onclick = () => {
        if (!active) return;
        if (active.page < active.pdf.numPages) renderPage(active.page + 1, /*keepFit=*/true);
    };

    /* ------- － ボタン：10 % ずつ縮小 ----- */
    ctrl.zOut.onclick = () => {
        if (!active) return;
        active.fit = 'custom'; // モードを Custom に固定
        active.scale = Math.max(0.5, active.scale - 0.1);
        ctrl.zRange.value = Math.round(active.scale * 100);
        renderPage(active.page, /*keepFit=*/true);
    };

    /* ------- ＋ ボタン：10 % ずつ拡大 ----- */
    ctrl.zIn.onclick = () => {
        if (!active) return;
        active.fit = 'custom';
        active.scale = active.scale + 0.1;
        ctrl.zRange.value = Math.round(active.scale * 100);
        renderPage(active.page, /*keepFit=*/true);
    };

    /* ------- スライダー操作 --------------- */
    ctrl.zRange.oninput = e => {
        if (!active) return;
        active.fit = 'custom';
        active.scale = e.target.value / 100; // 0–300 → 0.0–3.0
        renderPage(active.page, /*keepFit=*/true);
    };

    /* ------- Fit‑Select 変更 -------------- */
    ctrl.fitSel.onchange = e => {
        if (!active) return;
        active.fit = e.target.value; // 'fit-width' | 'fit-page' | 'custom'
        renderPage(active.page);  // 拡大率を再計算
    };

    /* =========================================================
     *  ▼ ウィンドウ移動・リサイズ／ファイル入出力まわり
     * ---------------------------------------------------------
     *    ❶ “ドラッグで移動”             … タイトルバーをつまんで移動
     *    ❷ ResizeObserver               … ビューアを伸縮したら再レイアウト
     *    ❸ ローカル選択・URL入力         … PDF / MD / TXT をロード
     *    ❹ D&D（ドラッグ＆ドロップ）     … ビューア表示中だけ有効
     * ======================================================= */

    /* ──────────────────────────────────────── ❶ Drag move ── */
    (() => {
        const bar = $('.titlebar'); // つまむ場所＝タイトルバー
        let dragging = false;       // ドラッグ中フラグ
        let offsetX = 0, offsetY = 0; // クリック位置と枠のズレ

        /* ―― マウス押下：ドラッグ開始 ―― */
        bar.addEventListener('mousedown', e => {
            if (e.target === btnClose) return; // × ボタンは除外
            dragging = true;
            const rect = viewer.getBoundingClientRect(); // 現在位置を取得
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            e.preventDefault();
        });

        /* ―― 移動中：位置を更新 ―― */
        window.addEventListener('mousemove', e => {
            if (!dragging) return;
            viewer.style.left = `${e.clientX - offsetX}px`;
            viewer.style.top = `${e.clientY - offsetY}px`;
        });

        /* ―― ボタン離し：ドラッグ終了 ―― */
        window.addEventListener('mouseup', () => dragging = false);
    })();

    /* ─────────────────────────────── ❷ ResizeObserver ──
     *  ウィンドウをリサイズしたら “Fit Width / Fit Page”
     *  の時だけ再描画して拡大率を合わせ直す                    */
    const ro = new ResizeObserver(() => {
        if (active && active.fit !== 'custom') renderPage(active.page, /*keepFit=*/true);
    });
    ro.observe(wrap);   // 左右スクロール領域
    ro.observe(viewer); // 全体ウィンドウ

    /* ─────────────────────────────── ❸ File & URL 入力 ── */
    /* …… [ローカル選択] ボタン …… */
    fileBtn.onclick = () => fileInput.click();

    /* …… ローカルファイル読み込み …… */
    fileInput.onchange = async e => {
        const f = e.target.files[0];
        if (!f) return;

        if (f.name.endsWith('.pdf')) { // PDF
            openBytes(new Uint8Array(await f.arrayBuffer()), `file:${f.name}`, f.name);
        } else if (/\.(md|txt)$/i.test(f.name)) { // Markdown / TXT
            const txt = await f.text();
            openTextSession(txt, f.name);
        } else {
            alert('PDF / MD / TXT 以外は未対応です');
        }
    };
    /* …… URL 読み込み …… */
    urlLoad.onclick = () => handleUrl(urlInput.value.trim());

    // Viewer 内の「✕」ボタン
    btnClose.onclick = () => {
        viewer.hidden = true;
        autoShow = false;        // 手動で閉じたので次回は自動表示しない
    };

    /* ─────────────────────────────── ❹ Drag & Drop ─────── */
    /* ＊ viewer.hidden = true のときは D&D を無効化している */
    let dragCnt = 0;   // ネストした dragenter / dragleave を数える

    /* ----- ペイロードがウィンドウ上に入った ----- */
    document.addEventListener('dragenter', () => {
        if (viewer.hidden) return; // 非表示なら無視
        dragCnt++;
        dropOL.classList.add('active'); // 画面全体に半透明オーバレイ
    });

    /* ----- ペイロードがウィンドウ外へ出た ----- */
    document.addEventListener('dragleave', () => {
        if (--dragCnt <= 0) {
            if (viewer.hidden) return;
            dragCnt = 0;
            dropOL.classList.remove('active');
        }
    });

    /* ----- ファイルを運んでいる間 ----- */
    document.addEventListener('dragover', e => {
        if (viewer.hidden) return;
        e.preventDefault(); // ブラウザ既定のリンク開きを抑止
    });

    /* ----- ドロップ完了 ----- */
    document.addEventListener('drop', async e => {
        if (viewer.hidden) return; // ビューア非表示なら終了
        if (!dropOL.classList.contains('active')) return;

        e.preventDefault();
        dragCnt = 0;
        dropOL.classList.remove('active');

        const f = e.dataTransfer?.files[0];
        if (!f) return;

        /* ---------- PDF ---------- */
        if (f.name.endsWith('.pdf')) {
            openBytes(new Uint8Array(await f.arrayBuffer()), `file:${f.name}`, f.name);
            return;
        }

        /* ---------- Markdown / Text ---------- */
        if (/\.(md|txt)$/i.test(f.name)) {
            const txt = await f.text();
            openTextSession(txt, f.name);
            return;
        }

        alert('PDF / MD / TXT 以外はドロップ対応していません');
    });

    /* ========== 汎用CSS ========== */
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
    /* ============================== */

    /* ========== Window のドラッグとリサイズ ========== */

    /* ----------------------------------------------------------------------- *
     * 【Window のドラッグ移動 / リサイズ】                                   *
     * ----------------------------------------------------------------------- *
     *   drag(el) …… タイトルバーをつかんで自由に配置                            *
     *   resz(el) …… 右下グリップをドラッグしてサイズ変更                     *
     *                                                                          *
     *   ─ どちらも PointerEvents で実装 ─                                     *
     *     ・pointerdown … 開始座標と初期値を保存                              *
     *     ・pointermove … 差分だけ座標／サイズをリアルタイム反映              *
     *     ・pointerup   … フラグを落として終了                                *
     * ----------------------------------------------------------------------- */

    /* ---------------------- ドラッグ移動 -------------------------------- */
    const drag = (el) => {

        /* タイトルバー（class="head"）をドラッグ領域とする */
        const hd = el.querySelector('.head');

        /* 座標保存用  */
        let sx = 0, sy = 0, // pointerdown 時の座標
            ox = 0, oy = 0, // pointerdown 時のウィンドウ原点
            d  = false,     // ドラッグ中フラグ
            r  = 0;

        /* ――― pointerdown : ドラッグ開始 ――― */
        hd.addEventListener('pointerdown', e => {

            /* ×ボタンなど .b 内はドラッグさせない */
            if (e.target.closest('.b')) return;

            d = true; sx = e.clientX; sy = e.clientY;

            /* 現在位置を取得して基準値にする */
            r = el.getBoundingClientRect(); ox = r.left; oy = r.top;

            hd.setPointerCapture(e.pointerId);
        });

        /* ――― pointermove : マウス移動量をそのまま位置に加算 ――― */
        hd.addEventListener('pointermove', e => {
            if (!d) return;

            /* 移動後座標 = 元の座標 + (今のマウス位置 - 開始時の位置) */
            el.style.left = `${clamp(ox + e.clientX - sx, 0, innerWidth  - 100)}px`;
            el.style.top  = `${clamp(oy + e.clientY - sy, 0, innerHeight - 40 )}px`;
        });

        /* ――― pointerup : 終了 ――― */
        hd.addEventListener('pointerup', () => { d = false; r = el.getBoundingClientRect(); });
    };

    /* ---------------------- リサイズ ------------------------------------ */
    const resz = (el) => {

        /* 右下グリップ（class="rs"）をリサイズハンドルに */
        const g = el.querySelector('.rs');

        /* サイズ保存用 */
        let w  = 0, h  = 0, // 開始時の幅・高さ
            sx = 0, sy = 0, // pointerdown 時の座標
            r  = false;

        /* ――― pointerdown : リサイズ開始 ――― */
        g.addEventListener('pointerdown', e => {
            r = true; sx = e.clientX; sy = e.clientY;
            const rt = el.getBoundingClientRect();
            w = rt.width; h = rt.height;
            g.setPointerCapture(e.pointerId);
        });

        /* ――― pointermove : 幅・高さを差分分だけ伸縮 ――― */
        g.addEventListener('pointermove', e => {
            if (!r) return;

            // 最小 240 × 160
            el.style.width  = `${Math.max(w + e.clientX - sx, 240)}px`;
            el.style.height = `${Math.max(h + e.clientY - sy, 160)}px`;
        });

        /* ――― pointerup : 終了 ――― */
        g.addEventListener('pointerup', () => r = false);
    };
    /* ============================== */

    /* ======================================================================= *
     *                           ▼  ウィンドウ群の生成 ▼                       *
     * ----------------------------------------------------------------------- *
     *  buildWin()   … パレットランチャーを作成/再生成                          *
     *  toggleWin()  … buildWin と remove をトグル                             *
     * ----------------------------------------------------------------------- *
     *  toggleEd()   … コマンドエディタ（CodeMirror）の表示/非表示            *
     *  toggleVar()  … 変数エディタの表示/非表示                               *
     *  toggleHelp() … ヘルプウィンドウの表示/非表示                           *
     * ======================================================================= */

    let win = null,
        ed = null,
        vr = null,
        hl = null;

    /* ── パレット生成 ───────────────────────────────────────────────── */
    const buildWin = () => {

        // 既にあれば作り直す
        if (win) win.remove();

        /* ウィンドウ骨格 ---------------------------------------------------- */
        win = document.createElement('div'); win.id = 'tm-win';
        win.innerHTML =
            `
            <div class="head">
                <span>パレット</span>

                <!-- PDF / MD / TXT Viewer -->
                <button class="b" id="viB">📄</button>

                <!-- 自動ダイス結果隠し -->
                <button class="b" id="autoHideB">🎲</button>

                <!-- 設定読み込み -->
                <button class="b" id="impB">⤒</button>

                <!-- 設定保存 -->
                <button class="b" id="expB">⤓</button>

                <!-- HELP -->
                <button class="b" id="hB">？</button>

                <!-- VAR -->
                <button class="b" id="vB">Φ</button>

                <!-- EDIT -->
                <button class="b" id="eB">⚙</button>

                <!-- CLOSE -->
                <button class="b" id="cB">✕</button>
            </div>

            <!-- ボタン置場 -->
            <div class="g" id="gp">

            <!-- 右下リサイズ -->
            </div><div class="rs"></div>
            `;

        // ドラッグ移動
        drag(win);

        // リサイズ
        resz(win);

        /* コマンドボタン生成 ----------------------------------------------- */
        const gp = win.querySelector('#gp');
        cmds.forEach(({ label, lines }, i) => {
            const btn = document.createElement('button');
            btn.textContent = label || `Button${i + 1}`;
            btn.onclick = () => enqueueSend(lines); // クリックで送信
            gp.appendChild(btn);
            win.querySelector('#cB').onclick = () => win.remove(); // 閉じる
        });

        /* ボタンクリック割り当て ------------------------------------------- */
        win.querySelector('#eB').onclick   = toggleEd;     // コマンド編集
        win.querySelector('#vB').onclick   = toggleVar;    // 変数編集
        win.querySelector('#hB').onclick   = toggleHelp;   // ヘルプ
        win.querySelector('#impB').onclick = importConfig; // 設定インポート
        win.querySelector('#expB').onclick = exportConfig; // 設定エクスポート

        // Viewer
        win.querySelector('#viB').onclick = () => {
            viewer.hidden = !viewer.hidden;        // 表示 / 非表示をトグル
            autoShow = !viewer.hidden;             // “手動で隠したら自動表示しない” という元のロジック

            if (viewer.hidden) return;             // 開いた時だけ初期化チェック
            if (!sessions.length) setActive(null); // 初回は「空タブ」状態にして真っ白に
        };

        /* 🎲 : 自動スクリプトカードの ON/OFF ------------------------------- */
        win.querySelector('#autoHideB').onclick = () => {
            hideAutoCards = !hideAutoCards;
            document.querySelectorAll(`${CARD_SEL}[${AUTO_ATTR}]`).forEach(el => { el.style.display = (hideAutoCards && el.getAttribute(AUTO_ATTR) === 'true') ? 'none' : ''; });
        };

        document.body.appendChild(win);
    };

    /* buildWin() 呼び出しを切り替える */
    const toggleWin = () => document.body.contains(win) ? win.remove() : buildWin();

    /* ------------------------------ コマンドエディタ ----------------------- */
    const toggleEd = () => {

        // 表示中なら閉じる
        if (ed) { ed.remove(); ed = null; return; }

        let isWrite = false;

        /* === 骨格 & 基本レイアウト ======================================= */
        ed = document.createElement('div'); ed.id = 'tm-ed';
        ed.innerHTML =
            `
            <div class="head"><span>コマンド編集</span><button class="b" id="x">✕</button></div>
            <div class="list" id="ls"></div>
            <div class="dock">
                <button class="b add"id="ad">■ 追加</button>
                <button class="b save" id="sv">■ 保存</button>
            </div>
            <div class="rs"></div>`;
        drag(ed); resz(ed);
        document.body.appendChild(ed);

        // 行を並べる領域
        const ls = ed.querySelector('#ls');

        // CodeMirror 遅延生成キュー
        const cmQueue = [];
        let idleToken = null;

        /* ---------- CodeMirror をアイドル時間に生成 ---------------------- */
        const rIdle = window.requestIdleCallback || (cb => setTimeout(() => cb({timeRemaining:() => 0}), 80));

        /* キュー登録 */
        function queueCM(row){ cmQueue.push(row); if(!idleToken) idleToken = rIdle(runQueue,{timeout:500}); }

        /* 3行ずつ生成して UI ブロックを防ぐ */
        function runQueue(deadline){
            let count = 0;
            while(cmQueue.length && (deadline.timeRemaining() > 5) && count < 3) {
                createCM(cmQueue.shift());
                count++;
            }
            if(cmQueue.length) { idleToken = rIdle(runQueue,{timeout:500}); }
            else{ idleToken = null; }
        }

        /* ---------- CodeMirror 行エディタ生成 ---------------------------- */
        function createCM(row) {
            row.classList.remove('pending-cm');

            // 元 textarea
            const ta = row.querySelector('.cmd-lines');

            // 置き換え後は非表示
            ta.style.display = 'none';

            /* CodeMirror 本体 */
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

            /* 各種オーバレイ（キーワード色分けなど） */
            cm.addOverlay(highlightPaletteKW);
            cm.addOverlay(paletteOverlay);
            const varOv = buildVarsOverlay();
            if (varOv) cm.addOverlay(varOv);

            cm.setSize('100%', 'auto');

            /* カーソル位置が隠れないよう自動スクロール ------------------- */
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

            /* 変更監視 & 行の色分け更新 ------------------------------- */
            cm.on('change', () => { isWrite = true; classifyRow(row, cm.getLine(0).trim()); cm.setSize('100%', 'auto'); });

            /* 「.」入力直後にメンバー補完 ------------------------------ */
            cm.on('inputRead', (cm, change) => {
                if (change.text[0] === '.') {
                    setTimeout(() => cm.showHint({
                        hint : CodeMirror.hint.member,
                        completeSingle: false
                    }), 0);
                }
            });

            // 行 → CM 対応表
            CM_SET.set(row, cm);

            // 行タイプ判定
            classifyRow(row, cm.getLine(0).trim());
        }

        /* ---------- 行タイプ別の装飾（css クラス付与） ------------------ */
        const classifyRow = (row, firstLine = '') => {
            row.classList.remove('type-cmd', 'type-wait', 'type-script');
            if (/^\[\s*(WAIT|WAITMSG)\b/i.test(firstLine)) row.classList.add('type-wait');
            else if (/^\[\s*$/.test(firstLine))            row.classList.add('type-script');
            else                                           row.classList.add('type-cmd');
        };

        /* ---------- 行(row)を DOM に追加 ------------------------------ */
        const addRow = (c = { label: '', lines: [] }) => {
            const row = document.createElement('div');
            row.className = 'row pending-cm';
            row.innerHTML =
                `
                <input class="cmd-label" value="${c.label}">
                <textarea class="cmd-lines">${c.lines.join('\n')}</textarea>
                <div class="ctrl">
                    <button class="b up" title="上へ">▲</button>
                    <button class="b down" title="下へ">▼</button>
                    <button class="b del" title="削除">✕</button>
                </div>`;

            /* 削除・上下移動ボタン ----------------------------------- */
            row.querySelector('.del').onclick  = () => { CM_SET.delete(row); row.remove(); };
            row.querySelector('.up').onclick   = () => { const prev = row.previousElementSibling; if (prev) ls.insertBefore(row, prev); };
            row.querySelector('.down').onclick = () => { const next = row.nextElementSibling?.nextElementSibling; if (next) ls.insertBefore(row, next); else ls.appendChild(row); };

            ls.appendChild(row);
            classifyRow(row, (c.lines[0] || '').trim());

            // 後で CodeMirror 生成
            queueCM(row);
        };

        /* 既存コマンドを全て行へ展開 ------------------------------ */
        cmds.forEach(addRow);

        // 追加ボタン
        ed.querySelector('#ad').onclick = () => addRow();


        /* ---------- 保存（cmds ⇒ localStorage） ------------------ */
        ed.querySelector('#sv').onclick = () => {
            cmds = [...ls.querySelectorAll('.row')].map(row => {
                const label = row.querySelector('.cmd-label').value.trim();
                const srcTxt = CM_SET.has(row) ? CM_SET.get(row).getValue() : row.querySelector('.cmd-lines').value;

                /* 先頭/末尾の空行は削除 */
                const lines = srcTxt.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter((l, i, a) => !((i === 0 || i === a.length - 1) && l === ''));
                while (lines[0] !== undefined && lines[0].trim() === '') lines.shift();
                while (lines[lines.length - 1] !== undefined && lines[lines.length - 1].trim() === '') lines.pop();
                return label && lines.length ? { label, lines } : null;
            }).filter(Boolean);

            // 永続化
            save(CMD_KEY, cmds);

            // パレット再描画
            buildWin();
            ed.remove(); ed = null;
        };

        /* ---------- × ボタン：破棄確認 --------------------------- */
        const closeEd = () => {
            if (!isWrite) { ed.remove(); ed = null; return; }
            askDiscard(ok => { if (ok) { isWrite = false; ed.remove(); ed = null; } });
        };

        ed.querySelector('#x').onclick = closeEd;
    };

    /* ------------------------------ 変数エディタ --------------------------- */
    const toggleVar = () => {
        if (vr) { vr.remove(); vr = null; return; }

        let isWrite = false;

        vr = document.createElement('div'); vr.id = 'tm-var';
        vr.innerHTML =
            `
            <div class="head"><span>変数編集</span><button class="b" id="x">✕</button></div>
            <div class="list" id="vl"></div>
            <div class="dock"><button class="b add" id="ad">■ 追加</button><button class="b save" id="sv">■ 保存</button></div>
            <div class="rs"></div>
            `;

        drag(vr); resz(vr);

        const vl = vr.querySelector('#vl');

        /* 行生成 */
        const addRow = (v = { name: '', value: '' }) => {
            const r = document.createElement('div');
            r.className = 'var-row';
            r.innerHTML =
                `
                <input class="var-key"   placeholder="名前" value="${v.name}">
                <input class="var-value" placeholder="値"   value="${v.value}">
                <button class="b del">✕</button>
                `;
            r.querySelector('.del').onclick = () => r.remove();
            r.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => isWrite = true));
            vl.appendChild(r);
        };

        vars.forEach(addRow);
        vr.querySelector('#ad').onclick = () => addRow();

        /* 保存 */
        vr.querySelector('#sv').onclick = () => {
            vars = [...vl.querySelectorAll('.var-row')].map(r => {
                const [n, v] = r.querySelectorAll('input'); return { name: n.value.trim(), value: v.value.trim() };
            }).filter(o => o.name);
            save(VAR_KEY, vars);

            /* 全エディタに変数ハイライトを再付与 */
            const newOv = buildVarsOverlay();
            CM_SET.forEach(cm => {
                if (cm.state.varOverlay) cm.removeOverlay(cm.state.varOverlay);
                if (newOv) {
                    cm.addOverlay(newOv);
                    cm.state.varOverlay = newOv;
                } else { delete cm.state.varOverlay; }
            });
            vr.remove(); vr = null;
        };

        /* × ボタン：破棄確認 */
        const closeVar = () => {
            if (!isWrite) { vr.remove(); vr = null; return; }
            askDiscard(ok => { if (ok) { isWrite = false; vr.remove(); vr = null; } });
        };

        vr.querySelector('#x').onclick = closeVar;

        document.body.appendChild(vr);
    };

    /* ------------------------------ ヘルプ --------------------------------- */
    const toggleHelp = () => {
        if (hl) { hl.remove(); hl = null; return; }

        hl = document.createElement('div'); hl.id = 'tm-help';
        hl.innerHTML =
            `
            <div class="head">
                <span>ヘルプ</span>
                <button class="b" id="x">✕</button>
            </div>

            <!-- 外部定数に埋め込んだ HTML -->
            <div style="flex:1;overflow:auto;padding:8px;font-size:12px;line-height:1.4;">${HELP_HTML}</div>

            <div class="rs"></div>`;
        drag(hl); resz(hl);

        hl.querySelector('#x').onclick = () => { hl.remove(); hl = null; };
        document.body.appendChild(hl);

        /* 目次生成（data-ref 属性 → #anchor） */
        const navUl = hl.querySelector('#tm-help-nav');
        hl.querySelectorAll('[data-ref]').forEach(sec => {
            const id = sec.dataset.ref;
            sec.id = 'hlp-' + id;
            const li = document.createElement('li');
            li.innerHTML = `<a href="#hlp-${id}">${sec.querySelector('h2').textContent}</a>`;
            navUl.appendChild(li);
        });

        // CodeMirror でサンプルコードを着色
        beautifyHelpCode();
    };

    /* ======================================================================= *
     *                    ▼  ランチャーボタン注入 & ホットキー ▼               *
     * ----------------------------------------------------------------------- *
     *  injectLaunch()  … diceバーにランチャーボタン (#tm-launch) を常駐挿入   *
     *                     - 既にあればスキップ（多重挿入防止）                *
     *                     - クリックで toggleWin()                            *
     *                                                                         *
     *  setInterval(injectLaunch,1500) … 1.5 秒ごとに DOM 変化を監視し保険注入 *
     *                                                                         *
     *  keydown リスナー … Alt+P などのショートカットで各ウィンドウをトグル     *
     *                                                                         *
     *  URL 変化監視 … location.pathname が変わったらウィンドウを自動破棄      *
     * ======================================================================= */

    /* ------------------------------------------------------------------ *
     * injectLaunch : diceバーを見つけ次第カスタムボタンを挿入する         *
     * ------------------------------------------------------------------ */
    const injectLaunch = () => wait(DICEBAR).then(bar => {

        /* 既にボタンがある場合は何もしない（再注入防止） */
        if (bar.querySelector('#tm-launch')) return;

        /* ▼ ランチャーボタン生成 --------------------------------------- */
        const btn = document.createElement('button');
        btn.id = 'tm-launch'; btn.type = 'button'; btn.title = '拡張チャットパレット (Alt+P)';
        btn.className = 'MuiButtonBase-root tm-launch-btn';

        /* SVG アイコン（メモ帳風） */
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="tm-launch-ico">
                           <rect x="4" y="3"  width="16" height="18" rx="2" ry="2"/>
                           <rect x="9" y="1"  width="6"  height="4"  rx="1" ry="1"/>
                           <line  x1="7" y1="8" x2="17" y2="8"/>
                           <line  x1="7" y1="12" x2="17" y2="12"/>
                           <line  x1="7" y1="16" x2="13" y2="16"/>
                         </svg>`;

        // クリック → パレット表示/非表示
        btn.onclick = toggleWin;

        // diceバー末尾へ追加
        bar.appendChild(btn);
    });

    /* 初回呼び出し (DOMが既にある場合) */
    injectLaunch();

    /* 1.5 秒おきに再チェック：ページ遷移で diceバーが作り直されても挿入 */
    setInterval(injectLaunch, 1500);

    /* ------------------------------------------------------------------ *
     *  Alt 系ホットキー                                                  *
     * ------------------------------------------------------------------ */
    document.addEventListener('keydown', e => {

        /* Alt 単独 (Ctrl/Shift 無し) のみ受け付け */
        if (e.altKey && !e.ctrlKey && !e.shiftKey) {
            const k = e.key.toLowerCase();

            /* Alt+P … メインパレット */
            if (k === HK_VIEW) toggleWin();

            /* Alt+O … コマンドエディタ */
            if (k === HK_EDIT) toggleEd();

            /* Alt+I … 変数エディタ */
            if (k === HK_VARS) toggleVar();

            /* Alt+E … パレット自体を瞬時に hide/show（※開発用おまけ） */
            if (e.key === 'e') win.style.display = (win.style.display === 'none') ? '' : 'none';
        }
    });

    /* ------------------------------------------------------------------ *
     *  URL 変化(=部屋移動) をポーリング監視し、古いウィンドウを掃除         *
     * ------------------------------------------------------------------ */
    let path = location.pathname;
    setInterval(() => {
        if (location.pathname !== path) { // 部屋が変わった
            path = location.pathname;
            win?.remove(); ed?.remove(); vr?.remove();
        }
    }, 800); // 0.8 秒毎
})();

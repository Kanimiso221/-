// ==UserScript==
// @name         ココフォリア追加チャットパレット
// @version      1.0.0
// @description  ココフォリア上に追加されるいい感じの追加チャットパレット
// @author       Apocrypha
// @match        https://ccfolia.com/rooms/*
// @grant        GM_getValue
// @grant        GM_setValue
// @updateURL    https://github.com/Kanimiso221/-/blob/main/%E3%82%B3%E3%82%B3%E3%83%95%E3%82%A9%E3%83%AA%E3%82%A2%E8%BF%BD%E5%8A%A0%E3%83%81%E3%83%A3%E3%83%83%E3%83%88%E3%83%91%E3%83%AC%E3%83%83%E3%83%88-1.0.0.user.js
// @@downloadURL https://github.com/Kanimiso221/-/blob/main/%E3%82%B3%E3%82%B3%E3%83%95%E3%82%A9%E3%83%AA%E3%82%A2%E8%BF%BD%E5%8A%A0%E3%83%81%E3%83%A3%E3%83%83%E3%83%88%E3%83%91%E3%83%AC%E3%83%83%E3%83%88-1.0.0.user.js
// @license      MIT
// ==/UserScript==

/*  ★ 使い方  ★
   - Alt+P : パレット開閉
   - Alt+O : コマンド編集
   - Alt+V : 変数編集（ユーザーが自由に定義）
   - コマンドに {HP} や {STR} を書くと、選択中キャラの現在値で展開は出来ません！！どうやるんだよ！！
   - 多段 {HO{NUM}} も再帰展開で {HO1} のように 1 段へ
*/

/* eslint no-return-assign: 0 */

(()=>{

    'use strict';

    const curVer=GM_info.script.version,KEY='myScript_prev_ver',prevVer=localStorage.getItem(KEY);

    if (prevVer && prevVer !== curVer) {
        if (confirm(`拡張を ${prevVer} → ${curVer} に更新しました。\nページを再読込しますか？`)) {localStorage.setItem(KEY,curVer);location.reload();}
        else {localStorage.setItem(KEY,curVer);}
    }

    /* ========== 設定 ========== */
    const CMD_KEY='tmPaletteCmds_v3',VAR_KEY='tmPaletteVars_v3',AUTO_KEY='tmPaletteAuto_v3',HELP_KEY = 'tmPaletteHelp_v1';
    const DEF_CMDS=[{label:'1D100',lines:['1D100','1d100<=50','CCB<=50']}];
    const DEF_VARS=[{name:'NUM',value:'1'}];
    const TXT_SEL='textarea[name="text"]';
    const DICEBAR='div.sc-igOlGb';
    const HK_VIEW='p', HK_EDIT='o', HK_VARS='v';
    const SEND_DELAY=500;
    const MSG_BODY='div[data-testid="RoomMessage__body"]';
    const ROW_STAT='div[data-testid="CharacterStatus__row"]';
    const ROW_PARAM='div[data-testid="CharacterParam__row"]';
    const CHAT_CACHE=20;
    const KW_ALIAS={'M':/失敗/,'S':/(?<!決定的)成功|(?<!決定的成功\/)スペシャル/,'F':/致命的失敗/,'100F':/(100.*致命的失敗|致命的失敗.*100)/,'C':/(クリティカル|決定的成功(?:\/スペシャル)?)/,'1C':/(1.*(?:クリティカル|決定的成功)|(?:クリティカル|決定的成功).*1)/};
    const CONF_MIME='application/x-ccp+json';
    const CONF_VER=1;
    const EXPORT_FILE=()=>`tmPalette_${new Date().toISOString().replace(/[:.]/g,'-')}.ccp`;
    const FILE_TYPES=[{description:'Chat-Palette Config',accept:{'application/json':['.ccp']}}];
    /* ========================== */

    /* ========== 基本 util ========== */
    const clamp=(v,mi,ma)=>Math.min(Math.max(v,mi),ma);
    const wait=sel=>new Promise(r=>{const f=()=>{const n=document.querySelector(sel);n?r(n):requestAnimationFrame(f)};f()});
    const setVal=(ta,val)=>Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(ta,val);
    const sendLine=(ta,txt)=>{setVal(ta,txt);ta.dispatchEvent(new Event('input',{bubbles:true}));requestAnimationFrame(()=>ta.dispatchEvent(new KeyboardEvent('keypress',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true})));};
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const load=(k,d)=>{try{const j=localStorage.getItem(k);return j?JSON.parse(j):d}catch{return d}};
    const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
    const escReg = s => s.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&');
    const HELP_HTML = `
<!--  ─────────────────────────────  -->
<style>
  #tm-help { color:#ddd; }
  #tm-help code        { background:#222;padding:1px 4px;border-radius:3px;color:#9cf; }
  #tm-help pre         { background:#222;padding:6px;border-radius:4px;overflow:auto;color:#cfc; }
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
</p>
`;

    /* ========== データ========== */
    let cmds=load(CMD_KEY,DEF_CMDS).map(c=>{if('label'in c)return {auto:false,...c};const [label,...lines]=c.lines??[];return {auto:false,label:label||'Cmd',lines};});
    let vars=load(VAR_KEY,DEF_VARS);
    let autoCmd=load(AUTO_KEY,['// Auto script here\n(まだ何も出来ないよ)']);
    let autoAst=null,autoTimer=null,hl=null;

    /* ========== キャラステータス DOM 収集 ========== */
    const buildStatMap=()=>{
        const m={};
        document.querySelectorAll(`${ROW_STAT},${ROW_PARAM}`).forEach(r=>{
            const lab=r.querySelector('span:first-child')?.textContent?.trim();
            const val=r.querySelector('span:last-child') ?.textContent?.trim();
            if(lab) m[lab]=val;
        });return m;};
    let statCache=buildStatMap();
    new MutationObserver(()=>{statCache=buildStatMap();}).observe(document.body,{childList:true,subtree:true});

    /* ========== 変数オブジェクトヘルパ ========== */
    const varsObj=()=>Object.fromEntries(vars.map(v=>[v.name,Number(v.value)||0]));
    const saveVarsObj=obj=>{vars=Object.entries(obj).map(([name,v])=>({name,value:String(Math.trunc(v))}));save(VAR_KEY,vars);};

    /* ========== チャットメッセージ取得 ========== */
    let _sendChain=Promise.resolve();
    const enqueueSend=lines=>{_sendChain=_sendChain.then(()=>sendMulti(lines));return _sendChain;};
    const getLastMessages=(n=CHAT_CACHE)=>{
        return Array.from(document.querySelectorAll('div.MuiListItem-root'))
            .slice(-n)
            .reverse()
            .map(el=>{
            const body=el.querySelector('div[data-testid=\"RoomMessage__body\"], p');
            return body?body.innerText.trim():'';
        });
    };
    const wrapMessages=arr=>arr.map(txt=>{
        const Find=kw=>(KW_ALIAS[kw]??new RegExp(escReg(kw))).test(txt);
        const Lines=()=>txt.split(/\\r?\\n/);
        const FindAt=kw=>{
            const base=KW_ALIAS[kw]??new RegExp(escReg(kw),'g');
            const re=base.global?base:new RegExp(base.source,base.flags+'g');
            return (txt.match(re)||[]).length;
        };
        const Match=re=>(typeof re==='string'?txt.match(new RegExp(re)):txt.match(re));
        const MatchAll=re=>{if(typeof re==='string')re=new RegExp(re,'g');if(!re.global)re=new RegExp(re.source,re.flags+'g');return [...txt.matchAll(re)];};
        const GetNum=()=>{const m=txt.match(/＞\s*(-?\d+(?:\.\d+)?)/);return m?Number(m[1]):NaN;};
        return {text:txt,Find,Lines,Match,MatchAll,FindAt,GetNum,Send:(...lines)=>enqueueSend(lines.flat())};
    });

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
    const userMap=()=>Object.fromEntries(vars.map(v=>[v.name,v.value]));
    const sendMulti = async rawLines => {
        const ta = await wait(TXT_SEL);
        const ctx = varsObj();

        let stop = false;
        Object.defineProperty(ctx,'SEnd',{value:()=>{stop=true;},writable:false});
        Object.defineProperty(ctx,'CMessage',{ get:()=>wrapMessages(getLastMessages()),enumerable:false});

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
                let codeLines = [ trimmed ];
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
        vars : Object.create(null),
        funcs: {
            max : Math.max,
            min : Math.min,
            clamp:(x,lo,hi)=>Math.min(Math.max(x,lo),hi),
            abs : Math.abs,
            ceil: Math.ceil,
            floor:Math.floor,
            print: console.log
        },
        roomchat: {
            contents: kw => wrapMessages(getLastMessages()).some(m=>m.Find(kw)),
            send    : txt=>sendMulti([txt]),
            num     : ()=>{ const m=/→\\s*(\\d+)/.exec(getLastMessages(1)[0]||'');return m?+m[1]:0;}
        }
    };

    function buildRTfromGui(){
        RT.vars = Object.create(null);
        vars.forEach(v=>{
            const n=v.name, raw=v.value.trim();
            RT.vars[n] = {
                value: (/^\d+$/.test(raw)? Number(raw): raw),
                type : 'int'
            };
        });
    }

    /* ========== 字句解析（Tokenizer）========== */
    function tokenize(src){
        const re = /\/\*[^]*?\*\/|\/\/.*?$|\s+|"(?:[^"\\]|\\.)*"|\d+\.\d+|\d+|==|!=|\+\+|--|\+=|-=|\*=|\/=|%=|[A-Za-z_]\w*|[(){};,.+\-*/%<>=]/gm;
        const out=[];
        for (let m; (m=re.exec(src));){
            const tk=m[0];
            if (/^(?:\s+|\/\/)/.test(tk)) continue;
            out.push(tk);
        }
        return out;
    }

    /* ========== 構文パーサー ========== */
    function parse(tokens){
        let i=0;
        const peek=()=>tokens[i], next=()=>tokens[i++];
        const expect=t=>{
            const got = next();
            if(got!==t){
                alert('期待:',t,' でも実際は',got,' 残り',tokens.slice(i));
                throw `期待: ${t}`;
            }
        };

        const prog=[];
        function parseExpr(){
            let lhs = parseTerm();

            const asg = peek();
            if (['=','+=','-=','*=','/=','%='].includes(asg)) {
                next();
                const rhs = parseExpr();
                return {kind:'assign', op:asg, lhs, rhs};
            }

            while(['+','-','==','!='].includes(peek())) {
                const op = next(), rhs = parseTerm();
                lhs = {kind:'bin', op, lhs, rhs};
            }

            return lhs;
        }
        function parseTerm(){
            let lhs=parseFactor();
            while(['*','/','%'].includes(peek())){
                const op=next(), rhs=parseFactor();
                lhs={kind:'bin',op,lhs,rhs};
            }
            return lhs;
        }
        function parseFactor(){
            let node;
            const tk = next();

            if (tk==='('){ node=parseExpr(); expect(')'); }
            else if (/^\d/.test(tk)) node={kind:'num',val:+tk};
            else if (/^"/.test(tk)) node={kind:'str',val:tk.slice(1,-1)};
            else node={kind:'var',name:tk};

            while (true){
                if (peek()==='.') {
                    next(); const prop = next();
                    node = {kind:'prop',obj:node,prop};
                } else if (peek()==='(') {
                    next();
                    const args=[];
                    if (peek()!==')') {
                        args.push(parseExpr());
                        while (peek()===','){ next(); args.push(parseExpr()); }
                    }
                    expect(')');
                    node = {kind:'call',func:node,args};
                } else break;
            }
            return node;
        }

        while(i<tokens.length){
            const tk=peek();
            if(tk==='int' || tk==='float'){
                const type=next(), name=next();
                let init=null;
                if(peek()==='='){ next(); init=parseExpr();}
                expect(';');
                prog.push({kind:'decl',type,name,init});
            }else if(tk==='if'){
                next(); expect('('); const cond=parseExpr(); expect(')');
                expect('{'); const body=[]; while(peek()!=='}'){ body.push(parseExpr()); expect(';'); }
                expect('}'); prog.push({kind:'if',cond,body});
            }else if(tk==='trigger'){
                next(); expect('('); const cond=parseExpr(); expect(')'); expect('{');
                const body=[]; while(peek()!=='}'){ body.push(parseExpr()); expect(';'); }
                expect('}'); prog.push({kind:'trigger',cond,body,runned:false});
            }else{
                const e=parseExpr(); expect(';'); prog.push({kind:'expr',expr:e});
            }
        }
        return prog;
    }

    /* ========== インタープリタ ========== */
    function evalNode(node, env){
        switch(node.kind){
            case 'num' : return node.val;
            case 'str' : return node.val;
            case 'var' : {
                const n = node.name;
                if (n in env) return env[n];
                if (n in env.funcs) return env.funcs[n];
                if (n in env.vars) return env.vars[n].value;
                return 0;
            }
            case 'bin' : {
                const l=evalNode(node.lhs,env), r=evalNode(node.rhs,env);
                switch(node.op){
                    case '+':return l+r; case '-':return l-r;
                    case '*':return l*r; case '/':return l/r; case '%':return l%r;
                    case '==':return l==r; case '!=':return l!=r;
                }
            }
            case 'prop': return evalNode(node.obj,env)[node.prop];
            case 'assign': {
                const name = node.lhs.name;
                if (node.lhs.kind !== 'var') { alert('左辺は変数限定'); throw '左辺は変数限定'; }
                if (!(name in env.vars) && (name in env || name in env.funcs)) { alert(`組込み名 ${name} は書き換え禁止`); throw `組込み名 ${name} は書き換え禁止`; }
                const cur = env.vars[name]?.value ?? 0;
                const rhs = evalNode(node.rhs, env);

                let val;
                switch (node.op){
                    case '=' : val = rhs; break;
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
                const fn = evalNode(node.func,env);
                if (typeof fn !== 'function') {throw `呼び出し対象が関数でない: ${node.func.prop || node.func.name}`;}
                const args = node.args.map(a=>evalNode(a,env));
                return fn.apply(null,args);
            }
            case 'decl':{
                env.vars[node.name]={value:node.init?evalNode(node.init,env):0,type:node.type};
                return;
            }
            case 'expr': evalNode(node.expr,env); return;

            case 'if':
                if(evalNode(node.cond,env)) node.body.forEach(n=>evalNode(n,env));
                return;

            case 'trigger':
                if(!node.runned && evalNode(node.cond,env)){
                    node.runned=true;
                    node.body.forEach(n=>evalNode(n,env));
                }
                return;
        }
    }

    function syncVarsToStorage(){
        vars = Object.entries(RT.vars).map(([k,obj])=>({name:k,value:String(obj.value)}));
        save(VAR_KEY, vars);
    }

    /* ========== 設定オブジェクト ========== */
    function collectConfig(){return{version:CONF_VER,cmds:cmds,vars:vars,autoCmd:autoCmd}}

    /* ========== エクスポート（ダウンロード） ========== */
    function exportConfig(){
        const blob=new Blob([JSON.stringify(collectConfig(),null,2)],{type:CONF_MIME});
        const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:EXPORT_FILE()});
        a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href),1000);
        localStorage.removeItem(CMD_KEY);
        localStorage.removeItem(VAR_KEY);
        localStorage.removeItem(AUTO_KEY);
        location.reload();
    }

    /* ========== インポート（ファイル読み込み） ========== */
    function importConfig(){
        const inp=Object.assign(document.createElement('input'),{type:'file',accept:'.ccp'});
        inp.onchange=()=>{
            const file=inp.files[0];
            if(!file)return;
            const fr=new FileReader();
            fr.onload=e=>{
                try{
                    const cfg=JSON.parse(e.target.result);
                    if(cfg.version!==CONF_VER)throw 'version mismatch';
                    if(cfg.cmds)localStorage.setItem(CMD_KEY,JSON.stringify(cfg.cmds));
                    if(cfg.vars)localStorage.setItem(VAR_KEY,JSON.stringify(cfg.vars));
                    if(cfg.autoCmd)localStorage.setItem(AUTO_KEY,JSON.stringify(cfg.autoCmd));
                    alert('設定を読み込みました。ページを再読み込みします');
                    location.reload();
                }catch(err){
                    alert('読み込み失敗: '+err);
                }
            };
            fr.readAsText(file);
        };
        inp.click();
    }

    /* ------------------------------------------------------------------ */
    /* ↓↓↓                UI（パレット／編集／変数）                   ↓↓↓ */
    /* ------------------------------------------------------------------ */

    const css=`
#tm-win,#tm-ed,#tm-var{position:fixed;background:rgba(44,44,44,.87);color:#fff;z-index:99999;box-shadow:0 2px 6px rgba(0,0,0,.4);border-radius:4px;font-family:sans-serif;display:flex;flex-direction:column;}
#tm-win{top:60px;left:60px;width:260px;min-width:260px;}
#tm-ed {top:90px;left:90px;width:340px;min-width:320px;max-height:70vh;overflow:auto;}
#tm-var{top:120px;left:120px;width:350px;min-width:280px;}
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
.row{display:flex;flex-direction:column;gap:4px;position:relative;}
.row .del{position:absolute;top:0;right:0;width:22px;background:#833;}
.row textarea{resize:none;overflow:hidden;background: #555;border: 1px solid #777;border-radius: 2px;color: #fff;}
.row input{flex: 1;padding: 4px;font-size: 12px;background: #555;border: 1px solid #777;border-radius: 2px;color: #fff;}
#tm-au{position:fixed;top:180px;left:180px;width:400px;height:280px;background:rgba(44,44,44,.87);color:#fff;z-index:99999;box-shadow:0 2px 6px rgba(0,0,0,.4);border-radius:4px;font-family:sans-serif;display:flex;flex-direction:column;}
#tm-help{position:fixed;top:210px;left:210px;width:530px;height:340px;background:rgba(44,44,44,.87);color:#fff;z-index:99999;box-shadow:0 2px 6px rgba(0,0,0,.4);border-radius:4px;font-family:sans-serif;display:flex;flex-direction:column;}
`;
    document.head.appendChild(Object.assign(document.createElement('style'),{textContent:css}));

    /* ========== ドラッグ／リサイズ ========== */
    const drag=(el)=>{
        const hd=el.querySelector('.head');let sx=0,sy=0,ox=0,oy=0,d=false;
        hd.addEventListener('pointerdown',e=>{if(e.target.closest('.b'))return;
                                              d=true;sx=e.clientX;sy=e.clientY;const r=el.getBoundingClientRect();ox=r.left;oy=r.top;
                                              hd.setPointerCapture(e.pointerId);});
        hd.addEventListener('pointermove',e=>{if(!d)return;el.style.left=`${clamp(ox+e.clientX-sx,0,innerWidth-100)}px`;
                                              el.style.top =`${clamp(oy+e.clientY-sy,0,innerHeight-40)}px`;});
        hd.addEventListener('pointerup',()=>d=false);
    };
    const resz=(el)=>{
        const g=el.querySelector('.rs');let w=0,h=0,sx=0,sy=0,r=false;
        g.addEventListener('pointerdown',e=>{r=true;sx=e.clientX;sy=e.clientY;const rt=el.getBoundingClientRect();w=rt.width;h=rt.height;
                                             g.setPointerCapture(e.pointerId);});
        g.addEventListener('pointermove',e=>{if(!r)return;el.style.width =`${Math.max(w+e.clientX-sx,240)}px`;
                                             el.style.height=`${Math.max(h+e.clientY-sy,160)}px`;});
        g.addEventListener('pointerup',()=>r=false);
    };

    /* ========== パレット ========== */
    let win=null,ed=null,vr=null,au = null;
    const buildWin=()=>{
        if(win)win.remove();
        win=document.createElement('div');win.id='tm-win';
        win.innerHTML=`<div class="head"><span>パレット</span><button class="b" id="impB">⤒</button><button class="b" id="expB">⤓</button>
                       <button class="b" id="hB">？</button><button class="b" id="aB">A</button><button class="b" id="vB">Φ</button>
                       <button class="b" id="eB">⚙</button><button class="b" id="cB">✕</button></div><div class="g" id="gp"></div><div class="rs"></div>`;
        drag(win);resz(win);
        const gp=win.querySelector('#gp');
        cmds.forEach(({ label, lines }, i) => {
            const btn = document.createElement('button');
            btn.textContent = label || `Button${i + 1}`;
            btn.onclick = () => sendMulti(lines);
            gp.appendChild(btn);
            win.querySelector('#cB').onclick=()=>win.remove();
        });
        win.querySelector('#eB').onclick=toggleEd;
        win.querySelector('#vB').onclick=toggleVar;
        win.querySelector('#aB').onclick=toggleAuto;
        win.querySelector('#hB').onclick=toggleHelp;
        win.querySelector('#impB').onclick=importConfig;
        win.querySelector('#expB').onclick=exportConfig;
        document.body.appendChild(win);
    };
    const toggleWin=()=>document.body.contains(win)?win.remove():buildWin();

    /* ========== コマンド編集 ========== */
    const toggleEd=()=>{
        if(ed){ed.remove();ed=null;return;}
        ed=document.createElement('div');ed.id='tm-ed';
        ed.innerHTML=`<div class="head"><span>コマンド編集</span><button class="b" id="x">✕</button></div>
                      <div class="list" id="ls"></div>
                      <div class="dock"><button class="b add" id="ad">■ 追加</button><button class="b save" id="sv">■ 保存</button></div>
                      <div class="rs"></div>`;
        drag(ed);resz(ed);
        const ls=ed.querySelector('#ls');
        const addRow = (c = { label: '', lines: [] }) => {
            const autoResize = ta => {
                ta.style.height = 'auto';
                ta.style.height = (ta.scrollHeight || 24) + 'px';
            };

            const r = document.createElement('div');
            r.className = 'row';
            r.innerHTML = `<input class="cmd-label" type="text" placeholder="ボタン名" value="${c.label}">
                           <textarea class="cmd-lines" rows="1"
                            placeholder="実行内容を改行で複数行書けます">${c.lines.join('\n')}</textarea>
                           <button class="b del">✕</button>`;
            r.querySelector('.del').onclick = () => r.remove();
            ls.appendChild(r);

            const ta = r.querySelector('.cmd-lines');
            requestAnimationFrame(() => autoResize(ta));
            ta.addEventListener('input', () => autoResize(ta));
        };
        cmds.forEach(c => addRow(c));
        ed.querySelector('#ad').onclick = () => addRow();
        ed.querySelector('#sv').onclick = () => {
            cmds = [...ls.querySelectorAll('.row')].map(r => {
                const label = r.querySelector('.cmd-label').value.trim();
                const lines = r
                .querySelector('.cmd-lines')
                .value.split(/\r?\n/)
                .map(s => s.trim())
                .filter(Boolean);
                return label && lines.length ? { label, lines } : null;
            }).filter(Boolean);
            save(CMD_KEY, cmds);
            buildWin();
            ed.remove(); ed = null;
        };
        ed.querySelector('#x').onclick=()=>{ed.remove();ed=null;};
        document.body.appendChild(ed);
    };

    /* ========== 変数編集 ========== */
    const toggleVar=()=>{
        if(vr){vr.remove();vr=null;return;}
        vr=document.createElement('div');vr.id='tm-var';
        vr.innerHTML=`<div class="head"><span>変数編集</span><button class="b" id="x">✕</button></div>
                      <div class="list" id="vl"></div>
                      <div class="dock"><button class="b add" id="ad">■ 追加</button><button class="b save" id="sv">■ 保存</button></div>
                      <div class="rs"></div>`;
        drag(vr);resz(vr);
        const vl=vr.querySelector('#vl');
        const addRow=(v={name:'',value:''})=>{
            const r=document.createElement('div');r.className='row';
            r.innerHTML=`<input placeholder="名前" value="${v.name}">
                         <input placeholder="値"   value="${v.value}">
                         <button class="b del">✕</button>`;
            r.querySelector('.del').onclick=()=>r.remove();
            vl.appendChild(r);
        };
        vars.forEach(addRow);
        vr.querySelector('#ad').onclick=()=>addRow();
        vr.querySelector('#sv').onclick=()=>{
            vars=[...vl.querySelectorAll('.row')].map(r=>{
                const [n,v]=r.querySelectorAll('input');return{ name:n.value.trim(), value:v.value.trim()};
            }).filter(o=>o.name);
            save(VAR_KEY,vars);vr.remove();vr=null;
        };
        vr.querySelector('#x').onclick=()=>{vr.remove();vr=null;};
        document.body.appendChild(vr);
    };

    /* ========== Auto コマンド編集 ========== */
    const toggleAuto = () => {
        if (au) { au.remove(); au = null; return; }
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
            autoCmd = ta.value.split(/\\r?\\n/);
            save(AUTO_KEY, autoCmd);
            buildRTfromGui();
            const tokens = tokenize(autoCmd.join('\\n'));
            const ast = parse(tokens);
            ast.forEach(n=>{if (n.kind !== 'trigger') evalNode(n,RT); }); autoAst = ast;
            au.remove(); au = null;
        };
        au.querySelector('#x').onclick = () => { au.remove(); au = null; };
        document.body.appendChild(au);
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
    };

    /* ========== ランチャーボタン ========== */
    const injectLaunch=()=>wait(DICEBAR).then(bar=>{
        if(bar.querySelector('#tm-launch'))return;
        const b=document.createElement('button');
        b.id='tm-launch';b.type='button';
        b.className='MuiButtonBase-root MuiIconButton-root MuiIconButton-sizeSmall';
        b.innerHTML=`<span class="MuiSvgIcon-root" style="width:20px;height:20px;fill:#ACACAC;">
                     <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><rect x="9" y="11" width="6" height="2" fill="#202020"/></svg></span>`;
        b.onclick=toggleWin;
        bar.appendChild(b);
    });
    injectLaunch();setInterval(injectLaunch,1500);

    /* ========== Hotkeys ========== */
    document.addEventListener('keydown',e=>{
        if(e.altKey&&!e.ctrlKey&&!e.shiftKey){
            const k=e.key.toLowerCase();
            if(k===HK_VIEW)toggleWin();
            if(k===HK_EDIT)toggleEd();
            if(k===HK_VARS)toggleVar();
        }
    });

    /* ========== URL 遷移 クリーンアップ ========== */
    let path=location.pathname;
    setInterval(()=>{if(location.pathname!==path){path=location.pathname;win?.remove();ed?.remove();vr?.remove();}},800);

    /* ========== 起動時にパレット自動表示したくなければ下行をコメントアウト ========== */
    buildWin();

})();

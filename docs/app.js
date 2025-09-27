// ========== app.js (完整，前端优先 + 后台兜底 + 本地存储) ==========

// ---- DOM 工具 ----
const $ = (s) => document.querySelector(s);
function setStatus(msg) { $('#status').innerHTML = '<small>状态：' + msg + '</small>'; }
function nowTs(){ return Date.now().toString(); }
function showBar(){ $('#barWrap').style.display='block'; const b=$('#bar'); b.style.transition='none'; b.style.width='0%'; void b.offsetWidth; b.style.transition='width 5s linear'; b.style.background='var(--accent)'; setTimeout(()=>b.style.width='100%',50); }
function okBar(){ $('#bar').style.background='var(--ok)'; }
function warnBar(){ $('#bar').style.background='var(--warn)'; }
function hideBar(){ $('#barWrap').style.display='none'; }

// ---- 本地存储（repo/branch/token/开关） ----
(function restoreSettings(){
  const repo = localStorage.getItem('repo_name');
  const branch = localStorage.getItem('branch_name');
  const token = localStorage.getItem('github_token');
  if (repo) $('#repo').value = repo;
  if (branch) $('#branch').value = branch;
  if (token) $('#token').value = token;

  const autoDecode = localStorage.getItem('autoDecode');
  const autoBeautify = localStorage.getItem('autoBeautify');
  const autoResume = localStorage.getItem('autoResume');
  if (autoDecode !== null) $('#autoDecode').checked = autoDecode === '1';
  if (autoBeautify !== null) $('#autoBeautify').checked = autoBeautify === '1';
  if (autoResume !== null) $('#autoResume').checked = autoResume === '1';
})();

['repo','branch','token'].forEach(id=>{
  const el = $('#'+id);
  el.addEventListener('change', ()=>{
    const v = el.value.trim();
    if (id==='repo') localStorage.setItem('repo_name', v);
    if (id==='branch') localStorage.setItem('branch_name', v);
    if (id==='token') localStorage.setItem('github_token', v);
  });
});
[['autoDecode','autoDecode'],['autoBeautify','autoBeautify'],['autoResume','autoResume']].forEach(([id,key])=>{
  const el = $('#'+id);
  el.addEventListener('change', ()=> localStorage.setItem(key, el.checked ? '1':'0'));
});

// ---- 文件/剪贴板/远程加载 ----
function pick(){ $('#file').click(); }
$('#file').addEventListener('change', async (e)=>{
  const f=e.target.files?.[0]; if(!f) return;
  const txt=await f.text(); $('#codeIn').value=txt; setStatus('已载入本地文件：'+f.name+' · '+txt.length+' 字符');
  autoDecodeIfNeeded();
});

async function pasteFromClipboard(){
  try{ const t=await navigator.clipboard.readText(); $('#codeIn').value=t; setStatus('已从剪贴板粘贴 · '+t.length+' 字符'); autoDecodeIfNeeded(); }
  catch(e){ setStatus('粘贴失败：'+e.message); }
}

async function loadRemote(){
  let u=$('#remoteUrl').value.trim(); if(!u){ setStatus('请输入 URL'); return }
  if(/https?:\/\/github\.com\/.+\/blob\//.test(u)){
    u=u.replace('https://github.com/','https://raw.githubusercontent.com/').replace('/blob/','/');
  }
  try{
    const r=await fetch(u+'?t='+nowTs(),{cache:'no-store'}); const t=await r.text();
    if(!r.ok) throw new Error(r.status+' '+r.statusText+' '+t.slice(0,200));
    $('#codeIn').value=t; setStatus('远程已加载 · '+t.length+' 字符'); autoDecodeIfNeeded();
  }catch(e){ setStatus('远程加载失败：'+e.message); }
}

function clrIn(){ $('#codeIn').value=''; setStatus('已清空输入'); }
function clrAll(){ $('#codeIn').value=''; $('#codeOut').textContent=''; $('#outputRaw').textContent=''; hideBar(); setStatus('已清空输入与结果'); }

// ---- 美化（可选 Prettier） ----
async function ensurePrettier(){
  if(window.prettier&&window.prettierPlugins&&window.prettierPlugins.babel) return;
  const s1=document.createElement('script'); s1.src='https://unpkg.com/prettier@3.2.5/standalone.js';
  const s2=document.createElement('script'); s2.src='https://unpkg.com/prettier@3.2.5/plugins/babel.js';
  document.body.appendChild(s1); await new Promise(r=>s1.onload=r);
  document.body.appendChild(s2); await new Promise(r=>s2.onload=r);
}
async function beautify(){
  let s=$('#codeOut').textContent||$('#codeIn').value||'';
  if(!s){ setStatus('无待美化内容'); return }
  try{
    await ensurePrettier();
    const out=prettier.format(s,{parser:'babel',plugins:[prettierPlugins.babel]});
    $('#codeOut').textContent=out;
    setStatus('已用 Prettier 美化');
  }catch(e){ setStatus('Prettier 失败：'+e.message); }
}

// ---- 复制（修复：支持 pre 文本） ----
async function copySel(sel,btn){
  try{
    const el=$(sel); const t=el?(el.value??el.textContent??''):'';
    await navigator.clipboard.writeText(t);
    const old=btn.textContent; btn.textContent='✅ 已复制'; setTimeout(()=>btn.textContent=old,1200);
  }catch(e){ setStatus('复制失败：'+e.message); }
}

// ---- GitHub API 头 ----
function ghHeaders(){
  const t=$('#token').value.trim();
  if(!t){ throw new Error('缺少 Token（需要 contents: read & write）'); }
  return {
    'Authorization':'Bearer '+t,
    'Accept':'application/vnd.github+json',
    'If-None-Match': '' // 禁止沿用旧 ETag
  };
}
function repoBase(){ return `https://api.github.com/repos/${$('#repo').value.trim()}` }

// ---- Base64 UTF-8 安全转换 ----
function b64ToUtf8(b64){ try{ return decodeURIComponent(escape(atob(b64))) }catch{ return atob(b64) } }

// ---- 提交 input.js（PUT） + 可选自动轮询 ----
async function submitInput(){
  const path='input.js'; // 固定入口，Action 自己处理
  const api=`${repoBase()}/contents/${path}`;
  const code=$('#codeIn').value;
  if(!code){ setStatus('没有可上传的内容'); return }
  try{
    let sha='';
    const head=await fetch(`${api}?ref=${$('#branch').value.trim()}&t=${nowTs()}`,{headers:ghHeaders(),cache:'no-store'});
    if(head.ok){ const j=await head.json(); sha=j.sha||''; }
    const body={
      message: 'update: input.js via UI',
      content: btoa(unescape(encodeURIComponent(code))),
      branch: $('#branch').value.trim(),
      sha: sha||undefined
    };
    const res=await fetch(api,{ method:'PUT', headers:{ 'Content-Type':'application/json', ...ghHeaders() }, cache:'no-store', body: JSON.stringify(body) });
    const txt=await res.text();
    if(!res.ok) throw new Error(res.status+' '+res.statusText+' → '+txt.slice(0,200));
    setStatus('提交成功 · 工作流将自动开始');

    if ($('#autoResume').checked) {
      startAutoPoll(true);
    }
  }catch(e){ setStatus('提交失败：'+e.message); }
}

// ---- 自动轮询 output（两种产物任选其一） ----
let pollingTimer=null, barTimer=null;
async function startAutoPoll(){
  try{ ghHeaders(); }catch(e){ setStatus(e.message); return }
  if(pollingTimer){ clearInterval(pollingTimer); pollingTimer=null; }
  if(barTimer){ clearInterval(barTimer); barTimer=null; }

  const which=$('#whichOut')?.value || 'output/output.js';
  const branch=$('#branch').value.trim();
  const api=`${repoBase()}/contents/${which}?ref=${branch}`;
  const interval=5000; // 5s
  const maxWait=150000; // 150s

  let lastSha=''; 
  let waited=0;

  setStatus('正在轮询：'+which);
  showBar();
  barTimer=setInterval(()=>{ const b=$('#bar'); b.style.transition='none'; b.style.width='0%'; void b.offsetWidth; b.style.transition='width 5s linear'; b.style.width='100%'; },5000);

  await tryFetch();

  pollingTimer=setInterval(async ()=>{
    waited+=interval;
    const done=await tryFetch();
    if(done){ clearInterval(pollingTimer); pollingTimer=null; clearInterval(barTimer); barTimer=null; okBar(); return; }
    if(waited>=maxWait){
      clearInterval(pollingTimer); pollingTimer=null;
      clearInterval(barTimer); barTimer=null;
      warnBar();
      setStatus('⌛ 超时：仍未获取到 '+which+'，可能 Actions 还在跑或失败');
    }
  }, interval);

  async function tryFetch(){
    try{
      const r=await fetch(api+'&t='+nowTs(),{headers:ghHeaders(),cache:'no-store'});
      const raw=await r.text();
      if(!r.ok){
        setStatus('等待中… '+which+'（HTTP '+r.status+'）');
        return false;
      }
      const j=JSON.parse(raw);
      const sha=j.sha||'';
      if(sha && sha===lastSha){
        setStatus('等待中… '+which+'（未更新）');
        return false;
      }
      const b64=(j.content||'').replace(/\n/g,'');
      const out=j.content?b64ToUtf8(b64):'';
      if(out && out.trim()){
        lastSha=sha||nowTs();
        $('#codeOut').textContent=out;
        setStatus('✅ 已获取到最新 '+which+' · '+(out.length)+' 字符');
        return true;
      }else{
        setStatus('等待中… '+which+'（文件为空或未生成）');
        return false;
      }
    }catch(e){
      setStatus('等待中… '+which+'（'+e.message+'）');
      return false;
    }
  }
}

// ---- 手动拉取 Raw ----
async function loadOutputRaw(path){
  path = path || ($('#whichOut')?.value || 'output/output.js');
  const url=`https://raw.githubusercontent.com/${$('#repo').value.trim()}/${$('#branch').value.trim()}/${path}?t=${nowTs()}`;
  try{
    const r=await fetch(url,{cache:'no-store'}); const t=await r.text();
    if(!r.ok) throw new Error(r.status+' '+r.statusText);
    $('#outputRaw').textContent=t;
    setStatus('已拉取 Raw · '+path+' · '+t.length+' 字符');
  }catch(e){
    $('#outputRaw').textContent='拉取失败：'+e.message+'\n'+url;
    setStatus('拉取失败');
  }
}

// ---- 下载输出 ----
function downloadOutput(){
  const t=$('#codeOut').textContent||$('#outputRaw').textContent||'';
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([t],{type:'text/javascript;charset=utf-8'}));
  const which=($('#whichOut')?.value || 'output/output.js').split('/').pop()||'output.js';
  a.download=which;
  a.click(); URL.revokeObjectURL(a.href);
}

// ---- 前端秒解（核心） ----
function tryFrontendDecode(code) {
  try {
    if (typeof window.smartDecodePipeline !== 'function') return null;
    const out = window.smartDecodePipeline(code);
    if (typeof out === 'string' && out && out !== code) return out;
    return null;
  } catch { return null; }
}

async function runLocalDecode(source='in'){
  const raw = source==='out' ? ($('#codeOut').textContent||'') : ($('#codeIn').value||'');
  const code = raw.trim();
  if(!code){ setStatus('没有可解密的内容'); return; }
  setStatus('本地解密中…');
  const dec = tryFrontendDecode(code);
  if (dec) {
    $('#codeOut').textContent = dec;
    setStatus('✅ 前端秒解成功');
    if ($('#autoBeautify')?.checked) await beautify();
  } else {
    setStatus('⚠️ 前端未能完全解出，可点击“提交（后台）”');
  }
}

// ---- 自动触发（输入改变时，若开启自动解密） ----
let autoTimer = null;
function autoDecodeIfNeeded(){
  if (!$('#autoDecode').checked) return;
  clearTimeout(autoTimer);
  autoTimer = setTimeout(()=>runLocalDecode('in'), 400);
}
$('#codeIn').addEventListener('input', autoDecodeIfNeeded);

// ---- 按钮事件（与 index.html 对齐） ----
// 解密（前端）
document.querySelector('button.ok')?.addEventListener('click', (e)=>{
  // 支持 Shift+点击 强制本地解
  if (e.shiftKey) { e.preventDefault(); runLocalDecode('in'); return; }
  runLocalDecode('in');
});
// 提交（后台）
document.querySelector('button.warn')?.addEventListener('click', (e)=>{
  submitInput();
});

// 暴露给全局（index.html 按钮直接 onclick 的场景）
window.pick = pick;
window.loadRemote = loadRemote;
window.pasteFromClipboard = pasteFromClipboard;
window.clrIn = clrIn;
window.clrAll = clrAll;
window.beautify = beautify;
window.copySel = copySel;
window.submitInput = submitInput;
window.startAutoPoll = startAutoPoll;
window.loadOutputRaw = loadOutputRaw;
window.downloadOutput = downloadOutput;
window.autoDecodeIfNeeded = autoDecodeIfNeeded;

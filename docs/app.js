// app.js — OtOjs 前端核心逻辑
// GitHub API 上传、轮询、状态条、复制下载、Prettier 自动化、后台恢复、智能解密入口、本地存储、输入防抖

const $ = s => document.querySelector(s);
function setStatus(msg) { $('#status').innerHTML = '<small>状态：' + msg + '</small>'; }
function showBar() {
  $('#barWrap').style.display = 'block';
  const b = $('#bar');
  b.style.transition = 'none';
  b.style.width = '0%';
  void b.offsetWidth;
  b.style.transition = 'width 5s linear';
  b.style.background = 'var(--accent)';
  setTimeout(() => b.style.width = '100%', 50);
}
function okBar() { $('#bar').style.background = 'var(--ok)'; }
function warnBar() { $('#bar').style.background = 'var(--warn)'; }
function hideBar() { $('#barWrap').style.display = 'none'; }

// 防抖
function debounce(fn, wait = 300) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), wait);
  };
}

// ========== GitHub API 基础 ==========
function ghHeaders() {
  const t = $('#token').value.trim();
  if (!t) throw new Error('缺少 Token（需要 contents: read & write）');
  return {
    'Authorization': 'Bearer ' + t,
    'Accept': 'application/vnd.github+json',
    'If-None-Match': ''
  };
}
function repoBase() { return `https://api.github.com/repos/${$('#repo').value.trim()}` }
function nowTs() { return Date.now().toString() }

// Base64 → UTF8
function b64ToUtf8(b64) {
  try { return decodeURIComponent(escape(atob(b64))) }
  catch { return atob(b64) }
}

// ========== 设置持久化 ==========
function restoreSettings() {
  try {
    const repo = localStorage.getItem('otojs_repo');
    const branch = localStorage.getItem('otojs_branch');
    const token = localStorage.getItem('otojs_token');
    if (repo) $('#repo').value = repo;
    if (branch) $('#branch').value = branch;
    if (token) $('#token').value = token;
  } catch {}
}
function bindSettingsAutosave() {
  const save = debounce(() => {
    localStorage.setItem('otojs_repo', $('#repo').value.trim());
    localStorage.setItem('otojs_branch', $('#branch').value.trim());
    localStorage.setItem('otojs_token', $('#token').value.trim());
  }, 200);
  ['#repo', '#branch', '#token'].forEach(sel => {
    const el = $(sel);
    el.addEventListener('input', save);
    el.addEventListener('blur', save);
    el.addEventListener('change', save);
  });
}

// ========== 文件操作 ==========
function pick() { $('#file').click(); }
$('#file').addEventListener('change', async e => {
  const f = e.target.files?.[0]; if (!f) return;
  const txt = await f.text();
  $('#codeIn').value = txt;
  setStatus('已载入本地文件：' + f.name + ' · ' + txt.length + ' 字符');
  autoDecodeIfNeeded();
});

// 远程加载
async function loadRemote() {
  let u = $('#remoteUrl').value.trim();
  if (!u) { setStatus('请输入 URL'); return }
  if (/https?:\/\/github\.com\/.+\/blob\//.test(u)) {
    u = u.replace('https://github.com/','https://raw.githubusercontent.com/').replace('/blob/','/');
  }
  try {
    const r = await fetch(u + '?t=' + nowTs(), { cache: 'no-store' }); const t = await r.text();
    if (!r.ok) throw new Error(r.status + ' ' + r.statusText + ' ' + t.slice(0,200));
    $('#codeIn').value = t; setStatus('远程已加载 · ' + t.length + ' 字符');
    autoDecodeIfNeeded();
  } catch(e){ setStatus('远程加载失败：' + e.message); }
}

// 粘贴板
async function pasteFromClipboard(){
  try{
    const t = await navigator.clipboard.readText();
    $('#codeIn').value = t;
    setStatus('已从剪贴板粘贴 · ' + t.length + ' 字符');
    autoDecodeIfNeeded();
  }catch(e){ setStatus('粘贴失败：' + e.message); }
}

// 清空
function clrIn(){ $('#codeIn').value=''; setStatus('已清空输入'); }
function clrAll(){ $('#codeIn').value=''; $('#codeOut').textContent=''; $('#outputRaw').textContent=''; hideBar(); setStatus('已清空输入与结果'); }

// ========== GitHub 提交 ==========
async function submitInput(){
  const path='input.js';
  const api=`${repoBase()}/contents/${path}`;
  const code=$('#codeIn').value;
  if(!code){ setStatus('没有可上传的内容'); return }
  try{
    let sha='';
    const head=await fetch(`${api}?ref=${$('#branch').value.trim()}&t=${nowTs()}`,{headers:ghHeaders(),cache:'no-store'});
    if(head.ok){ const j=await head.json(); sha=j.sha||''; }
    const body={
      message:'update via UI',
      content:btoa(unescape(encodeURIComponent(code))),
      branch:$('#branch').value.trim(),
      sha: sha||undefined
    };
    const res=await fetch(api,{ method:'PUT', headers:{ 'Content-Type':'application/json', ...ghHeaders() }, cache:'no-store', body: JSON.stringify(body) });
    const txt=await res.text();
    if(!res.ok) throw new Error(res.status+' '+res.statusText+' → '+txt.slice(0,200));
    setStatus('提交成功 · 工作流将自动开始');
    if($('#autoResume').checked){
      localStorage.setItem('otojs-job', JSON.stringify({ repo: $('#repo').value.trim(), branch: $('#branch').value.trim(), path: 'output/output.js', start: Date.now() }));
    }
    startAutoPoll(true);
  }catch(e){ setStatus('提交失败：'+e.message); }
}

// ========== 轮询拉取 ==========
let pollingTimer=null, barTimer=null;
async function startAutoPoll(){
  try{ ghHeaders(); }catch(e){ setStatus(e.message); return }
  if(pollingTimer){ clearInterval(pollingTimer); pollingTimer=null; }
  if(barTimer){ clearInterval(barTimer); barTimer=null; }

  const which='output/output.js';
  const branch=$('#branch').value.trim();
  const api=`${repoBase()}/contents/${which}?ref=${branch}`;
  const interval=5000, maxWait=150000;

  let lastSha=''; let waited=0;

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
      setStatus('⌛ 超时：仍未获取到 '+which);
    }
  }, interval);

  async function tryFetch(){
    try{
      const r=await fetch(api+'&t='+nowTs(),{headers:ghHeaders(),cache:'no-store'});
      const raw=await r.text();
      if(!r.ok){ setStatus('等待中… '+which+'（HTTP '+r.status+'）'); return false; }
      const j=JSON.parse(raw);
      const sha=j.sha||'';
      if(sha && sha===lastSha){ setStatus('等待中… '+which+'（未更新）'); return false; }
      const b64=(j.content||'').replace(/\n/g,'');
      const out=j.content?b64ToUtf8(b64):'';
      if(out && out.trim()){
        lastSha=sha||nowTs();
        $('#codeOut').textContent=out;
        setStatus('✅ 已获取最新 '+which+' · '+(out.length)+' 字符');
        autoDecodeIfNeeded();
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

// ========== 手动拉取 Raw ==========
async function loadOutputRaw(path){
  path = path || 'output/output.js';
  const url=`https://raw.githubusercontent.com/${$('#repo').value.trim()}/${$('#branch').value.trim()}/${path}?t=${nowTs()}`;
  try{
    const r=await fetch(url,{cache:'no-store'}); const t=await r.text();
    if(!r.ok) throw new Error(r.status+' '+r.statusText);
    $('#outputRaw').textContent=t;
    setStatus('已拉取 Raw · '+path+' · '+t.length+' 字符');
    if($('#autoDecode').checked){
      const decoded = await smartDecodePipeline(t);   // ✅ await
      if (decoded) {
        $('#codeOut').textContent = decoded;
        if ($('#autoBeautify').checked) await beautify();  // ✅ await
      }
    }
  }catch(e){
    $('#outputRaw').textContent='拉取失败：'+e.message+'\n'+url;
    setStatus('拉取失败');
  }
}

// ========== 下载 ==========
function downloadOutput(){
  const t=$('#codeOut').textContent||$('#outputRaw').textContent||'';
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([t],{type:'text/javascript;charset=utf-8'}));
  a.download='output.js';
  a.click(); URL.revokeObjectURL(a.href);
}

// ========== Prettier ==========
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

// ========== 复制 ==========
async function copySel(sel,btn){
  try{
    const el=$(sel); const t=el?(el.value??el.textContent??''):'';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(t);
    } else {
      const ta=document.createElement('textarea');
      ta.value=t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    const old=btn.textContent; btn.textContent='✅ 已复制'; setTimeout(()=>btn.textContent=old,1200);
  }catch(e){ setStatus('复制失败：'+e.message); }
}

// ========== 智能解密入口 ==========
async function autoDecodeIfNeeded(){
  if(!$('#autoDecode').checked) return;
  if (typeof window.smartDecodePipeline !== 'function') {
    setStatus('智能解密插件未加载（请确认 decode-all.js 已在 app.js 之前引入）');
    return;
  }
  let code=$('#codeIn').value||$('#codeOut').textContent||'';
  if(!code.trim()) return;
  try {
    const decoded = await smartDecodePipeline(code);   // ✅ await
    if(decoded){
      $('#codeOut').textContent=decoded;
      if($('#autoBeautify').checked) await beautify();  // ✅ await
    }
  } catch(e){
    setStatus('解密失败：'+e.message);
  }
}

// ========== 后台恢复 ==========
function autoResumeIfNeeded(){
  const job=localStorage.getItem('otojs-job');
  if(!job) return;
  try{
    const j=JSON.parse(job);
    if(Date.now()-j.start < 10*60*1000){
      $('#repo').value=j.repo;
      $('#branch').value=j.branch;
      startAutoPoll();
    }
  }catch{}
}

// ========== 页面初始化 ==========
window.addEventListener('load', () => {
  restoreSettings();
  bindSettingsAutosave();
  autoResumeIfNeeded();

  // 输入时自动解密（防抖）
  $('#codeIn').addEventListener('input', debounce(() => {
    autoDecodeIfNeeded();
  }, 400));
});

(function(){
  const $ = id => document.getElementById(id);
  const setStatus = (msg, ok=true)=>{ const s=$("status"); s.className=ok?"ok":"err"; s.textContent=msg; };
  const setWF     = (msg, cls="")=>{ const e=$("wfStatus"); e.className=cls; e.innerHTML=msg; };
  const show = t => $("out").textContent = (typeof t==="string"?t:JSON.stringify(t,null,2));

  // 固定仓库与分支/文件名
  const repo   = "Mikephie/OtOjs";
  const branch = "main";
  const infile = "input.js";
  const outfile = "output.js";
  const workflowFile = ".github/workflows/decode.yml";     // 你的工作流文件名

  const b64 = s => btoa(unescape(encodeURIComponent(s)));
  const decodeEntities = s => { const ta=document.createElement("textarea"); ta.innerHTML=s; return ta.value; };

  async function upsert({token, path, content}){
    const url = `https://api.github.com/repos/${repo}/contents/${path}`;
    // 取 sha
    let sha;
    const head = await fetch(`${url}?ref=${branch}`, {
      headers: { "Accept":"application/vnd.github+json", "Authorization":`Bearer ${token}` }
    });
    if (head.ok) { sha = (await head.json()).sha; }
    // 写文件
    const body = { message:`update ${path} via web`, content:b64(content), branch, ...(sha?{sha}:{}) };
    const put = await fetch(url, {
      method:"PUT",
      headers: { "Accept":"application/vnd.github+json", "Authorization":`Bearer ${token}` },
      body: JSON.stringify(body)
    });
    if (!put.ok) throw new Error(`${put.status} ${await put.text().catch(()=>put.statusText)}`);
  }

  async function readRaw(path){
    const url = `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
    const r = await fetch(url, {cache:"no-store"});
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.text();
  }

  // ---------- Actions 状态轮询 ----------
  async function getWorkflowId(token){
    // 先按文件路径取（最快）
    let r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}`, {
      headers: { "Accept":"application/vnd.github+json", "Authorization":`Bearer ${token}` }
    });
    if (r.ok) { const j = await r.json(); return j.id; }

    // 兜底：遍历，找名字或路径带 decode 的
    r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows`, {
      headers: { "Accept":"application/vnd.github+json", "Authorization":`Bearer ${token}` }
    });
    if (!r.ok) throw new Error("找不到 workflow");
    const j = await r.json();
    const hit = (j.workflows||[]).find(w =>
      /decode/i.test(w.name||"") || /decode/i.test(w.path||"")
    );
    if (!hit) throw new Error("未发现 decode 工作流");
    return hit.id;
  }

  async function getLatestRun(token, workflowId){
    const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflowId}/runs?branch=${encodeURIComponent(branch)}&per_page=1`;
    const r = await fetch(url, {
      headers: { "Accept":"application/vnd.github+json", "Authorization":`Bearer ${token}` }
    });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const j = await r.json();
    return (j.workflow_runs && j.workflow_runs[0]) || null;
  }

  async function pollRun(token, {interval=5000, timeout=180000}={}){
    try{
      const wfId = await getWorkflowId(token);
      const start = Date.now();

      setWF("🟡 工作流已触发，正在运行…", "ok");

      // 轮询直到完成或超时
      while (Date.now() - start < timeout){
        const run = await getLatestRun(token, wfId);
        if (run){
          const url = run.html_url;
          const status = run.status;        // queued / in_progress / completed
          const conc  = run.conclusion;     // success / failure / cancelled / null
          if (status === "completed"){
            if (conc === "success"){
              setWF(`✅ 运行成功 → <a href="${url}" target="_blank">查看日志</a>`, "ok");
            }else{
              setWF(`❌ 运行失败（${conc||"unknown"}）→ <a href="${url}" target="_blank">查看日志</a>`, "err");
            }
            return conc || "completed";
          }else{
            const icon = (status === "queued") ? "🟨" : "🟡";
            setWF(`${icon} ${status}… → <a href="${url}" target="_blank">打开运行</a>`, "ok");
          }
        }else{
          setWF("🕓 等待工作流队列…", "ok");
        }
        await new Promise(r=>setTimeout(r, interval));
      }
      setWF("⏱️ 等待超时（可手动点打开运行查看）", "err");
      return "timeout";
    }catch(e){
      setWF("⚠️ 无法查询工作流状态："+e.message, "err");
      return "error";
    }
  }

  // ---------- 输入来源：URL / 本地文件 ----------
  $("btnLoadUrl").onclick = async ()=>{
    const url = $("srcUrl").value.trim();
    if (!url) { setStatus("请填写链接", false); return; }
    try{
      setStatus("拉取中…");
      const r = await fetch(url,{cache:"no-store"});
      if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      $("code").value = await r.text();
      setStatus("已填入输入框");
    }catch(e){ setStatus("拉取失败："+e.message,false); }
  };

  $("btnLoadFile").onclick = async ()=>{
    const f = $("srcFile").files?.[0];
    if(!f){ setStatus("请先选择文件",false); return; }
    try{
      $("code").value = await f.text();
      setStatus(`已读取：${f.name}`);
    }catch(e){ setStatus("读取失败："+e.message,false); }
  };

  // ---------- 提交 / 读取 / 复制 ----------
  $("btnSubmit").onclick = async ()=>{
    const token = $("token").value.trim();
    const code = decodeEntities($("code").value);
    if (!token) { setStatus("需要 Token", false); return; }

    try{
      setStatus("提交中…");
      await upsert({token, path: infile, content: code});
      setStatus("已写入 input.js，准备查询工作流状态…");
      // 提交后开始轮询状态
      pollRun(token);
    }catch(e){
      setStatus("提交失败："+e.message,false);
    }
  };

  $("btnRead").onclick = async ()=>{
    try{
      setStatus("读取中…");
      const txt = await readRaw(outfile);
      show(txt);
      setStatus("已读取 output.js");
    }catch(e){ setStatus("读取失败："+e.message,false); }
  };

  $("btnCopyOut").onclick = async ()=>{
    try{
      await navigator.clipboard.writeText($("out").textContent||"");
      setStatus("已复制 output.js");
    }catch(e){
      try{
        const r = document.createRange();
        r.selectNodeContents($("out"));
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
        const ok = document.execCommand("copy");
        sel.removeAllRanges();
        setStatus(ok ? "已复制 output.js" : "复制失败（浏览器限制）", !!ok);
      }catch(err){ setStatus("复制失败："+err.message,false); }
    }
  };
})();
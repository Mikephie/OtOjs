(function(){
  const $ = (id)=>document.getElementById(id);
  const setStatus = (msg, ok)=>{ const s=$("status"); s.className=ok?"ok":"err"; s.textContent=msg; };
  const logOut = (t)=>{ $("out").textContent = (typeof t==="string"?t:JSON.stringify(t,null,2)); };

  // ---- helpers ----
  function b64(s){ return btoa(unescape(encodeURIComponent(s))); }
  function decodeEntities(s){
    if(!s || typeof s!=="string") return s||"";
    if(!/[&][a-zA-Z#0-9]+;/.test(s)) return s;
    const ta=document.createElement("textarea"); ta.innerHTML=s; return ta.value;
  }
  function encodePathSegments(p){ return p.split('/').map(encodeURIComponent).join('/'); }

  async function ghFetch(url, token, opt={}){
    const res = await fetch(url, {
      ...opt,
      headers: {
        "Accept":"application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        "X-GitHub-Api-Version":"2022-11-28",
        ...(opt.headers||{})
      }
    });
    if(!res.ok){
      const txt = await res.text().catch(()=>res.statusText);
      throw new Error(`${res.status} ${txt}`);
    }
    return res;
  }

  async function checkRepo(ownerRepo, token){
    const [owner, repo] = ownerRepo.split("/");
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    await ghFetch(url, token);
  }
  async function checkBranch(ownerRepo, branch, token){
    const [owner, repo] = ownerRepo.split("/");
    const url = `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`;
    await ghFetch(url, token);
  }

  async function upsertFile({ownerRepo, branch, token, path, content, message}){
    await checkRepo(ownerRepo, token);
    await checkBranch(ownerRepo, branch, token);

    const [owner, repo] = ownerRepo.split("/");
    const p = encodePathSegments(path);

    // read current (to get sha)
    let sha;
    const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${p}?ref=${encodeURIComponent(branch)}`;
    const head = await fetch(getUrl, {
      headers: {"Accept":"application/vnd.github+json","Authorization":`Bearer ${token}`,"X-GitHub-Api-Version":"2022-11-28"}
    });
    if(head.ok){ const j = await head.json(); sha = j.sha; }
    else if(head.status!==404){ const t=await head.text().catch(()=>head.statusText); throw new Error(`读取 ${path} 失败：${head.status} ${t}`); }

    const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${p}`;
    const body = { message: message||`chore: update ${path} from web ui`, content: b64(content), branch, ...(sha?{sha}:{}) };
    const res = await ghFetch(putUrl, token, { method:"PUT", body: JSON.stringify(body) });
    return res.json();
  }

  async function dispatchWorkflow({ownerRepo, token, workflowFile, ref, inputs}){
    const [owner, repo] = ownerRepo.split("/");
    const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`;
    await ghFetch(url, token, { method:"POST", body: JSON.stringify({ ref, inputs: inputs||{} }) });
  }

  async function readRaw({ownerRepo, branch, path}){
    const url = `https://raw.githubusercontent.com/${ownerRepo}/${branch}/${path}`;
    const r = await fetch(url, { cache:"no-store" });
    if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.text();
  }

  // ---- UI events ----
  $("btnSubmit").onclick = async ()=>{
    const token = $("token").value.trim();
    const ownerRepo = $("repo").value.trim();
    const branch = $("branch").value.trim() || "main";
    let code = $("code").value;

    if(!token || !ownerRepo){ setStatus("Token 与 仓库 必填", false); return; }

    code = decodeEntities(code);

    try{
      setStatus("写入 input.js …", true);
      await upsertFile({ ownerRepo, branch, token, path:"input.js", content:code, message:"update input.js from web ui" });

      setStatus("触发工作流 decode.yml …", true);
      await dispatchWorkflow({ ownerRepo, token, workflowFile:"decode.yml", ref:branch });

      setStatus("已触发，约 60 秒后点「手动刷新结果」查看。", true);
    }catch(e){
      setStatus("提交失败：" + e.message, false);
    }
  };

  $("btnCheck").onclick = async ()=>{
    const ownerRepo = $("repo").value.trim();
    const branch = $("branch").value.trim() || "main";
    try{
      setStatus("拉取 output.js …", true);
      const text = await readRaw({ ownerRepo, branch, path:"output.js" });
      logOut(text);
      setStatus("已更新输出。", true);
    }catch(e){
      setStatus("还没产出或读取失败：" + e.message, false);
    }
  };
})();

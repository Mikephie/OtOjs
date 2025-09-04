(async function(){
  const $ = (id)=>document.getElementById(id);
  const log = (t)=>{ const out=$("out"); out.textContent = (typeof t==="string"?t:JSON.stringify(t,null,2)); };

  function b64(s){ return btoa(unescape(encodeURIComponent(s))); }
  function decodeEntities(s){
    if(!/[&][a-zA-Z#0-9]+;/.test(s)) return s;
    const ta = document.createElement("textarea"); ta.innerHTML = s; return ta.value;
  }

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
      const text = await res.text().catch(()=>res.statusText);
      throw new Error(`GitHub API ${res.status}: ${text}`);
    }
    return res;
  }

  async function upsertFile({ownerRepo, branch, token, path, content, message}){
    const [owner, repo] = ownerRepo.split("/");
    // 先查 sha（如果文件存在）
    let sha = undefined;
    const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
    const head = await fetch(getUrl, { headers: { Authorization:`Bearer ${token}`, "Accept":"application/vnd.github+json" }});
    if(head.ok){ const j = await head.json(); sha = j.sha; }

    const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
    const body = {
      message: message || `chore: update ${path}`,
      content: b64(content),
      branch,
      ...(sha ? {sha} : {})
    };
    const res = await ghFetch(putUrl, token, { method:"PUT", body: JSON.stringify(body) });
    return res.json();
  }

  async function dispatchWorkflow({ownerRepo, token, workflowFile, ref, inputs}){
    const [owner, repo] = ownerRepo.split("/");
    const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`;
    await ghFetch(url, token, {
      method:"POST",
      body: JSON.stringify({ref, inputs: inputs||{}})
    });
  }

  async function readRaw({ownerRepo, branch, path}){
    const url = `https://raw.githubusercontent.com/${ownerRepo}/${branch}/${path}`;
    const res = await fetch(url, { cache: "no-store" });
    if(!res.ok) throw new Error(`Raw ${res.status}`);
    return await res.text();
  }

  // 点击：提交解密
  $("btnSubmit").onclick = async ()=>{
    const token = $("token").value.trim();
    const ownerRepo = $("repo").value.trim();
    const branch = $("branch").value.trim();
    let code = $("code").value;

    if(!token || !ownerRepo){ alert("Token 与 Fork 仓库必填"); return; }
    code = decodeEntities(code);

    try{
      log("正在写入 input.js ...");
      await upsertFile({
        ownerRepo, branch, token,
        path: "input.js",
        content: code,
        message: "chore: update input.js from web ui"
      });

      // 触发 workflow_dispatch（文件名按对方仓库工作流实际名称；一般是 main.yml 或 decode.yml）
      // 如果你不确定名称，进 fork 的 Actions 页看工作流文件名；默认分支要能看到 Run workflow 按钮。:contentReference[oaicite:5]{index=5}
      await dispatchWorkflow({
        ownerRepo, token,
        workflowFile: "decode.yml",   // ★ 如名称不同改这里（例如 decode.yml）
        ref: branch
      });

      log("已触发工作流，等待约 60 秒后点击「手动刷新结果」查看。");
    }catch(e){
      log("提交失败：" + e.message);
    }
  };

  // 点击：检查结果
  $("btnCheck").onclick = async ()=>{
    const ownerRepo = $("repo").value.trim();
    const branch = $("branch").value.trim();
    try{
      log("拉取 output.js ...");
      const text = await readRaw({ ownerRepo, branch, path: "output.js" });
      $("out").textContent = text;
    }catch(e){
      log("还没产出或读取失败：" + e.message);
    }
  };
})();

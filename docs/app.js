(function(){
  const $ = id => document.getElementById(id);
  const setStatus = (msg, ok=true)=>{ const s=$("status"); s.className=ok?"ok":"err"; s.textContent=msg; };
  const show = t => $("out").textContent = (typeof t==="string"?t:JSON.stringify(t,null,2));

  // Helpers
  const b64 = s => btoa(unescape(encodeURIComponent(s)));
  const decodeEntities = s => { const ta=document.createElement("textarea"); ta.innerHTML=s; return ta.value; };
  const encPath = p => p.split('/').map(encodeURIComponent).join('/');

  async function ghFetch(url, token, opt={}){
    const r = await fetch(url,{
      ...opt,
      headers:{
        "Accept":"application/vnd.github+json",
        "Authorization":`Bearer ${token}`,
        "X-GitHub-Api-Version":"2022-11-28",
        ...(opt.headers||{})
      }
    });
    if(!r.ok){ throw new Error(`${r.status} ${await r.text().catch(()=>r.statusText)}`); }
    return r;
  }

  async function upsert({token, repo, branch, path, content}){
    const [owner, name] = (repo||"").split("/");
    if (!owner || !name) throw new Error("仓库格式应为 owner/repo");
    const p = encPath(path);
    // 查 sha
    let sha;
    const head = await fetch(`https://api.github.com/repos/${owner}/${name}/contents/${p}?ref=${encodeURIComponent(branch)}`,{
      headers:{
        "Accept":"application/vnd.github+json",
        "Authorization":`Bearer ${token}`,
        "X-GitHub-Api-Version":"2022-11-28"
      }
    });
    if (head.ok) { sha = (await head.json()).sha; }
    // 写文件
    const body = { message:`update ${path} via web`, content:b64(content), branch, ...(sha?{sha}:{}) };
    await ghFetch(`https://api.github.com/repos/${owner}/${name}/contents/${p}`, token, {
      method:"PUT", body: JSON.stringify(body)
    });
  }

  async function readRaw({repo, branch, path}){
    const url = `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
    const r = await fetch(url, { cache:"no-store" });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.text();
  }

  // 方式 B：从 URL 拉取
  $("btnLoadUrl").onclick = async ()=>{
    const url = $("srcUrl").value.trim();
    if (!url) { setStatus("请填写链接地址", false); return; }
    try{
      setStatus("从链接拉取中…");
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const text = await r.text();
      $("code").value = text;
      setStatus("已从链接填入文本框");
    }catch(e){
      setStatus("拉取失败："+e.message+"（可能被目标站点 CORS 限制，建议下载后用本地文件方式）", false);
    }
  };

  // 方式 C：本地文件
  $("btnLoadFile").onclick = async ()=>{
    const file = $("srcFile").files && $("srcFile").files[0];
    if (!file) { setStatus("请先选择一个文件", false); return; }
    try{
      setStatus("读取本地文件中…");
      const text = await file.text();
      $("code").value = text;
      setStatus(`已读取：${file.name}`);
    }catch(e){
      setStatus("读取文件失败："+e.message, false);
    }
  };

  // 提交（写入 input.js）
  $("btnSubmit").onclick = async ()=>{
    const token = $("token").value.trim();
    const repo  = $("repo").value.trim();
    const branch= $("branch").value.trim() || "main";
    const infile= $("infile").value.trim() || "input.js";
    // 解一下实体，防复制带 &quot; 等
    const code  = decodeEntities($("code").value);
    if (!token || !repo) { setStatus("Token 和 仓库 必填", false); return; }

    try{
      setStatus("提交中（写入 input.js）…");
      await upsert({token, repo, branch, path: infile, content: code});
      setStatus("已写入 input.js，Actions 正在解密。稍后点击「读取 output.js」。");
    }catch(e){
      setStatus("提交失败："+e.message, false);
    }
  };

  // 读取 output.js
  $("btnRead").onclick = async ()=>{
    const repo   = $("repo").value.trim();
    const branch = $("branch").value.trim() || "main";
    const outfile= $("outfile").value.trim() || "output.js";
    try{
      setStatus("读取中…");
      const txt = await readRaw({repo, branch, path: outfile});
      show(txt);
      setStatus("已读取 output.js");
    }catch(e){
      setStatus("读取失败："+e.message+"（可能 workflow 还在运行中）", false);
    }
  };

  // 一键复制输出
  $("btnCopyOut").onclick = async ()=>{
    try{
      const text = $("out").textContent || "";
      await navigator.clipboard.writeText(text);
      setStatus("已复制 output.js 到剪贴板");
    }catch(e){
      // 某些环境需要用户交互或 https；降级兼容
      try{
        const r = document.createRange();
        r.selectNodeContents($("out"));
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
        const ok = document.execCommand("copy");
        sel.removeAllRanges();
        setStatus(ok ? "已复制 output.js 到剪贴板" : "复制失败（浏览器限制）", !!ok);
      }catch(err){
        setStatus("复制失败："+err.message, false);
      }
    }
  };
})();
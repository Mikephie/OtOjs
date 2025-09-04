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
    const body = { message: message||`chore: update ${path} from web ui`, content: b64(content), branch, ...(sha?{sha}:{}

(function(){
  const $ = id => document.getElementById(id);
  const setStatus = (msg, ok)=>{ const s=$("status"); s.className=ok?"ok":"err"; s.textContent=msg; };
  const logOut = t => { $("out").textContent = (typeof t==="string"?t:JSON.stringify(t,null,2)); };

  function b64(s){ return btoa(unescape(encodeURIComponent(s))); }
  function decodeEntities(s){ const ta=document.createElement("textarea"); ta.innerHTML=s; return ta.value; }
  function encodePathSegments(p){ return p.split('/').map(encodeURIComponent).join('/'); }

  async function ghFetch(url, token, opt={}){
    const r = await fetch(url,{...opt,headers:{
      "Accept":"application/vnd.github+json",
      "Authorization":`Bearer ${token}`,
      "X-GitHub-Api-Version":"2022-11-28",
      ...(opt.headers||{})
    }});
    if(!r.ok){ throw new Error(`${r.status} ${await r.text().catch(()=>r.statusText)}`); }
    return r;
  }

  async function upsertFile({ownerRepo, branch, token, path, content, message}){
    const [owner, repo] = ownerRepo.split("/");
    const p = encodePathSegments(path);
    // 读 sha
    const head = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${p}?ref=${encodeURIComponent(branch)}`,{
      headers:{ "Accept":"application/vnd.github+json", "Authorization":`Bearer ${token}`, "X-GitHub-Api-Version":"2022-11-28" }
    });
    let sha; if(head.ok){ sha=(await head.json()).sha; }
    // 写入
    const body = { message: message||`update ${path} from web ui`, content: b64(content), branch, ...(sha?{sha}:{}) };
    await ghFetch(`https://api.github.com/repos/${owner}/${repo}/contents/${p}`, token, { method:"PUT", body: JSON.stringify(body) });
  }

  async function readRaw({ownerRepo, branch, path}){
    const url=`https://raw.githubusercontent.com/${ownerRepo}/${branch}/${path}`;
    const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error(`${r.status}`); return r.text();
  }

  $("btnSubmit").onclick = async ()=>{
    const token=$("token").value.trim(), repo=$("repo").value.trim(), branch=$("branch").value.trim()||"main";
    const infile=$("infile").value.trim()||"input.js";
    let code=decodeEntities($("code").value);
    if(!token||!repo){ setStatus("Token 与 仓库 必填",false); return; }
    try{
      setStatus("写入 "+infile+" …（将自动触发 Actions）",true);
      await upsertFile({ownerRepo:repo,branch,token,path:infile,content:code});
      setStatus("已写入。稍等片刻后点击「刷新结果」查看 output.js。",true);
    }catch(e){ setStatus("提交失败："+e.message,false); }
  };

  $("btnCheck").onclick = async ()=>{
    const repo=$("repo").value.trim(), branch=$("branch").value.trim()||"main", outfile=$("outfile").value.trim()||"output.js";
    try{ setStatus("读取 "+outfile+" …",true); logOut(await readRaw({ownerRepo:repo,branch,path:outfile})); setStatus("已更新输出",true); }
    catch(e){ setStatus("读取失败："+e.message,false); }
  };
})();
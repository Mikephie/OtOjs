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

  async function upsertFile({ownerRepo, branch, token, path, content}){
    const [owner, repo] = ownerRepo.split("/");
    const p = encodePathSegments(path);
    const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${p}?ref=${branch}`;
    let sha;
    const head = await fetch(getUrl,{headers:{Authorization:`Bearer ${token}`,"Accept":"application/vnd.github+json"}});
    if(head.ok){ sha=(await head.json()).sha; }
    const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${p}`;
    const body = {message:`update ${path} from web ui`,content:b64(content),branch,...(sha?{sha}:{})};
    await ghFetch(putUrl,token,{method:"PUT",body:JSON.stringify(body)});
  }

  async function dispatchWorkflow({ownerRepo, token, workflowFile, ref, inputs}){
    const [owner, repo] = ownerRepo.split("/");
    const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`;
    await ghFetch(url, token, {method:"POST",body:JSON.stringify({ref,inputs})});
  }

  async function readRaw({ownerRepo, branch, path}){
    const url=`https://raw.githubusercontent.com/${ownerRepo}/${branch}/${path}`;
    const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error(`${r.status}`); return r.text();
  }

  $("btnSubmit").onclick = async ()=>{
    const token=$("token").value.trim(), repo=$("repo").value.trim(), branch=$("branch").value.trim();
    const infile=$("infile").value.trim(), outfile=$("outfile").value.trim();
    let code=decodeEntities($("code").value);
    if(!token||!repo){ setStatus("Token 与 仓库 必填",false); return; }
    try{
      setStatus("写入 "+infile+" …",true);
      await upsertFile({ownerRepo:repo,branch,token,path:infile,content:code});
      setStatus("触发 workflow decode.yml …",true);
      await dispatchWorkflow({ownerRepo:repo,token,workflowFile:"decode.yml",ref:branch,inputs:{input_path:infile,output_path:outfile}});
      setStatus("已触发，稍等后刷新结果",true);
    }catch(e){ setStatus("提交失败："+e.message,false); }
  };

  $("btnCheck").onclick = async ()=>{
    const repo=$("repo").value.trim(), branch=$("branch").value.trim(), outfile=$("outfile").value.trim();
    try{ setStatus("读取 "+outfile+" …",true); logOut(await readRaw({ownerRepo:repo,branch,path:outfile})); setStatus("已更新输出",true); }
    catch(e){ setStatus("读取失败："+e.message,false); }
  };
})();

(function () {
  // 简易选择器 & 状态
  function $(id){ return document.getElementById(id); }
  function setStatus(msg, ok){ if(ok===void 0) ok=true; var s=$("status"); s.className=ok?"ok":"err"; s.textContent=msg; }
  function setWF(msg, cls){ if(cls===void 0) cls=""; var e=$("wfStatus"); if(e){ e.className=cls; e.innerHTML=msg; } }
  function show(t){ $("out").textContent = (typeof t==="string"?t:JSON.stringify(t,null,2)); }

  // 固定仓库与分支
  var repo   = "Mikephie/OtOjs";
  var branch = "main";
  var infile = "input.js";
  var outfile= "output.js";
  var workflowFile = ".github/workflows/decode.yml";

  function b64(s){ return btoa(unescape(encodeURIComponent(s))); }
  function decodeEntities(s){ var ta=document.createElement("textarea"); ta.innerHTML=s; return ta.value; }

  // --- GitHub 写入 / 读取 ---
  async function upsert(opt){
    var token=opt.token, path=opt.path, content=opt.content;
    var base="https://api.github.com/repos/"+repo+"/contents/"+path;
    var head = await fetch(base+"?ref="+branch,{headers:{"Accept":"application/vnd.github+json","Authorization":"Bearer "+token}});
    var sha; if(head.ok){ var j=await head.json(); sha=j.sha; }
    var body={message:"update "+path+" via web", content:b64(content), branch:branch}; if(sha) body.sha=sha;
    var put=await fetch(base,{method:"PUT",headers:{"Accept":"application/vnd.github+json","Authorization":"Bearer "+token},body:JSON.stringify(body)});
    if(!put.ok) throw new Error(put.status+" "+(await put.text().catch(function(){return put.statusText;})));
  }
  async function readRaw(path){
    var url="https://raw.githubusercontent.com/"+repo+"/"+branch+"/"+path;
    var r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error(r.status+" "+r.statusText); return r.text();
  }

  // --- Actions 状态轮询（与之前一致） ---
  async function getWorkflowId(token){
    var r=await fetch("https://api.github.com/repos/"+repo+"/actions/workflows/"+encodeURIComponent(workflowFile),{headers:{"Accept":"application/vnd.github+json","Authorization":"Bearer "+token}});
    if(r.ok){ var j=await r.json(); return j.id; }
    r=await fetch("https://api.github.com/repos/"+repo+"/actions/workflows",{headers:{"Accept":"application/vnd.github+json","Authorization":"Bearer "+token}});
    if(!r.ok) throw new Error("找不到 workflow");
    var all=await r.json(), list=all.workflows||[], i; for(i=0;i<list.length;i++){ var w=list[i]; if(/decode/i.test(w.name||"")||/decode/i.test(w.path||"")) return w.id; }
    throw new Error("未发现 decode 工作流");
  }
  async function getLatestRun(token, id){
    var url="https://api.github.com/repos/"+repo+"/actions/workflows/"+id+"/runs?branch="+encodeURIComponent(branch)+"&per_page=1";
    var r=await fetch(url,{headers:{"Accept":"application/vnd.github+json","Authorization":"Bearer "+token}});
    if(!r.ok) throw new Error(r.status+" "+r.statusText);
    var j=await r.json(); return (j.workflow_runs && j.workflow_runs[0]) || null;
  }
  async function pollRun(token, opt){
    opt=opt||{}; var interval=opt.interval||5000, timeout=opt.timeout||180000;
    try{
      var wfId=await getWorkflowId(token), start=Date.now();
      setWF("🟡 工作流已触发，正在运行…","ok");
      while(Date.now()-start < timeout){
        var run=await getLatestRun(token, wfId);
        if(run){
          var url=run.html_url, status=run.status, conc=run.conclusion;
          if(status==="completed"){
            if(conc==="success") setWF("✅ 运行成功 → <a href=\""+url+"\" target=\"_blank\">查看日志</a>","ok");
            else setWF("❌ 运行失败（"+(conc||"unknown")+"） → <a href=\""+url+"\" target=\"_blank\">查看日志</a>","err");
            return conc||"completed";
          }else{
            var icon=(status==="queued")?"🟨":"🟡";
            setWF(icon+" "+status+"… → <a href=\""+url+"\" target=\"_blank\">打开运行</a>","ok");
          }
        }else{
          setWF("🕓 等待工作流队列…","ok");
        }
        await new Promise(function(r){ return setTimeout(r, interval); });
      }
      setWF("⏱️ 等待超时（可手动打开运行查看）","err");
      return "timeout";
    }catch(e){
      setWF("⚠️ 无法查询工作流状态："+e.message,"err");
      return "error";
    }
  }

  // === 自动载入：URL 与 本地文件 ===
  // URL：回车、change、以及输入停止 800ms 后自动拉取
  var urlDebounceTimer=null;
  function autoFetchUrl(){
    var url=$("srcUrl").value.trim(); if(!url){ return; }
    (async function(){
      try{
        setStatus("从链接拉取中…");
        var r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error(r.status+" "+r.statusText);
        var text=await r.text();
        $("code").value=text;  // ★ 自动填入
        setStatus("已从链接填入输入框");
      }catch(e){ setStatus("拉取失败："+e.message,false); }
    })();
  }
  $("srcUrl").addEventListener("keydown", function(ev){
    if(ev.key==="Enter"){ ev.preventDefault(); autoFetchUrl(); }
  });
  $("srcUrl").addEventListener("change", autoFetchUrl);
  $("srcUrl").addEventListener("input", function(){
    if(urlDebounceTimer) clearTimeout(urlDebounceTimer);
    urlDebounceTimer=setTimeout(autoFetchUrl, 800);
  });

  // 本地文件：选择后自动读取
  $("srcFile").addEventListener("change", async function(){
    var input=$("srcFile"); var file=input && input.files && input.files[0];
    if(!file){ setStatus("未选择文件", false); return; }
    try{
      setStatus("读取本地文件中…");
      var text=await file.text();
      $("code").value=text; // ★ 自动填入
      setStatus("已读取："+file.name);
    }catch(e){ setStatus("读取失败："+e.message,false); }
  });

  // === 清空 / 提交 / 读取 / 复制 ===
  $("btnClear").onclick = function(){
    $("srcUrl").value="";
    if($("srcFile")) $("srcFile").value="";
    $("code").value="";
    setStatus("已清空输入");
  };

  $("btnSubmit").onclick = async function(){
    var token=$("token").value.trim();
    var code=decodeEntities($("code").value);
    if(!token){ setStatus("需要 Token", false); return; }
    try{
      setStatus("提交中…");
      await upsert({token:token, path:infile, content:code});
      setStatus("已写入 input.js，准备查询工作流状态…");
      pollRun(token);
    }catch(e){ setStatus("提交失败："+e.message,false); }
  };

  $("btnRead").onclick = async function(){
    try{
      setStatus("读取中…");
      var txt=await readRaw(outfile);
      show(txt);
      setStatus("已读取 output.js");
    }catch(e){ setStatus("读取失败："+e.message,false); }
  };

  $("btnCopyOut").onclick = async function(){
    try{
      await navigator.clipboard.writeText($("out").textContent||"");
      setStatus("已复制 output.js");
    }catch(e){
      try{
        var r=document.createRange(); r.selectNodeContents($("out"));
        var sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        var ok=document.execCommand("copy"); sel.removeAllRanges();
        setStatus(ok?"已复制 output.js":"复制失败（浏览器限制）", !!ok);
      }catch(err){ setStatus("复制失败："+err.message,false); }
    }
  };
})();
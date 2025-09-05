(function () {
  var $ = function (id) { return document.getElementById(id); };
  var setStatus = function (msg, ok) {
    if (ok === void 0) ok = true;
    var s = $("status");
    s.className = ok ? "ok" : "err";
    s.textContent = msg;
  };
  var setWF = function (msg, cls) {
    if (cls === void 0) cls = "";
    var e = $("wfStatus");
    if (e) { e.className = cls; e.innerHTML = msg; }
  };
  var show = function (t) { $("out").textContent = (typeof t === "string" ? t : JSON.stringify(t, null, 2)); };

  // 固定仓库与分支/文件名
  var repo = "Mikephie/OtOjs";
  var branch = "main";
  var infile = "input.js";
  var outfile = "output.js";
  var workflowFile = ".github/workflows/decode.yml";

  function b64(s) { return btoa(unescape(encodeURIComponent(s))); }
  function decodeEntities(s) { var ta = document.createElement("textarea"); ta.innerHTML = s; return ta.value; }

  async function upsert(opt) {
    var token = opt.token, path = opt.path, content = opt.content;
    var url = "https://api.github.com/repos/" + repo + "/contents/" + path;
    // 取 sha
    var head = await fetch(url + "?ref=" + branch, {
      headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + token }
    });
    var sha;
    if (head.ok) { var j = await head.json(); sha = j.sha; }
    // 写入
    var body = { message: "update " + path + " via web", content: b64(content), branch: branch };
    if (sha) body.sha = sha;
    var put = await fetch(url, {
      method: "PUT",
      headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + token },
      body: JSON.stringify(body)
    });
    if (!put.ok) throw new Error(put.status + " " + (await put.text().catch(function () { return put.statusText; })));
  }

  async function readRaw(path) {
    var url = "https://raw.githubusercontent.com/" + repo + "/" + branch + "/" + path;
    var r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status + " " + r.statusText);
    return r.text();
  }

  // -------- Actions 状态（保留，与你目前一致） --------
  async function getWorkflowId(token) {
    var r = await fetch("https://api.github.com/repos/" + repo + "/actions/workflows/" + encodeURIComponent(workflowFile), {
      headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + token }
    });
    if (r.ok) { var j = await r.json(); return j.id; }
    r = await fetch("https://api.github.com/repos/" + repo + "/actions/workflows", {
      headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + token }
    });
    if (!r.ok) throw new Error("找不到 workflow");
    var all = await r.json();
    var list = all.workflows || [];
    for (var i = 0; i < list.length; i++) {
      var w = list[i];
      if (/decode/i.test(w.name || "") || /decode/i.test(w.path || "")) return w.id;
    }
    throw new Error("未发现 decode 工作流");
  }
  async function getLatestRun(token, id) {
    var url = "https://api.github.com/repos/" + repo + "/actions/workflows/" + id + "/runs?branch=" + encodeURIComponent(branch) + "&per_page=1";
    var r = await fetch(url, { headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + token } });
    if (!r.ok) throw new Error(r.status + " " + r.statusText);
    var j = await r.json();
    return (j.workflow_runs && j.workflow_runs[0]) || null;
  }
  async function pollRun(token, opt) {
    opt = opt || {};
    var interval = opt.interval || 5000;
    var timeout = opt.timeout || 180000;
    try {
      var wfId = await getWorkflowId(token);
      var start = Date.now();
      setWF("🟡 工作流已触发，正在运行…", "ok");
      while (Date.now() - start < timeout) {
        var run = await getLatestRun(token, wfId);
        if (run) {
          var url = run.html_url;
          var status = run.status;
          var conc = run.conclusion;
          if (status === "completed") {
            if (conc === "success") setWF("✅ 运行成功 → <a href=\"" + url + "\" target=\"_blank\">查看日志</a>", "ok");
            else setWF("❌ 运行失败（" + (conc || "unknown") + "） → <a href=\"" + url + "\" target=\"_blank\">查看日志</a>", "err");
            return conc || "completed";
          } else {
            var icon = (status === "queued") ? "🟨" : "🟡";
            setWF(icon + " " + status + "… → <a href=\"" + url + "\" target=\"_blank\">打开运行</a>", "ok");
          }
        } else {
          setWF("🕓 等待工作流队列…", "ok");
        }
        await new Promise(function (r) { return setTimeout(r, interval); });
      }
      setWF("⏱️ 等待超时（可手动打开运行查看）", "err");
      return "timeout";
    } catch (e) {
      setWF("⚠️ 无法查询工作流状态：" + e.message, "err");
      return "error";
    }
  }

  // ====== 关键修复点：自动把“文件/链接”的内容填进输入框 ======

  // A) 远端链接：点击按钮、按回车、或输入框失焦时自动拉取
  async function fetchUrlToTextarea() {
    var url = $("srcUrl").value.trim();
    if (!url) { setStatus("请填写链接", false); return; }
    try {
      setStatus("拉取中…");
      var r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status + " " + r.statusText);
      var text = await r.text();
      $("code").value = text;  // ★ 直接灌入输入框
      setStatus("已从链接填入输入框");
    } catch (e) {
      setStatus("拉取失败：" + e.message, false);
    }
  }
  $("btnLoadUrl").onclick = fetchUrlToTextarea;
  $("srcUrl").addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); fetchUrlToTextarea(); }
  });
  $("srcUrl").addEventListener("change", function () {
    // iOS Safari 有时按“完成”是 change 事件
    fetchUrlToTextarea();
  });

  // B) 本地文件：选择文件后立即读取并填入（不必再点按钮）
  $("srcFile").addEventListener("change", async function () {
    var input = $("srcFile");
    var file = input && input.files && input.files[0];
    if (!file) { setStatus("未选择文件", false); return; }
    try {
      setStatus("读取本地文件中…");
      var text = await file.text();
      $("code").value = text; // ★ 直接灌入输入框
      setStatus("已读取：" + file.name);
    } catch (e) {
      setStatus("读取失败：" + e.message, false);
    }
  });

  // 同时保留“读取本地文件 → 填入输入框”按钮（可不点）
  $("btnLoadFile").onclick = async function () {
    var input = $("srcFile");
    var file = input && input.files && input.files[0];
    if (!file) { setStatus("请先选择文件", false); return; }
    try {
      var text = await file.text();
      $("code").value = text;
      setStatus("已读取：" + file.name);
    } catch (e) { setStatus("读取失败：" + e.message, false); }
  };

  // ====== 提交 / 读取 / 复制 ======
  $("btnSubmit").onclick = async function () {
    var token = $("token").value.trim();
    var code = decodeEntities($("code").value);
    if (!token) { setStatus("需要 Token", false); return; }
    try {
      setStatus("提交中…");
      await upsert({ token: token, path: infile, content: code });
      setStatus("已写入 input.js，准备查询工作流状态…");
      pollRun(token); // 提交后自动轮询状态
    } catch (e) {
      setStatus("提交失败：" + e.message, false);
    }
  };

  $("btnRead").onclick = async function () {
    try {
      setStatus("读取中…");
      var txt = await readRaw(outfile);
      show(txt);
      setStatus("已读取 output.js");
    } catch (e) { setStatus("读取失败：" + e.message, false); }
  };

  $("btnCopyOut").onclick = async function () {
    try {
      await navigator.clipboard.writeText($("out").textContent || "");
      setStatus("已复制 output.js");
    } catch (e) {
      try {
        var r = document.createRange();
        r.selectNodeContents($("out"));
        var sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
        var ok = document.execCommand("copy");
        sel.removeAllRanges();
        setStatus(ok ? "已复制 output.js" : "复制失败（浏览器限制）", !!ok);
      } catch (err) { setStatus("复制失败：" + err.message, false); }
    }
  };
})();
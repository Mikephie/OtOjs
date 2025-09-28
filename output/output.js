// @license      MIT
(function () {
  'use strict';
  const STORAGE_KEYS = {
    GITHUB_TOKEN: 'github_pat_token',
    USER_INFO: 'github_user_info',
    FILE_HISTORY: 'github_file_history',
    USER_SETTINGS: 'github_user_settings',
    REMEMBER_TOKEN: 'github_remember_token',
    SELECTED_BRANCH: 'github_selected_branch',
    GISTS_PAGE: 'github_gists_page',
    GIT_URL_TYPE: 'github_git_url_type',
    EDITOR_POSITION: 'github_editor_position',
    EDITOR_SIZE: 'github_editor_size',
    GISTS_POSITION: 'github_gists_position',
    GISTS_SIZE: 'github_gists_size',
    WORKFLOWS_PAGE: 'github_workflows_page'
  };
  function utf8ToBase64(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
      return String.fromCharCode('0x' + p1);
    }));
  }
  function base64ToUtf8(str) {
    return decodeURIComponent(Array.prototype.map.call(atob(str), function (c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
  }
  function getDecodeRepo() {
    const userInfo = GM_getValue(STORAGE_KEYS.USER_INFO, {});
    const login = userInfo.login || 'Alex0510';
    return {
      owner: login,
      repo: 'decode',
      inputFile: 'input.js',
      outputFile: 'output.js'
    };
  }
  GM_addStyle(`
    .gh-panel {
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    
    .gh-panel-header {
      cursor: move;
    }
    
    .gh-resize-handle {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 24px;
      height: 24px;
      cursor: nwse-resize;
      z-index: 1000;
    }
    
    .gh-resize-handle::after {
      content: '';
      position: absolute;
      bottom: 6px;
      right: 6px;
      width: 12px;
      height: 12px;
      border-right: 2px solid #a0a0a0;
      border-bottom: 2px solid #a0a0a0;
    }
    
    /* Gists面板头部样式 */
    .gh-gists-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px;
      background: #2d2d2d;
      border-bottom: 1px solid #444;
    }
    
    .gh-gists-title {
      font-weight: bold;
      font-size: 16px;
      color: #e6e6e6;
    }
    
    .gh-gists-header-buttons {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    
    .gh-gists-close-btn {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 30px;
      height: 30px;
      color: #e6e6e6;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .gh-gists-close-btn:hover {
      color: #58a6ff;
    }
    
    @media (max-width: 768px) {
      .gh-panel {
        min-width: 280px !important;
        min-height: 180px !important;
      }
      
      .gh-resize-handle {
        width: 30px;
        height: 30px;
      }
      
      .gh-gists-header-buttons {
        flex-direction: column;
        gap: 5px;
      }
    }
    
    /* iOS特定优化 */
    .gh-ios-drag-active {
      background-color: rgba(0,0,0,0.1) !important;
    }
    
    .gh-ios-resize-active {
      background-color: rgba(0,0,0,0.1) !important;
    }

.gh-header-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 12px;
    font-size: 12px;
    border-radius: 6px;
    border: 1px solid rgba(0,0,0,0.1);
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .gh-header-btn:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }
  
  @media (max-width: 768px) {
    .gh-gists-header-buttons {
      flex-direction: column;
      gap: 5px;
    }
    
    .gh-header-btn {
      font-size: 11px;
      padding: 4px 8px;
    }
  }
   /* ========== Release检测样式 ========== */
    .gh-releases-loading,
    .gh-releases-message {
        padding: 40px;
        text-align: center;
        color: #586069;
    }
    
    .gh-releases-message.error {
        color: #cb2431;
    }
    
    .gh-releases-container {
        padding: 20px;
    }
    
    .gh-release-item {
        border: 1px solid #e1e4e8;
        border-radius: 6px;
        margin-bottom: 16px;
        background: #f6f8fa;
    }
    
    .gh-release-header {
        padding: 16px;
        border-bottom: 1px solid #e1e4e8;
        background: white;
        border-top-left-radius: 6px;
        border-top-right-radius: 6px;
    }
    
    .gh-release-title {
        margin: 0 0 8px 0;
        font-size: 18px;
        color: #24292e;
    }
    
    .gh-release-meta {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    .gh-release-date {
        color: #586069;
        font-size: 14px;
    }
    
    .gh-release-tag {
        font-size: 12px;
        padding: 2px 6px;
        border-radius: 12px;
        font-weight: 500;
    }
    
    .gh-release-tag.prerelease {
        background: #fcf8e3;
        color: #8a6d3b;
        border: 1px solid #faebcc;
    }
    
    .gh-release-tag.draft {
        background: #f8f9fa;
        color: #586069;
        border: 1px solid #e1e4e8;
    }
    
    .gh-release-body {
        padding: 16px;
        background: white;
        border-bottom: 1px solid #e1e4e8;
        color: #24292e;
        line-height: 1.5;
    }
    
    .gh-release-assets {
        padding: 16px;
        background: white;
        border-bottom-left-radius: 6px;
        border-bottom-right-radius: 6px;
    }
    
    .gh-release-assets h4 {
        margin: 0 0 12px 0;
        color: #24292e;
    }
    
    .gh-no-assets {
        color: #586069;
        font-style: italic;
        margin: 0;
    }
    
    .gh-assets-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    
    .gh-asset-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px;
        border-radius: 6px;
        border: 1px solid #e1e4e8;
    }
    
    .gh-asset-item.available {
        background: #f0fff4;
        border-color: #cbffd6;
    }
    
    .gh-asset-item.unavailable {
        background: #fff5f5;
        border-color: #ffd7d7;
    }
    
    .gh-asset-info {
        display: flex;
        flex-direction: column;
        flex: 1;
    }
    
    .gh-asset-name {
        font-weight: 500;
        color: #24292e;
    }
    
    .gh-asset-size {
        font-size: 12px;
        color: #586069;
    }
    
    .gh-asset-status {
        margin: 0 16px;
        font-size: 14px;
    }
    
    .gh-asset-item.available .gh-asset-status {
        color: #22863a;
    }
    
    .gh-asset-item.unavailable .gh-asset-status {
        color: #cb2431;
    }
    
    .gh-asset-actions {
        display: flex;
        gap: 8px;
    }
    
    .gh-download-btn,
    .gh-copy-btn {
        padding: 4px 8px;
        font-size: 12px;
        border: 1px solid;
        border-radius: 4px;
        cursor: pointer;
    }
    
    .gh-download-btn {
        background: #22863a;
        color: white;
        border-color: #22863a;
    }
    
    .gh-copy-btn {
        background: #fafbfc;
        color: #24292e;
        border-color: #e1e4e8;
    }
    
    .gh-retry-btn {
        padding: 8px 16px;
        background: #0366d6;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        margin-top: 12px;
    }
    
    @media (max-width: 768px) {
        .gh-asset-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
        }
        
        .gh-asset-status {
            margin: 0;
        }
        
        .gh-asset-actions {
            align-self: flex-end;
        }
    }
    
    /* 暗色模式适配 */
    [data-color-mode="dark"] .gh-release-item,
    [data-dark-theme] .gh-release-item {
        background: #161b22;
        border-color: #30363d;
    }
    
    [data-color-mode="dark"] .gh-release-header,
    [data-dark-theme] .gh-release-header {
        background: #0d1117;
        border-color: #30363d;
    }
    
    [data-color-mode="dark"] .gh-release-title,
    [data-dark-theme] .gh-release-title {
        color: #f0f6fc;
    }
    
    [data-color-mode="dark"] .gh-release-body,
    [data-dark-theme] .gh-release-body {
        background: #0d1117;
        border-color: #30363d;
        color: #f0f6fc;
    }
    
    [data-color-mode="dark"] .gh-release-assets,
    [data-dark-theme] .gh-release-assets {
        background: #0d1117;
        color: #f0f6fc;
    }
    
    [data-color-mode="dark"] .gh-release-assets h4,
    [data-dark-theme] .gh-release-assets h4 {
        color: #f0f6fc;
    }
    
    [data-color-mode="dark"] .gh-asset-item,
    [data-dark-theme] .gh-asset-item {
        background: #161b22;
        border-color: #30363d;
    }
    
    [data-color-mode="dark"] .gh-asset-item.available,
    [data-dark-theme] .gh-asset-item.available {
        background: rgba(35, 134, 54, 0.1);
        border-color: rgba(35, 134, 54, 0.4);
    }
    
    [data-color-mode="dark"] .gh-asset-item.unavailable,
    [data-dark-theme] .gh-asset-item.unavailable {
        background: rgba(203, 36, 49, 0.1);
        border-color: rgba(203, 36, 49, 0.4);
    }
    
    [data-color-mode="dark"] .gh-asset-name,
    [data-dark-theme] .gh-asset-name {
        color: #f0f6fc;
    }
    
    [data-color-mode="dark"] .gh-copy-btn,
    [data-dark-theme] .gh-copy-btn {
        background: #21262d;
        color: #f0f6fc;
        border-color: #30363d;
    }
  `);
  function isIOS() {
    return ['iPad Simulator', 'iPhone Simulator', 'iPod Simulator', 'iPad', 'iPhone', 'iPod'].includes(navigator.platform) || navigator.userAgent.includes("Mac") && "ontouchend" in document;
  }
  function isDarkMode() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return true;
    }
    const html = document.documentElement;
    if (html.getAttribute('data-color-mode') === 'dark' || html.getAttribute('data-dark-theme') || html.classList.contains('dark') || document.body.classList.contains('dark')) {
      return true;
    }
    if (/(Mac|iPhone|iPod|iPad)/i.test(navigator.platform)) {
      try {
        const computedStyle = window.getComputedStyle(document.documentElement);
        const bgColor = computedStyle.backgroundColor;
        const color = computedStyle.color;
        const rgb = bgColor.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          const r = parseInt(rgb[0]),
            g = parseInt(rgb[1]),
            b = parseInt(rgb[2]);
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
          if (brightness < 128) return true;
        }
      } catch (e) {}
    }
    return false;
  }
  function getAdaptiveColors() {
    const darkMode = isDarkMode();
    return {
      bgPrimary: darkMode ? '#1a1a1a' : '#fff',
      bgSecondary: darkMode ? '#2d2d2d' : '#f6f8fa',
      border: darkMode ? '#444' : '#d0d7de',
      textPrimary: darkMode ? '#e6e6e6' : '#24292f',
      textSecondary: darkMode ? '#a0a0a0' : '#586069',
      buttonBg: darkMode ? '#2ea44f' : '#2ea44f',
      buttonText: '#fff',
      hoverBg: darkMode ? '#333' : '#f3f4f6',
      shadow: darkMode ? '0 4px 20px rgba(0,0,0,0.3)' : '0 4px 20px rgba(0,0,0,0.15)',
      link: darkMode ? '#58a6ff' : '#0366d6'
    };
  }
  function addDragAndResizeFunctionality(panel, storageKeyPrefix) {
    if (!panel) return;
    const colors = getAdaptiveColors();
    const header = panel.querySelector('h3') || panel.querySelector('.gh-gists-title') || panel.querySelector('div:first-child');
    if (!header) return;
    panel.classList.add('gh-panel');
    header.classList.add('gh-panel-header');
    const savedPosition = GM_getValue(storageKeyPrefix + '_POSITION');
    const savedSize = GM_getValue(storageKeyPrefix + '_SIZE');
    if (savedPosition) {
      panel.style.left = savedPosition.left + 'px';
      panel.style.top = savedPosition.top + 'px';
      panel.style.transform = 'none';
    }
    if (savedSize) {
      panel.style.width = savedSize.width + 'px';
      panel.style.height = savedSize.height + 'px';
    }
    panel.style.position = 'fixed';
    if (!savedPosition) {
      panel.style.left = '50%';
      panel.style.top = '50%';
      panel.style.transform = 'translate(-50%, -50%)';
    }
    if (storageKeyPrefix === 'GIT_URL_DIALOG') {
      panel.style.minWidth = isIOS() ? '280px' : '400px';
      panel.style.minHeight = isIOS() ? '200px' : '250px';
      panel.style.maxWidth = isIOS() ? '400px' : '600px';
      panel.style.maxHeight = isIOS() ? '300px' : '400px';
    } else {
      panel.style.minWidth = '300px';
      panel.style.minHeight = '200px';
    }
    let isDragging = false;
    let isResizing = false;
    let startX, startY, initialLeft, initialTop;
    let startWidth, startHeight;
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'gh-resize-handle';
    resizeHandle.innerHTML = `
        <svg width="24" height="24" style="position:absolute; bottom:0; right:0;">
            <path d="M24 0L0 24L24 24Z" 
                  fill="${colors.textSecondary}"/>
        </svg>
    `;
    panel.appendChild(resizeHandle);
    panel.style.resize = 'none';
    header.addEventListener('mousedown', startDrag);
    resizeHandle.addEventListener('mousedown', startResize);
    header.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        startDrag(e.touches[0]);
        if (isIOS()) {
          header.classList.add('gh-ios-drag-active');
        }
        e.preventDefault();
      }
    }, {
      passive: false
    });
    resizeHandle.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2 || isIOS() && e.touches.length === 1) {
        startResize(e.touches[0]);
        if (isIOS()) {
          resizeHandle.classList.add('gh-ios-resize-active');
        }
        e.preventDefault();
      }
    }, {
      passive: false
    });
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchmove', function (e) {
      if (isDragging || isResizing) {
        if (e.touches.length === 1) {
          onDragMove(e.touches[0]);
          e.preventDefault();
        }
      }
    }, {
      passive: false
    });
    document.addEventListener('touchend', stopDrag);
    document.addEventListener('touchcancel', stopDrag);
    function startDrag(e) {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      panel.style.transform = 'none';
      panel.style.left = initialLeft + 'px';
      panel.style.top = initialTop + 'px';
    }
    function startResize(e) {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = parseInt(document.defaultView.getComputedStyle(panel).width, 10);
      startHeight = parseInt(document.defaultView.getComputedStyle(panel).height, 10);
    }
    function onDragMove(e) {
      if (isDragging) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newLeft = initialLeft + dx;
        const newTop = initialTop + dy;
        const maxLeft = window.innerWidth - 50;
        const maxTop = window.innerHeight - 50;
        panel.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
        panel.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
      }
      if (isResizing) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const minWidth = storageKeyPrefix === 'GIT_URL_DIALOG' && isIOS() ? 280 : 300;
        const minHeight = storageKeyPrefix === 'GIT_URL_DIALOG' && isIOS() ? 200 : 200;
        panel.style.width = Math.max(minWidth, startWidth + dx) + 'px';
        panel.style.height = Math.max(minHeight, startHeight + dy) + 'px';
      }
    }
    function stopDrag() {
      if (isDragging) {
        const left = parseInt(panel.style.left, 10);
        const top = parseInt(panel.style.top, 10);
        GM_setValue(storageKeyPrefix + '_POSITION', {
          left,
          top
        });
      }
      if (isResizing) {
        const width = parseInt(panel.style.width, 10);
        const height = parseInt(panel.style.height, 10);
        GM_setValue(storageKeyPrefix + '_SIZE', {
          width,
          height
        });
      }
      isDragging = false;
      isResizing = false;
      header.classList.remove('gh-ios-drag-active');
      resizeHandle.classList.remove('gh-ios-resize-active');
    }
    if (isIOS()) {
      let lastTap = 0;
      header.addEventListener('touchend', function (e) {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        if (tapLength < 300 && tapLength > 0) {
          panel.style.left = '50%';
          panel.style.top = '50%';
          panel.style.transform = 'translate(-50%, -50%)';
          if (storageKeyPrefix === 'GIT_URL_DIALOG') {
            panel.style.width = '80%';
            panel.style.height = 'auto';
          } else {
            panel.style.width = '80%';
            panel.style.height = '80%';
          }
          GM_setValue(storageKeyPrefix + '_POSITION', null);
          GM_setValue(storageKeyPrefix + '_SIZE', null);
          e.preventDefault();
        }
        lastTap = currentTime;
      });
    }
  }
  function copyToClipboard(text) {
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(text);
        safeNotify('已复制', text);
        return;
      }
    } catch (e) {}
    if (isIOSDevice) {
      copyToClipboardIOS(text);
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        safeNotify('已复制', text);
      }).catch(() => {
        fallbackCopy(text);
      });
      return;
    }
    fallbackCopy(text);
  }
  function copyToClipboardIOS(text) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.top = 0;
      textarea.style.left = 0;
      textarea.style.width = '1px';
      textarea.style.height = '1px';
      textarea.style.opacity = 0;
      textarea.style.pointerEvents = 'none';
      textarea.style.userSelect = 'text';
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (successful) {
        safeNotify('已复制', text);
      } else {
        showManualCopyPrompt(text);
      }
    } catch (err) {
      console.error('iOS复制失败:', err);
      showManualCopyPrompt(text);
    }
  }
  function showManualCopyPrompt(text) {
    const colors = getAdaptiveColors();
    const prompt = document.createElement('div');
    prompt.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: ${colors.bgPrimary};
        color: ${colors.textPrimary};
        border: 1px solid ${colors.border};
        border-radius: 8px;
        padding: 20px;
        z-index: 2147483647;
        box-shadow: ${colors.shadow};
        max-width: 90%;
        width: 400px;
    `;
    prompt.innerHTML = `
        <h3 style="margin-top: 0; color: ${colors.textPrimary};">手动复制</h3>
        <p style="color: ${colors.textSecondary}; margin-bottom: 15px;">iOS限制自动复制功能，请手动选择并复制以下文本：</p>
        <textarea 
            id="ios-copy-text" 
            style="width: 100%; height: 100px; padding: 10px; border: 1px solid ${colors.border}; border-radius: 4px; background: ${colors.bgSecondary}; color: ${colors.textPrimary}; margin-bottom: 15px; resize: vertical;"
        >${text}</textarea>
        <div style="display: flex; justify-content: flex-end;">
            <button id="ios-copy-close" style="padding: 8px 16px; background: ${colors.buttonBg}; color: ${colors.buttonText}; border: none; border-radius: 4px; cursor: pointer;">关闭</button>
        </div>
    `;
    document.body.appendChild(prompt);
    const textarea = document.getElementById('ios-copy-text');
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    document.getElementById('ios-copy-close').addEventListener('click', () => {
      document.body.removeChild(prompt);
    });
    prompt.addEventListener('click', e => {
      if (e.target === prompt) {
        document.body.removeChild(prompt);
      }
    });
  }
  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) {
        safeNotify('已复制', text);
      } else {
        showManualCopyPrompt(text);
      }
    } catch (e) {
      showManualCopyPrompt(text);
    }
  }
  function safeNotify(title, text) {
    try {
      GM_notification({
        title: title,
        text: text,
        timeout: 2000
      });
    } catch (e) {
      try {
        console.log(title + ': ' + text);
      } catch (_) {}
    }
  }
  function makeLink(href, text) {
    const colors = getAdaptiveColors();
    var el = document.createElement('a');
    el.href = href;
    el.textContent = text;
    el.style.display = 'inline-block';
    el.style.margin = '6px 8px 0 0';
    el.style.textDecoration = 'underline';
    el.style.color = colors.link;
    el.target = '_blank';
    return el;
  }
  function makeBtn(text, onclick, title = '') {
    const colors = getAdaptiveColors();
    var btn = document.createElement('button');
    btn.textContent = text;
    btn.title = title;
    btn.style.margin = '6px 8px 0 0';
    btn.style.padding = '6px 12px';
    btn.style.fontSize = '12px';
    btn.style.background = colors.buttonBg;
    btn.style.color = colors.buttonText;
    btn.style.border = '1px solid rgba(0,0,0,0.1)';
    btn.style.borderRadius = '6px';
    btn.style.cursor = 'pointer';
    btn.style.minWidth = '100px';
    btn.style.textAlign = 'center';
    btn.style.boxSizing = 'border-box';
    btn.style.height = '32px';
    btn.addEventListener('click', onclick);
    return btn;
  }
  function filterFiles(searchTerm) {
    const fileItems = document.querySelectorAll('.gh-file-checkbox');
    const colors = getAdaptiveColors();
    fileItems.forEach(checkbox => {
      const fileItem = checkbox.closest('div');
      const fileName = fileItem.querySelector('span:nth-child(3)').textContent;
      const title = fileItem.querySelector('span:nth-child(3)').getAttribute('title');
      if (fileName.toLowerCase().includes(searchTerm.toLowerCase()) || title && title.toLowerCase().includes(searchTerm.toLowerCase())) {
        fileItem.style.display = 'flex';
      } else {
        fileItem.style.display = 'none';
      }
    });
  }
  function toggleSelectAll() {
    const visibleFileCheckboxes = document.querySelectorAll('.gh-file-checkbox:not([style*="display: none"])');
    const selectAllBtn = document.querySelector('button[onclick="toggleSelectAll()"]');
    if (visibleFileCheckboxes.length === 0) return;
    const allChecked = Array.from(visibleFileCheckboxes).every(checkbox => checkbox.checked);
    visibleFileCheckboxes.forEach(checkbox => {
      checkbox.checked = !allChecked;
    });
    if (selectAllBtn) {
      selectAllBtn.textContent = allChecked ? '全选' : '取消全选';
    }
  }
  function getDefaultBranch() {
    var el = document.querySelector('meta[name="octolytics-dimension-repository_default_branch"]');
    return el && el.getAttribute('content') || 'main';
  }
  function getCurrentBranchFromDOM() {
    const selectors = ['a[data-hotkey="w"]', 'button[data-hotkey="w"]', '[data-test-selector="branch-name"]', '.branch-name', 'span[title="Branch"]', 'details[data-overlay-details-reference-id] summary', 'a[data-tab-item="code"] .css-truncate-target'];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        let text = el.textContent.trim();
        text = text.replace(/^Branch:\s*/i, '').replace(/\s*\(.*\)$/, '').replace(/^.*\//, '').replace(/^\s+|\s+$/g, '');
        if (text && text !== 'master' && text !== 'main') {
          console.log('Found branch from DOM:', text);
          return text;
        }
      }
    }
    const path = window.location.pathname.split('/');
    if (path.length > 4 && path[2] === 'blob') {
      const potentialBranch = path.slice(3, -1).join('/');
      console.log('Extracted branch from URL:', potentialBranch);
      return potentialBranch;
    }
    console.log('Could not determine branch, using default');
    return getDefaultBranch();
  }
  function getRepoInfo() {
    var path = location.pathname.split('/').filter(Boolean);
    if (path.length < 2) return {};
    var owner = path[0];
    var repo = path[1];
    var branch = getDefaultBranch();
    var filePath = '';
    if (path.length === 2) {
      branch = getCurrentBranchFromDOM() || getDefaultBranch();
    } else if (path[2] === 'tree') {
      branch = path[3] || '';
      filePath = path.slice(4).join('/');
    } else if (path[2] === 'blob') {
      branch = path[3] || '';
      filePath = path.slice(4).join('/');
    } else {
      branch = getCurrentBranchFromDOM() || getDefaultBranch();
    }
    return {
      owner,
      repo,
      branch,
      filePath
    };
  }
  function isForkRepository() {
    const forkIndicator = document.querySelector('[title="Fork"]') || document.querySelector('.fork-flag') || document.querySelector('span.text-bold[aria-label="Fork"]');
    const metaFork = document.querySelector('meta[property="og:description"]');
    if (metaFork && metaFork.content && metaFork.content.includes('forked from')) {
      return true;
    }
    const pageText = document.body.textContent;
    if (pageText.includes('forked from') || pageText.includes('Forked from')) {
      return true;
    }
    return !!forkIndicator;
  }
  function getParentRepoInfo() {
    try {
      const parentLink = document.querySelector('a[data-hovercard-type="repository"]');
      if (parentLink && parentLink.href) {
        const urlParts = parentLink.href.split('/').filter(Boolean);
        if (urlParts.length >= 2) {
          return {
            owner: urlParts[urlParts.length - 2],
            repo: urlParts[urlParts.length - 1]
          };
        }
      }
      const metaDesc = document.querySelector('meta[property="og:description"]');
      if (metaDesc && metaDesc.content) {
        const match = metaDesc.content.match(/forked from ([^/]+)\/([^)]+)/);
        if (match && match.length >= 3) {
          return {
            owner: match[1],
            repo: match[2]
          };
        }
      }
    } catch (e) {
      console.error('获取父仓库信息失败:', e);
    }
    return null;
  }
  function getGitHubToken() {
    return GM_getValue(STORAGE_KEYS.GITHUB_TOKEN, '');
  }
  function setGitHubToken(token, remember = false) {
    GM_setValue(STORAGE_KEYS.GITHUB_TOKEN, token);
    GM_setValue(STORAGE_KEYS.REMEMBER_TOKEN, remember);
  }
  function clearGitHubToken() {
    GM_deleteValue(STORAGE_KEYS.GITHUB_TOKEN);
    GM_deleteValue(STORAGE_KEYS.USER_INFO);
    GM_deleteValue(STORAGE_KEYS.USER_SETTINGS);
    GM_setValue(STORAGE_KEYS.REMEMBER_TOKEN, false);
  }
  function isAuthenticated() {
    const token = getGitHubToken();
    const remember = GM_getValue(STORAGE_KEYS.REMEMBER_TOKEN, false);
    return !!token && remember;
  }
  function getAuthHeaders() {
    const token = getGitHubToken();
    return token ? {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    } : {
      'Accept': 'application/vnd.github.v3+json'
    };
  }
  function getEnhancedAuthHeaders() {
    const token = getGitHubToken();
    return token ? {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'GitHub-Rescue-Script'
    } : {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitHub-Rescue-Script'
    };
  }
  async function verifyToken(token) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        const userData = await response.json();
        GM_setValue(STORAGE_KEYS.USER_INFO, userData);
        return {
          success: true,
          user: userData
        };
      } else {
        return {
          success: false,
          error: `Token验证失败: ${response.status} ${response.statusText}`
        };
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'Token验证超时，请检查网络连接'
        };
      }
      return {
        success: false,
        error: error.message
      };
    }
  }
  function createAuthDialog() {
    const dialogId = '__gh_auth_dialog__';
    if (document.getElementById(dialogId)) return document.getElementById(dialogId);
    const colors = getAdaptiveColors();
    const dialog = document.createElement('div');
    dialog.id = dialogId;
    dialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 420px;
      background: ${colors.bgPrimary};
      color: ${colors.textPrimary};
      z-index: 2147483647;
      border: 1px solid ${colors.border};
      box-shadow: ${colors.shadow};
      border-radius: 8px;
      padding: 18px;
      display: none;
    `;
    const title = document.createElement('h3');
    title.textContent = 'GitHub 认证';
    title.style.marginTop = '0';
    title.style.color = colors.textPrimary;
    const desc = document.createElement('p');
    desc.innerHTML = "需要 GitHub Personal Access Token 来保存文件修改。<br>1. 前往 <a href=\"https://github.com/settings/tokens\" target=\"_blank\" style=\"color: " + colors.link + ';">GitHub Tokens</a><br>' + '2. 生成新 Token（需要 repo 权限）请勿泄露个人token信息，避免删库，概不负责';
    desc.style.color = colors.textSecondary;
    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = '输入 GitHub Personal Access Token';
    input.style.cssText = `
      width: 100%;
      padding: 8px;
      margin: 10px 0;
      border: 1px solid ${colors.border};
      border-radius: 4px;
      box-sizing: border-box;
      background: ${colors.bgSecondary};
      color: ${colors.textPrimary};
    `;
    const rememberContainer = document.createElement('div');
    rememberContainer.style.cssText = `display: flex; align-items: center; margin: 8px 0;`;
    const rememberCheckbox = document.createElement('input');
    rememberCheckbox.type = 'checkbox';
    rememberCheckbox.id = '__gh_remember_me__';
    rememberCheckbox.checked = GM_getValue(STORAGE_KEYS.REMEMBER_TOKEN, true);
    const rememberLabel = document.createElement('label');
    rememberLabel.htmlFor = '__gh_remember_me__';
    rememberLabel.textContent = '记住我';
    rememberLabel.style.marginLeft = '8px';
    rememberLabel.style.color = colors.textSecondary;
    rememberContainer.appendChild(rememberCheckbox);
    rememberContainer.appendChild(rememberLabel);
    const buttonGroup = document.createElement('div');
    buttonGroup.style.cssText = `display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px;`;
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = `padding: 6px 12px; background: ${colors.bgSecondary}; color: ${colors.textPrimary}; border: 1px solid ${colors.border}; border-radius: 6px; cursor: pointer; height: 32px; min-width: 80px;`;
    cancelBtn.onclick = () => hideAuthDialog();
    const submitBtn = document.createElement('button');
    submitBtn.textContent = '验证';
    submitBtn.style.cssText = `padding: 6px 12px; background: ${colors.buttonBg}; color: ${colors.buttonText}; border: none; border-radius: 6px; cursor: pointer; height: 32px; min-width: 80px;`;
    submitBtn.onclick = async () => {
      const token = input.value.trim();
      if (!token) {
        alert('请输入 GitHub Token');
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = '验证中...';
      const result = await verifyToken(token);
      if (result.success) {
        const remember = rememberCheckbox.checked;
        setGitHubToken(token, remember);
        hideAuthDialog();
        safeNotify('认证成功', `已登录为: ${result.user.login}`);
        updateUIWithAuthStatus();
      } else {
        alert(`认证失败: ${result.error}`);
        submitBtn.disabled = false;
        submitBtn.textContent = '验证';
      }
    };
    buttonGroup.appendChild(cancelBtn);
    buttonGroup.appendChild(submitBtn);
    dialog.appendChild(title);
    dialog.appendChild(desc);
    dialog.appendChild(input);
    dialog.appendChild(rememberContainer);
    dialog.appendChild(buttonGroup);
    document.documentElement.appendChild(dialog);
    addDragAndResizeFunctionality(dialog, 'AUTH_DIALOG');
    return dialog;
  }
  function showAuthDialog() {
    const dialog = document.getElementById('__gh_auth_dialog__') || createAuthDialog();
    dialog.style.display = 'block';
    const input = dialog.querySelector('input[type="password"]');
    const rememberCheckbox = dialog.querySelector('#__gh_remember_me__');
    const remember = GM_getValue(STORAGE_KEYS.REMEMBER_TOKEN, false);
    const savedToken = GM_getValue(STORAGE_KEYS.GITHUB_TOKEN, '');
    if (remember && savedToken) {
      input.value = savedToken;
    } else {
      input.value = '';
    }
    rememberCheckbox.checked = remember;
    input.focus();
  }
  function hideAuthDialog() {
    const dialog = document.getElementById('__gh_auth_dialog__');
    if (dialog) dialog.style.display = 'none';
  }
  function saveFileLocally_general(content, filename) {
    try {
      const blob = new Blob([content], {
        type: 'text/plain;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename && filename.split('/').pop() || 'download.txt';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 3000);
      const history = GM_getValue(STORAGE_KEYS.FILE_HISTORY, []);
      history.unshift({
        filename: filename,
        content: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
        timestamp: new Date().toISOString(),
        size: content.length
      });
      GM_setValue(STORAGE_KEYS.FILE_HISTORY, history.slice(0, 10));
      return true;
    } catch (err) {
      console.error('本地保存失败', err);
      return false;
    }
  }
  async function fetchAllBranches(owner, repo) {
    try {
      var apiUrl = `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`;
      var res = await fetch(apiUrl, {
        credentials: 'omit',
        headers: isAuthenticated() ? getAuthHeaders() : {
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      var data = await res.json();
      return data.map(b => b.name);
    } catch (e) {
      console.warn('获取分支失败:', e);
      return [];
    }
  }
  function createEditor() {
    const editorId = '__gh_editor_modal__';
    if (document.getElementById(editorId)) return;
    const colors = getAdaptiveColors();
    const modal = document.createElement('div');
    modal.id = editorId;
    modal.style.cssText = `
      position: fixed;
      width: 80%;
      height: 80%;
      background: ${colors.bgPrimary};
      color: ${colors.textPrimary};
      z-index: 2147483647;
      border: 1px solid ${colors.border};
      box-shadow: ${colors.shadow};
      display: none;
      flex-direction: column;
      border-radius: 8px;
      overflow: hidden;
    `;
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 10px;
      background: ${colors.bgSecondary};
      border-bottom: 1px solid ${colors.border};
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    const title = document.createElement('span');
    title.id = '__gh_editor_title__';
    title.textContent = 'GitHub 文件编辑器';
    title.style.fontWeight = 'bold';
    title.style.color = colors.textPrimary;
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `background: none; border: none; font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px; color: ${colors.textPrimary};`;
    closeBtn.onclick = () => hideEditor();
    header.appendChild(title);
    header.appendChild(closeBtn);
    const editorArea = document.createElement('textarea');
    editorArea.id = '__gh_editor_textarea__';
    editorArea.style.cssText = `
      flex: 1; 
      padding: 12px; 
      border: none; 
      resize: none; 
      font-family: monospace; 
      font-size: 14px;
      background: ${colors.bgPrimary};
      color: ${colors.textPrimary};
    `;
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 10px; 
      background: ${colors.bgSecondary}; 
      border-top: 1px solid ${colors.border}; 
      display: flex; 
      flex-direction: column;
      gap: 10px;
    `;
    const status = document.createElement('div');
    status.id = '__gh_editor_status__';
    status.style.fontSize = '12px';
    status.style.color = colors.textSecondary;
    status.style.width = '100%';
    const buttonGroup = document.createElement('div');
    buttonGroup.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      width: 100%;
      flex-wrap: wrap;
    `;
    const saveLocalBtn = makeBtn('💾 保存到本地', () => saveCurrentEditorFileLocally(), '保存文件到本地设备');
    const saveGithubBtn = makeBtn('🚀 保存到GitHub', () => saveFileToGitHub(), '保存文件到GitHub仓库');
    const saveGistBtn = makeBtn('💾 保存到Gist', () => {
      const modal = document.getElementById('__gh_editor_modal__');
      if (modal && modal.dataset.editMode === 'gist') {
        saveGistFile(modal.dataset.gistId, modal.dataset.filename, document.getElementById('__gh_editor_textarea__').value);
      }
    }, '保存文件到Gist');
    const cancelBtn = makeBtn('取消', () => hideEditor(), '关闭编辑器');
    const buttonStyle = {
      margin: '0',
      padding: '8px 12px',
      fontSize: '12px',
      minWidth: '120px',
      textAlign: 'center',
      boxSizing: 'border-box',
      height: '32px'
    };
    Object.assign(saveLocalBtn.style, buttonStyle);
    Object.assign(saveGithubBtn.style, buttonStyle);
    Object.assign(saveGistBtn.style, buttonStyle);
    Object.assign(cancelBtn.style, buttonStyle);
    saveGistBtn.style.display = 'none';
    saveGithubBtn.originalOnclick = saveGithubBtn.onclick;
    saveGithubBtn.originalText = saveGithubBtn.textContent;
    saveGistBtn.originalOnclick = saveGistBtn.onclick;
    saveGistBtn.originalText = saveGistBtn.textContent;
    buttonGroup.appendChild(saveLocalBtn);
    buttonGroup.appendChild(saveGithubBtn);
    buttonGroup.appendChild(saveGistBtn);
    buttonGroup.appendChild(cancelBtn);
    [saveLocalBtn, saveGithubBtn, cancelBtn].forEach(btn => {
      btn.style.margin = '0';
      btn.style.padding = '8px 12px';
      btn.style.fontSize = '8px';
      btn.style.minWidth = '90px';
    });
    saveGithubBtn.style.background = colors.buttonBg;
    saveGithubBtn.style.color = colors.buttonText;
    buttonGroup.appendChild(saveLocalBtn);
    buttonGroup.appendChild(saveGithubBtn);
    buttonGroup.appendChild(cancelBtn);
    footer.appendChild(status);
    footer.appendChild(buttonGroup);
    modal.appendChild(header);
    modal.appendChild(editorArea);
    modal.appendChild(footer);
    document.documentElement.appendChild(modal);
    addDragAndResizeFunctionality(modal, 'EDITOR');
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.style.display === 'flex') hideEditor();
    });
    editorArea.addEventListener('input', updateEditorStatus);
  }
  function showEditor(content, filename, options = {}) {
    const modal = document.getElementById('__gh_editor_modal__');
    const textarea = document.getElementById('__gh_editor_textarea__');
    const title = document.getElementById('__gh_editor_title__');
    if (!modal || !textarea || !title) return;
    title.textContent = options.isGist ? `编辑Gist: ${filename}` : `编辑: ${filename}`;
    textarea.value = content;
    modal.style.display = 'flex';
    textarea.focus();
    updateEditorStatus();
    modal.dataset.editMode = options.isGist ? 'gist' : 'file';
    const buttons = modal.querySelectorAll('button');
    let saveGithubBtn = null;
    let saveGistBtn = null;
    let saveLocalBtn = null;
    let cancelBtn = null;
    for (const btn of buttons) {
      if (btn.textContent.includes('保存到GitHub')) {
        saveGithubBtn = btn;
      } else if (btn.textContent.includes('保存到Gist')) {
        saveGistBtn = btn;
      } else if (btn.textContent.includes('保存到本地')) {
        saveLocalBtn = btn;
      } else if (btn.textContent.includes('取消')) {
        cancelBtn = btn;
      }
    }
    if (options.isGist) {
      modal.dataset.editMode = 'gist';
      modal.dataset.gistId = options.gistId;
      modal.dataset.filename = filename;
      if (saveGithubBtn) saveGithubBtn.style.display = 'none';
      if (saveGistBtn) saveGistBtn.style.display = 'inline-block';
      if (saveLocalBtn) saveLocalBtn.style.display = 'inline-block';
      if (cancelBtn) cancelBtn.style.display = 'inline-block';
      const buttonWidth = '120px';
      if (saveGistBtn) saveGistBtn.style.minWidth = buttonWidth;
      if (saveLocalBtn) saveLocalBtn.style.minWidth = buttonWidth;
      if (cancelBtn) cancelBtn.style.minWidth = buttonWidth;
    } else {
      modal.dataset.filename = filename;
      if (saveGithubBtn) saveGithubBtn.style.display = 'inline-block';
      if (saveGistBtn) saveGistBtn.style.display = 'none';
      if (saveLocalBtn) saveLocalBtn.style.display = 'inline-block';
      if (cancelBtn) cancelBtn.style.display = 'inline-block';
      const buttonWidth = '120px';
      if (saveGithubBtn) saveGithubBtn.style.minWidth = buttonWidth;
      if (saveLocalBtn) saveLocalBtn.style.minWidth = buttonWidth;
      if (cancelBtn) cancelBtn.style.minWidth = buttonWidth;
    }
  }
  function createFallbackSaveButton(modal, mode) {
    const footer = modal.querySelector('div').lastElementChild;
    if (!footer) return;
    const colors = getAdaptiveColors();
    const saveBtn = document.createElement('button');
    if (mode === 'gist') {
      saveBtn.textContent = '💾 保存到Gist';
      saveBtn.onclick = function () {
        const textarea = document.getElementById('__gh_editor_textarea__');
        saveGistFile(modal.dataset.gistId, modal.dataset.filename, textarea.value);
      };
    } else {
      saveBtn.textContent = '🚀 保存到GitHub';
      saveBtn.onclick = function () {
        saveFileToGitHub();
      };
    }
    saveBtn.style.cssText = `
        margin: 6px 8px 0 0;
        padding: 6px 12px;
        font-size: 12px;
        background: ${colors.buttonBg};
        color: ${colors.buttonText};
        border: 1px solid rgba(0,0,0,0.1);
        border-radius: 6px;
        cursor: pointer;
        min-width: 100px;
        text-align: center;
        box-sizing: border-box;
        height: 32px;
    `;
    footer.insertBefore(saveBtn, footer.firstChild);
  }
  function updateEditorStatus() {
    const textarea = document.getElementById('__gh_editor_textarea__');
    const status = document.getElementById('__gh_editor_status__');
    if (!textarea || !status) return;
    const content = textarea.value;
    const lineCount = content.split('\n').length;
    const charCount = content.length;
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    status.textContent = `行数: ${lineCount} | 字符: ${charCount} | 单词: ${wordCount}`;
  }
  function hideEditor() {
    const modal = document.getElementById('__gh_editor_modal__');
    if (modal) {
      const buttons = modal.querySelectorAll('button');
      buttons.forEach(btn => {
        if (btn.originalOnclick) {
          btn.onclick = btn.originalOnclick;
          btn.textContent = btn.originalText;
          btn.style.display = 'inline-block';
        }
      });
      delete modal.dataset.editMode;
      delete modal.dataset.gistId;
      delete modal.dataset.filename;
      modal.style.display = 'none';
    }
  }
  async function loadFileForEditing() {
    const info = getRepoInfo();
    if (!info.filePath) {
      alert('当前页面不是文件页面');
      return;
    }
    const selectedBranch = GM_getValue(STORAGE_KEYS.SELECTED_BRANCH, info.branch);
    info.branch = selectedBranch;
    try {
      const encodedFilePath = encodeURIComponent(info.filePath);
      const apiUrl = `https://api.github.com/repos/${info.owner}/${info.repo}/contents/${encodedFilePath}?ref=${info.branch}`;
      console.log('API URL:', apiUrl);
      const response = await fetch(apiUrl, {
        headers: isAuthenticated() ? getEnhancedAuthHeaders() : {}
      });
      console.log('Response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error('无法获取文件内容: ' + response.status + ' - ' + errorText);
      }
      const fileData = await response.json();
      const content = atob(fileData.content.replace(/\s/g, ''));
      showEditor(content, info.filePath.split('/').pop());
    } catch (error) {
      console.error('加载文件失败:', error);
      let errorMessage = '加载文件失败: ' + error.message;
      if (error.message.includes('404')) {
        errorMessage += '\n可能的原因:\n1. 文件不存在\n2. 您没有该文件的访问权限\n3. 分支名称不正确';
      } else if (error.message.includes('403')) {
        errorMessage += '\n您可能没有权限访问该文件，请检查GitHub Token权限';
      }
      alert(errorMessage);
    }
  }
  function saveCurrentEditorFileLocally() {
    const modal = document.getElementById('__gh_editor_modal__');
    const textarea = document.getElementById('__gh_editor_textarea__');
    if (!modal || !textarea) {
      alert('没有可保存的文件内容');
      return;
    }
    const content = textarea.value;
    const filename = modal.dataset.filename || 'unknown.txt';
    if (saveFileLocally_general(content, filename)) {
      safeNotify('保存成功', `文件已保存到本地: ${filename}`);
    } else {
      alert('保存到本地失败');
    }
  }
  async function saveFileToGitHub() {
    const modal = document.getElementById('__gh_editor_modal__');
    if (modal && modal.dataset.editMode === 'gist') {
      alert('当前处于Gist编辑模式，请使用"保存到Gist"按钮');
      return;
    }
    const info = getRepoInfo();
    const textarea = document.getElementById('__gh_editor_textarea__');
    if (!info.filePath || !textarea) return;
    if (!isAuthenticated()) {
      alert('请先进行 GitHub 认证才能保存文件');
      showAuthDialog();
      return;
    }
    const newContent = textarea.value;
    const filename = info.filePath.split('/').pop();
    try {
      let sha = null;
      try {
        const fileInfoUrl = `https://api.github.com/repos/${info.owner}/${info.repo}/contents/${info.filePath}?ref=${info.branch}`;
        const fileInfoResponse = await fetch(fileInfoUrl, {
          headers: getAuthHeaders()
        });
        if (fileInfoResponse.ok) {
          const fileInfo = await fileInfoResponse.json();
          sha = fileInfo.sha;
        }
      } catch (e) {
        console.log('获取文件SHA失败（可能是新文件）:', e);
      }
      const commitUrl = `https://api.github.com/repos/${info.owner}/${info.repo}/contents/${info.filePath}`;
      const commitData = {
        message: `Update ${filename} via GitHub Editor`,
        content: utf8ToBase64(newContent),
        branch: info.branch
      };
      if (sha) commitData.sha = sha;
      const commitResponse = await fetch(commitUrl, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(commitData)
      });
      if (commitResponse.ok) {
        const result = await commitResponse.json();
        safeNotify('保存成功', `文件已保存到 GitHub`);
        setTimeout(() => location.reload(), 800);
        hideEditor();
      } else {
        const error = await commitResponse.text();
        throw new Error(`GitHub API错误: ${commitResponse.status} - ${error}`);
      }
    } catch (error) {
      console.error('保存到GitHub失败:', error);
      alert('保存到GitHub失败: ' + error.message);
    }
  }
  async function uploadToDecodeInput(content, filename = '') {
    if (!isAuthenticated()) {
      alert('请先进行 GitHub 认证才能上传密文');
      showAuthDialog();
      return false;
    }
    try {
      const decodeRepo = getDecodeRepo();
      const repoCheckUrl = `https://api.github.com/repos/${decodeRepo.owner}/${decodeRepo.repo}`;
      const repoCheckResponse = await fetch(repoCheckUrl, {
        headers: getEnhancedAuthHeaders()
      });
      if (!repoCheckResponse.ok) {
        if (repoCheckResponse.status === 404) {
          throw new Error(`仓库不存在: ${decodeRepo.owner}/${decodeRepo.repo}\n请确保您有一个名为"decode"的仓库（公开或私有）`);
        } else {
          const errorText = await repoCheckResponse.text();
          throw new Error(`无法访问仓库: ${repoCheckResponse.status} - ${errorText}`);
        }
      }
      const repoInfo = await repoCheckResponse.json();
      const defaultBranch = repoInfo.default_branch || 'main';
      let sha = null;
      try {
        const fileInfoUrl = `https://api.github.com/repos/${decodeRepo.owner}/${decodeRepo.repo}/contents/${decodeRepo.inputFile}?ref=${defaultBranch}`;
        const fileInfoResponse = await fetch(fileInfoUrl, {
          headers: getEnhancedAuthHeaders()
        });
        if (fileInfoResponse.ok) {
          const fileInfo = await fileInfoResponse.json();
          sha = fileInfo.sha;
          console.log('找到现有文件，SHA:', sha);
        } else if (fileInfoResponse.status !== 404) {
          const errorText = await fileInfoResponse.text();
          throw new Error(`获取文件信息失败: ${fileInfoResponse.status} - ${errorText}`);
        } else {
          console.log('文件不存在，将创建新文件');
        }
      } catch (e) {
        console.log('获取input.js SHA失败:', e);
      }
      const uploadUrl = `https://api.github.com/repos/${decodeRepo.owner}/${decodeRepo.repo}/contents/${decodeRepo.inputFile}`;
      const base64Content = utf8ToBase64(content);
      const uploadData = {
        message: `Update ${decodeRepo.inputFile} via GitHub助手${filename ? ` (来自文件: ${filename})` : ''}`,
        content: base64Content,
        branch: defaultBranch
      };
      if (sha) uploadData.sha = sha;
      console.log('上传数据到:', uploadUrl);
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: getEnhancedAuthHeaders(),
        body: JSON.stringify(uploadData)
      });
      if (uploadResponse.ok) {
        const result = await uploadResponse.json();
        console.log('上传成功:', result);
        safeNotify('上传成功', '内容已上传到decode库');
        return true;
      } else {
        const errorText = await uploadResponse.text();
        console.error('上传失败:', uploadResponse.status, errorText);
        let errorMessage = `上传失败: ${uploadResponse.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage += ` - ${errorJson.message || errorText}`;
          if (errorJson.message && errorJson.message.includes('insufficient_scope')) {
            errorMessage += '\n\n您的GitHub Token权限不足，需要"repo"权限。\n请重新生成Token并确保勾选"repo"权限范围。';
          }
        } catch (e) {
          errorMessage += ` - ${errorText}`;
        }
        if (uploadResponse.status === 404) {
          errorMessage += '\n可能的原因:\n1. 您没有该仓库的写入权限\n2. 仓库所有者与当前用户不匹配';
        } else if (uploadResponse.status === 403) {
          errorMessage += '\n您可能没有权限访问该仓库';
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('上传内容失败:', error);
      alert('上传内容失败: ' + error.message);
      return false;
    }
  }
  async function getDecodeOutput() {
    if (!isAuthenticated()) {
      alert('请先进行 GitHub 认证才能获取解密结果');
      showAuthDialog();
      return null;
    }
    try {
      const decodeRepo = getDecodeRepo();
      const apiUrl = `https://api.github.com/repos/${decodeRepo.owner}/${decodeRepo.repo}/contents/${decodeRepo.outputFile}`;
      console.log(`通过API获取: ${apiUrl}`);
      const response = await fetch(apiUrl, {
        headers: getEnhancedAuthHeaders()
      });
      if (response.ok) {
        const fileData = await response.json();
        if (fileData.content) {
          const content = base64ToUtf8(fileData.content.replace(/\s/g, ''));
          console.log('成功获取解密结果');
          return content;
        } else {
          throw new Error('文件内容为空');
        }
      } else if (response.status === 404) {
        throw new Error('output.js文件不存在或您没有访问权限');
      } else {
        const errorText = await response.text();
        throw new Error(`API请求失败: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('获取解密结果失败:', error);
      if (error.message.includes('404')) {}
      alert('\n可能的原因:\n1. output.js文件尚未生成\n2. decode仓库不存在\n3. 您没有该仓库的读取权限');
      return null;
    }
  }
  function showDecryptResult(content) {
    const colors = getAdaptiveColors();
    const resultPanel = document.createElement('div');
    resultPanel.id = '__gh_decrypt_result_panel__';
    resultPanel.style.cssText = `
    position: fixed;
    width: 80%;
    height: 80%;
    background: ${colors.bgPrimary};
    color: ${colors.textPrimary};
    z-index: 2147483647;
    border: 1px solid ${colors.border};
    box-shadow: ${colors.shadow};
    display: flex;
    flex-direction: column;
    border-radius: 8px;
    overflow: hidden;
  `;
    const header = document.createElement('div');
    header.style.cssText = `
    padding: 15px;
    background: ${colors.bgSecondary};
    border-bottom: 1px solid ${colors.border};
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
    const title = document.createElement('span');
    title.textContent = '解密结果';
    title.style.fontWeight = 'bold';
    title.style.color = colors.textPrimary;
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `background: none; border: none; font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px; color: ${colors.textPrimary};`;
    closeBtn.onclick = () => document.body.removeChild(resultPanel);
    header.appendChild(title);
    header.appendChild(closeBtn);
    const contentArea = document.createElement('textarea');
    contentArea.style.cssText = `
    flex: 1;
    padding: 15px;
    border: none;
    resize: none;
    font-family: monospace;
    font-size: 14px;
    background: ${colors.bgPrimary};
    color: ${colors.textPrimary};
  `;
    contentArea.value = content;
    contentArea.readOnly = true;
    const footer = document.createElement('div');
    footer.style.cssText = `
    padding: 15px;
    background: ${colors.bgSecondary};
    border-top: 1px solid ${colors.border};
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  `;
    const saveBtn = makeBtn('保存到本地', () => {
      const filename = 'decrypt_result.txt';
      if (saveFileLocally_general(contentArea.value, filename)) {
        safeNotify('保存成功', `文件已保存到本地: ${filename}`);
      } else {
        alert('保存到本地失败');
      }
    });
    saveBtn.style.padding = '6px 12px';
    saveBtn.style.margin = '0';
    const copyBtn = makeBtn('复制内容', () => {
      copyToClipboard(contentArea.value);
    });
    copyBtn.style.padding = '6px 12px';
    copyBtn.style.margin = '0';
    const closeBtn2 = makeBtn('关闭', () => {
      document.body.removeChild(resultPanel);
    });
    closeBtn2.style.padding = '6px 12px';
    closeBtn2.style.margin = '0';
    footer.appendChild(saveBtn);
    footer.appendChild(copyBtn);
    footer.appendChild(closeBtn2);
    resultPanel.appendChild(header);
    resultPanel.appendChild(contentArea);
    resultPanel.appendChild(footer);
    document.body.appendChild(resultPanel);
    addDragAndResizeFunctionality(resultPanel, 'DECRYPT_RESULT');
  }
  async function fetchRepoReleases(owner, repo) {
    try {
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases`;
      const response = await fetch(apiUrl, {
        headers: isAuthenticated() ? getAuthHeaders() : {
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (!response.ok) {
        if (response.status === 404) {
          return {
            releases: [],
            hasReleases: false
          };
        }
        throw new Error(`获取Releases失败: ${response.status}`);
      }
      const releases = await response.json();
      return {
        releases: releases || [],
        hasReleases: releases && releases.length > 0
      };
    } catch (error) {
      console.error('获取Releases失败:', error);
      throw error;
    }
  }
  async function checkReleaseAssetAvailability(assetUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(assetUrl, {
          method: 'GET',
          signal: controller.signal,
          credentials: 'omit',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Range': 'bytes=0-0'
          }
        });
        clearTimeout(timeoutId);
        return {
          exists: response.ok || response.status === 206,
          status: response.status,
          statusText: response.statusText,
          size: response.headers.get('content-length') || '未知'
        };
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          return {
            exists: false,
            status: 0,
            statusText: '请求超时',
            size: '未知'
          };
        }
        throw error;
      }
    } catch (error) {
      console.error(`检查资源失败 ${assetUrl}:`, error);
      return {
        exists: false,
        status: 0,
        statusText: '检查失败',
        size: '未知'
      };
    }
  }
  function formatFileSize(bytes) {
    if (!bytes || bytes === 0 || bytes === '未知') return '未知大小';
    if (typeof bytes === 'string') {
      bytes = parseInt(bytes);
    }
    if (isNaN(bytes)) return '未知大小';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
  function formatReleaseBody(body) {
    if (!body) return '';
    return body.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>').replace(/\n/g, '<br>');
  }
  function downloadReleaseAsset(url, filename) {
    try {
      window.open(url, '_blank');
      safeNotify('下载开始', `正在下载 ${filename}`);
    } catch (e) {
      console.error('下载失败:', e);
      try {
        GM_xmlhttpRequest({
          method: 'GET',
          url: url,
          onload: function (response) {
            const blob = new Blob([response.response], {
              type: 'application/octet-stream'
            });
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(downloadUrl);
            }, 100);
          },
          onerror: function (error) {
            console.error('下载失败:', error);
            alert('下载失败，请手动访问: ' + url);
          }
        });
      } catch (gmError) {
        console.error('GM_xmlhttpRequest也失败:', gmError);
        alert('下载失败，请手动访问: ' + url);
      }
    }
  }
  async function fetchUserGists(page = 1, perPage = 30) {
    try {
      const response = await fetch(`https://api.github.com/gists?page=${page}&per_page=${perPage}`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        if (response.status === 401) {
          clearGitHubToken();
          updateUIWithAuthStatus();
          throw new Error('Token已失效，请重新认证');
        }
        throw new Error('获取Gists失败: ' + response.status);
      }
      const gists = await response.json();
      const linkHeader = response.headers.get('Link');
      let hasNextPage = false;
      let nextPage = page + 1;
      if (linkHeader) {
        const links = linkHeader.split(',');
        hasNextPage = links.some(link => link.includes('rel="next"'));
      }
      return {
        gists,
        hasNextPage,
        nextPage
      };
    } catch (error) {
      console.error('获取Gists失败:', error);
      throw error;
    }
  }
  function createGistsPanel() {
    const panelId = '__gh_gists_panel__';
    if (document.getElementById(panelId)) return document.getElementById(panelId);
    const colors = getAdaptiveColors();
    const panel = document.createElement('div');
    panel.id = panelId;
    panel.style.cssText = `
      position: fixed;
      width: 80%;
      height: 80%;
      background: ${colors.bgPrimary};
      color: ${colors.textPrimary};
      z-index: 2147483646;
      border: 1px solid ${colors.border};
      box-shadow: ${colors.shadow};
      display: none;
      flex-direction: column;
      border-radius: 8px;
      overflow: hidden;
    `;
    const header = document.createElement('div');
    header.className = 'gh-gists-header';
    const title = document.createElement('span');
    title.className = 'gh-gists-title';
    title.textContent = 'Your Gists';
    const headerButtons = document.createElement('div');
    headerButtons.className = 'gh-gists-header-buttons';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.className = 'gh-gists-close-btn';
    closeBtn.title = '关闭面板';
    closeBtn.onclick = () => hideGistsPanel();
    headerButtons.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(headerButtons);
    const content = document.createElement('div');
    content.id = '__gh_gists_content__';
    content.style.cssText = `
      flex: 1; 
      padding: 15px; 
      overflow-y: auto; 
      position: relative;
      background: ${colors.bgPrimary};
    `;
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 15px; 
      background: ${colors.bgSecondary}; 
      border-top: 1px solid ${colors.border}; 
      display: flex; 
      justify-content: space-between; 
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    `;
    const status = document.createElement('div');
    status.id = '__gh_gists_status__';
    status.style.fontSize = '13px';
    status.style.color = colors.textSecondary;
    const buttonGroup = document.createElement('div');
    buttonGroup.style.display = 'flex';
    buttonGroup.style.gap = '10px';
    buttonGroup.style.flexWrap = 'wrap';
    const loadMoreBtn = makeBtn('加载更多', () => {
      const currentPage = GM_getValue(STORAGE_KEYS.GISTS_PAGE, 1);
      loadUserGists(currentPage + 1, true);
    }, '加载更多Gist');
    loadMoreBtn.id = '__gh_load_more_btn__';
    loadMoreBtn.style.display = 'none';
    loadMoreBtn.style.padding = '6px 12px';
    loadMoreBtn.style.margin = '0';
    const newGistBtn = makeBtn('新建 Gist', () => createNewGist());
    newGistBtn.style.padding = '6px 12px';
    newGistBtn.style.margin = '0';
    const batchDeleteBtn = makeBtn('批量删除', () => batchDeleteGists(), '批量删除选中的Gists');
    batchDeleteBtn.style.padding = '6px 12px';
    batchDeleteBtn.style.margin = '0';
    batchDeleteBtn.style.background = '#cb2431';
    batchDeleteBtn.style.color = 'white';
    const closeBtn2 = makeBtn('关闭', () => hideGistsPanel());
    closeBtn2.style.padding = '6px 12px';
    closeBtn2.style.margin = '0';
    buttonGroup.appendChild(loadMoreBtn);
    buttonGroup.appendChild(newGistBtn);
    buttonGroup.appendChild(batchDeleteBtn);
    buttonGroup.appendChild(closeBtn2);
    footer.appendChild(status);
    footer.appendChild(buttonGroup);
    panel.appendChild(header);
    panel.appendChild(content);
    panel.appendChild(footer);
    document.documentElement.appendChild(panel);
    addDragAndResizeFunctionality(panel, 'GISTS');
    return panel;
  }
  function showGistsPanel() {
    const panel = document.getElementById('__gh_gists_panel__') || createGistsPanel();
    panel.style.display = 'flex';
    loadUserGists(1);
  }
  function hideGistsPanel() {
    const panel = document.getElementById('__gh_gists_panel__');
    if (panel) {
      panel.style.display = 'none';
      const content = document.getElementById('__gh_gists_content__');
      if (content) {
        content.innerHTML = '';
      }
      const status = document.getElementById('__gh_gists_status__');
      if (status) {
        status.textContent = '';
      }
    }
  }
  async function loadUserGists(page = 1, append = false) {
    const content = document.getElementById('__gh_gists_content__');
    const status = document.getElementById('__gh_gists_status__');
    const loadMoreBtn = document.getElementById('__gh_load_more_btn__');
    if (!content || !status) return;
    const colors = getAdaptiveColors();
    if (!append) {
      content.innerHTML = '<div style="text-align: center; padding: 40px;">加载中...</div>';
      loadMoreBtn.style.display = 'none';
    }
    try {
      const result = await fetchUserGists(page);
      const gists = result.gists;
      if (gists.length === 0 && !append) {
        content.innerHTML = '<div style="text-align: center; padding: 40px;">没有找到 Gists</div>';
        status.textContent = '没有 Gists';
        return;
      }
      GM_setValue(STORAGE_KEYS.GISTS_PAGE, page);
      let html = '';
      if (append) {
        html = content.innerHTML;
        html = html.replace('<div style="text-align: center; padding: 20px; color: #586069;">没有更多Gists了</div>', '');
      } else {
        html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;">';
      }
      gists.forEach(gist => {
        const filenames = Object.keys(gist.files);
        const description = gist.description || '无描述';
        const isPublic = gist.public;
        const createdAt = new Date(gist.created_at).toLocaleDateString();
        const updatedAt = new Date(gist.updated_at).toLocaleDateString();
        html += `
  <div class="gh-gist-item" data-gist-id="${gist.id}">
    <div style="display: flex; align-items: flex-start; margin-bottom: 8px;">
      <input type="checkbox" class="gh-gist-checkbox" data-gist-id="${gist.id}" style="margin-right: 8px; margin-top: 3px;">
      <div style="flex: 1;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
          <span style="font-weight: 500; font-size: 14px; color: ${colors.textPrimary};">
            ${filenames.length > 1 ? `${filenames[0]} 等 ${filenames.length} 个文件` : filenames[0] || '无文件名'}
          </span>
          <span style="font-size: 12px; color: ${isPublic ? colors.link : colors.textSecondary}; padding: 2px 6px; border: 1px solid ${isPublic ? colors.link : colors.textSecondary}; border-radius: 12px;">
            ${isPublic ? '公开' : '私有'}
          </span>
        </div>
        <div style="font-size: 13px; color: ${colors.textSecondary}; margin-bottom: 8px; height: 40px; overflow: hidden; text-overflow: ellipsis;">${description}</div>
      </div>
    </div>
    <div style="font-size: 11px; color: ${colors.textSecondary}; margin-bottom: 12px;">
      <div>创建: ${createdAt}</div>
      <div>更新: ${updatedAt}</div>
    </div>
    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
      <a href="${gist.html_url}" target="_blank" style="font-size: 12px; color: ${colors.link}; text-decoration: none; padding: 4px 8px; border: 1px solid ${colors.link}; border-radius: 4px;">查看</a>
      <a href="#" class="gh-gist-edit-btn" data-gist-id="${gist.id}" style="font-size: 12px; color: ${colors.link}; text-decoration: none; padding: 4px 8px; border: 1px solid ${colors.link}; border-radius: 4px;">编辑</a>
    </div>
    ${filenames.length > 1 ? `
      <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid ${colors.border};">
        <details>
          <summary style="cursor: pointer; font-size: 12px; color: ${colors.textSecondary};">
            查看所有文件 (${filenames.length})
          </summary>
          <div style="margin-top: 8px;">
            ${filenames.map(filename => {
          const file = gist.files[filename];
          return `
              <div style="display: flex; align-items: center; margin-bottom: 5px;">
                <span style="font-size: 12px; color: ${colors.textPrimary}; margin-right: 8px;">${filename}</span>
                <a href="#" class="gh-gist-file-edit-btn" data-gist-id="${gist.id}" data-filename="${filename}" style="font-size: 11px; color: ${colors.link}; text-decoration: none; padding: 2px 6px; border: 1px solid ${colors.link}; border-radius: 4px; margin-right: 5px;">编辑</a>
                <a href="${file.raw_url}" target="_blank" style="font-size: 11px; color: ${colors.link}; text-decoration: none; padding: 2px 6px; border: 1px solid ${colors.link}; border-radius: 4px;">Raw</a>
              </div>
              `;
        }).join('')}
          </div>
        </details>
      </div>
    ` : ''}
  </div>
`;
      });
      if (!append) html += '</div>';
      if (result.hasNextPage) {
        loadMoreBtn.style.display = 'inline-block';
        loadMoreBtn.onclick = () => loadUserGists(page + 1, true);
      } else if (gists.length > 0) {
        html += `<div style="text-align: center; padding: 20px; color: ${colors.textSecondary};">没有更多Gists了</div>`;
        loadMoreBtn.style.display = 'none';
      }
      content.innerHTML = html;
      setTimeout(() => {
        document.querySelectorAll('.gh-gist-edit-btn').forEach(btn => {
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            const gistId = this.getAttribute('data-gist-id');
            fetch(`https://api.github.com/gists/${gistId}`, {
              headers: getAuthHeaders()
            }).then(response => response.json()).then(gistData => {
              const filenames = Object.keys(gistData.files);
              if (filenames.length === 0) {
                alert('此Gist没有文件');
                return;
              }
              if (filenames.length === 1) {
                const filename = filenames[0];
                const file = gistData.files[filename];
                editGistFile(gistId, filename, file.raw_url);
                return;
              }
              const colors = getAdaptiveColors();
              const dialog = document.createElement('div');
              dialog.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: ${colors.bgPrimary};
                color: ${colors.textPrimary};
                border: 1px solid ${colors.border};
                border-radius: 8px;
                padding: 20px;
                z-index: 2147483647;
                box-shadow: ${colors.shadow};
                min-width: 300px;
            `;
              dialog.innerHTML = `
                <h3 style="margin-top: 0; margin-bottom: 15px;">选择要编辑的文件</h3>
                <div style="max-height: 200px; overflow-y: auto; margin-bottom: 15px;">
                    ${filenames.map(name => `
                        <div style="padding: 8px; border-bottom: 1px solid ${colors.border}; cursor: pointer;" 
                             class="gh-gist-file-option" data-filename="${name}">
                            ${name}
                        </div>
                    `).join('')}
                </div>
                <button id="gh-gist-cancel" style="padding: 8px 16px; background: ${colors.bgSecondary}; color: ${colors.textPrimary}; border: 1px solid ${colors.border}; border-radius: 4px; cursor: pointer;">取消</button>
            `;
              document.body.appendChild(dialog);
              dialog.querySelectorAll('.gh-gist-file-option').forEach(option => {
                option.addEventListener('click', function () {
                  const filename = this.getAttribute('data-filename');
                  const file = gistData.files[filename];
                  document.body.removeChild(dialog);
                  editGistFile(gistId, filename, file.raw_url);
                });
              });
              document.getElementById('gh-gist-cancel').addEventListener('click', () => {
                document.body.removeChild(dialog);
              });
            }).catch(error => {
              console.error('获取Gist详情失败:', error);
              alert('获取Gist详情失败: ' + error.message);
            });
          });
        });
        document.querySelectorAll('.gh-gist-file-edit-btn').forEach(btn => {
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            const gistId = this.getAttribute('data-gist-id');
            const filename = this.getAttribute('data-filename');
            fetch(`https://api.github.com/gists/${gistId}`, {
              headers: getAuthHeaders()
            }).then(response => response.json()).then(gistData => {
              const file = gistData.files[filename];
              if (file) {
                editGistFile(gistId, filename, file.raw_url);
              } else {
                alert(`文件 ${filename} 不存在`);
              }
            }).catch(error => {
              console.error('获取Gist详情失败:', error);
              alert('获取Gist详情失败: ' + error.message);
            });
          });
        });
      }, 100);
      status.textContent = `已加载 ${gists.length * page} 个 Gist`;
    } catch (error) {
      console.error('加载Gists失败:', error);
      content.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #cb2431;">
          <p style="margin-bottom: 16px;">加载Gists失败: ${error.message}</p>
          <button onclick="location.reload()" style="margin: 5px; padding: 8px 16px; background: #2ea44f; color: white; border: none; border-radius: 4px; cursor: pointer;">
            重试
          </button>
          <button onclick="showAuthDialog()" style="margin: 5px; padding: 8px 16px; background: #0366d6; color: white; border: none; border-radius: 4px; cursor: pointer;">
            重新认证
          </button>
        </div>
      `;
      status.textContent = '加载失败';
    }
  }
  async function editGistFile(gistId, filename, rawUrl) {
    try {
      const gistApiUrl = `https://api.github.com/gists/${gistId}`;
      const response = await fetch(gistApiUrl, {
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        throw new Error(`获取Gist内容失败: ${response.status}`);
      }
      const gistData = await response.json();
      const file = gistData.files[filename];
      if (!file) {
        throw new Error('文件不存在于Gist中');
      }
      let content = file.content;
      if (!content && file.raw_url) {
        try {
          const rawResponse = await fetch(file.raw_url, {
            headers: getAuthHeaders()
          });
          if (rawResponse.ok) {
            content = await rawResponse.text();
          }
        } catch (rawError) {
          console.warn('从raw URL获取内容失败:', rawError);
        }
      }
      showEditor(content, filename, {
        isGist: true,
        gistId: gistId
      });
    } catch (error) {
      console.error('加载Gist文件失败:', error);
      alert('加载Gist文件失败: ' + error.message);
    }
  }
  function showGistEditor(content, filename, gistId) {
    const modal = document.getElementById('__gh_editor_modal__');
    const textarea = document.getElementById('__gh_editor_textarea__');
    const title = document.getElementById('__gh_editor_title__');
    const saveGithubBtn = document.querySelector('button[onclick="saveFileToGitHub()"]');
    if (!modal || !textarea || !title) return;
    title.textContent = `编辑Gist: ${filename}`;
    textarea.value = content;
    modal.style.display = 'flex';
    textarea.focus();
    updateEditorStatus();
    if (saveGithubBtn) {
      if (!saveGithubBtn.originalOnclick) {
        saveGithubBtn.originalOnclick = saveGithubBtn.onclick;
        saveGithubBtn.originalText = saveGithubBtn.textContent;
      }
      saveGithubBtn.textContent = '💾 保存到Gist';
      saveGithubBtn.onclick = function () {
        saveGistFile(gistId, filename, textarea.value);
      };
    }
    modal.dataset.gistId = gistId;
    modal.dataset.filename = filename;
  }
  async function saveGistFile(gistId, filename, content) {
    const modal = document.getElementById('__gh_editor_modal__');
    if (!modal || modal.dataset.editMode !== 'gist') {
      alert('当前不处于Gist编辑模式，无法保存到Gist');
      return;
    }
    try {
      const gistUrl = `https://api.github.com/gists/${gistId}`;
      const gistResponse = await fetch(gistUrl, {
        headers: getAuthHeaders()
      });
      if (!gistResponse.ok) {
        throw new Error(`获取Gist信息失败: ${gistResponse.status}`);
      }
      const gistData = await gistResponse.json();
      const updateData = {
        description: gistData.description || '',
        files: {},
        public: gistData.public
      };
      for (const [name, file] of Object.entries(gistData.files)) {
        if (name === filename) {
          updateData.files[filename] = {
            content: content,
            filename: filename
          };
        } else {
          updateData.files[name] = {
            content: file.content,
            filename: name
          };
        }
      }
      const updateResponse = await fetch(gistUrl, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(updateData)
      });
      if (updateResponse.ok) {
        const result = await updateResponse.json();
        safeNotify('保存成功', 'Gist文件已更新');
        hideEditor();
        const currentPage = GM_getValue(STORAGE_KEYS.GISTS_PAGE, 1);
        loadUserGists(currentPage, false);
      } else if (updateResponse.status === 409) {
        console.log('Gist更新冲突，重试一次...');
        setTimeout(async () => {
          try {
            const retryResponse = await fetch(gistUrl, {
              headers: getAuthHeaders()
            });
            if (!retryResponse.ok) {
              throw new Error(`重试获取Gist失败: ${retryResponse.status}`);
            }
            const retryGistData = await retryResponse.json();
            const retryUpdateData = {
              description: retryGistData.description || '',
              files: {},
              public: retryGistData.public
            };
            for (const [name, file] of Object.entries(retryGistData.files)) {
              if (name === filename) {
                retryUpdateData.files[filename] = {
                  content: content,
                  filename: filename
                };
              } else {
                retryUpdateData.files[name] = {
                  content: file.content,
                  filename: name
                };
              }
            }
            const retryUpdateResponse = await fetch(gistUrl, {
              method: 'PATCH',
              headers: getAuthHeaders(),
              body: JSON.stringify(retryUpdateData)
            });
            if (retryUpdateResponse.ok) {
              const result = await retryUpdateResponse.json();
              safeNotify('保存成功', 'Gist文件已更新');
              hideEditor();
              const currentPage = GM_getValue(STORAGE_KEYS.GISTS_PAGE, 1);
              loadUserGists(currentPage, false);
            } else {
              const errorText = await retryUpdateResponse.text();
              throw new Error(`重试更新Gist失败: ${retryUpdateResponse.status} - ${errorText}`);
            }
          } catch (retryError) {
            console.error('重试保存Gist失败:', retryError);
            alert('重试保存Gist失败: ' + retryError.message);
          }
        }, 1000);
      } else {
        const errorText = await updateResponse.text();
        let errorMessage = `更新Gist失败: ${updateResponse.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage += ` - ${errorJson.message || errorText}`;
        } catch (e) {
          errorMessage += ` - ${errorText}`;
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('保存到Gist失败:', error);
      alert('保存到Gist失败: ' + error.message);
    }
  }
  async function createNewGist() {
    if (!isAuthenticated()) {
      alert('请先进行 GitHub 认证才能创建Gist');
      showAuthDialog();
      return;
    }
    const colors = getAdaptiveColors();
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: ${colors.bgPrimary};
        color: ${colors.textPrimary};
        border: 1px solid ${colors.border};
        border-radius: 8px;
        padding: 20px;
        z-index: 2147483647;
        box-shadow: ${colors.shadow};
        min-width: 400px;
    `;
    dialog.innerHTML = `
        <h3 style="margin-top: 0;">创建新Gist</h3>
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">文件名:</label>
            <input type="text" id="gh-new-gist-filename" style="width: 100%; padding: 8px; border: 1px solid ${colors.border}; border-radius: 4px; background: ${colors.bgSecondary}; color: ${colors.textPrimary};" placeholder="例如: example.js">
        </div>
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">内容:</label>
            <textarea id="gh-new-gist-content" style="width: 100%; height: 150px; padding: 8px; border: 1px solid ${colors.border}; border-radius: 4px; background: ${colors.bgSecondary}; color: ${colors.textPrimary}; resize: vertical;"></textarea>
        </div>
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">描述 (可选):</label>
            <input type="text" id="gh-new-gist-description" style="width: 100%; padding: 8px; border: 1px solid ${colors.border}; border-radius: 4px; background: ${colors.bgSecondary}; color: ${colors.textPrimary};">
        </div>
        <div style="margin-bottom: 15px;">
            <label>
                <input type="checkbox" id="gh-new-gist-public"> 公开Gist
            </label>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button id="gh-new-gist-cancel" style="padding: 8px 16px; background: ${colors.bgSecondary}; color: ${colors.textPrimary}; border: 1px solid ${colors.border}; border-radius: 4px; cursor: pointer;">取消</button>
            <button id="gh-new-gist-create" style="padding: 8px 16px; background: ${colors.buttonBg}; color: ${colors.buttonText}; border: none; border-radius: 4px; cursor: pointer;">创建</button>
        </div>
    `;
    document.body.appendChild(dialog);
    document.getElementById('gh-new-gist-cancel').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
    document.getElementById('gh-new-gist-create').addEventListener('click', async () => {
      const filename = document.getElementById('gh-new-gist-filename').value.trim();
      const content = document.getElementById('gh-new-gist-content').value;
      const description = document.getElementById('gh-new-gist-description').value.trim();
      const isPublic = document.getElementById('gh-new-gist-public').checked;
      if (!filename) {
        alert('请输入文件名');
        return;
      }
      if (!content) {
        alert('请输入内容');
        return;
      }
      try {
        const createData = {
          description: description,
          public: isPublic,
          files: {
            [filename]: {
              content: content
            }
          }
        };
        const response = await fetch('https://api.github.com/gists', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(createData)
        });
        if (response.ok) {
          const result = await response.json();
          safeNotify('创建成功', 'Gist已创建');
          document.body.removeChild(dialog);
          const currentPage = GM_getValue(STORAGE_KEYS.GISTS_PAGE, 1);
          loadUserGists(currentPage, false);
        } else {
          const error = await response.text();
          throw new Error(`创建Gist失败: ${response.status} - ${error}`);
        }
      } catch (error) {
        console.error('创建Gist失败:', error);
        alert('创建Gist失败: ' + error.message);
      }
    });
  }
  async function batchDeleteGists() {
    const selectedGists = document.querySelectorAll('.gh-gist-checkbox:checked');
    if (selectedGists.length === 0) {
      safeNotify('未选中任何Gist', '请先选择要删除的Gist');
      return;
    }
    const gistsPanel = document.getElementById('__gh_gists_panel__');
    if (!gistsPanel) return;
    const confirmContainer = document.createElement('div');
    confirmContainer.id = '__gh_gists_confirm_container__';
    confirmContainer.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;
    const colors = getAdaptiveColors();
    const confirmDialog = document.createElement('div');
    confirmDialog.style.cssText = `
        background: ${colors.bgPrimary};
        color: ${colors.textPrimary};
        border: 1px solid ${colors.border};
        border-radius: 8px;
        padding: 20px;
        box-shadow: ${colors.shadow};
        min-width: 300px;
        max-width: 80%;
        max-height: 80%;
        overflow: auto;
    `;
    const gistList = Array.from(selectedGists).map(checkbox => {
      const gistId = checkbox.getAttribute('data-gist-id');
      const gistItem = document.querySelector(`.gh-gist-item[data-gist-id="${gistId}"]`);
      const filenameSpan = gistItem ? gistItem.querySelector('span[style*="font-weight: 500"]') : null;
      const filename = filenameSpan ? filenameSpan.textContent : '未知文件';
      return `${filename} (ID: ${gistId})`;
    }).join('\n');
    confirmDialog.innerHTML = `
        <h3 style="margin-top: 0; color: ${colors.textPrimary};">确认删除Gist</h3>
        <p style="color: ${colors.textSecondary}; margin-bottom: 15px;">您确定要删除以下 ${selectedGists.length} 个Gist吗？此操作无法撤销！</p>
        <div style="max-height: 200px; overflow-y: auto; border: 1px solid ${colors.border}; padding: 10px; margin-bottom: 15px; background: ${colors.bgSecondary};">
            <pre style="margin: 0; font-size: 12px; color: ${colors.textPrimary};">${gistList}</pre>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button id="__gh_gist_delete_cancel__" style="padding: 8px 16px; background: ${colors.bgSecondary}; color: ${colors.textPrimary}; border: 1px solid ${colors.border}; border-radius: 4px; cursor: pointer;">取消</button>
            <button id="__gh_gist_delete_confirm__" style="padding: 8px 16px; background: #cb2431; color: white; border: none; border-radius: 4px; cursor: pointer;">确认删除</button>
        </div>
    `;
    confirmContainer.appendChild(confirmDialog);
    gistsPanel.appendChild(confirmContainer);
    document.getElementById('__gh_gist_delete_cancel__').addEventListener('click', () => {
      gistsPanel.removeChild(confirmContainer);
    });
    document.getElementById('__gh_gist_delete_confirm__').addEventListener('click', async () => {
      gistsPanel.removeChild(confirmContainer);
      await performGistDeletion(selectedGists);
    });
  }
  async function performGistDeletion(selectedGists) {
    const status = document.getElementById('__gh_gists_status__');
    if (!status) return;
    if (!isAuthenticated()) {
      status.textContent = '请先进行GitHub认证';
      status.style.color = '#cb2431';
      showAuthDialog();
      return;
    }
    status.textContent = '删除Gists中...';
    status.style.color = getAdaptiveColors().textSecondary;
    try {
      let successCount = 0;
      let failCount = 0;
      for (const checkbox of selectedGists) {
        const gistId = checkbox.getAttribute('data-gist-id');
        if (!gistId) {
          console.error('Gist ID缺失');
          failCount++;
          continue;
        }
        const deleteUrl = `https://api.github.com/gists/${gistId}`;
        try {
          const response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: getAuthHeaders()
          });
          if (response.status === 204) {
            successCount++;
            const gistItem = document.querySelector(`.gh-gist-item[data-gist-id="${gistId}"]`);
            if (gistItem) {
              gistItem.remove();
            }
          } else {
            console.error(`删除Gist失败 ${gistId}:`, response.status, response.statusText);
            failCount++;
          }
        } catch (error) {
          console.error(`删除Gist失败 ${gistId}:`, error);
          failCount++;
        }
      }
      if (failCount === 0) {
        status.textContent = `成功删除 ${successCount} 个Gist!`;
        status.style.color = '#28a745';
        safeNotify('删除成功', `已删除 ${successCount} 个Gist`);
      } else {
        status.textContent = `完成: ${successCount} 个成功, ${failCount} 个失败`;
        status.style.color = '#cb2431';
      }
    } catch (error) {
      console.error('删除Gists过程中出错:', error);
      status.textContent = `删除失败: ${error.message}`;
      status.style.color = '#cb2431';
    }
  }
  function createReleasesPanel() {
    const panelId = '__gh_releases_panel__';
    if (document.getElementById(panelId)) return document.getElementById(panelId);
    const colors = getAdaptiveColors();
    const panel = document.createElement('div');
    panel.id = panelId;
    panel.style.cssText = `
        position: fixed;
        width: 85%;
        height: 80%;
        background: ${colors.bgPrimary};
        color: ${colors.textPrimary};
        z-index: 2147483646;
        border: 1px solid ${colors.border};
        box-shadow: ${colors.shadow};
        display: none;
        flex-direction: column;
        border-radius: 8px;
        overflow: hidden;
    `;
    const header = document.createElement('div');
    header.className = 'gh-gists-header';
    const title = document.createElement('span');
    title.className = 'gh-gists-title';
    title.textContent = 'Release 文件检测';
    title.id = '__gh_releases_title__';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.className = 'gh-gists-close-btn';
    closeBtn.onclick = () => hideReleasesPanel();
    header.appendChild(title);
    header.appendChild(closeBtn);
    const content = document.createElement('div');
    content.id = '__gh_releases_content__';
    content.style.cssText = `
        flex: 1; 
        padding: 0;
        overflow-y: auto; 
        position: relative;
        background: ${colors.bgPrimary};
    `;
    const footer = document.createElement('div');
    footer.style.cssText = `
        padding: 15px; 
        background: ${colors.bgSecondary}; 
        border-top: 1px solid ${colors.border}; 
        display: flex; 
        justify-content: space-between; 
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
    `;
    const status = document.createElement('div');
    status.id = '__gh_releases_status__';
    status.style.fontSize = '13px';
    status.style.color = colors.textSecondary;
    const buttonGroup = document.createElement('div');
    buttonGroup.style.display = 'flex';
    buttonGroup.style.gap = '10px';
    buttonGroup.style.flexWrap = 'wrap';
    const refreshBtn = makeBtn('重新检测', () => loadRepoReleases());
    const closeBtn2 = makeBtn('关闭', () => hideReleasesPanel());
    [refreshBtn, closeBtn2].forEach(btn => {
      btn.style.padding = '6px 12px';
      btn.style.margin = '0';
    });
    buttonGroup.appendChild(refreshBtn);
    buttonGroup.appendChild(closeBtn2);
    footer.appendChild(status);
    footer.appendChild(buttonGroup);
    panel.appendChild(header);
    panel.appendChild(content);
    panel.appendChild(footer);
    document.documentElement.appendChild(panel);
    addDragAndResizeFunctionality(panel, 'RELEASES');
    return panel;
  }
  async function loadRepoReleases() {
    const content = document.getElementById('__gh_releases_content__');
    const status = document.getElementById('__gh_releases_status__');
    const title = document.getElementById('__gh_releases_title__');
    if (!content || !status) return;
    const info = getRepoInfo();
    if (!info.owner || !info.repo) {
      content.innerHTML = '<div class="gh-releases-message">当前不是有效的仓库页面</div>';
      return;
    }
    if (title) {
      title.textContent = `Release 文件检测: ${info.owner}/${info.repo}`;
    }
    content.innerHTML = '<div class="gh-releases-loading">检测中...</div>';
    status.textContent = '正在检测Release信息...';
    try {
      const result = await fetchRepoReleases(info.owner, info.repo);
      if (!result.hasReleases) {
        content.innerHTML = `
                <div class="gh-releases-message">
                    <h3>暂无 Releases</h3>
                    <p>该仓库目前没有发布任何版本</p>
                </div>
            `;
        status.textContent = '未找到Release信息';
        return;
      }
      let html = `<div class="gh-releases-container">`;
      for (const release of result.releases) {
        const releaseDate = new Date(release.published_at || release.created_at).toLocaleDateString();
        const isPrerelease = release.prerelease ? '<span class="gh-release-tag prerelease">预发布</span>' : '';
        const isDraft = release.draft ? '<span class="gh-release-tag draft">草稿</span>' : '';
        let releaseHtml = `
                <div class="gh-release-item">
                    <div class="gh-release-header">
                        <h3 class="gh-release-title">${release.name || release.tag_name}</h3>
                        <div class="gh-release-meta">
                            <span class="gh-release-date">${releaseDate}</span>
                            ${isPrerelease}
                            ${isDraft}
                        </div>
                    </div>
                    
                    ${release.body ? `<div class="gh-release-body">${formatReleaseBody(release.body)}</div>` : ''}
                    
                    <div class="gh-release-assets">
                        <h4>可下载资源 (${release.assets.length})</h4>
            `;
        if (release.assets.length === 0) {
          releaseHtml += `<p class="gh-no-assets">此版本没有可下载资源</p>`;
        } else {
          releaseHtml += `<div class="gh-assets-list">`;
          for (const asset of release.assets) {
            const statusClass = 'available';
            const statusText = `可用 (${formatFileSize(asset.size)})`;
            const safeUrl = asset.browser_download_url.replace(/"/g, '&quot;');
            const safeName = asset.name.replace(/"/g, '&quot;');
            releaseHtml += `
                        <div class="gh-asset-item ${statusClass}">
                            <div class="gh-asset-info">
                                <span class="gh-asset-name">${asset.name}</span>
                                <span class="gh-asset-size">${formatFileSize(asset.size)}</span>
                            </div>
                            <div class="gh-asset-status">${statusText}</div>
                            <div class="gh-asset-actions">
                                <button class="gh-download-btn" data-url="${safeUrl}" data-filename="${safeName}">
                                    下载
                                </button>
                                <button class="gh-copy-btn" data-url="${safeUrl}">
                                    复制链接
                                </button>
                            </div>
                        </div>
                    `;
          }
          releaseHtml += `</div>`;
        }
        releaseHtml += `</div></div>`;
        html += releaseHtml;
      }
      html += `</div>`;
      content.innerHTML = html;
      status.textContent = `检测完成，共 ${result.releases.length} 个版本`;
      content.querySelectorAll('.gh-download-btn').forEach(btn => {
        btn.addEventListener('click', function () {
          const url = this.getAttribute('data-url');
          const filename = this.getAttribute('data-filename');
          downloadReleaseAsset(url, filename);
        });
      });
      content.querySelectorAll('.gh-copy-btn').forEach(btn => {
        btn.addEventListener('click', function () {
          const url = this.getAttribute('data-url');
          copyToClipboard(url);
        });
      });
    } catch (error) {
      console.error('加载Release信息失败:', error);
      content.innerHTML = `
            <div class="gh-releases-message error">
                <h3>检测失败</h3>
                <p>${error.message || '加载Release信息时发生错误'}</p>
                <button onclick="loadRepoReleases()" class="gh-retry-btn">重试</button>
            </div>
        `;
      status.textContent = '检测失败';
    }
  }
  function downloadReleaseAsset(url, filename) {
    try {
      window.open(url, '_blank');
      safeNotify('下载开始', `正在下载 ${filename}`);
    } catch (e) {
      console.error('下载失败:', e);
      try {
        GM_xmlhttpRequest({
          method: 'GET',
          url: url,
          responseType: 'blob',
          onload: function (response) {
            try {
              const blob = response.response;
              const downloadUrl = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = downloadUrl;
              a.download = filename;
              document.body.appendChild(a);
              a.click();
              setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(downloadUrl);
              }, 100);
            } catch (e) {
              console.error('Blob下载失败:', e);
              window.open(url, '_blank');
            }
          },
          onerror: function (error) {
            console.error('下载失败:', error);
            window.open(url, '_blank');
          }
        });
      } catch (gmError) {
        console.error('GM_xmlhttpRequest也失败:', gmError);
        window.open(url, '_blank');
      }
    }
  }
  function showReleasesPanel() {
    const panel = document.getElementById('__gh_releases_panel__') || createReleasesPanel();
    panel.style.display = 'flex';
    loadRepoReleases();
  }
  function hideReleasesPanel() {
    const panel = document.getElementById('__gh_releases_panel__');
    if (panel) panel.style.display = 'none';
  }
  async function fetchWorkflows(owner, repo) {
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        if (response.status === 401) {
          clearGitHubToken();
          updateUIWithAuthStatus();
          throw new Error('Token已失效，请重新认证');
        }
        throw new Error('获取工作流失败: ' + response.status);
      }
      const data = await response.json();
      return data.workflows || [];
    } catch (error) {
      console.error('获取工作流失败:', error);
      throw error;
    }
  }
  async function runWorkflow(owner, repo, workflowId, ref = 'main') {
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ref: ref
        })
      });
      if (response.status === 204) {
        return true;
      } else if (response.status === 404) {
        throw new Error('工作流不存在或没有权限访问');
      } else {
        const errorText = await response.text();
        throw new Error(`GitHub API错误: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('触发工作流失败:', error);
      throw error;
    }
  }
  function createWorkflowsPanel() {
    const panelId = '__gh_workflows_panel__';
    if (document.getElementById(panelId)) return document.getElementById(panelId);
    const colors = getAdaptiveColors();
    const panel = document.createElement('div');
    panel.id = panelId;
    panel.style.cssText = `
      position: fixed;
      width: 80%;
      height: 80%;
      background: ${colors.bgPrimary};
      color: ${colors.textPrimary};
      z-index: 2147483646;
      border: 1px solid ${colors.border};
      box-shadow: ${colors.shadow};
      display: none;
      flex-direction: column;
      border-radius: 8px;
      overflow: hidden;
    `;
    const header = document.createElement('div');
    header.className = 'gh-gists-header';
    const title = document.createElement('span');
    title.className = 'gh-gists-title';
    title.textContent = '工作流 (Workflows)';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.className = 'gh-gists-close-btn';
    closeBtn.onclick = () => hideWorkflowsPanel();
    header.appendChild(title);
    header.appendChild(closeBtn);
    const content = document.createElement('div');
    content.id = '__gh_workflows_content__';
    content.style.cssText = `
      flex: 1; 
      padding: 15px; 
      overflow-y: auto; 
      position: relative;
      background: ${colors.bgPrimary};
    `;
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 15px; 
      background: ${colors.bgSecondary}; 
      border-top: 1px solid ${colors.border}; 
      display: flex; 
      justify-content: space-between; 
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    `;
    const status = document.createElement('div');
    status.id = '__gh_workflows_status__';
    status.style.fontSize = '13px';
    status.style.color = colors.textSecondary;
    const buttonGroup = document.createElement('div');
    buttonGroup.style.display = 'flex';
    buttonGroup.style.gap = '10px';
    buttonGroup.style.flexWrap = 'wrap';
    const refreshBtn = makeBtn('刷新', () => loadWorkflows());
    refreshBtn.style.padding = '6px 12px';
    refreshBtn.style.margin = '0';
    const newWorkflowBtn = makeBtn('新建 Workflow', () => showNewWorkflowEditor());
    newWorkflowBtn.style.padding = '6px 12px';
    newWorkflowBtn.style.margin = '0';
    const closeBtn2 = makeBtn('关闭', () => hideWorkflowsPanel());
    closeBtn2.style.padding = '6px 12px';
    closeBtn2.style.margin = '0';
    buttonGroup.appendChild(refreshBtn);
    buttonGroup.appendChild(newWorkflowBtn);
    buttonGroup.appendChild(closeBtn2);
    footer.appendChild(status);
    footer.appendChild(buttonGroup);
    panel.appendChild(header);
    panel.appendChild(content);
    panel.appendChild(footer);
    document.documentElement.appendChild(panel);
    addDragAndResizeFunctionality(panel, 'WORKFLOWS');
    return panel;
  }
  function createNewWorkflowEditor() {
    const editorId = '__gh_new_workflow_editor__';
    if (document.getElementById(editorId)) return document.getElementById(editorId);
    const colors = getAdaptiveColors();
    const editor = document.createElement('div');
    editor.id = editorId;
    editor.style.cssText = `
      position: fixed;
      width: 70%;
      height: 80%;
      background: ${colors.bgPrimary};
      color: ${colors.textPrimary};
      z-index: 2147483647;
      border: 1px solid ${colors.border};
      box-shadow: ${colors.shadow};
      display: none;
      flex-direction: column;
      border-radius: 8px;
      overflow: hidden;
    `;
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 15px;
      background: ${colors.bgSecondary};
      border-bottom: 1px solid ${colors.border};
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    const title = document.createElement('span');
    title.textContent = '新建 Workflow';
    title.style.fontWeight = 'bold';
    title.style.color = colors.textPrimary;
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `background: none; border: none; font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px; color: ${colors.textPrimary};`;
    closeBtn.onclick = () => hideNewWorkflowEditor();
    header.appendChild(title);
    header.appendChild(closeBtn);
    const content = document.createElement('div');
    content.style.cssText = `
      flex: 1;
      padding: 15px;
      display: flex;
      flex-direction: column;
      gap: 15px;
      overflow-y: auto;
    `;
    const fileNameContainer = document.createElement('div');
    fileNameContainer.style.display = 'flex';
    fileNameContainer.style.flexDirection = 'column';
    fileNameContainer.style.gap = '5px';
    const fileNameLabel = document.createElement('label');
    fileNameLabel.textContent = '文件名 (自动添加 .yml 后缀)';
    fileNameLabel.style.fontWeight = '500';
    fileNameLabel.style.color = colors.textPrimary;
    const fileNameInput = document.createElement('input');
    fileNameInput.type = 'text';
    fileNameInput.placeholder = '例如: ci-cd-workflow';
    fileNameInput.style.cssText = `
      padding: 8px;
      border: 1px solid ${colors.border};
      border-radius: 4px;
      background: ${colors.bgSecondary};
      color: ${colors.textPrimary};
    `;
    fileNameContainer.appendChild(fileNameLabel);
    fileNameContainer.appendChild(fileNameInput);
    const editorContainer = document.createElement('div');
    editorContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      flex: 1;
      gap: 5px;
    `;
    const editorLabel = document.createElement('label');
    editorLabel.textContent = 'Workflow YAML 内容';
    editorLabel.style.fontWeight = '500';
    editorLabel.style.color = colors.textPrimary;
    const yamlEditor = document.createElement('textarea');
    yamlEditor.id = '__gh_workflow_yaml_editor__';
    yamlEditor.style.cssText = `
      flex: 1;
      padding: 12px;
      border: 1px solid ${colors.border};
      border-radius: 4px;
      resize: none;
      font-family: monospace;
      font-size: 14px;
      background: ${colors.bgSecondary};
      color: ${colors.textPrimary};
    `;
    yamlEditor.placeholder = `name: CI/CD Workflow

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '14'
        
    - name: Install dependencies
      run: npm install
      
    - name: Run tests
      run: npm test`;
    editorContainer.appendChild(editorLabel);
    editorContainer.appendChild(yamlEditor);
    content.appendChild(fileNameContainer);
    content.appendChild(editorContainer);
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 15px;
      background: ${colors.bgSecondary};
      border-top: 1px solid ${colors.border};
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    `;
    const cancelBtn = makeBtn('取消', () => hideNewWorkflowEditor());
    cancelBtn.style.padding = '6px 12px';
    cancelBtn.style.margin = '0';
    const saveBtn = makeBtn('创建 Workflow', () => createNewWorkflow());
    saveBtn.style.padding = '6px 12px';
    saveBtn.style.margin = '0';
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    editor.appendChild(header);
    editor.appendChild(content);
    editor.appendChild(footer);
    document.documentElement.appendChild(editor);
    addDragAndResizeFunctionality(editor, 'NEW_WORKFLOW_EDITOR');
    return editor;
  }
  function showNewWorkflowEditor() {
    const editor = document.getElementById('__gh_new_workflow_editor__') || createNewWorkflowEditor();
    editor.style.display = 'flex';
    const fileNameInput = editor.querySelector('input[type="text"]');
    const yamlEditor = document.getElementById('__gh_workflow_yaml_editor__');
    if (fileNameInput) fileNameInput.value = '';
    if (yamlEditor) yamlEditor.value = '';
  }
  function hideNewWorkflowEditor() {
    const editor = document.getElementById('__gh_new_workflow_editor__');
    if (editor) editor.style.display = 'none';
  }
  async function createNewWorkflow() {
    const editor = document.getElementById('__gh_new_workflow_editor__');
    if (!editor) return;
    const fileNameInput = editor.querySelector('input[type="text"]');
    const yamlEditor = document.getElementById('__gh_workflow_yaml_editor__');
    if (!fileNameInput || !yamlEditor) return;
    const fileName = fileNameInput.value.trim();
    const yamlContent = yamlEditor.value.trim();
    if (!fileName) {
      alert('请输入文件名');
      return;
    }
    if (!yamlContent) {
      alert('请输入Workflow YAML内容');
      return;
    }
    const fullFileName = fileName.endsWith('.yml') || fileName.endsWith('.yaml') ? fileName : `${fileName}.yml`;
    const info = getRepoInfo();
    if (!info.owner || !info.repo) {
      alert('无法确定仓库信息，请确保您在正确的仓库页面');
      return;
    }
    if (!isAuthenticated()) {
      alert('请先进行GitHub认证才能创建Workflow');
      showAuthDialog();
      return;
    }
    try {
      const repoInfoUrl = `https://api.github.com/repos/${info.owner}/${info.repo}`;
      const repoInfoResponse = await fetch(repoInfoUrl, {
        headers: getAuthHeaders()
      });
      if (!repoInfoResponse.ok) {
        throw new Error(`获取仓库信息失败: ${repoInfoResponse.status}`);
      }
      const repoInfo = await repoInfoResponse.json();
      const defaultBranch = repoInfo.default_branch || 'main';
      const workflowPath = `.github/workflows/${fullFileName}`;
      const createUrl = `https://api.github.com/repos/${info.owner}/${info.repo}/contents/${workflowPath}`;
      const createData = {
        message: `Create ${fullFileName} workflow`,
        content: btoa(unescape(encodeURIComponent(yamlContent))),
        branch: defaultBranch
      };
      const createResponse = await fetch(createUrl, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(createData)
      });
      if (createResponse.ok) {
        const result = await createResponse.json();
        safeNotify('创建成功', `Workflow文件已创建: ${fullFileName}`);
        hideNewWorkflowEditor();
        setTimeout(() => loadWorkflows(), 1000);
      } else {
        const error = await createResponse.text();
        throw new Error(`创建Workflow失败: ${createResponse.status} - ${error}`);
      }
    } catch (error) {
      console.error('创建Workflow失败:', error);
      alert('创建Workflow失败: ' + error.message);
    }
  }
  function showWorkflowsPanel() {
    const panel = document.getElementById('__gh_workflows_panel__') || createWorkflowsPanel();
    panel.style.display = 'flex';
    loadWorkflows();
  }
  function hideWorkflowsPanel() {
    const panel = document.getElementById('__gh_workflows_panel__');
    if (panel) {
      panel.style.display = 'none';
      const content = document.getElementById('__gh_workflows_content__');
      if (content) {
        content.innerHTML = '';
      }
      const status = document.getElementById('__gh_workflows_status__');
      if (status) {
        status.textContent = '';
      }
    }
  }
  async function loadWorkflows() {
    const content = document.getElementById('__gh_workflows_content__');
    const status = document.getElementById('__gh_workflows_status__');
    if (!content || !status) return;
    const info = getRepoInfo();
    if (!info.owner || !info.repo) {
      content.innerHTML = '<div style="text-align: center; padding: 40px;">当前不是有效的仓库页面</div>';
      return;
    }
    const colors = getAdaptiveColors();
    content.innerHTML = '<div style="text-align: center; padding: 40px;">加载中...</div>';
    status.textContent = '正在加载工作流...';
    try {
      const workflows = await fetchWorkflows(info.owner, info.repo);
      if (workflows.length === 0) {
        content.innerHTML = '<div style="text-align: center; padding: 40px;">没有找到工作流</div>';
        status.textContent = '没有工作流';
        return;
      }
      let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;">';
      workflows.forEach(workflow => {
        const workflowName = workflow.name || '未命名工作流';
        const workflowState = workflow.state || '未知状态';
        const createdAt = workflow.created_at ? new Date(workflow.created_at).toLocaleDateString() : '未知';
        const updatedAt = workflow.updated_at ? new Date(workflow.updated_at).toLocaleDateString() : '未知';
        const workflowUrl = `https://github.com/${info.owner}/${info.repo}/actions/workflows/${workflow.path.split('/').pop()}`;
        html += `
          <div style="border: 1px solid ${colors.border}; border-radius: 8px; padding: 16px; background: ${colors.bgSecondary};">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
              <span style="font-weight: 500; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${colors.textPrimary};" title="${workflowName}">${workflowName}</span>
              <span style="font-size: 12px; color: ${workflowState === 'active' ? '#28a745' : '#cb2431'}; padding: 2px 6px; border: 1px solid ${workflowState === 'active' ? '#28a745' : '#cb2431'}; border-radius: 12px;">
                ${workflowState === 'active' ? '活跃' : '禁用'}
              </span>
            </div>
            <div style="font-size: 11px; color: ${colors.textSecondary}; margin-bottom: 12px;">
              <div>创建: ${createdAt}</div>
              <div>更新: ${updatedAt}</div>
              <div>文件: ${workflow.path}</div>
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <a href="${workflowUrl}" target="_blank" style="font-size: 12px; color: ${colors.link}; text-decoration: none; padding: 4px 8px; border: 1px solid ${colors.link}; border-radius: 4px;">查看</a>
              <button class="gh-run-workflow" data-workflow-id="${workflow.id}" data-branch="${info.branch}" style="font-size: 12px; color: #28a745; background: none; border: 1px solid #28a745; border-radius: 4px; padding: 4px 8px; cursor: pointer;">运行</button>
            </div>
          </div>
        `;
      });
      html += '</div>';
      content.innerHTML = html;
      status.textContent = `已加载 ${workflows.length} 个工作流`;
      content.querySelectorAll('.gh-run-workflow').forEach(button => {
        button.addEventListener('click', function () {
          const workflowId = this.getAttribute('data-workflow-id');
          const branch = this.getAttribute('data-branch');
          runSelectedWorkflow(workflowId, branch);
        });
      });
    } catch (error) {
      console.error('加载工作流失败:', error);
      content.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #cb2431;">
          <p style="margin-bottom: 16px;">加载工作流失败: ${error.message}</p>
          <button onclick="loadWorkflows()" style="margin: 5px; padding: 8px 16px; background: #2ea44f; color: white; border: none; border-radius: 4px; cursor: pointer;">
            重试
          </button>
          ${error.message.includes('认证') ? `
          <button onclick="showAuthDialog()" style="margin: 5px; padding: 8px 16px; background: #0366d6; color: white; border: none; border-radius: 4px; cursor: pointer;">
            重新认证
          </button>
          ` : ''}
        </div>
      `;
      status.textContent = '加载失败';
    }
  }
  async function runSelectedWorkflow(workflowId, branch) {
    const info = getRepoInfo();
    if (!info.owner || !info.repo) {
      alert('当前不是有效的仓库页面');
      return;
    }
    if (!isAuthenticated()) {
      alert('请先进行 GitHub 认证才能运行工作流');
      showAuthDialog();
      return;
    }
    try {
      const result = await runWorkflow(info.owner, info.repo, workflowId, branch);
      if (result) {
        safeNotify('工作流已触发', '工作流已成功触发运行');
        window.open(`https://github.com/${info.owner}/${info.repo}/actions`, '_blank');
      }
    } catch (error) {
      console.error('运行工作流失败:', error);
      alert('运行工作流失败: ' + error.message);
    }
  }
  function createGitUrlDialog() {
    const dialogId = '__gh_git_url_dialog__';
    if (document.getElementById(dialogId)) return document.getElementById(dialogId);
    const colors = getAdaptiveColors();
    const dialog = document.createElement('div');
    dialog.id = dialogId;
    dialog.style.cssText = `
      position: fixed; 
      top: 50%; 
      left: 50%; 
      transform: translate(-50%, -50%); 
      width: ${isIOS() ? '80%' : '500px'}; 
      max-width: 90vw;
      background: ${colors.bgPrimary}; 
      color: ${colors.textPrimary};
      z-index: 2147483647; 
      border: 1px solid ${colors.border}; 
      box-shadow: ${colors.shadow}; 
      border-radius: 8px; 
      padding: 20px; 
      display: none;
    `;
    const title = document.createElement('h3');
    title.textContent = '复制 Git 仓库地址';
    title.style.marginTop = '0';
    title.style.color = colors.textPrimary;
    const typeContainer = document.createElement('div');
    typeContainer.style.marginBottom = '15px';
    const httpsRadio = document.createElement('input');
    httpsRadio.type = 'radio';
    httpsRadio.id = '__gh_git_url_https__';
    httpsRadio.name = 'gitUrlType';
    httpsRadio.value = 'https';
    const httpsLabel = document.createElement('label');
    httpsLabel.htmlFor = '__gh_git_url_https__';
    httpsLabel.textContent = 'HTTPS';
    httpsLabel.style.marginRight = '15px';
    httpsLabel.style.cursor = 'pointer';
    httpsLabel.style.color = colors.textPrimary;
    const sshRadio = document.createElement('input');
    sshRadio.type = 'radio';
    sshRadio.id = '__gh_git_url_ssh__';
    sshRadio.name = 'gitUrlType';
    sshRadio.value = 'ssh';
    const sshLabel = document.createElement('label');
    sshLabel.htmlFor = '__gh_git_url_ssh__';
    sshLabel.textContent = 'SSH';
    sshLabel.style.cursor = 'pointer';
    sshLabel.style.color = colors.textPrimary;
    typeContainer.appendChild(httpsRadio);
    typeContainer.appendChild(httpsLabel);
    typeContainer.appendChild(sshRadio);
    typeContainer.appendChild(sshLabel);
    const urlContainer = document.createElement('div');
    urlContainer.style.marginBottom = '15px';
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.id = '__gh_git_url_input__';
    urlInput.style.cssText = `
      width: 100%; 
      padding: 8px; 
      border: 1px solid ${colors.border}; 
      border-radius: 4px; 
      box-sizing: border-box; 
      font-family: monospace; 
      font-size: 14px;
      background: ${colors.bgSecondary};
      color: ${colors.textPrimary};
    `;
    urlInput.readOnly = true;
    urlContainer.appendChild(urlInput);
    const buttonGroup = document.createElement('div');
    buttonGroup.style.cssText = `display: flex; justify-content: flex-end; gap: 10px;`;
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = `padding: 6px 12px; background: ${colors.bgSecondary}; color: ${colors.textPrimary}; border: 1px solid ${colors.border}; border-radius: 6px; cursor: pointer; height: 32px; min-width: 80px;`;
    cancelBtn.onclick = () => hideGitUrlDialog();
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '复制';
    copyBtn.style.cssText = `padding: 6px 12px; background: ${colors.buttonBg}; color: ${colors.buttonText}; border: none; border-radius: 6px; cursor: pointer; height: 32px; min-width: 80px;`;
    copyBtn.onclick = () => {
      copyToClipboard(urlInput.value);
      hideGitUrlDialog();
    };
    buttonGroup.appendChild(cancelBtn);
    buttonGroup.appendChild(copyBtn);
    dialog.appendChild(title);
    dialog.appendChild(typeContainer);
    dialog.appendChild(urlContainer);
    dialog.appendChild(buttonGroup);
    httpsRadio.addEventListener('change', function () {
      updateGitUrlInDialog();
    });
    sshRadio.addEventListener('change', function () {
      updateGitUrlInDialog();
    });
    document.documentElement.appendChild(dialog);
    addDragAndResizeFunctionality(dialog, 'GIT_URL_DIALOG');
    if (isIOS()) {
      dialog.style.width = '80%';
      dialog.style.minWidth = '280px';
      dialog.style.maxWidth = '400px';
      dialog.style.minHeight = '200px';
    }
    return dialog;
  }
  function updateGitUrlInDialog() {
    const dialog = document.getElementById('__gh_git_url_dialog__');
    if (!dialog) return;
    const urlInput = dialog.querySelector('#__gh_git_url_input__');
    const savedUrlType = GM_getValue(STORAGE_KEYS.GIT_URL_TYPE, 'https');
    const selectedRadio = dialog.querySelector('input[name="gitUrlType"]:checked');
    const sel = selectedRadio ? selectedRadio.value : savedUrlType;
    const info = getRepoInfo();
    if (!info.owner || !info.repo) {
      urlInput.value = '';
      return;
    }
    if (sel === 'ssh') {
      urlInput.value = `git@github.com:${info.owner}/${info.repo}.git`;
    } else {
      urlInput.value = `https://github.com/${info.owner}/${info.repo}.git`;
    }
  }
  function showGitUrlDialog() {
    const dialog = document.getElementById('__gh_git_url_dialog__') || createGitUrlDialog();
    dialog.style.display = 'block';
    const savedUrlType = GM_getValue(STORAGE_KEYS.GIT_URL_TYPE, 'https');
    const httpsRadio = dialog.querySelector('#__gh_git_url_https__');
    const sshRadio = dialog.querySelector('#__gh_git_url_ssh__');
    if (savedUrlType === 'ssh') {
      sshRadio.checked = true;
    } else {
      httpsRadio.checked = true;
    }
    updateGitUrlInDialog();
  }
  function hideGitUrlDialog() {
    const dialog = document.getElementById('__gh_git_url_dialog__');
    if (!dialog) return;
    const selectedType = dialog.querySelector('input[name="gitUrlType"]:checked');
    if (selectedType) GM_setValue(STORAGE_KEYS.GIT_URL_TYPE, selectedType.value);
    dialog.style.display = 'none';
  }
  async function syncForkWithUpstream() {
    const info = getRepoInfo();
    if (!info.owner || !info.repo) {
      alert('当前不是有效的仓库页面');
      return;
    }
    if (!isAuthenticated()) {
      alert('请先进行 GitHub 认证才能同步 Fork');
      showAuthDialog();
      return;
    }
    if (!isForkRepository()) {
      alert('当前仓库不是 Fork 仓库，无法同步');
      return;
    }
    const parentRepo = getParentRepoInfo();
    if (!parentRepo) {
      alert('无法获取父仓库信息');
      return;
    }
    try {
      const repoInfoUrl = `https://api.github.com/repos/${info.owner}/${info.repo}`;
      const repoInfoResponse = await fetch(repoInfoUrl, {
        headers: getAuthHeaders()
      });
      if (!repoInfoResponse.ok) {
        throw new Error(`获取仓库信息失败: ${repoInfoResponse.status}`);
      }
      const repoInfo = await repoInfoResponse.json();
      const defaultBranch = repoInfo.default_branch || 'main';
      const mergeUrl = `https://api.github.com/repos/${info.owner}/${info.repo}/merge-upstream`;
      const mergeResponse = await fetch(mergeUrl, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          branch: defaultBranch
        })
      });
      if (mergeResponse.ok) {
        const result = await mergeResponse.json();
        safeNotify('同步成功', `Fork 仓库已同步到上游最新版本`);
        setTimeout(() => location.reload(), 1500);
      } else if (mergeResponse.status === 409) {
        safeNotify('无需同步', 'Fork 仓库已经是最新版本');
      } else {
        const error = await mergeResponse.text();
        throw new Error(`同步失败: ${mergeResponse.status} - ${error}`);
      }
    } catch (error) {
      console.error('同步Fork失败:', error);
      alert('同步Fork失败: ' + error.message);
    }
  }
  async function forkRepository() {
    const info = getRepoInfo();
    if (!info.owner || !info.repo) {
      alert('当前不是有效的仓库页面');
      return;
    }
    if (!isAuthenticated()) {
      alert('请先进行GitHub认证才能Fork仓库');
      showAuthDialog();
      return;
    }
    const userInfo = GM_getValue(STORAGE_KEYS.USER_INFO, {});
    if (!userInfo || !userInfo.login) {
      alert('无法获取用户信息，请重新登录');
      showAuthDialog();
      return;
    }
    if (info.owner === userInfo.login) {
      alert('不能Fork自己的仓库');
      return;
    }
    const colors = getAdaptiveColors();
    const confirmDialog = document.createElement('div');
    confirmDialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: ${colors.bgPrimary};
        color: ${colors.textPrimary};
        border: 1px solid ${colors.border};
        border-radius: 8px;
        padding: 20px;
        z-index: 2147483647;
        box-shadow: ${colors.shadow};
        min-width: 300px;
    `;
    confirmDialog.innerHTML = `
        <h3 style="margin-top: 0; color: ${colors.textPrimary};">确认Fork仓库</h3>
        <p style="color: ${colors.textSecondary}; margin-bottom: 20px;">
            确定要将仓库 <strong>${info.owner}/${info.repo}</strong> Fork到您的账户 (<strong>${userInfo.login}</strong>) 吗？
        </p>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button id="__gh_fork_cancel__" style="padding: 8px 16px; background: ${colors.bgSecondary}; color: ${colors.textPrimary}; border: 1px solid ${colors.border}; border-radius: 4px; cursor: pointer;">取消</button>
            <button id="__gh_fork_confirm__" style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">确认Fork</button>
        </div>
    `;
    document.body.appendChild(confirmDialog);
    return new Promise(resolve => {
      document.getElementById('__gh_fork_confirm__').addEventListener('click', async () => {
        document.body.removeChild(confirmDialog);
        try {
          const loadingDialog = document.createElement('div');
          loadingDialog.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: ${colors.bgPrimary};
                    color: ${colors.textPrimary};
                    border: 1px solid ${colors.border};
                    border-radius: 8px;
                    padding: 20px;
                    z-index: 2147483647;
                    box-shadow: ${colors.shadow};
                    min-width: 300px;
                    text-align: center;
                `;
          loadingDialog.innerHTML = `
                    <h3 style="margin-top: 0; color: ${colors.textPrimary};">Fork仓库中...</h3>
                    <p style="color: ${colors.textSecondary}; margin-bottom: 20px;">
                        正在将仓库 Fork 到您的账户，请稍候...
                    </p>
                    <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #f3f3f3; border-top: 2px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    <style>
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    </style>
                `;
          document.body.appendChild(loadingDialog);
          const forkUrl = `https://api.github.com/repos/${info.owner}/${info.repo}/forks`;
          const response = await fetch(forkUrl, {
            method: 'POST',
            headers: getAuthHeaders()
          });
          document.body.removeChild(loadingDialog);
          if (response.status === 202 || response.status === 200) {
            const forkData = await response.json();
            const forkFullName = forkData.full_name;
            const checkForkStatus = async () => {
              try {
                const checkUrl = `https://api.github.com/repos/${forkFullName}`;
                const checkResponse = await fetch(checkUrl, {
                  headers: getAuthHeaders()
                });
                if (checkResponse.ok) {
                  safeNotify('Fork成功', `仓库已成功Fork到您的账户: ${forkFullName}`);
                  window.open(`https://github.com/${forkFullName}`, '_blank');
                } else if (checkResponse.status === 404) {
                  setTimeout(checkForkStatus, 2000);
                } else {
                  throw new Error(`检查Fork状态失败: ${checkResponse.status}`);
                }
              } catch (error) {
                console.error('检查Fork状态失败:', error);
                safeNotify('Fork可能已创建', `正在打开可能的Fork页面: ${userInfo.login}/${info.repo}`);
                window.open(`https://github.com/${userInfo.login}/${info.repo}`, '_blank');
              }
            };
            safeNotify('Fork请求已接受', '仓库正在Fork中，请稍后查看您的账户');
            setTimeout(checkForkStatus, 3000);
          } else if (response.status === 403) {
            const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
            if (rateLimitRemaining === '0') {
              const rateLimitReset = response.headers.get('X-RateLimit-Reset');
              const resetTime = new Date(rateLimitReset * 1000);
              alert(`您已达到GitHub的API速率限制，请在 ${resetTime.toLocaleTimeString()} 后重试`);
            } else {
              const errorData = await response.json();
              alert(`Fork失败: ${errorData.message || '未知错误'}`);
            }
          } else if (response.status === 422) {
            safeNotify('仓库已存在', `您已经Fork过这个仓库: ${userInfo.login}/${info.repo}`);
            window.open(`https://github.com/${userInfo.login}/${info.repo}`, '_blank');
          } else {
            const errorData = await response.json();
            throw new Error(`Fork失败: ${response.status} - ${errorData.message}`);
          }
        } catch (error) {
          console.error('Fork仓库失败:', error);
          alert('Fork仓库失败: ' + error.message);
          safeNotify('尝试打开Fork页面', `正在打开可能的Fork页面: ${userInfo.login}/${info.repo}`);
          window.open(`https://github.com/${userInfo.login}/${info.repo}`, '_blank');
        }
        resolve();
      });
      document.getElementById('__gh_fork_cancel__').addEventListener('click', () => {
        document.body.removeChild(confirmDialog);
        resolve();
      });
    });
  }
  function createUploadPanel() {
    const panelId = '__gh_upload_panel__';
    if (document.getElementById(panelId)) return document.getElementById(panelId);
    const colors = getAdaptiveColors();
    const panel = document.createElement('div');
    panel.id = panelId;
    panel.style.cssText = `
        position: fixed;
        width: 450px;
        background: ${colors.bgPrimary};
        color: ${colors.textPrimary};
        z-index: 2147483647;
        border: 1px solid ${colors.border};
        box-shadow: ${colors.shadow};
        display: none;
        flex-direction: column;
        border-radius: 8px;
        overflow: hidden;
        opacity: 1 !important; /* 确保不透明 */
    `;
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 15px;
        background: ${colors.bgSecondary};
        border-bottom: 1px solid ${colors.border};
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    const title = document.createElement('span');
    title.textContent = '上传文件到仓库';
    title.style.fontWeight = 'bold';
    title.style.color = colors.textPrimary;
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `background: none; border: none; font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px; color: ${colors.textPrimary};`;
    closeBtn.onclick = () => hideUploadPanel();
    header.appendChild(title);
    header.appendChild(closeBtn);
    const content = document.createElement('div');
    content.style.cssText = `
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 15px;
    `;
    const fileSection = document.createElement('div');
    fileSection.style.display = 'flex';
    fileSection.style.flexDirection = 'column';
    fileSection.style.gap = '8px';
    const fileLabel = document.createElement('label');
    fileLabel.textContent = '选择文件';
    fileLabel.style.fontWeight = '500';
    fileLabel.style.color = colors.textPrimary;
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = '__gh_upload_file_input__';
    fileInput.style.cssText = `
        padding: 8px;
        border: 1px solid ${colors.border};
        border-radius: 4px;
        background: ${colors.bgSecondary};
        color: ${colors.textPrimary};
    `;
    fileSection.appendChild(fileLabel);
    fileSection.appendChild(fileInput);
    const branchSection = document.createElement('div');
    branchSection.style.display = 'flex';
    branchSection.style.flexDirection = 'column';
    branchSection.style.gap = '8px';
    const branchLabel = document.createElement('label');
    branchLabel.textContent = '目标分支';
    branchLabel.style.fontWeight = '500';
    branchLabel.style.color = colors.textPrimary;
    const branchSelect = document.createElement('select');
    branchSelect.id = '__gh_upload_branch_select__';
    branchSelect.style.cssText = `
        padding: 8px;
        border: 1px solid ${colors.border};
        border-radius: 4px;
        background: ${colors.bgSecondary};
        color: ${colors.textPrimary};
    `;
    branchSection.appendChild(branchLabel);
    branchSection.appendChild(branchSelect);
    const pathSection = document.createElement('div');
    pathSection.style.display = 'flex';
    pathSection.style.flexDirection = 'column';
    pathSection.style.gap = '8px';
    const pathLabel = document.createElement('label');
    pathLabel.textContent = '目标路径';
    pathLabel.style.fontWeight = '500';
    pathLabel.style.color = colors.textPrimary;
    const pathSelectContainer = document.createElement('div');
    pathSelectContainer.style.display = 'flex';
    pathSelectContainer.style.gap = '8px';
    const pathSelect = document.createElement('select');
    pathSelect.id = '__gh_upload_path_select__';
    pathSelect.style.cssText = `
        flex: 1;
        padding: 8px;
        border: 1px solid ${colors.border};
        border-radius: 4px;
        background: ${colors.bgSecondary};
        color: ${colors.textPrimary};
    `;
    const refreshPathBtn = document.createElement('button');
    refreshPathBtn.textContent = '↻';
    refreshPathBtn.title = '刷新路径列表';
    refreshPathBtn.style.cssText = `
        padding: 8px;
        border: 1px solid ${colors.border};
        border-radius: 4px;
        background: ${colors.bgSecondary};
        color: ${colors.textPrimary};
        cursor: pointer;
        width: 40px;
    `;
    refreshPathBtn.onclick = () => loadPathsForUpload();
    pathSelectContainer.appendChild(pathSelect);
    pathSelectContainer.appendChild(refreshPathBtn);
    const customPathInput = document.createElement('input');
    customPathInput.type = 'text';
    customPathInput.id = '__gh_upload_custom_path_input__';
    customPathInput.placeholder = '或输入自定义路径 (例如: folder/subfolder/)';
    customPathInput.style.cssText = `
        padding: 8px;
        border: 1px solid ${colors.border};
        border-radius: 4px;
        background: ${colors.bgSecondary};
        color: ${colors.textPrimary};
        display: none; // 默认隐藏
    `;
    const togglePathInputBtn = document.createElement('button');
    togglePathInputBtn.textContent = '自定义路径';
    togglePathInputBtn.id = '__gh_toggle_path_input_btn__';
    togglePathInputBtn.style.cssText = `
        padding: 6px 12px;
        border: 1px solid ${colors.border};
        border-radius: 4px;
        background: ${colors.bgSecondary};
        color: ${colors.textPrimary};
        cursor: pointer;
        font-size: 12px;
        align-self: flex-start;
    `;
    togglePathInputBtn.onclick = () => {
      const isCustom = customPathInput.style.display === 'block';
      if (isCustom) {
        customPathInput.style.display = 'none';
        pathSelectContainer.style.display = 'flex';
        togglePathInputBtn.textContent = '自定义路径';
      } else {
        customPathInput.style.display = 'block';
        pathSelectContainer.style.display = 'none';
        togglePathInputBtn.textContent = '选择路径';
      }
    };
    pathSection.appendChild(pathLabel);
    pathSection.appendChild(pathSelectContainer);
    pathSection.appendChild(customPathInput);
    pathSection.appendChild(togglePathInputBtn);
    const messageSection = document.createElement('div');
    messageSection.style.display = 'flex';
    messageSection.style.flexDirection = 'column';
    messageSection.style.gap = '8px';
    const messageLabel = document.createElement('label');
    messageLabel.textContent = '提交信息';
    messageLabel.style.fontWeight = '500';
    messageLabel.style.color = colors.textPrimary;
    const messageInput = document.createElement('input');
    messageInput.type = 'text';
    messageInput.id = '__gh_upload_message_input__';
    messageInput.value = '添加文件 via GitHub助手';
    messageInput.style.cssText = `
        padding: 8px;
        border: 1px solid ${colors.border};
        border-radius: 4px;
        background: ${colors.bgSecondary};
        color: ${colors.textPrimary};
    `;
    messageSection.appendChild(messageLabel);
    messageSection.appendChild(messageInput);
    const status = document.createElement('div');
    status.id = '__gh_upload_status__';
    status.style.fontSize = '13px';
    status.style.color = colors.textSecondary;
    status.style.minHeight = '20px';
    content.appendChild(fileSection);
    content.appendChild(branchSection);
    content.appendChild(pathSection);
    content.appendChild(messageSection);
    content.appendChild(status);
    const footer = document.createElement('div');
    footer.style.cssText = `
        padding: 15px;
        background: ${colors.bgSecondary};
        border-top: 1px solid ${colors.border};
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    `;
    const cancelBtn = makeBtn('取消', () => hideUploadPanel());
    cancelBtn.style.padding = '6px 12px';
    cancelBtn.style.margin = '0';
    const uploadBtn = makeBtn('上传文件', () => uploadFileToGitHub());
    uploadBtn.style.padding = '6px 12px';
    uploadBtn.style.margin = '0';
    footer.appendChild(cancelBtn);
    footer.appendChild(uploadBtn);
    panel.appendChild(header);
    panel.appendChild(content);
    panel.appendChild(footer);
    document.documentElement.appendChild(panel);
    addDragAndResizeFunctionality(panel, 'UPLOAD');
    fileInput.addEventListener('change', function () {
      if (this.files.length > 0) {
        const fileName = this.files[0].name;
        if (customPathInput.style.display === 'block') {
          customPathInput.value = customPathInput.value + fileName;
        } else {
          const pathSelect = document.getElementById('__gh_upload_path_select__');
          if (pathSelect && pathSelect.value) {
            customPathInput.value = pathSelect.value + fileName;
          } else {
            customPathInput.value = fileName;
          }
        }
      }
    });
    branchSelect.addEventListener('change', () => {
      loadPathsForUpload();
    });
    return panel;
  }
  async function loadPathsForUpload() {
    const pathSelect = document.getElementById('__gh_upload_path_select__');
    const branchSelect = document.getElementById('__gh_upload_branch_select__');
    if (!pathSelect || !branchSelect) return;
    const info = getRepoInfo();
    if (!info.owner || !info.repo) return;
    const selectedBranch = branchSelect.value;
    if (!selectedBranch) return;
    pathSelect.innerHTML = '<option value="">加载中...</option>';
    try {
      const files = await fetchRepoTree(info.owner, info.repo, selectedBranch);
      const folders = new Set(['']);
      files.forEach(item => {
        if (item.type === 'tree') {
          folders.add(item.path + '/');
          const pathParts = item.path.split('/');
          let currentPath = '';
          for (let i = 0; i < pathParts.length - 1; i++) {
            currentPath += pathParts[i] + '/';
            folders.add(currentPath);
          }
        }
      });
      const sortedFolders = Array.from(folders).sort();
      pathSelect.innerHTML = '';
      sortedFolders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder;
        option.textContent = folder === '' ? '根目录 /' : folder;
        pathSelect.appendChild(option);
      });
      pathSelect.value = '';
    } catch (error) {
      console.error('加载路径失败:', error);
      pathSelect.innerHTML = '<option value="">加载失败</option>';
    }
  }
  function showUploadPanel() {
    const panel = document.getElementById('__gh_upload_panel__') || createUploadPanel();
    panel.style.display = 'flex';
    document.getElementById('__gh_upload_file_input__').value = '';
    document.getElementById('__gh_upload_path_select__').innerHTML = '<option value="">加载中...</option>';
    document.getElementById('__gh_upload_custom_path_input__').value = '';
    document.getElementById('__gh_upload_custom_path_input__').style.display = 'none';
    document.getElementById('__gh_upload_path_select__').parentElement.style.display = 'flex';
    document.getElementById('__gh_toggle_path_input_btn__').textContent = '自定义路径';
    document.getElementById('__gh_upload_message_input__').value = '添加文件 via GitHub助手';
    document.getElementById('__gh_upload_status__').textContent = '';
    loadBranchesForUpload().then(() => {
      loadPathsForUpload();
    });
  }
  function hideUploadPanel() {
    const panel = document.getElementById('__gh_upload_panel__');
    if (panel) panel.style.display = 'none';
  }
  async function loadBranchesForUpload() {
    const info = getRepoInfo();
    if (!info.owner || !info.repo) return;
    const branchSelect = document.getElementById('__gh_upload_branch_select__');
    if (!branchSelect) return;
    branchSelect.innerHTML = '<option value="">加载中...</option>';
    try {
      const branches = await fetchAllBranches(info.owner, info.repo);
      branchSelect.innerHTML = '';
      const currentBranch = info.branch || getDefaultBranch();
      branches.forEach(branch => {
        const option = document.createElement('option');
        option.value = branch;
        option.textContent = branch;
        if (branch === currentBranch) {
          option.selected = true;
        }
        branchSelect.appendChild(option);
      });
    } catch (error) {
      console.error('加载分支失败:', error);
      branchSelect.innerHTML = '<option value="">加载失败</option>';
    }
  }
  async function uploadFileToGitHub() {
    const fileInput = document.getElementById('__gh_upload_file_input__');
    const branchSelect = document.getElementById('__gh_upload_branch_select__');
    const pathSelect = document.getElementById('__gh_upload_path_select__');
    const customPathInput = document.getElementById('__gh_upload_custom_path_input__');
    const messageInput = document.getElementById('__gh_upload_message_input__');
    const status = document.getElementById('__gh_upload_status__');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      status.textContent = '请选择要上传的文件';
      status.style.color = '#cb2431';
      return;
    }
    const file = fileInput.files[0];
    const targetBranch = branchSelect.value;
    let targetPath = '';
    if (customPathInput.style.display === 'block' && customPathInput.value.trim()) {
      targetPath = customPathInput.value.trim();
    } else if (pathSelect.value !== null) {
      targetPath = pathSelect.value + file.name;
    } else {
      targetPath = file.name;
    }
    if (targetPath.startsWith('/')) {
      targetPath = targetPath.substring(1);
    }
    const commitMessage = messageInput.value.trim() || `添加文件 ${file.name}`;
    if (!targetBranch) {
      status.textContent = '请选择目标分支';
      status.style.color = '#cb2431';
      return;
    }
    if (!targetPath) {
      status.textContent = '请指定目标路径';
      status.style.color = '#cb2431';
      return;
    }
    if (!isAuthenticated()) {
      status.textContent = '请先进行GitHub认证';
      status.style.color = '#cb2431';
      showAuthDialog();
      return;
    }
    const info = getRepoInfo();
    if (!info.owner || !info.repo) {
      status.textContent = '无法确定仓库信息';
      status.style.color = '#cb2431';
      return;
    }
    status.textContent = '上传中...';
    status.style.color = getAdaptiveColors().textSecondary;
    try {
      const fileContent = await readFileAsBase64(file);
      let sha = null;
      try {
        const fileInfoUrl = `https://api.github.com/repos/${info.owner}/${info.repo}/contents/${encodeURIComponent(targetPath)}?ref=${targetBranch}`;
        const fileInfoResponse = await fetch(fileInfoUrl, {
          headers: getAuthHeaders()
        });
        if (fileInfoResponse.ok) {
          const fileInfo = await fileInfoResponse.json();
          sha = fileInfo.sha;
        }
      } catch (e) {
        console.log('文件不存在，将创建新文件:', e);
      }
      const uploadUrl = `https://api.github.com/repos/${info.owner}/${info.repo}/contents/${encodeURIComponent(targetPath)}`;
      const uploadData = {
        message: commitMessage,
        content: fileContent,
        branch: targetBranch
      };
      if (sha) {
        uploadData.sha = sha;
      }
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(uploadData)
      });
      if (uploadResponse.ok) {
        const result = await uploadResponse.json();
        status.textContent = '上传成功!';
        status.style.color = '#28a745';
        safeNotify('上传成功', `文件已上传到 ${targetPath}`);
        setTimeout(() => {
          hideUploadPanel();
          setTimeout(() => location.reload(), 1000);
        }, 3000);
      } else {
        const error = await uploadResponse.text();
        throw new Error(`上传失败: ${uploadResponse.status} - ${error}`);
      }
    } catch (error) {
      console.error('上传文件失败:', error);
      status.textContent = `上传失败: ${error.message}`;
      status.style.color = '#cb2431';
    }
  }
  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.replace(/^data:.+;base64,/, '');
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  function createDeletePanel() {
    const panelId = '__gh_delete_panel__';
    if (document.getElementById(panelId)) return document.getElementById(panelId);
    const colors = getAdaptiveColors();
    const panel = document.createElement('div');
    panel.id = panelId;
    panel.style.cssText = `
        position: fixed;
        width: 80%;
        height: 80%;
        background: ${colors.bgPrimary};
        color: ${colors.textPrimary};
        z-index: 2147483647;
        border: 1px solid ${colors.border};
        box-shadow: ${colors.shadow};
        display: none;
        flex-direction: column;
        border-radius: 8px;
        overflow: hidden;
    `;
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 15px;
        background: ${colors.bgSecondary};
        border-bottom: 1px solid ${colors.border};
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    const title = document.createElement('span');
    title.textContent = '删除仓库文件';
    title.style.fontWeight = 'bold';
    title.style.color = colors.textPrimary;
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `background: none; border: none; font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px; color: ${colors.textPrimary};`;
    closeBtn.onclick = () => hideDeletePanel();
    header.appendChild(title);
    header.appendChild(closeBtn);
    const content = document.createElement('div');
    content.id = '__gh_delete_content__';
    content.style.cssText = `
        flex: 1;
        padding: 15px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
    `;
    const searchContainer = document.createElement('div');
    searchContainer.style.cssText = `display: flex; gap: 10px; align-items: center; margin-bottom: 10px;`;
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = '搜索文件...';
    searchInput.id = '__gh_delete_search__';
    searchInput.style.cssText = `
        flex: 1;
        padding: 8px;
        border: 1px solid ${colors.border};
        border-radius: 4px;
        background: ${colors.bgSecondary};
        color: ${colors.textPrimary};
    `;
    const selectAllBtn = makeBtn('全选', () => toggleSelectAll());
    selectAllBtn.style.padding = '6px 12px';
    selectAllBtn.style.margin = '0';
    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(selectAllBtn);
    const fileListContainer = document.createElement('div');
    fileListContainer.id = '__gh_delete_file_list__';
    fileListContainer.style.cssText = `
        flex: 1;
        overflow-y: auto;
        border: 1px solid ${colors.border};
        border-radius: 4px;
        padding: 10px;
        background: ${colors.bgSecondary};
    `;
    content.appendChild(searchContainer);
    content.appendChild(fileListContainer);
    const footer = document.createElement('div');
    footer.style.cssText = `
        padding: 15px;
        background: ${colors.bgSecondary};
        border-top: 1px solid ${colors.border};
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    const status = document.createElement('div');
    status.id = '__gh_delete_status__';
    status.style.fontSize = '13px';
    status.style.color = colors.textSecondary;
    const buttonGroup = document.createElement('div');
    buttonGroup.style.display = 'flex';
    buttonGroup.style.gap = '10px';
    const cancelBtn = makeBtn('取消', () => hideDeletePanel());
    cancelBtn.style.padding = '6px 12px';
    cancelBtn.style.margin = '0';
    const deleteBtn = makeBtn('删除选中', () => deleteSelectedFiles());
    deleteBtn.style.padding = '6px 12px';
    deleteBtn.style.margin = '0';
    deleteBtn.style.background = '#cb2431';
    buttonGroup.appendChild(cancelBtn);
    buttonGroup.appendChild(deleteBtn);
    footer.appendChild(status);
    footer.appendChild(buttonGroup);
    panel.appendChild(header);
    panel.appendChild(content);
    panel.appendChild(footer);
    document.documentElement.appendChild(panel);
    addDragAndResizeFunctionality(panel, 'DELETE');
    searchInput.addEventListener('input', function () {
      filterFiles(this.value);
    });
    return panel;
  }
  function showDeletePanel() {
    const panel = document.getElementById('__gh_delete_panel__') || createDeletePanel();
    panel.style.display = 'flex';
    loadRepoFiles();
  }
  function hideDeletePanel() {
    const panel = document.getElementById('__gh_delete_panel__');
    if (panel) panel.style.display = 'none';
  }
  async function loadRepoFiles() {
    const content = document.getElementById('__gh_delete_file_list__');
    const status = document.getElementById('__gh_delete_status__');
    if (!content || !status) return;
    const info = getRepoInfo();
    if (!info.owner || !info.repo) {
      content.innerHTML = '<div style="text-align: center; padding: 20px;">当前不是有效的仓库页面</div>';
      return;
    }
    content.innerHTML = '<div style="text-align: center; padding: 40px;">加载文件列表中...</div>';
    status.textContent = '正在加载文件列表...';
    try {
      const files = await fetchRepoTree(info.owner, info.repo, info.branch);
      if (files.length === 0) {
        content.innerHTML = '<div style="text-align: center; padding: 20px;">仓库中没有文件</div>';
        status.textContent = '没有文件';
        return;
      }
      renderFileList(files);
      status.textContent = `已加载 ${files.length} 个文件/文件夹`;
    } catch (error) {
      console.error('加载文件列表失败:', error);
      content.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #cb2431;">
                <p>加载文件列表失败: ${error.message}</p>
                <button onclick="loadRepoFiles()" style="margin-top: 10px; padding: 8px 16px; background: #2ea44f; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    重试
                </button>
            </div>
        `;
      status.textContent = '加载失败';
    }
  }
  async function fetchRepoTree(owner, repo, branch, path = '') {
    try {
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}${path ? ':' + path : ''}?recursive=true`;
      const response = await fetch(apiUrl, {
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        if (response.status === 409) {
          console.log('仓库太大，使用递归方式获取失败，尝试分层获取');
          return await fetchRepoTreeLayered(owner, repo, branch, path);
        }
        throw new Error(`获取文件树失败: ${response.status}`);
      }
      const data = await response.json();
      return data.tree || [];
    } catch (error) {
      console.error('获取文件树失败:', error);
      throw error;
    }
  }
  async function fetchRepoTreeLayered(owner, repo, branch, path = '') {
    try {
      const rootUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}${path ? ':' + path : ''}`;
      const rootResponse = await fetch(rootUrl, {
        headers: getAuthHeaders()
      });
      if (!rootResponse.ok) {
        throw new Error(`获取根目录失败: ${rootResponse.status}`);
      }
      const rootData = await rootResponse.json();
      let allFiles = [];
      for (const item of rootData.tree) {
        if (item.type === 'blob') {
          allFiles.push(item);
        } else if (item.type === 'tree') {
          const subFiles = await fetchRepoTreeLayered(owner, repo, branch, path ? `${path}/${item.path}` : item.path);
          allFiles = allFiles.concat(subFiles);
        }
      }
      return allFiles;
    } catch (error) {
      console.error('分层获取文件树失败:', error);
      throw error;
    }
  }
  function createDeletePanel() {
    const panelId = '__gh_delete_panel__';
    if (document.getElementById(panelId)) return document.getElementById(panelId);
    const colors = getAdaptiveColors();
    const panel = document.createElement('div');
    panel.id = panelId;
    panel.style.cssText = `
        position: fixed;
        width: 80%;
        height: 80%;
        background: ${colors.bgPrimary};
        color: ${colors.textPrimary};
        z-index: 2147483647;
        border: 1px solid ${colors.border};
        box-shadow: ${colors.shadow};
        display: none;
        flex-direction: column;
        border-radius: 8px;
        overflow: hidden;
    `;
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 15px;
        background: ${colors.bgSecondary};
        border-bottom: 1px solid ${colors.border};
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    const title = document.createElement('span');
    title.textContent = '删除仓库文件';
    title.style.fontWeight = 'bold';
    title.style.color = colors.textPrimary;
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `background: none; border: none; font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px; color: ${colors.textPrimary};`;
    closeBtn.onclick = () => hideDeletePanel();
    header.appendChild(title);
    header.appendChild(closeBtn);
    const content = document.createElement('div');
    content.id = '__gh_delete_content__';
    content.style.cssText = `
        flex: 1;
        padding: 15px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
    `;
    const branchContainer = document.createElement('div');
    branchContainer.style.cssText = `display: flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap;`;
    const branchLabel = document.createElement('span');
    branchLabel.textContent = '选择分支:';
    branchLabel.style.color = colors.textPrimary;
    const branchSelect = document.createElement('select');
    branchSelect.id = '__gh_delete_branch_select__';
    branchSelect.style.cssText = `
        padding: 8px;
        border: 1px solid ${colors.border};
        border-radius: 4px;
        background: ${colors.bgSecondary};
        color: ${colors.textPrimary};
        min-width: 150px;
    `;
    const refreshBtn = makeBtn('刷新分支', () => loadBranchesForDelete());
    refreshBtn.style.padding = '6px 12px';
    refreshBtn.style.margin = '0';
    branchContainer.appendChild(branchLabel);
    branchContainer.appendChild(branchSelect);
    branchContainer.appendChild(refreshBtn);
    const searchContainer = document.createElement('div');
    searchContainer.style.cssText = `display: flex; gap: 10px; align-items: center; margin-bottom: 10px;`;
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = '搜索文件...';
    searchInput.id = '__gh_delete_search__';
    searchInput.style.cssText = `
        flex: 1;
        padding: 8px;
        border: 1px solid ${colors.border};
        border-radius: 4px;
        background: ${colors.bgSecondary};
        color: ${colors.textPrimary};
    `;
    const selectAllBtn = makeBtn('全选', () => toggleSelectAll());
    selectAllBtn.style.padding = '6px 12px';
    selectAllBtn.style.margin = '0';
    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(selectAllBtn);
    const fileListContainer = document.createElement('div');
    fileListContainer.id = '__gh_delete_file_list__';
    fileListContainer.style.cssText = `
        flex: 1;
        overflow-y: auto;
        border: 1px solid ${colors.border};
        border-radius: 4px;
        padding: 10px;
        background: ${colors.bgSecondary};
    `;
    const paginationContainer = document.createElement('div');
    paginationContainer.id = '__gh_delete_pagination__';
    paginationContainer.style.cssText = `
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 10px;
        margin-top: 10px;
    `;
    content.appendChild(branchContainer);
    content.appendChild(searchContainer);
    content.appendChild(fileListContainer);
    content.appendChild(paginationContainer);
    const footer = document.createElement('div');
    footer.style.cssText = `
        padding: 15px;
        background: ${colors.bgSecondary};
        border-top: 1px solid ${colors.border};
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    const status = document.createElement('div');
    status.id = '__gh_delete_status__';
    status.style.fontSize = '13px';
    status.style.color = colors.textSecondary;
    const buttonGroup = document.createElement('div');
    buttonGroup.style.display = 'flex';
    buttonGroup.style.gap = '10px';
    const cancelBtn = makeBtn('取消', () => hideDeletePanel());
    cancelBtn.style.padding = '6px 12px';
    cancelBtn.style.margin = '0';
    const deleteBtn = makeBtn('删除选中', () => deleteSelectedFiles());
    deleteBtn.style.padding = '6px 12px';
    deleteBtn.style.margin = '0';
    deleteBtn.style.background = '#cb2431';
    buttonGroup.appendChild(cancelBtn);
    buttonGroup.appendChild(deleteBtn);
    footer.appendChild(status);
    footer.appendChild(buttonGroup);
    panel.appendChild(header);
    panel.appendChild(content);
    panel.appendChild(footer);
    document.documentElement.appendChild(panel);
    addDragAndResizeFunctionality(panel, 'DELETE');
    searchInput.addEventListener('input', function () {
      filterFiles(this.value);
    });
    branchSelect.addEventListener('change', function () {
      loadRepoFiles();
    });
    return panel;
  }
  async function loadBranchesForDelete() {
    const branchSelect = document.getElementById('__gh_delete_branch_select__');
    if (!branchSelect) return;
    const info = getRepoInfo();
    if (!info.owner || !info.repo) return;
    branchSelect.innerHTML = '<option value="">加载中...</option>';
    try {
      const branches = await fetchAllBranches(info.owner, info.repo);
      branchSelect.innerHTML = '';
      const currentBranch = info.branch || getDefaultBranch();
      branches.forEach(branch => {
        const option = document.createElement('option');
        option.value = branch;
        option.textContent = branch;
        if (branch === currentBranch) {
          option.selected = true;
        }
        branchSelect.appendChild(option);
      });
      loadRepoFiles();
    } catch (error) {
      console.error('加载分支失败:', error);
      branchSelect.innerHTML = '<option value="">加载失败</option>';
    }
  }
  let currentPage = 1;
  const filesPerPage = 50;
  let allFiles = [];
  async function loadRepoFiles() {
    const content = document.getElementById('__gh_delete_file_list__');
    const status = document.getElementById('__gh_delete_status__');
    const branchSelect = document.getElementById('__gh_delete_branch_select__');
    if (!content || !status || !branchSelect) return;
    const info = getRepoInfo();
    if (!info.owner || !info.repo) {
      content.innerHTML = '<div style="text-align: center; padding: 20px;">当前不是有效的仓库页面</div>';
      return;
    }
    const selectedBranch = branchSelect.value || info.branch || getDefaultBranch();
    content.innerHTML = '<div style="text-align: center; padding: 40px;">加载文件列表中...</div>';
    status.textContent = '正在加载文件列表...';
    currentPage = 1;
    try {
      allFiles = await fetchRepoTree(info.owner, info.repo, selectedBranch);
      if (allFiles.length === 0) {
        content.innerHTML = '<div style="text-align: center; padding: 20px;">仓库中没有文件</div>';
        status.textContent = '没有文件';
        return;
      }
      renderFileList();
      updatePagination();
      status.textContent = `已加载 ${allFiles.length} 个文件/文件夹`;
    } catch (error) {
      console.error('加载文件列表失败:', error);
      content.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #cb2431;">
                <p>加载文件列表失败: ${error.message}</p>
                <button onclick="loadRepoFiles()" style="margin-top: 10px; padding: 8px 16px; background: #2ea44f; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    重试
                </button>
            </div>
        `;
      status.textContent = '加载失败';
    }
  }
  function renderFileList() {
    const content = document.getElementById('__gh_delete_file_list__');
    if (!content) return;
    const colors = getAdaptiveColors();
    const startIndex = (currentPage - 1) * filesPerPage;
    const endIndex = Math.min(startIndex + filesPerPage, allFiles.length);
    const currentFiles = allFiles.slice(startIndex, endIndex);
    let html = '<div style="display: flex; flex-direction: column; gap: 5px;">';
    const fileItems = currentFiles.filter(item => item.type === 'blob');
    if (fileItems.length === 0) {
      html += '<div style="text-align: center; padding: 20px;">当前页面没有文件</div>';
    } else {
      fileItems.forEach(file => {
        html += `
                <div style="display: flex; align-items: center; padding: 8px; border-bottom: 1px solid ${colors.border};">
                    <input type="checkbox" class="gh-file-checkbox" data-path="${file.path}" data-sha="${file.sha}" style="margin-right: 10px;">
                    <span style="margin-right: 8px;">📄</span>
                    <span style="flex: 1; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${file.path}">${file.path}</span>
                    <span style="font-size: 12px; color: ${colors.textSecondary};">${formatFileSize(file.size || 0)}</span>
                </div>
            `;
      });
    }
    html += '</div>';
    content.innerHTML = html;
  }
  function updatePagination() {
    const paginationContainer = document.getElementById('__gh_delete_pagination__');
    if (!paginationContainer) return;
    const totalPages = Math.ceil(allFiles.length / filesPerPage);
    if (totalPages <= 1) {
      paginationContainer.innerHTML = '';
      return;
    }
    const colors = getAdaptiveColors();
    let html = '';
    if (currentPage > 1) {
      html += `<button class="gh-page-btn" data-page="${currentPage - 1}" style="padding: 6px 12px; border: 1px solid ${colors.border}; border-radius: 4px; background: ${colors.bgSecondary}; color: ${colors.textPrimary}; cursor: pointer;">上一页</button>`;
    }
    html += `<span style="color: ${colors.textPrimary}; margin: 0 10px;">第 ${currentPage} 页 / 共 ${totalPages} 页</span>`;
    if (currentPage < totalPages) {
      html += `<button class="gh-page-btn" data-page="${currentPage + 1}" style="padding: 6px 12px; border: 1px solid ${colors.border}; border-radius: 4px; background: ${colors.bgSecondary}; color: ${colors.textPrimary}; cursor: pointer;">下一页</button>`;
    }
    paginationContainer.innerHTML = html;
    paginationContainer.querySelectorAll('.gh-page-btn').forEach(button => {
      button.addEventListener('click', function () {
        const page = parseInt(this.getAttribute('data-page'));
        changePage(page);
      });
    });
  }
  function changePage(page) {
    currentPage = page;
    renderFileList();
    updatePagination();
    const content = document.getElementById('__gh_delete_file_list__');
    if (content) {
      content.scrollTop = 0;
    }
  }
  function showDeletePanel() {
    const panel = document.getElementById('__gh_delete_panel__') || createDeletePanel();
    panel.style.display = 'flex';
    loadBranchesForDelete();
  }
  async function deleteSelectedFiles() {
    const selectedFiles = document.querySelectorAll('.gh-file-checkbox:checked');
    if (selectedFiles.length === 0) {
      const status = document.getElementById('__gh_delete_status__');
      if (status) {
        status.textContent = '请先选择要删除的文件';
        status.style.color = '#cb2431';
      }
      return;
    }
    const deletePanel = document.getElementById('__gh_delete_panel__');
    if (!deletePanel) return;
    const confirmContainer = document.createElement('div');
    confirmContainer.id = '__gh_delete_confirm_container__';
    confirmContainer.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;
    const colors = getAdaptiveColors();
    const confirmDialog = document.createElement('div');
    confirmDialog.style.cssText = `
        background: ${colors.bgPrimary};
        color: ${colors.textPrimary};
        border: 1px solid ${colors.border};
        border-radius: 8px;
        padding: 20px;
        box-shadow: ${colors.shadow};
        min-width: 300px;
        max-width: 80%;
        max-height: 80%;
        overflow: auto;
    `;
    const fileList = Array.from(selectedFiles).map(file => {
      return file.getAttribute('data-path');
    }).join('\n');
    confirmDialog.innerHTML = `
        <h3 style="margin-top: 0; color: ${colors.textPrimary};">确认删除</h3>
        <p style="color: ${colors.textSecondary}; margin-bottom: 15px;">您确定要删除以下 ${selectedFiles.length} 个文件吗？此操作无法撤销！</p>
        <div style="max-height: 200px; overflow-y: auto; border: 1px solid ${colors.border}; padding: 10px; margin-bottom: 15px; background: ${colors.bgSecondary};">
            <pre style="margin: 0; font-size: 12px; color: ${colors.textPrimary};">${fileList}</pre>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button id="__gh_delete_cancel__" style="padding: 8px 16px; background: ${colors.bgSecondary}; color: ${colors.textPrimary}; border: 1px solid ${colors.border}; border-radius: 4px; cursor: pointer;">取消</button>
            <button id="__gh_delete_confirm__" style="padding: 8px 16px; background: #cb2431; color: white; border: none; border-radius: 4px; cursor: pointer;">确认删除</button>
        </div>
    `;
    confirmContainer.appendChild(confirmDialog);
    deletePanel.appendChild(confirmContainer);
    document.getElementById('__gh_delete_cancel__').addEventListener('click', () => {
      deletePanel.removeChild(confirmContainer);
    });
    document.getElementById('__gh_delete_confirm__').addEventListener('click', async () => {
      deletePanel.removeChild(confirmContainer);
      await performFileDeletion(selectedFiles);
    });
  }
  async function performFileDeletion(selectedFiles) {
    const status = document.getElementById('__gh_delete_status__');
    const branchSelect = document.getElementById('__gh_delete_branch_select__');
    if (!status || !branchSelect) return;
    const info = getRepoInfo();
    if (!info.owner || !info.repo) {
      status.textContent = '无法确定仓库信息';
      status.style.color = '#cb2431';
      return;
    }
    const selectedBranch = branchSelect.value;
    if (!selectedBranch) {
      status.textContent = '请选择目标分支';
      status.style.color = '#cb2431';
      return;
    }
    if (!isAuthenticated()) {
      status.textContent = '请先进行GitHub认证';
      status.style.color = '#cb2431';
      showAuthDialog();
      return;
    }
    status.textContent = '删除文件中...';
    status.style.color = getAdaptiveColors().textSecondary;
    try {
      let successCount = 0;
      let failCount = 0;
      for (const fileCheckbox of selectedFiles) {
        const filePath = fileCheckbox.getAttribute('data-path');
        const fileSha = fileCheckbox.getAttribute('data-sha');
        if (!filePath || !fileSha) {
          console.error('文件路径或SHA缺失:', filePath, fileSha);
          failCount++;
          continue;
        }
        const deleteUrl = `https://api.github.com/repos/${info.owner}/${info.repo}/contents/${encodeURIComponent(filePath)}`;
        const deleteData = {
          message: `删除文件 ${filePath} via GitHub助手`,
          sha: fileSha,
          branch: selectedBranch
        };
        try {
          const response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: getAuthHeaders(),
            body: JSON.stringify(deleteData)
          });
          if (response.ok) {
            successCount++;
          } else {
            console.error(`删除文件失败 ${filePath}:`, response.status, response.statusText);
            failCount++;
          }
        } catch (error) {
          console.error(`删除文件失败 ${filePath}:`, error);
          failCount++;
        }
      }
      if (failCount === 0) {
        status.textContent = `成功删除 ${successCount} 个文件!`;
        status.style.color = '#28a745';
        safeNotify('删除成功', `已删除 ${successCount} 个文件`);
        setTimeout(() => {
          loadRepoFiles();
        }, 3000);
      } else {
        status.textContent = `完成: ${successCount} 个成功, ${failCount} 个失败`;
        status.style.color = '#cb2431';
        setTimeout(() => {
          loadRepoFiles();
        }, 3000);
      }
    } catch (error) {
      console.error('删除文件过程中出错:', error);
      status.textContent = `删除失败: ${error.message}`;
      status.style.color = '#cb2431';
    }
  }
  async function buildRescueLinks() {
    var wrap = document.createElement('div');
    var info = getRepoInfo();
    var owner = info.owner,
      repo = info.repo,
      branch = info.branch,
      filePath = info.filePath;
    const colors = getAdaptiveColors();
    if (!owner || !repo) {
      wrap.textContent = '当前不是仓库页。';
      wrap.style.color = colors.textPrimary;
      return wrap;
    }
    const isPrivate = await isPrivateRepo(owner, repo);
    if (isPrivate && !isAuthenticated()) {
      const privateWarning = document.createElement('div');
      privateWarning.className = 'gh-private-warning';
      privateWarning.innerHTML = '⚠️ 当前是私有仓库，部分功能需要<a href="#" id="__gh_private_login__">GitHub认证</a>才能使用';
      wrap.appendChild(privateWarning);
    }
    const authStatus = document.createElement('div');
    authStatus.style.marginBottom = '10px';
    authStatus.style.padding = '5px';
    authStatus.style.borderBottom = `1px solid ${colors.border}`;
    authStatus.style.color = colors.textPrimary;
    if (isAuthenticated()) {
      const userInfo = GM_getValue(STORAGE_KEYS.USER_INFO, {});
      authStatus.innerHTML = `✅ 已认证: <strong>${userInfo.login || 'GitHub用户'}</strong> | 
        <a href="#" id="__gh_logout__" style="color: ${colors.link}; text-decoration: underline;">退出</a>`;
    } else {
      authStatus.innerHTML = `❌ 未认证 | 
        <a href="#" id="__gh_login__" style="color: ${colors.link}; text-decoration: underline;">登录GitHub</a>`;
    }
    wrap.appendChild(authStatus);
    wrap.appendChild(makeLink('/' + owner + '/' + repo + '/issues', 'Issues'));
    wrap.appendChild(makeLink('/' + owner + '/' + repo + '/pulls', 'Pull Requests'));
    wrap.appendChild(makeLink('/' + owner + '/' + repo + '/releases', 'Releases'));
    wrap.appendChild(makeLink('/' + owner + '/' + repo + '/actions', 'Actions'));
    var branches = await fetchAllBranches(owner, repo);
    if (branches.length > 0) {
      var selectWrap = document.createElement('div');
      selectWrap.style.margin = '10px 0';
      var selectLabel = document.createElement('span');
      selectLabel.textContent = '选择分支: ';
      selectLabel.style.marginRight = '5px';
      selectLabel.style.color = colors.textPrimary;
      var select = document.createElement('select');
      select.id = '__gh_branch_select__';
      select.style.marginRight = '8px';
      select.style.fontSize = '12px';
      select.style.padding = '6px 12px';
      select.style.background = colors.bgSecondary;
      select.style.color = colors.textPrimary;
      select.style.border = `1px solid ${colors.border}`;
      select.style.borderRadius = '6px';
      select.style.height = '32px';
      select.style.minWidth = '100px';
      select.style.boxSizing = 'border-box';
      const savedBranch = GM_getValue(STORAGE_KEYS.SELECTED_BRANCH, branch);
      branches.forEach(b => {
        var option = document.createElement('option');
        option.value = b;
        option.textContent = b;
        if (b === savedBranch) option.selected = true;
        select.appendChild(option);
      });
      select.addEventListener('change', function () {
        GM_setValue(STORAGE_KEYS.SELECTED_BRANCH, this.value);
      });
      selectWrap.appendChild(selectLabel);
      selectWrap.appendChild(select);
      var zipBtn = makeBtn('⬇️ Download ZIP', () => {
        var chosenBranch = select.value;
        downloadZipForBranch(owner, repo, chosenBranch);
      }, '下载选中分支的ZIP文件');
      var openBranchBtn = makeBtn('🌐 打开分支', () => {
        var chosenBranch = select.value;
        var branchUrl = `https://github.com/${owner}/${repo}/tree/${chosenBranch}`;
        window.open(branchUrl, '_blank');
      }, '在新标签页中打开选中的分支');
      var copyGitBtn = makeBtn('📋 Git链接', () => {
        showGitUrlDialog();
      }, '复制Git仓库地址');
      selectWrap.appendChild(zipBtn);
      selectWrap.appendChild(openBranchBtn);
      selectWrap.appendChild(copyGitBtn);
      wrap.appendChild(selectWrap);
    }
    if (isForkRepository()) {
      const parentRepo = getParentRepoInfo();
      if (parentRepo) {
        const syncSection = document.createElement('div');
        syncSection.style.margin = '10px 0';
        syncSection.style.padding = '10px';
        syncSection.style.borderTop = `1px solid ${colors.border}`;
        const syncTitle = document.createElement('div');
        syncTitle.textContent = 'Fork 操作:';
        syncTitle.style.fontWeight = 'bold';
        syncTitle.style.marginBottom = '5px';
        syncTitle.style.color = colors.textPrimary;
        const syncDesc = document.createElement('div');
        syncDesc.textContent = `上游仓库: ${parentRepo.owner}/${parentRepo.repo}`;
        syncDesc.style.fontSize = '12px';
        syncDesc.style.color = colors.textSecondary;
        syncDesc.style.marginBottom = '8px';
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.flexWrap = 'wrap';
        const syncBtn = makeBtn('🔄 Sync Fork', () => syncForkWithUpstream(), '与上游仓库同步');
        const forkBtn = makeBtn('⑂ Fork仓库', () => forkRepository(), '一键Fork此仓库到您的账户');
        buttonContainer.appendChild(syncBtn);
        buttonContainer.appendChild(forkBtn);
        syncSection.appendChild(syncTitle);
        syncSection.appendChild(syncDesc);
        syncSection.appendChild(buttonContainer);
        wrap.appendChild(syncSection);
      }
    } else {
      const forkSection = document.createElement('div');
      forkSection.style.margin = '10px 0';
      forkSection.style.padding = '10px';
      forkSection.style.borderTop = `1px solid ${colors.border}`;
      const forkTitle = document.createElement('div');
      forkTitle.textContent = '仓库操作:';
      forkTitle.style.fontWeight = 'bold';
      forkTitle.style.marginBottom = '5px';
      forkTitle.style.color = colors.textPrimary;
      const forkDesc = document.createElement('div');
      forkDesc.textContent = '将此仓库Fork到您的账户';
      forkDesc.style.fontSize = '12px';
      forkDesc.style.color = colors.textSecondary;
      forkDesc.style.marginBottom = '8px';
      const forkBtn = makeBtn('⑂ Fork仓库', () => forkRepository(), '一键Fork此仓库到您的账户');
      forkSection.appendChild(forkTitle);
      forkSection.appendChild(forkDesc);
      forkSection.appendChild(forkBtn);
      wrap.appendChild(forkSection);
    }
    if (filePath) {
      var fileSection = document.createElement('div');
      fileSection.style.margin = '10px 0';
      fileSection.style.padding = '10px';
      fileSection.style.borderTop = `1px solid ${colors.border}`;
      var fileTitle = document.createElement('div');
      fileTitle.textContent = '当前文件:';
      fileTitle.style.fontWeight = 'bold';
      fileTitle.style.marginBottom = '5px';
      fileTitle.style.color = colors.textPrimary;
      var fileName = document.createElement('div');
      fileName.textContent = filePath;
      fileName.style.fontFamily = 'monospace';
      fileName.style.fontSize = '12px';
      fileName.style.marginBottom = '10px';
      fileName.style.color = colors.textSecondary;
      fileSection.appendChild(fileTitle);
      fileSection.appendChild(fileName);
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
      const rawBtn = makeBtn('🌐 打开Raw文件', () => window.open(rawUrl, '_blank'), '在新标签页中打开Raw文件');
      fileSection.appendChild(rawBtn);
      const downloadBtn = makeBtn('⬇️ 下载文件', function () {
        downloadViaGM(rawUrl, filePath, isPrivate);
      }, '下载当前文件');
      fileSection.appendChild(downloadBtn);
      const editBtn = makeBtn('✏️ 编辑文件', function () {
        loadFileForEditing();
      }, '编辑当前文件');
      fileSection.appendChild(editBtn);
      const decryptSection = document.createElement('div');
      decryptSection.style.margin = '10px 0';
      decryptSection.style.padding = '10px';
      decryptSection.style.borderTop = `1px solid ${colors.border}`;
      const decryptTitle = document.createElement('div');
      decryptTitle.textContent = '解密功能:';
      decryptTitle.style.fontWeight = 'bold';
      decryptTitle.style.marginBottom = '5px';
      decryptTitle.style.color = colors.textPrimary;
      decryptSection.appendChild(decryptTitle);
      const decryptDesc = document.createElement('div');
      decryptDesc.textContent = '将当前文件内容上传到decode库进行解密，等待60s左右即可查看解密结果';
      decryptDesc.style.fontSize = '12px';
      decryptDesc.style.color = colors.textSecondary;
      decryptDesc.style.marginBottom = '8px';
      decryptSection.appendChild(decryptDesc);
      const decryptButtons = document.createElement('div');
      decryptButtons.style.display = 'flex';
      decryptButtons.style.gap = '10px';
      decryptButtons.style.flexWrap = 'wrap';
      const uploadPlaintextBtn = makeBtn('📤 上传密文', async function () {
        try {
          const selectedBranch = GM_getValue(STORAGE_KEYS.SELECTED_BRANCH, branch);
          const content = await getRawFileContent(owner, repo, selectedBranch, filePath);
          const success = await uploadToDecodeInput(content, filePath);
          if (success) {
            safeNotify('上传成功', '文件内容已上传到decode库的input.js');
          }
        } catch (error) {
          console.error('上传密文失败:', error);
          alert('上传密文失败: ' + error.message);
        }
      }, '将当前文件内容上传到decode库的input.js');
      uploadPlaintextBtn.style.flex = '1';
      decryptButtons.appendChild(uploadPlaintextBtn);
      const uploadLocalFileBtn = makeBtn('📁 上传本地文件', function () {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.js,.txt,.text,.json,.xml,.html,.css,.py,.java,.c,.cpp,.cs,.php,.rb,.go,.rs,.ts,.jsx,.tsx,.md,.yaml,.yml,.sh,.bat,.cmd,.ps1';
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', async function (e) {
          const file = e.target.files[0];
          if (!file) return;
          try {
            const reader = new FileReader();
            reader.onload = async function (e) {
              const content = e.target.result;
              const success = await uploadToDecodeInput(content, file.name);
              if (success) {
                safeNotify('上传成功', `本地文件 "${file.name}" 已上传到decode库`);
              }
            };
            reader.readAsText(file);
          } catch (error) {
            console.error('读取本地文件失败:', error);
            alert('读取本地文件失败: ' + error.message);
          }
          document.body.removeChild(fileInput);
        });
        document.body.appendChild(fileInput);
        fileInput.click();
      }, '选择本地文件上传到decode库');
      uploadLocalFileBtn.style.flex = '1';
      decryptButtons.appendChild(uploadLocalFileBtn);
      const decryptResultBtn = makeBtn('🔓 解密结果', async function () {
        try {
          const result = await getDecodeOutput();
          if (result) {
            showDecryptResult(result);
          } else {
            alert('无法获取解密结果，请检查:\n1. 您是否有访问decode库的权限\n2. output.js文件是否存在\n3. GitHub认证是否有效');
          }
        } catch (error) {
          console.error('获取解密结果失败:', error);
          alert('获取解密结果失败: ' + error.message);
        }
      }, '获取decode库output.js的解密结果');
      decryptResultBtn.style.flex = '1';
      decryptButtons.appendChild(decryptResultBtn);
      decryptSection.appendChild(decryptButtons);
      fileSection.appendChild(decryptSection);
      wrap.appendChild(fileSection);
    }
    const fileOperationsSection = document.createElement('div');
    fileOperationsSection.style.margin = '10px 0';
    fileOperationsSection.style.padding = '10px';
    fileOperationsSection.style.borderTop = `1px solid ${colors.border}`;
    const fileOperationsTitle = document.createElement('div');
    fileOperationsTitle.textContent = '文件操作:';
    fileOperationsTitle.style.fontWeight = 'bold';
    fileOperationsTitle.style.marginBottom = '8px';
    fileOperationsTitle.style.color = colors.textPrimary;
    fileOperationsSection.appendChild(fileOperationsTitle);
    const fileOperationsDesc = document.createElement('div');
    fileOperationsDesc.textContent = '上传或删除仓库文件';
    fileOperationsDesc.style.fontSize = '12px';
    fileOperationsDesc.style.color = colors.textSecondary;
    fileOperationsDesc.style.marginBottom = '8px';
    fileOperationsSection.appendChild(fileOperationsDesc);
    const fileOperationsButtons = document.createElement('div');
    fileOperationsButtons.style.display = 'flex';
    fileOperationsButtons.style.gap = '10px';
    fileOperationsButtons.style.flexWrap = 'wrap';
    const fileListBtn = makeBtn('📂 文件列表', () => {
      if (!isAuthenticated()) {
        alert('请先进行 GitHub 认证才能查看文件列表');
        showAuthDialog();
        return;
      }
      showFileListPanel();
    }, '浏览仓库中的所有文件并快速跳转');
    fileListBtn.style.flex = '1';
    fileOperationsButtons.appendChild(fileListBtn);
    const uploadBtn = makeBtn('📤 上传文件', () => {
      if (!isAuthenticated()) {
        alert('请先进行 GitHub 认证才能上传文件');
        showAuthDialog();
        return;
      }
      showUploadPanel();
    }, '上传文件到当前仓库');
    uploadBtn.style.flex = '1';
    fileOperationsButtons.appendChild(uploadBtn);
    const deleteBtn = makeBtn('🗑️ 删除文件', () => {
      if (!isAuthenticated()) {
        alert('请先进行 GitHub 认证才能删除文件');
        showAuthDialog();
        return;
      }
      showDeletePanel();
    }, '批量选择并删除仓库文件');
    deleteBtn.style.flex = '1';
    fileOperationsButtons.appendChild(deleteBtn);
    fileOperationsSection.appendChild(fileOperationsButtons);
    wrap.appendChild(fileOperationsSection);
    const workflowReleaseSection = document.createElement('div');
    workflowReleaseSection.style.margin = '10px 0';
    workflowReleaseSection.style.padding = '10px';
    workflowReleaseSection.style.borderTop = `1px solid ${colors.border}`;
    const workflowReleaseTitle = document.createElement('div');
    workflowReleaseTitle.textContent = '高级功能:';
    workflowReleaseTitle.style.fontWeight = 'bold';
    workflowReleaseTitle.style.marginBottom = '8px';
    workflowReleaseTitle.style.color = colors.textPrimary;
    workflowReleaseSection.appendChild(workflowReleaseTitle);
    const workflowReleaseDesc = document.createElement('div');
    workflowReleaseDesc.textContent = '工作流管理和Release检测';
    workflowReleaseDesc.style.fontSize = '12px';
    workflowReleaseDesc.style.color = colors.textSecondary;
    workflowReleaseDesc.style.marginBottom = '8px';
    workflowReleaseSection.appendChild(workflowReleaseDesc);
    const workflowReleaseButtons = document.createElement('div');
    workflowReleaseButtons.style.display = 'flex';
    workflowReleaseButtons.style.gap = '10px';
    workflowReleaseButtons.style.flexWrap = 'wrap';
    const workflowsBtn = makeBtn('⚙️ Workflows', function () {
      if (!isAuthenticated()) {
        alert('请先进行 GitHub 认证才能查看工作流');
        showAuthDialog();
        return;
      }
      showWorkflowsPanel();
    }, '查看和运行工作流');
    workflowsBtn.style.flex = '1';
    workflowReleaseButtons.appendChild(workflowsBtn);
    const checkReleasesBtn = makeBtn('🔍 检测Release', () => {
      showReleasesPanel();
    }, '检测当前仓库的Release文件可用性');
    checkReleasesBtn.style.flex = '1';
    workflowReleaseButtons.appendChild(checkReleasesBtn);
    workflowReleaseSection.appendChild(workflowReleaseButtons);
    wrap.appendChild(workflowReleaseSection);
    const settingsSection = document.createElement('div');
    settingsSection.style.margin = '10px 0';
    settingsSection.style.padding = '10px';
    settingsSection.style.borderTop = `1px solid ${colors.border}`;
    const settingsTitle = document.createElement('div');
    settingsTitle.textContent = 'GitHub 设置:';
    settingsTitle.style.fontWeight = 'bold';
    settingsTitle.style.marginBottom = '8px';
    settingsTitle.style.color = colors.textPrimary;
    settingsSection.appendChild(settingsTitle);
    const gistsBtn = makeBtn('📝 Your Gists', function () {
      if (!isAuthenticated()) {
        alert('请先进行 GitHub 认证才能查看 Gists');
        showAuthDialog();
        return;
      }
      showGistsPanel();
    }, '查看和管理你的 Gists');
    settingsSection.appendChild(gistsBtn);
    const settingsBtn = makeBtn('⚙️ Settings', function () {
      openGitHubSettings();
    }, '打开GitHub设置');
    settingsSection.appendChild(settingsBtn);
    wrap.appendChild(settingsSection);
    const authorInfo = document.createElement('div');
    authorInfo.style.marginTop = '10px';
    authorInfo.style.paddingTop = '10px';
    authorInfo.style.textAlign = 'center';
    const authorText = document.createElement('div');
    authorText.textContent = 'GitHub助手增强版 by Mr.Eric 6.0.28';
    authorText.style.color = colors.textSecondary;
    authorText.style.fontSize = '12px';
    authorText.style.fontStyle = 'italic';
    authorInfo.appendChild(authorText);
    wrap.appendChild(authorInfo);
    setTimeout(() => {
      const loginBtn = document.getElementById('__gh_login__');
      const logoutBtn = document.getElementById('__gh_logout__');
      const privateLoginBtn = document.getElementById('__gh_private_login__');
      if (loginBtn) {
        loginBtn.addEventListener('click', e => {
          e.preventDefault();
          showAuthDialog();
        });
      }
      if (logoutBtn) {
        logoutBtn.addEventListener('click', e => {
          e.preventDefault();
          clearGitHubToken();
          updateRescuePanel();
          safeNotify('已退出登录', 'GitHub 认证已清除');
        });
      }
      if (privateLoginBtn) {
        privateLoginBtn.addEventListener('click', e => {
          e.preventDefault();
          showAuthDialog();
        });
      }
    }, 100);
    return wrap;
  }
  function ensureRescueButtonAndPanel() {
    const oldBtn = document.getElementById('__gh_rescue_btn__');
    const oldPanel = document.getElementById('__gh_rescue_panel__');
    if (oldBtn) oldBtn.remove();
    if (oldPanel) oldPanel.remove();
    const colors = getAdaptiveColors();
    var btn = document.createElement('button');
    btn.id = '__gh_rescue_btn__';
    btn.textContent = '👾 Fix GitHub';
    Object.assign(btn.style, {
      position: 'fixed',
      right: '10px',
      bottom: '12px',
      zIndex: 2147483647,
      padding: '6px 12px',
      border: `1px solid ${colors.border}`,
      borderRadius: '6px',
      background: colors.bgPrimary,
      color: colors.textPrimary,
      fontSize: '12px',
      cursor: 'pointer',
      height: '32px',
      minWidth: '100px',
      boxSizing: 'border-box'
    });
    var panel = document.createElement('div');
    panel.id = '__gh_rescue_panel__';
    Object.assign(panel.style, {
      position: 'fixed',
      right: '10px',
      bottom: '48px',
      zIndex: 2147483647,
      padding: '10px',
      border: `1px solid ${colors.border}`,
      borderRadius: '8px',
      background: colors.bgPrimary,
      color: colors.textPrimary,
      fontSize: '13px',
      display: 'none',
      maxWidth: '80vw',
      maxHeight: '80vh',
      overflow: 'auto',
      boxShadow: colors.shadow
    });
    panel.addEventListener('click', function (e) {
      e.stopPropagation();
    });
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      if (panel.style.display === 'block') updateRescuePanel();
    });
    document.addEventListener('click', function (e) {
      const panel = document.getElementById('__gh_rescue_panel__');
      const btn = document.getElementById('__gh_rescue_btn__');
      if (panel && panel.style.display === 'block' && !panel.contains(e.target) && e.target !== btn) {
        if (panel.autoCloseTimer) {
          clearTimeout(panel.autoCloseTimer);
        }
        panel.autoCloseTimer = setTimeout(() => {
          if (panel && panel.style.display === 'block') {
            panel.style.display = 'none';
          }
        }, 20000);
      }
    });
    const originalUpdateRescuePanel = updateRescuePanel;
    updateRescuePanel = async function () {
      const panel = document.getElementById('__gh_rescue_panel__');
      if (panel && panel.autoCloseTimer) {
        clearTimeout(panel.autoCloseTimer);
        panel.autoCloseTimer = null;
      }
      await originalUpdateRescuePanel.apply(this, arguments);
    };
    document.documentElement.appendChild(btn);
    document.documentElement.appendChild(panel);
    createEditor();
    createAuthDialog();
    createGistsPanel();
    createWorkflowsPanel();
    createGitUrlDialog();
    console.log('GitHub Rescue 按钮和面板已初始化');
  }
  async function updateRescuePanel() {
    var panel = document.getElementById('__gh_rescue_panel__');
    if (!panel) {
      ensureRescueButtonAndPanel();
      panel = document.getElementById('__gh_rescue_panel__');
      if (!panel) return;
    }
    if (panel.style.display === 'none') return;
    panel.innerHTML = '<div style="padding: 10px;">加载中...</div>';
    try {
      var content = await buildRescueLinks();
      panel.innerHTML = '';
      panel.appendChild(content);
    } catch (e) {
      console.error('更新面板失败:', e);
      panel.innerHTML = '<div style="padding: 10px; color: red;">加载失败</div>';
    }
  }
  function updateUIWithAuthStatus() {
    updateRescuePanel();
  }
  function downloadViaGM(url, suggestedName, isPrivate = false) {
    try {
      const headers = {};
      if (isPrivate && isAuthenticated()) {
        headers['Authorization'] = `token ${getGitHubToken()}`;
      }
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        headers: headers,
        responseType: 'blob',
        onload: function (response) {
          try {
            var blob = response.response;
            var a = document.createElement('a');
            var objectUrl = URL.createObjectURL(blob);
            a.href = objectUrl;
            a.download = suggestedName && suggestedName.split('/').pop() || 'download';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              URL.revokeObjectURL(objectUrl);
              a.remove();
            }, 3000);
          } catch (e) {
            window.open(url, '_blank');
          }
        },
        onerror: function (err) {
          console.error('下载失败:', err);
          if (isPrivate && !isAuthenticated()) {
            alert('下载私有库资源需要GitHub认证，请先进行认证');
            showAuthDialog();
          } else {
            window.open(url, '_blank');
          }
        }
      });
    } catch (e) {
      try {
        window.open(url, '_blank');
      } catch (_) {
        console.error(e);
      }
    }
  }
  async function getRawFileContent(owner, repo, branch, filePath) {
    try {
      const encodedFilePath = encodeURIComponent(filePath);
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedFilePath}?ref=${branch}`;
      const response = await fetch(apiUrl, {
        headers: isAuthenticated() ? getEnhancedAuthHeaders() : {}
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`无法获取文件: ${response.status} - ${errorText}`);
      }
      const fileData = await response.json();
      return base64ToUtf8(fileData.content.replace(/\s/g, ''));
    } catch (error) {
      console.error('获取文件内容失败:', error);
      try {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodeURIComponent(filePath)}`;
        const rawResponse = await fetch(rawUrl, {
          headers: isAuthenticated() ? getEnhancedAuthHeaders() : {}
        });
        if (rawResponse.ok) {
          return await rawResponse.text();
        }
      } catch (rawError) {
        console.error('Raw URL也失败:', rawError);
      }
      throw error;
    }
  }
  async function loadFileForEditing() {
    const info = getRepoInfo();
    if (!info.filePath) {
      alert('当前页面不是文件页面');
      return;
    }
    try {
      const content = await getRawFileContent(info.owner, info.repo, info.branch, info.filePath);
      showEditor(content, info.filePath.split('/').pop());
    } catch (error) {
      console.error('加载文件失败:', error);
      if (error.message.includes('401') || error.message.includes('403')) {
        alert('加载私有库文件需要GitHub认证，请先进行认证');
        showAuthDialog();
      } else {
        alert('加载文件失败: ' + error.message);
      }
    }
  }
  async function downloadZipForBranch(owner, repo, branch) {
    const zipUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${branch}`;
    const isPrivate = await isPrivateRepo(owner, repo);
    downloadViaGM(zipUrl, `${repo}-${branch}.zip`, isPrivate);
  }
  async function isPrivateRepo(owner, repo) {
    try {
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
      const response = await fetch(apiUrl, {
        headers: isAuthenticated() ? getAuthHeaders() : {}
      });
      if (response.ok) {
        const repoInfo = await response.json();
        return repoInfo.private === true;
      }
      return response.status === 404 || response.status === 403;
    } catch (error) {
      console.error('检测仓库类型失败:', error);
      return true;
    }
  }
  function getGitUrl(owner, repo, urlType = 'https') {
    if (!owner || !repo) return '';
    if (urlType === 'ssh') {
      return `git@github.com:${owner}/${repo}.git`;
    } else {
      return `https://github.com/${owner}/${repo}.git`;
    }
  }
  function showGitUrlQuick(owner, repo) {
    const httpsUrl = getGitUrl(owner, repo, 'https');
    copyToClipboard(httpsUrl);
  }
  function openGitHubSettings() {
    window.open('https://github.com/settings/profile', '_blank');
  }
  function createFileListPanel() {
    const panelId = '__gh_file_list_panel__';
    if (document.getElementById(panelId)) return document.getElementById(panelId);
    const colors = getAdaptiveColors();
    const panel = document.createElement('div');
    panel.id = panelId;
    panel.style.cssText = `
        position: fixed;
        width: 80%;
        height: 80%;
        background: ${colors.bgPrimary};
        color: ${colors.textPrimary};
        z-index: 2147483647;
        border: 1px solid ${colors.border};
        box-shadow: ${colors.shadow};
        display: none;
        flex-direction: column;
        border-radius: 8px;
        overflow: hidden;
    `;
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 15px;
        background: ${colors.bgSecondary};
        border-bottom: 1px solid ${colors.border};
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    const title = document.createElement('span');
    title.textContent = '仓库文件列表';
    title.style.fontWeight = 'bold';
    title.style.color = colors.textPrimary;
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `background: none; border: none; font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px; color: ${colors.textPrimary};`;
    closeBtn.onclick = () => hideFileListPanel();
    header.appendChild(title);
    header.appendChild(closeBtn);
    const content = document.createElement('div');
    content.id = '__gh_file_list_content__';
    content.style.cssText = `
        flex: 1;
        padding: 15px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
    `;
    const searchContainer = document.createElement('div');
    searchContainer.style.cssText = `display: flex; gap: 10px; align-items: center; margin-bottom: 10px;`;
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = '搜索文件...';
    searchInput.id = '__gh_file_list_search__';
    searchInput.style.cssText = `
        flex: 1;
        padding: 8px;
        border: 1px solid ${colors.border};
        border-radius: 4px;
        background: ${colors.bgSecondary};
        color: ${colors.textPrimary};
    `;
    const selectAllBtn = makeBtn('全选', () => toggleFileListSelectAll());
    selectAllBtn.style.padding = '6px 12px';
    selectAllBtn.style.margin = '0';
    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(selectAllBtn);
    const fileListContainer = document.createElement('div');
    fileListContainer.id = '__gh_file_list_container__';
    fileListContainer.style.cssText = `
        flex: 1;
        overflow-y: auto;
        border: 1px solid ${colors.border};
        border-radius: 4px;
        padding: 10px;
        background: ${colors.bgSecondary};
    `;
    content.appendChild(searchContainer);
    content.appendChild(fileListContainer);
    const footer = document.createElement('div');
    footer.style.cssText = `
    padding: 15px;
    background: ${colors.bgSecondary}; 
    border-top: 1px solid ${colors.border}; 
    display: flex; 
    justify-content: space-between; 
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
`;
    const status = document.createElement('div');
    status.id = '__gh_file_list_status__';
    status.style.cssText = `
    font-size: 13px;
    color: ${colors.textSecondary};
    flex: 1;
    min-width: 200px;
`;
    const buttonGroup = document.createElement('div');
    buttonGroup.style.cssText = `
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
`;
    const cancelBtn = makeBtn('关闭', () => hideFileListPanel());
    cancelBtn.style.padding = '6px 12px';
    cancelBtn.style.margin = '0';
    const viewPageBtn = makeBtn('跳转到页面', () => openSelectedFiles('page'));
    viewPageBtn.style.padding = '6px 12px';
    viewPageBtn.style.margin = '0';
    const viewRawBtn = makeBtn('跳转到Raw', () => openSelectedFiles('raw'));
    viewRawBtn.style.padding = '6px 12px';
    viewRawBtn.style.margin = '0';
    buttonGroup.appendChild(cancelBtn);
    buttonGroup.appendChild(viewPageBtn);
    buttonGroup.appendChild(viewRawBtn);
    footer.appendChild(status);
    footer.appendChild(buttonGroup);
    panel.appendChild(header);
    panel.appendChild(content);
    panel.appendChild(footer);
    document.documentElement.appendChild(panel);
    addDragAndResizeFunctionality(panel, 'FILE_LIST');
    searchInput.addEventListener('input', function () {
      filterFileList(this.value);
    });
    return panel;
  }
  function showFileListPanel() {
    const panel = document.getElementById('__gh_file_list_panel__') || createFileListPanel();
    panel.style.display = 'flex';
    loadRepoFilesForList();
  }
  function hideFileListPanel() {
    const panel = document.getElementById('__gh_file_list_panel__');
    if (panel) panel.style.display = 'none';
  }
  async function loadRepoFilesForList() {
    const content = document.getElementById('__gh_file_list_container__');
    const status = document.getElementById('__gh_file_list_status__');
    if (!content || !status) return;
    const info = getRepoInfo();
    if (!info.owner || !info.repo) {
      content.innerHTML = '<div style="text-align: center; padding: 20px;">当前不是有效的仓库页面</div>';
      return;
    }
    content.innerHTML = '<div style="text-align: center; padding: 40px;">加载文件列表中...</div>';
    status.textContent = '正在加载文件列表...';
    try {
      const files = await fetchRepoTree(info.owner, info.repo, info.branch);
      if (files.length === 0) {
        content.innerHTML = '<div style="text-align: center; padding: 20px;">仓库中没有文件</div>';
        status.textContent = '没有文件';
        return;
      }
      renderFileListForBrowse(files);
      status.textContent = `已加载 ${files.length} 个文件/文件夹`;
    } catch (error) {
      console.error('加载文件列表失败:', error);
      content.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #cb2431;">
                <p>加载文件列表失败: ${error.message}</p>
                <button onclick="loadRepoFilesForList()" style="margin-top: 10px; padding: 8px 16px; background: #2ea44f; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    重试
                </button>
            </div>
        `;
      status.textContent = '加载失败';
    }
  }
  function renderFileListForBrowse(files) {
    const content = document.getElementById('__gh_file_list_container__');
    if (!content) return;
    const colors = getAdaptiveColors();
    const fileItems = files.filter(item => item.type === 'blob');
    let html = '<div style="display: flex; flex-direction: column; gap: 5px;">';
    if (fileItems.length === 0) {
      html += '<div style="text-align: center; padding: 20px;">仓库中没有文件</div>';
    } else {
      fileItems.forEach(file => {
        html += `
                <div style="display: flex; align-items: center; padding: 8px; border-bottom: 1px solid ${colors.border};">
                    <input type="checkbox" class="gh-file-list-checkbox" data-path="${file.path}" style="margin-right: 10px;">
                    <span style="margin-right: 8px;">📄</span>
                    <span style="flex: 1; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${file.path}">${file.path}</span>
                    <span style="font-size: 12px; color: ${colors.textSecondary};">${formatFileSize(file.size || 0)}</span>
                </div>
            `;
      });
    }
    html += '</div>';
    content.innerHTML = html;
  }
  function filterFileList(searchTerm) {
    const fileItems = document.querySelectorAll('.gh-file-list-checkbox');
    const colors = getAdaptiveColors();
    fileItems.forEach(checkbox => {
      const fileItem = checkbox.closest('div');
      const fileName = fileItem.querySelector('span:nth-child(3)').textContent;
      const title = fileItem.querySelector('span:nth-child(3)').getAttribute('title');
      if (fileName.toLowerCase().includes(searchTerm.toLowerCase()) || title && title.toLowerCase().includes(searchTerm.toLowerCase())) {
        fileItem.style.display = 'flex';
      } else {
        fileItem.style.display = 'none';
      }
    });
  }
  function toggleFileListSelectAll() {
    const visibleFileCheckboxes = document.querySelectorAll('.gh-file-list-checkbox:not([style*="display: none"])');
    const selectAllBtn = document.querySelector('button[onclick="toggleFileListSelectAll()"]');
    if (visibleFileCheckboxes.length === 0) return;
    const allChecked = Array.from(visibleFileCheckboxes).every(checkbox => checkbox.checked);
    visibleFileCheckboxes.forEach(checkbox => {
      checkbox.checked = !allChecked;
    });
    if (selectAllBtn) {
      selectAllBtn.textContent = allChecked ? '全选' : '取消全选';
    }
  }
  function openSelectedFiles(type) {
    const selectedFiles = document.querySelectorAll('.gh-file-list-checkbox:checked');
    if (selectedFiles.length === 0) {
      const status = document.getElementById('__gh_file_list_status__');
      if (status) {
        status.textContent = '请先选择要打开的文件';
        status.style.color = '#cb2431';
      }
      return;
    }
    const info = getRepoInfo();
    if (!info.owner || !info.repo) return;
    selectedFiles.forEach(fileCheckbox => {
      const filePath = fileCheckbox.getAttribute('data-path');
      let url;
      if (type === 'raw') {
        url = `https://raw.githubusercontent.com/${info.owner}/${info.repo}/${info.branch}/${filePath}`;
      } else {
        url = `https://github.com/${info.owner}/${info.repo}/blob/${info.branch}/${filePath}`;
      }
      window.open(url, '_blank');
    });
    const status = document.getElementById('__gh_file_list_status__');
    if (status) {
      status.textContent = `已打开 ${selectedFiles.length} 个文件`;
      status.style.color = '#28a745';
    }
  }
  function registerMenuCommands() {
    try {
      GM_registerMenuCommand('清除GitHub认证', function () {
        clearGitHubToken();
        safeNotify('已清除认证', 'GitHub 令牌已删除');
        updateRescuePanel();
      });
    } catch (e) {}
    try {
      GM_registerMenuCommand('查看文件历史', function () {
        const history = GM_getValue(STORAGE_KEYS.FILE_HISTORY, []);
        if (history.length === 0) {
          alert('没有文件历史记录');
          return;
        }
        let message = '最近保存的文件:\n\n';
        history.forEach((item, index) => {
          message += `${index + 1}. ${item.filename} (${new Date(item.timestamp).toLocaleString()})\n`;
          message += `   内容: ${item.content}\n`;
          message += `   大小: ${item.size} 字符\n\n`;
        });
        alert(message);
      });
    } catch (e) {}
    try {
      GM_registerMenuCommand('生成GitHub Token', function () {
        const url = 'https://github.com/settings/tokens/new';
        copyToClipboard(url);
        window.open(url, '_blank');
        safeNotify('已复制链接', 'GitHub Token 创建页面已复制到剪贴板');
      });
    } catch (e) {}
    try {
      GM_registerMenuCommand('打开Your Gists', function () {
        if (!isAuthenticated()) {
          alert('请先进行GitHub认证才能查看Gists');
          showAuthDialog();
          return;
        }
        showGistsPanel();
      });
    } catch (e) {}
    try {
      GM_registerMenuCommand('管理工作流', function () {
        if (!isAuthenticated()) {
          alert('请先进行GitHub认证才能管理工作流');
          showAuthDialog();
          return;
        }
        showWorkflowsPanel();
      });
    } catch (e) {}
    try {
      GM_registerMenuCommand('打开GitHub设置', function () {
        openGitHubSettings();
      });
    } catch (e) {}
    try {
      GM_registerMenuCommand('清除分支记忆', function () {
        GM_deleteValue(STORAGE_KEYS.SELECTED_BRANCH);
        safeNotify('已清除分支记忆', '下次将使用默认分支');
      });
    } catch (e) {}
    try {
      GM_registerMenuCommand('复制Git仓库地址', function () {
        const info = getRepoInfo();
        if (!info.owner || !info.repo) {
          alert('当前不是有效的仓库页面');
          return;
        }
        showGitUrlDialog();
      });
    } catch (e) {}
    try {
      GM_registerMenuCommand('同步Fork仓库', function () {
        if (!isForkRepository()) {
          alert('当前仓库不是Fork仓库');
          return;
        }
        syncForkWithUpstream();
      });
    } catch (e) {}
  }
  async function safeFixAll() {
    try {
      ensureRescueButtonAndPanel();
    } catch (e) {
      console.error('初始化救援按钮失败:', e);
    }
  }
  function init() {
    console.log('GitHub Rescue 脚本开始初始化 - 私有库支持版本');
    if (GM_getValue(STORAGE_KEYS.GITHUB_TOKEN, '')) {
      verifyToken(getGitHubToken()).then(result => {
        if (!result.success) {
          console.log('保存的Token可能已失效，需要重新认证');
          safeNotify('Token 已失效', '请重新进行 GitHub 认证');
          clearGitHubToken();
          updateUIWithAuthStatus();
        }
      });
    }
    ['DOMContentLoaded', 'turbo:load', 'pjax:end', 'load'].forEach(ev => {
      document.addEventListener(ev, safeFixAll, {
        passive: true
      });
    });
    try {
      registerMenuCommands();
    } catch (e) {
      console.error('注册菜单命令失败:', e);
    }
    setTimeout(safeFixAll, 1000);
    setInterval(safeFixAll, 5000);
    console.log('GitHub Rescue 脚本初始化完成');
    window.showReleasesPanel = showReleasesPanel;
    window.hideReleasesPanel = hideReleasesPanel;
    window.loadRepoReleases = loadRepoReleases;
    window.downloadReleaseAsset = downloadReleaseAsset;
    window.copyToClipboard = copyToClipboard;
    window.showDeletePanel = showDeletePanel;
    window.hideDeletePanel = hideDeletePanel;
    window.loadRepoFiles = loadRepoFiles;
    window.deleteSelectedFiles = deleteSelectedFiles;
    window.uploadToDecodeInput = uploadToDecodeInput;
    window.getDecodeOutput = getDecodeOutput;
    window.showDecryptResult = showDecryptResult;
    window.showFileListPanel = showFileListPanel;
    window.hideFileListPanel = hideFileListPanel;
    window.loadRepoFilesForList = loadRepoFilesForList;
    window.toggleFileListSelectAll = toggleFileListSelectAll;
    window.openSelectedFiles = openSelectedFiles;
  }
  init();
})();
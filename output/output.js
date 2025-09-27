function main() {
  const _0x44c5d4 = function () {
    let _0x5068d9 = true;
    return function (_0x389052, _0x201358) {
      {
        const _0x1351fd = _0x5068d9 ? function () {
          {
            if (_0x201358) {
              const _0x5eb482 = _0x201358.apply(_0x389052, arguments);
              _0x201358 = null;
              return _0x5eb482;
            }
          }
        } : function () {};
        _0x5068d9 = false;
        return _0x1351fd;
      }
    };
  }();
  const _0x17c360 = _0x44c5d4(this, function () {
    const _0x2c30b0 = typeof window !== "undefined" ? window : typeof process === "object" && typeof require === "function" && typeof global === "object" ? global : this;
    const _0x341f4f = function () {
      {
        const _0x3c2c16 = new _0x2c30b0.RegExp("^([^ ]+( +[^ ]+)+)+[^ ]}");
        return !_0x3c2c16.test(_0x17c360);
      }
    };
    return _0x341f4f();
  });
  _0x17c360();
  const _0x3144a3 = typeof $task !== "undefined" ? $response.body : $response.body;
  const _0x49f51c = typeof $task !== "undefined" ? $request.url : $request.url || $response.url;
  if (!_0x3144a3 || !_0x49f51c || !_0x49f51c.includes("douga/info")) {
    return complete();
  }
  try {
    const _0x1ea5e4 = JSON.parse(_0x3144a3);
    if (_0x1ea5e4.result !== 0 || !_0x1ea5e4.dougaId) {
      return complete();
    }
    const _0x5dc3dc = _0x1ea5e4.user?.["name"] || "未知用户";
    const _0x5186de = _0x1ea5e4.title || "无标题";
    const _0x312a90 = formatDuration(_0x1ea5e4.durationMillis || 0);
    const _0x24b2b8 = _0x1ea5e4.coverUrl || "";
    const _0x52b21e = getHighestQualityInfo(_0x1ea5e4);
    let _0x19f64f = "标题: " + _0x5186de + "\n时长: " + _0x312a90;
    _0x52b21e && (_0x19f64f += "\n清晰度: " + _0x52b21e.qualityType + "\n播放地址: " + _0x52b21e.url);
    if (typeof $task !== "undefined") {
      const _0x5b2461 = {
        "media-url": _0x24b2b8
      };
      $notify("ACFun视频 - " + _0x5dc3dc, "", _0x19f64f, _0x5b2461);
    } else {
      const _0x251e6d = {
        "media-url": _0x24b2b8
      };
      $notification.post("ACFun视频 - " + _0x5dc3dc, "", _0x19f64f, _0x251e6d);
    }
  } catch (_0x10940b) {} finally {
    complete();
  }
}
function formatDuration(_0x18302d) {
  const _0x409d3d = Math.floor(_0x18302d / 60000);
  const _0x583b3e = Math.floor(_0x18302d % 60000 / 1000);
  return _0x409d3d + ":" + _0x583b3e.toString().padStart(2, "0");
}
function getHighestQualityInfo(_0x59afe6) {
  if (_0x59afe6.currentVideoInfo?.["ksPlayJson"]) {
    {
      try {
        {
          const _0x19eccb = JSON.parse(_0x59afe6.currentVideoInfo.ksPlayJson);
          const _0x34d78e = _0x19eccb.adaptationSet?.[0]?.["representation"];
          if (_0x34d78e && _0x34d78e.length > 0) {
            const _0x43d1f7 = ["2160p60", "2160p", "1080p60", "1080p", "720p60", "720p"];
            for (const _0x520b5c of _0x43d1f7) {
              const _0x377add = _0x34d78e.find(_0x3eb24c => _0x3eb24c.qualityType === _0x520b5c || _0x3eb24c.qualityLabel === _0x520b5c);
              if (_0x377add && _0x377add.url) {
                return {
                  qualityType: _0x520b5c,
                  url: _0x377add.url
                };
              }
            }
            const _0x31c782 = {
              qualityType: _0x34d78e[0].qualityType || "未知",
              url: _0x34d78e[0].url
            };
            return _0x31c782;
          }
        }
      } catch (_0x5a76e2) {}
    }
  }
  return null;
}
function complete() {
  typeof $task !== "undefined" ? $done({}) : $done({});
}
main();
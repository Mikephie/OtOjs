/***********************************************
> 应用名称：墨鱼自用reddits去广告脚本001
> 脚本作者：@ddgksf2013
> 微信账号：墨鱼手记
> 更新时间：2025-05-30
> 通知频道：https://t.me/ddgksf2021
> 贡献投稿：https://t.me/ddgksf2013_bot
> 问题反馈：ddgksf2013@163.com
> 特别提醒：如需转载请注明出处，谢谢合作！
***********************************************/

const version = "V1.0.9";
const _0xc3dd0a = _0x1e61;
if (
  ((function (
    _0x297b99,
    _0x23f2e1,
    _0x6df70d,
    _0x3c23f,
    _0x377ebd,
    _0x2c90c8,
    _0x4be525,
  ) {
    return (
      (_0x297b99 = _0x297b99 >> 0x6),
      (_0x2c90c8 = "hs"),
      (_0x4be525 = "hs"),
      (function (_0x2e8807, _0x4f615d, _0x39406d, _0x480882, _0x25520e) {
        const _0x39cfbb = _0x1e61;
        ((_0x480882 = "tfi"),
          (_0x2c90c8 = _0x480882 + _0x2c90c8),
          (_0x25520e = "up"),
          (_0x4be525 += _0x25520e),
          (_0x2c90c8 = _0x39406d(_0x2c90c8)),
          (_0x4be525 = _0x39406d(_0x4be525)),
          (_0x39406d = 0x0));
        const _0x548169 = _0x2e8807();
        while (!![] && --_0x3c23f + _0x4f615d) {
          try {
            _0x480882 =
              -parseInt("1430351bsaypz") / 0x1 +
              (parseInt("2fNTxYk") / 0x2) * (parseInt("4716282KZLYJn") / 0x3) +
              -parseInt("2794252jgPioi") / 0x4 +
              -parseInt("5123300gMNNOv") / 0x5 +
              (-parseInt("66PCzVOG") / 0x6) * (parseInt("496265tcRuFS") / 0x7) +
              parseInt("12343928WpBKqc") / 0x8 +
              parseInt("14615001GYbpDC") / 0x9;
          } catch (_0x58ea56) {
            _0x480882 = _0x39406d;
          } finally {
            _0x25520e = _0x548169[_0x2c90c8]();
            if (_0x297b99 <= _0x3c23f)
              _0x39406d
                ? _0x377ebd
                  ? (_0x480882 = _0x25520e)
                  : (_0x377ebd = _0x25520e)
                : (_0x39406d = _0x25520e);
            else {
              if (
                _0x39406d ==
                _0x377ebd.replace(/[kKlGUnbLWFYEOphRDPNdf=]/g, "")
              ) {
                if (_0x480882 === _0x4f615d) {
                  _0x548169["un" + _0x2c90c8](_0x25520e);
                  break;
                }
                _0x548169[_0x4be525](_0x25520e);
              }
            }
          }
        }
      })(
        _0x6df70d,
        _0x23f2e1,
        function (
          _0x3bf4d5,
          _0x51ea99,
          _0x4fa532,
          _0xb5ed0d,
          _0xee9e18,
          _0x219c74,
          _0x1ad289,
        ) {
          return (
            (_0x51ea99 = "\x73\x70\x6c\x69\x74"),
            (_0x3bf4d5 = arguments[0x0]),
            (_0x3bf4d5 = _0x3bf4d5[_0x51ea99]("")),
            (_0x4fa532 = "\x72\x65\x76\x65\x72\x73\x65"),
            (_0x3bf4d5 = _0x3bf4d5[_0x4fa532]("\x76")),
            (_0xb5ed0d = "\x6a\x6f\x69\x6e"),
            0x1a8866,
            _0x3bf4d5[_0xb5ed0d]("")
          );
        },
      )
    );
  })(0x3340, 0xc4ab3, _0x1715, 0xcf),
  _0x1715)
) {
}
const opName = $request?.["headers"]?.["X-APOLLO-OPERATION-NAME"] || "";
let body;
if (/Ads/i.test(opName))
  $done({
    body: "{}",
  });
else
  try {
    body = JSON.parse(
      $response.body.replace(/"isObfuscated":true/g, "\x22isObfuscated\x22:false")
        .replace(/"obfuscatedPath":"[^"]*"/g, "\x22obfuscatedPath\x22:null")
        .replace(/"isNsfw":true/g, "\x22isNsfw\x22:false")
        .replace(
          /"isAdPersonalizationAllowed":true/g,
          "\x22isAdPersonalizationAllowed\x22:false",
        )
        .replace(
          /"isThirdPartyInfoAdPersonalizationAllowed":true/g,
          '"isThirdPartyInfoAdPersonalizationAllowed":false',
        )
        .replace(/"isNsfwMediaBlocked":true/g, '"isNsfwMediaBlocked":false')
        .replace(/"isNsfwContentShown":true/g, '"isNsfwContentShown":false')
        .replace(/"isPremiumMember":false/g, '"isPremiumMember":true')
        .replace(/"isEmployee":false/g, "\x22isEmployee\x22:true"),
    );
    const data = body.data ?? {};
    (Object.keys(data)["forEach"]((_0x264ed5) => {
      const _0x38539b = _0xc3dd0a,
        _0x227df7 = {
          xGFfl: function (_0x380bd6, _0x1395e7) {
            return _0x380bd6 === _0x1395e7;
          },
          QRZWk: _0x38539b(0x100, "r@dH"),
          iYbEo: function (_0x5aaf97, _0x21896c) {
            return _0x5aaf97 === _0x21896c;
          },
          Ojbez: _0x38539b(0x101, "qFlq"),
        },
        _0xe804f6 =
          data[_0x264ed5]?.[_0x38539b(0x104, "ICP5")]?.[
            _0x38539b(0xe2, "ICP5")
          ];
      if (!Array[_0x38539b(0xff, "YRTb")](_0xe804f6)) return;
      data[_0x264ed5][_0x38539b(0x109, "N8*j")][_0x38539b(0xfb, "L]@f")] =
        _0xe804f6[_0x38539b(0x107, "1D%(")](({ node: _0x2d14e2 }) => {
          const _0x5c395f = _0x38539b;
          if (
            _0x227df7[_0x5c395f(0x108, "d&Pb")](
              _0x227df7[_0x5c395f(0x105, "Kk@x")],
              "DxeQL",
            )
          ) {
            if (!_0x2d14e2) return !![];
            if (
              _0x227df7[_0x5c395f(0x10d, "*5gs")](
                _0x2d14e2[_0x5c395f(0xf7, "p6@A")],
                _0x227df7[_0x5c395f(0x10b, "&c9p")],
              )
            )
              return ![];
            if (_0x2d14e2.adPayload) return ![];
            if (Array.isArray(_0x2d14e2[_0x5c395f(0xf6, "*3VZ")]))
              return !_0x2d14e2.cells.some(
                (_0x3835ab) =>
                  _0x3835ab?.["__typename"] === _0x5c395f(0x10c, "Ludd"),
              );
            return !![];
          } else
            _0x221d34({
              body: "{}",
            });
        });
    }),
      (body = JSON.stringify(body)));
  } catch (_0x2d423f) {
    console.log("Parse error:", _0x2d423f);
  } finally {
    $done(
      body
        ? {
            body: body,
          }
        : {},
    );
  }

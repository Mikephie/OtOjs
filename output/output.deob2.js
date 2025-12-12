const _0xdb9e3f = function () {
  let _0x21aeea = true;
  return function (_0xa13a82, _0x3dfcd3) {
    const _0x56587c = _0x21aeea ? function () {
      if (_0x3dfcd3) {
        const _0x431ee4 = _0x3dfcd3.apply(_0xa13a82, arguments);
        _0x3dfcd3 = null;
        return _0x431ee4;
      }
    } : function () {};
    _0x21aeea = false;
    return _0x56587c;
  };
}();
const _0x5b219c = _0xdb9e3f(this, function () {
  const _0x3151fb = typeof window !== "undefined" ? window : typeof process === "object" && typeof require === "function" && typeof global === "object" ? global : this;
  const _0x5e7bde = function () {
    const _0x556a0c = new _0x3151fb.RegExp("^([^ ]+( +[^ ]+)+)+[^ ]}");
    return !_0x556a0c.test(_0x5b219c);
  };
  return _0x5e7bde();
});
_0x5b219c();
let obj = JSON.parse($response.body);
obj.info && obj.info.user && (obj.info.user.normalVipBoolean = true, obj.info.user.normalVipDt = 4102444799000, obj.info.user.normalVipForever = true, obj.info.user.nickName = "https://t.me/GieGie777", obj.info.user.countImgTotal = 9999, obj.info.user.countImg = 9999, obj.info.user.countImgAutoTotal = 9999, obj.info.user.countImgAuto = 9999, obj.info.user.countReportTotal = 9999, obj.info.user.adVipBoolean !== undefined && (obj.info.user.adVipBoolean = true, obj.info.user.adVipDt = 4102444799000, obj.info.user.adVipForever = true), obj.info.user.visitVipBoolean !== undefined && (obj.info.user.visitVipBoolean = true, obj.info.user.visitVipDt = 4102444799000, obj.info.user.visitVipForever = true));
$done({
  body: JSON.stringify(obj)
});
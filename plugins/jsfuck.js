// plugins/jsfuck.js
import ivm from "isolated-vm";

export default async function jsfuck(input) {
  if (!/(?:(?:\+|\!|\[|\]|\(|\)){10,})/.test(input)) return null;

  const isolate = new ivm.Isolate({ memoryLimit: 64 });
  const context = await isolate.createContext();
  const jail = context.global;
  await jail.set("global", jail.derefInto());

  try {
    const script = await isolate.compileScript(input, { filename: "jsfuck.js" });
    const result = await script.run(context, { timeout: 1000 });
    if (typeof result === "string") return result;
    try { return String(result); } catch { return null; }
  } catch {
    return null;
  } finally {
    context.release();
    isolate.dispose();
  }
}

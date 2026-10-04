/*
 * Copy a screen from the running app, for scripts/drawing-kit/from-app.mjs
 * (docs/developer/drawing-guide.md, "Redrawing a built screen").
 *
 * Run it in a browser tab on the running app (localhost:3000), signed in.
 * Then, in the same tab:
 *
 *   await window.hakkenCopyPage("/app/sites/<siteId>", "websites__Overview")
 *   await window.hakkenCopyPage("/app/sites/<siteId>", "switcher__Mobile", 390)
 *
 * Each loads the screen in a hidden frame at that width (a laptop, 1440, by
 * default), waits for its data, and saves the page as hk-snap-<name>.html in
 * the browser's downloads — ask Anthony before a browser of his downloads
 * anything. It answers with the height the board needs. Move the copies out of
 * Downloads when done.
 */
window.hakkenCopyPage = async (route, name, width = 1440) => {
  const frame = document.createElement("iframe");
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:${width < 600 ? 844 : 1000}px;border:0;`;
  document.body.appendChild(frame);
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  await Promise.race([new Promise((done) => { frame.onload = done; frame.src = route; }), wait(20000)]);
  const page = frame.contentDocument;
  const start = Date.now();
  await wait(2500);
  // Loading placeholders and spinners: wait for the data, up to 14 seconds.
  while (Date.now() - start < 14000 && page.querySelector('.animate-pulse, [aria-busy="true"], .animate-spin')) await wait(500);
  await wait(1500);
  const html = "<!doctype html>\n" + page.documentElement.outerHTML;
  const main = page.querySelector("main");
  const height = main ? main.scrollHeight : page.documentElement.scrollHeight;
  frame.remove();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  link.download = `hk-snap-${name}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return `${name}: ${Math.round(html.length / 1024)} KB, height ${height}`;
};

// Wipe the throwaway memory core only when Playwright is about to start its own server.
// If a server is already listening (developer ran `node server.js`), leave its data alone.
const fs = require('fs');

module.exports = async (config) => {
  const { url, env } = config.webServer || {};
  if (!url || !env?.OMNILOCAL_DATA_DIR) return;
  try {
    const res = await fetch(url);
    if (res.ok) return; // reuseExistingServer will pick this one up
  } catch {}
  fs.rmSync(env.OMNILOCAL_DATA_DIR, { recursive: true, force: true });
};

// Long-running server for your own computer or a VPS. On Vercel, api/index.js is used instead.
import { config } from './config.js';
import { init } from './db.js';
import { createApp } from './app.js';
import { startScheduler } from './lib/scheduler.js';
import { activeProvider } from './lib/llm.js';

const created = await init();
if (created.length) {
  console.log('Created starter accounts (change these passwords in Settings):');
  for (const u of created) console.log(`  ${u.username.padEnd(8)} / ${u.password}  (${u.role})`);
}
createApp().listen(config.port, () => {
  console.log(`Finance Hub running on http://localhost:${config.port}  ·  timezone ${config.timezone}  ·  AI: ${activeProvider() || 'built-in advisor (no API key set)'}`);
});
startScheduler();

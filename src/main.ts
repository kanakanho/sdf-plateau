import { startApp } from './app/app';
import { setStatus } from './app/controls';

startApp(document.getElementById('map')!).catch((e: unknown) => {
  console.error(e);
  setStatus(`エラー: ${e instanceof Error ? e.message : String(e)}`);
});

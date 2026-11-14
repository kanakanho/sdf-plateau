import { startAreaApp } from './app/areaApp';
import { startApp } from './app/app';
import { bindAreaSelect, setStatus } from './app/controls';

const { mode, slug } = document.body.dataset;
const container = document.getElementById('map')!;
bindAreaSelect();
(mode === 'area' && slug ? startAreaApp(container, slug) : startApp(container)).catch((e: unknown) => {
  console.error(e);
  setStatus(`エラー: ${e instanceof Error ? e.message : String(e)}`);
});

import { startAreaApp } from './app/areaApp';
import { startApp } from './app/app';
import { bindAreaSelect, setStatus } from './app/controls';

const { mode, slug = '', waves } = document.body.dataset;
const container = document.getElementById('map')!;
const shape = waves === 'true' ? 'waveShell' : 'plain';
bindAreaSelect(slug, shape === 'waveShell');
const start = mode === 'area' && slug ? startAreaApp(container, slug, shape) : startApp(container, shape);
start.catch((e: unknown) => {
  console.error(e);
  setStatus(`エラー: ${e instanceof Error ? e.message : String(e)}`);
});

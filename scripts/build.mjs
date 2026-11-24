import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const isWatch = process.argv.includes('--watch');
const root = process.cwd();
const distDir = path.join(root, 'dist');

fs.mkdirSync(distDir, { recursive: true });

function buildHtml(jsCode, cssCode) {
  const template = fs.readFileSync(path.join(root, 'src/ui.html'), 'utf8');
  return template
    .replace('<!--INLINE_CSS-->', () => `<style>\n${cssCode}\n</style>`)
    .replace('<!--INLINE_JS-->', () => `<script>\n${jsCode}\n</script>`);
}

const uiBundlePlugin = {
  name: 'inline-ui-html',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return;
      const jsFile = result.outputFiles?.find((f) => f.path.endsWith('.js'));
      const cssFile = result.outputFiles?.find((f) => f.path.endsWith('.css'));
      const html = buildHtml(jsFile?.text ?? '', cssFile?.text ?? '');
      fs.writeFileSync(path.join(distDir, 'ui.html'), html, 'utf8');
      console.log(`[build] dist/ui.html (${(html.length / 1024).toFixed(1)} KB)`);
    });
  },
};

const codeCtx = await esbuild.context({
  entryPoints: [path.join(root, 'src/code.ts')],
  bundle: true,
  outfile: path.join(distDir, 'code.js'),
  platform: 'neutral',
  target: 'es2020',
  format: 'iife',
  minify: !isWatch,
});

const uiCtx = await esbuild.context({
  entryPoints: [path.join(root, 'src/ui.ts')],
  bundle: true,
  write: false,
  outdir: distDir,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  minify: !isWatch,
  plugins: [uiBundlePlugin],
});

if (isWatch) {
  await Promise.all([codeCtx.watch(), uiCtx.watch()]);
  console.log('[watch] Watching src/ for changes...');
} else {
  await Promise.all([codeCtx.rebuild(), uiCtx.rebuild()]);
  await Promise.all([codeCtx.dispose(), uiCtx.dispose()]);
  console.log('[build] Done.');
}

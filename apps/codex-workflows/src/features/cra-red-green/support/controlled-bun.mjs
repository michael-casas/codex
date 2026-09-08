#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const args = process.argv.slice(2);

if (args[0] === 'create') {
  const projectPath = args[2];
  if (
    args.length !== 5 ||
    args[1] !== 'vite@9.2.0' ||
    typeof projectPath !== 'string' ||
    !isAbsolute(projectPath) ||
    args[3] !== '--template' ||
    args[4] !== 'react' ||
    !process.env.BUN_INSTALL_CACHE_DIR
  ) {
    process.stderr.write('controlled bun received a non-canonical Vite scaffold request\n');
    process.exit(64);
  }
  mkdirSync(join(projectPath, 'src'), { recursive: true });
  mkdirSync(join(projectPath, 'public'), { recursive: true });
  mkdirSync(join(projectPath, 'node_modules'), { recursive: true });
  writeFileSync(
    join(projectPath, 'package.json'),
    `${JSON.stringify(
      {
        name: 'bun-react-proof-app',
        private: true,
        version: '0.0.0',
        type: 'module',
        packageManager: 'bun@1.4.2',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          test: 'bun test',
        },
        dependencies: {
          react: '^19.2.8',
          'react-dom': '^19.2.8',
        },
        devDependencies: {
          '@vitejs/plugin-react': '^6.1.0',
          vite: '^8.2.2',
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(projectPath, 'bun.lock'), '{"lockfileVersion":1}\n');
  writeFileSync(
    join(projectPath, 'src/App.jsx'),
    'export default function App() { return <main><h1>Workflow Proof</h1></main>; }\n',
  );
  writeFileSync(
    join(projectPath, 'src/App.test.jsx'),
    "test('heading', () => { expect(markup).toContain('Workflow Proof'); });\n",
  );
  writeFileSync(join(projectPath, 'src/main.jsx'), "import App from './App.jsx';\n");
  process.exit(0);
}

if (args[0] === 'install' || args[0] === 'test') process.exit(0);
if (args[0] === 'run' && args[1] === 'build') {
  mkdirSync(join(process.cwd(), 'dist'), { recursive: true });
  writeFileSync(join(process.cwd(), 'dist/index.html'), '<main>built</main>\n');
  process.exit(0);
}

process.stderr.write(`controlled bun rejected arguments: ${JSON.stringify(args)}\n`);
process.exit(64);

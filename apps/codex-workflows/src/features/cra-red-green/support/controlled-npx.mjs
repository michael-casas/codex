#!/usr/bin/env node
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const args = process.argv.slice(2);
const projectPath = args[2];
if (
  args.length !== 4 ||
  args[0] !== '--yes' ||
  args[1] !== 'create-react-app@5.1.0' ||
  typeof projectPath !== 'string' ||
  !isAbsolute(projectPath) ||
  args[3] !== '--use-npm' ||
  process.env.NPM_CONFIG_USERCONFIG !== '/dev/null' ||
  !process.env.NPM_CONFIG_CACHE
) {
  process.stderr.write('controlled npx received a non-canonical CRA request\n');
  process.exit(64);
}

mkdirSync(join(projectPath, 'src'), { recursive: true });
mkdirSync(join(projectPath, 'public'), { recursive: true });
mkdirSync(join(projectPath, 'node_modules/.bin'), { recursive: true });
writeFileSync(
  join(projectPath, 'package.json'),
  `${JSON.stringify(
    {
      name: 'cra-proof-app',
      version: '0.1.0',
      private: true,
      dependencies: {
        react: '^19.0.0',
        'react-dom': '^19.0.0',
        'react-scripts': '5.0.1',
      },
      scripts: {
        start: 'react-scripts start',
        build: 'react-scripts build',
        test: 'react-scripts test',
      },
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  join(projectPath, 'src/App.js'),
  'export default function App() { return <main><h1>Workflow Proof</h1></main>; }\n',
);
writeFileSync(
  join(projectPath, 'src/App.test.js'),
  "test('heading', () => { expect(screen.getByText('Workflow Proof')).toBeInTheDocument(); });\n",
);
writeFileSync(join(projectPath, 'src/index.js'), "import App from './App';\n");
const fakeReactScripts = join(projectPath, 'node_modules/.bin/react-scripts');
writeFileSync(fakeReactScripts, '#!/usr/bin/env node\nprocess.exit(0);\n');
chmodSync(fakeReactScripts, 0o755);

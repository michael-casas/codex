import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { After, Given, Then, When } from '@cucumber/cucumber';

import {
  createPortableWikiFixture,
  runPortableWiki,
  type PortableWikiFixture,
} from './support/driver.js';

interface World {
  fixture?: PortableWikiFixture;
  before?: string;
  result?: ReturnType<typeof runPortableWiki>;
}

Given('a cloned Agent Wiki vault containing a portable note', function (this: World) {
  this.fixture = createPortableWikiFixture();
  this.before = this.fixture.digest();
});

Given('AGENT_WIKI_HOME points to that vault', function (this: World) {
  assert.ok(this.fixture?.vaultPath);
});

When('the agent reindexes and retrieves the note through the public wiki CLI', function (this: World) {
  assert.ok(this.fixture);
  const indexed = runPortableWiki(this.fixture, ['reindex', '--json']);
  assert.equal(indexed.status, 0, indexed.stderr);
  this.result = runPortableWiki(this.fixture, ['get', 'Portable Tooling', '--json']);
});

Then('the portable note is returned successfully', function (this: World) {
  assert.equal(this.result?.status, 0, this.result?.stderr);
  assert.equal(JSON.parse(this.result?.stdout ?? '{}').note?.path, 'skills/Portable Tooling.md');
});

Then('the Wiki note remains unchanged', function (this: World) {
  assert.equal(this.fixture?.digest(), this.before);
});

Then('the generated index is outside the cloned vault', function (this: World) {
  assert.ok(this.fixture);
  assert.ok(existsSync(this.fixture.indexPath));
  assert.equal(this.fixture.indexPath.startsWith(this.fixture.vaultPath), false);
});

After(function (this: World) {
  this.fixture?.cleanup();
});

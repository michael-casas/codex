import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  After,
  Given,
  Then,
  When,
  World,
  setWorldConstructor,
} from '@cucumber/cucumber';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  createCodexControlServer,
  createControlHttpClient,
} from '@codex/control-gateway';
import { projectContextFixture } from './support/project-context.fixture.js';

class ProjectWorld extends World {
  fixture!: Awaited<ReturnType<typeof projectContextFixture>>;
  client!: Client;
  server!: ReturnType<typeof createCodexControlServer>;
  admission: unknown;
}
setWorldConstructor(ProjectWorld);
Given(
  'a local caller has a granted project admission policy and a canonical repository',
  async function (this: ProjectWorld) {
    this.fixture = await projectContextFixture();
    const http = await this.fixture.connect();
    const authorization = {
      actorAgentId: 'owner',
      scopes: ['control:project', 'control:workflow'],
    };
    this.server = createCodexControlServer({
      control: createControlHttpClient({
        origin: http.origin,
        token: this.fixture.token,
        ...authorization,
      }),
      authorize: () => authorization,
    });
    this.client = new Client({
      name: 'project-admission-acceptance',
      version: '1',
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await this.server.connect(serverTransport);
    await this.client.connect(clientTransport);
  },
);
When(
  'the caller explicitly admits an external Git project through MCP',
  async function (this: ProjectWorld) {
    this.admission = await this.client.callTool({
      name: 'admit_project',
      arguments: this.fixture.command(1),
    });
  },
);
Then(
  "the tool returns that project's host and repository identity",
  function (this: ProjectWorld) {
    const result = this.admission as {
      isError?: boolean;
      structuredContent?: unknown;
    };
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.equal(
      (result.structuredContent as { hostId?: string }).hostId,
      'local',
    );
    assert.equal(
      (result.structuredContent as { repositoryId?: string }).repositoryId,
      'external-one',
    );
  },
);
Then(
  'source compilation selects that external project without executing the canonical source',
  async function (this: ProjectWorld) {
    const request = {
      name: 'run_workflow',
      arguments: {
        source: 'probe.workflow.ts',
        repositoryId: 'external-one',
        hostId: 'local',
        idempotencyKey: 'project-acceptance',
      },
    };
    const result = await this.client.callTool(request);
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), /WORKFLOW_EXPORT_INVALID/);
    assert.equal(
      await readFile(
        join(this.fixture.projects[1].checkoutPath, 'selected'),
        'utf8',
      ),
      'function',
    );
    await assert.rejects(
      access(join(this.fixture.projects[0].checkoutPath, 'selected')),
    );
  },
);
After(async function (this: ProjectWorld) {
  await this.client?.close();
  await this.server?.close();
  await this.fixture?.close();
});

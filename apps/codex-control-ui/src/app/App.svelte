<script lang="ts">
  import { onMount, tick } from 'svelte';
  import ActivityFeed from '../feed/activity-feed.component.svelte';
  import thirdPartyNotices from '../../THIRD-PARTY-NOTICES?url';

  import {
    createPresentationDescriptor,
    parseControlRoute,
  } from '../control/presentation';
  import { createBrowserControlClient } from '../control/http-client';
  import type { PresentationDescriptor } from '../control/presentation';
  import { createControlSession } from '../control/session';
  import type { ControlSession } from '../control/session';
  import type {
    ControlClient,
    ControlPhase,
    VisibilityAgent,
    VisibilityResult,
  } from '../control/types';

  let route = parseControlRoute(window.location.pathname);
  const browserClient: ControlClient = createBrowserControlClient(
    window.location.origin,
  );

  let phase: ControlPhase = 'loading';
  let result: VisibilityResult | undefined;
  let message = '';
  let selectedAgentId = route?.kind === 'agent' ? route.id : undefined;
  let session: ControlSession | undefined;
  $: presentation = route
    ? safePresentation(route.kind, route.id)
    : undefined;

  $: workflows = (result?.workflows ?? []).filter(workflow => route || !['completed', 'failed'].includes(workflow.status));
  $: workflow = route?.kind === 'workflow'
    ? workflows.find(({ id }) => id === route?.id)
    : route?.kind === 'agent'
      ? workflows.find(({ steps }) => steps.some(({ agents }) => agents.some(({ id }) => id === route?.id)))
      : workflows[0];
  $: stale = phase === 'reconnecting' || phase === 'offline' || phase === 'error';
  $: agents = workflow?.steps.flatMap(({ agents }) => agents) ?? [];
  $: selectedAgent = selectedAgentId
    ? agents.find(({ id }) => id === selectedAgentId)
    : undefined;
  $: title = route?.kind === 'agent'
    ? selectedAgent?.label ?? route.id
    : workflow?.label && !/^source\.[a-f0-9]{64}$/.test(workflow.label) ? workflow.label : workflow ? 'Workflow' : 'Codex Control';

  function safePresentation(
    kind: 'workflow' | 'agent',
    id: string,
  ): PresentationDescriptor | undefined {
    try {
      return createPresentationDescriptor(kind, id, {
        mobileBaseUrl: window.__CODEX_CONTROL_MOBILE_BASE_URL__,
        mobileAccess: window.__CODEX_CONTROL_MOBILE_ACCESS__,
      });
    } catch {
      return undefined;
    }
  }

  function updatePhase(next: ControlPhase, nextMessage = '') {
    phase = next;
    message = nextMessage;
  }

  async function select(agent: VisibilityAgent) {
    if (!session) return;
    selectedAgentId = agent.id;
    await session.select(agent.id);
    await tick();
    if (window.matchMedia('(max-width: 760px)').matches) document.querySelector('.feed')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  async function collapse() {
    if (!session) return;
    selectedAgentId = undefined;
    await session.collapse();
  }

  onMount(() => {
    session = createControlSession({
      client: window.__CODEX_CONTROL__ ?? browserClient,
      initialAgentId: selectedAgentId,
      onResult: (next) => {
        const routeCancelled = route?.kind === 'workflow'
          ? next.cancelledWorkflowIds?.includes(route.id)
          : route?.kind === 'agent' ? next.cancelledAgentIds?.includes(route.id) : false;
        if (routeCancelled) {
          window.history.replaceState(null, '', '/');
          route = undefined;
          selectedAgentId = undefined;
        }
        if (selectedAgentId && next.cancelledAgentIds?.includes(selectedAgentId)) selectedAgentId = undefined;
        if (!route && selectedAgentId && next.workflows?.some(workflow => ['completed', 'failed'].includes(workflow.status)
          && workflow.steps.some(step => step.agents.some(agent => agent.id === selectedAgentId)))) {
          selectedAgentId = undefined;
          void session?.collapse();
        }
        result = next;
      },
      onPhase: updatePhase,
    });
    void session.start();
    return () => session?.stop();
  });
</script>

<svelte:head>
  <title>{title} · Codex Control</title>
</svelte:head>

<main class="control-shell">
  <header class="topbar">
    <a class="brand" href="/" aria-label="Codex Control home">Codex Control</a>
    <div class="connection" data-phase={phase} aria-live="polite">
      <span class="connection-dot" aria-hidden="true"></span>
      {phase === 'ready' || phase === 'empty' ? 'Live' : phase === 'offline' ? 'Offline' : phase}
    </div>
  </header>

  {#if stale && workflows.length > 0}
    <div class="connection-notice" role="status">
      <p>Showing last-known activity. Updates are unavailable; agents may still be running.</p>
      <button class="quiet-button" type="button" on:click={() => session?.retry()}>Retry connection</button>
    </div>
  {/if}

  {#if phase === 'loading' || (phase === 'reconnecting' && !result)}
    <section class="state-panel" aria-live="polite">
      <p>Connecting to control plane…</p>
    </section>
  {:else if stale && workflows.length === 0}
    <section class="state-panel error" role="alert">
      <h1>Connection unavailable</h1>
      <p>{message || 'Control gateway unavailable'}</p>
      <button type="button" on:click={() => session?.retry()}>Retry</button>
    </section>
  {:else if workflows.length === 0 && result?.summariesTruncated}
    <section class="state-panel">
      <h1>Workflow activity unavailable</h1>
      <p>The current view is incomplete. Other workflows may still be running.</p>
      <button type="button" on:click={() => session?.retry()}>Retry</button>
    </section>
  {:else if workflows.length === 0 && result?.workflows !== undefined && !result.summariesTruncated}
    <section class="state-panel">
      <h1>No Workflows Running</h1>
      <p>New delegations and workflow runs will appear here automatically.</p>
    </section>
  {:else if workflow}
    <section class="workspace" aria-labelledby="view-title">
      <div class="overview">
        <div class="view-heading">
          <div>
            <h1 id="view-title">{title}</h1>
            <p>{workflow.stateText}</p>
          </div>
          <span class:running={workflow.status === 'running'} class="status-label">
            {workflow.status}
          </span>
        </div>

        {#if workflow.progressLabel}
          <p class="workflow-progress" aria-live="polite">{workflow.progressLabel}</p>
        {/if}

        <div class="steps" aria-label="Workflow steps">
          {#each workflow.steps as step (step.id)}
            <details open>
              <summary>
                <span>{step.label}</span>
                <span class="progress-label">{step.progressLabel ?? 'Not started'}</span>
              </summary>
              {#if step.agents.length > 0}
                <div class="agent-list">
                  {#each step.agents as agent (agent.id)}
                    <button
                      type="button"
                      class:selected={selectedAgentId === agent.id}
                      aria-pressed={selectedAgentId === agent.id}
                      on:click={() => select(agent)}
                    >
                      <span class="agent-state" data-status={agent.status} aria-hidden="true"></span>
                      <span>
                        <strong>{agent.label}</strong>
                        <small>{agent.stateText}</small>
                      </span>
                      <span class="agent-status">{agent.status}</span>
                    </button>
                  {/each}
                </div>
              {:else}
                <p class="step-empty">Waiting for the previous step.</p>
              {/if}
            </details>
          {/each}
        </div>

        <div class="support-grid">
          {#if result?.decisions?.length}
            <section aria-labelledby="decisions-title">
              <h2 id="decisions-title">Decisions</h2>
              {#each result.decisions as decision (decision.id)}
                <p class="support-row"><span>{decision.label}</span><small>{decision.state}</small></p>
              {/each}
            </section>
          {/if}
          {#if result?.artifacts?.length}
            <section aria-labelledby="artifacts-title">
              <h2 id="artifacts-title">Artifacts</h2>
              {#each result.artifacts as artifact (artifact.id)}
                <p class="support-row"><a href={artifact.href ?? '#'}>{artifact.label}</a></p>
              {/each}
            </section>
          {/if}
        </div>
      </div>

      {#key selectedAgentId}
        <ActivityFeed label={selectedAgent?.label ?? 'Agent activity'} selected={Boolean(selectedAgentId)}
          details={selectedAgentId && result?.details?.agentId === selectedAgentId ? result.details : undefined}
          limits={result?.evaluationLimits} onClose={collapse}
          mobileUrl={presentation?.mobile.state === 'available' ? presentation.mobile.url : undefined} />
      {/key}
    </section>
  {:else}
    <section class="state-panel">
      <h1>Activity not found</h1>
      <p>The requested workflow or agent is not in the current view.</p>
    </section>
  {/if}
  <footer class="legal-notice"><a href={thirdPartyNotices}>Third-party notices</a></footer>
</main>

<script lang="ts">
  import { beforeUpdate, afterUpdate, onMount, onDestroy } from 'svelte';
  import type { VisibilityResult } from '../control/types';
  import ActivityItem from './activity-item.ui.svelte';

  export let label = 'Agent activity';
  export let selected = false;
  export let details: VisibilityResult['details'];
  export let limits: VisibilityResult['evaluationLimits'];
  export let onClose: () => void;
  export let mobileUrl: string | undefined = undefined;
  let region: HTMLDivElement;
  let content: HTMLDivElement;
  let atBottom = true;
  let hasNewContent = false;
  let anchor: { key: string; offset: number } | undefined;
  let previousKeys: string[] = [];
  let previousSignature = '';
  let frame: number | undefined;
  let observer: ResizeObserver | undefined;
  $: signature = details?.items?.map(item => item.id + ':' + item.revision).join('|') ?? details?.events.map(event => event.eventId).join('|') ?? '';

  function capture() {
    if (!region) return;
    atBottom = region.scrollHeight - region.scrollTop - region.clientHeight < 32;
    const top = region.getBoundingClientRect().top;
    const articles = [...region.querySelectorAll<HTMLElement>('[data-feed-key]')];
    previousKeys = articles.map(article => article.dataset.feedKey ?? '');
    const first = articles.find(article => article.getBoundingClientRect().bottom > top);
    anchor = first ? { key: first.dataset.feedKey ?? '', offset: first.getBoundingClientRect().top - top } : undefined;
    if (atBottom) hasNewContent = false;
  }
  function restore() {
    if (!region) return;
    if (atBottom) { region.scrollTop = region.scrollHeight; return; }
    const articles = [...region.querySelectorAll<HTMLElement>('[data-feed-key]')];
    let target = articles.find(article => article.dataset.feedKey === anchor?.key);
    if (!target && anchor) {
      const survivors = new Set(previousKeys.slice(previousKeys.indexOf(anchor.key)));
      target = articles.find(article => survivors.has(article.dataset.feedKey ?? ''));
    }
    if (target && anchor) region.scrollTop += target.getBoundingClientRect().top - region.getBoundingClientRect().top - anchor.offset;
  }
  beforeUpdate(capture);
  afterUpdate(() => {
    if (signature === previousSignature) return;
    previousSignature = signature;
    if (!atBottom) hasNewContent = true;
    restore();
  });
  onMount(() => {
    observer = new ResizeObserver(() => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(restore);
    });
    observer.observe(content);
  });
  onDestroy(() => { observer?.disconnect(); if (frame !== undefined) cancelAnimationFrame(frame); });
  function latest() {
    region.scrollTop = region.scrollHeight;
    atBottom = true;
    hasNewContent = false;
    region.focus({ preventScroll: true });
  }
</script>

<aside class="feed" aria-labelledby="feed-title">
  <div class="feed-heading">
    <h2 id="feed-title">{label}</h2>
    {#if selected}<button class="quiet-button" type="button" on:click={onClose}>Close agent feed</button>{/if}
  </div>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable message regions need keyboard focus.) -->
  <div class="message-region" role="region" aria-label="Agent messages" tabindex="0" bind:this={region} on:scroll={capture}>
    <div class="message-content" bind:this={content}>
      {#if selected && details}
        {#if details.events.some(event => event.kind === 'result.unavailable')}
          <p class="feed-notice" role="status">Validated result display unavailable: item provenance could not be verified.</p>
        {/if}
        {#if details.items && (details.items.length > 0 || details.events.length === 0)}
          {#each details.items as item (item.id)}<ActivityItem {item} />{/each}
          {#if details.items.length === 0}<p class="feed-empty">Waiting for agent activity.</p>{/if}
        {:else}
          <p class="feed-notice">Legacy activity — message identity and completeness are unavailable.</p>
          {#each details.events as event (event.eventId)}
            <article class="activity-item" data-feed-key={event.eventId}>
              <p class="legacy-body">{event.detail?.body ?? 'Activity updated'}</p>
              {#if event.detail?.truncated}<p class="feed-notice">Output truncated</p>{/if}
            </article>
          {/each}
        {/if}
        {#if details.truncated}<p class="feed-notice">Earlier activity or content may be omitted from this bounded view.</p>{/if}
      {:else}<p class="feed-empty">Select an agent to view its live feed.</p>{/if}
    </div>
  </div>
  {#if hasNewContent}<button class="quiet-button jump-latest" type="button" on:click={latest}>Jump to latest</button>{/if}
  {#if limits}<p class="feed-limits">Evaluation limits: {Math.floor(limits.itemBytes / 1024)} KiB per item · {limits.logicalItems} items · {Math.floor(limits.aggregateBytes / 1024 / 1024)} MiB per feed. Not permanent policy.</p>{/if}
  {#if mobileUrl}<a class="mobile-link" href={mobileUrl} target="_blank" rel="noreferrer">Open mobile view</a>{/if}
</aside>

<script lang="ts">
  import type { VisibilityItem } from '../control/types';
  import MessageMarkdown from './message-markdown.ui.svelte';
  export let item: VisibilityItem;
  $: tool = item.kind === 'tool' || item.kind === 'command';
</script>

<article class="activity-item" data-item-id={item.itemId} data-feed-key={item.id} data-kind={tool ? 'tool' : item.kind}>
  <div class="item-meta">
    {#if item.state === 'streaming'}<span>Updating</span>{/if}
    {#if item.state === 'failed' || item.state === 'interrupted' || item.state === 'unknown'}<span>{item.state}</span>{/if}
  </div>
  {#if item.kind === 'result' && item.fields && item.schemaDigest}
    <dl class="result-fields">
      {#each item.fields as field (field.name)}
        <dt>{field.name}</dt><dd>{field.value === null ? 'null' : String(field.value)}</dd>
      {/each}
    </dl>
  {:else if tool}
    <details class="tool-item">
      <summary>
        <span class="tool-call-label">Tool Call
          <svg class="tool-call-icon" data-icon="tool-call" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15.5 5.5a4 4 0 0 1-5 5l-5.8 5.8a1.4 1.4 0 0 1-2-2l5.8-5.8a4 4 0 0 1 5-5l-2.3 2.3.7 2 2 .7 2.3-2.3Z" />
          </svg>
        </span>
        <span>{item.state}</span>
      </summary>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to scroll long tool output.) -->
      <pre class="message-code" tabindex="0" aria-label="Tool output"><code>{item.body}</code></pre>
    </details>
  {:else if item.messagePhase === 'final_answer' && item.state === 'streaming'}
    <p class="feed-notice">Preparing result…</p>
  {:else}
    <MessageMarkdown content={item.body} streaming={item.state === 'streaming'} />
  {/if}
  {#if item.truncated}<p class="feed-notice">Content omitted at the display limit{item.originalBytes ? ` (${item.originalBytes.toLocaleString()} original bytes)` : ''}.</p>{/if}
</article>

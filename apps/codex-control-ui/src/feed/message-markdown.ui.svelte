<script lang="ts">
  import { afterUpdate, onDestroy } from 'svelte';
  import PlainCode from './plain-code.ui.svelte';
  import { safeMarkdownUrl } from './markdown-url.policy';

  export let content: string;
  export let streaming = false;
  const renderer = import('streamdown-svelte').then(module => module.Streamdown);
  let element: HTMLDivElement;
  let previousContent = '';
  let previousText = '';
  let previousStreaming = false;
  let clear: ReturnType<typeof setTimeout> | undefined;
  let covers: { top: number; left: number; width: number; height: number }[] = [];
  let parserEpoch = 0;
  let parserVersions = 0;
  let parserInputBytes = 0;
  let parserContent: string | undefined;
  let parserStreaming = false;
  const encoder = new TextEncoder();

  // Release upstream per-instance caches without replacing the outer message/scroll anchor.
  function trackParser(nextContent: string, nextStreaming: boolean) {
    if (nextContent === parserContent && nextStreaming === parserStreaming) return;
    const bytes = encoder.encode(nextContent).byteLength;
    if (parserVersions >= 32 || parserInputBytes + bytes > 262_144 || (parserStreaming && !nextStreaming)) {
      parserEpoch += 1;
      parserVersions = 0;
      parserInputBytes = 0;
      previousContent = nextContent;
      previousStreaming = nextStreaming;
      clearTimeout(clear);
      covers = [];
    }
    parserVersions += 1;
    parserInputBytes += bytes;
    parserContent = nextContent;
    parserStreaming = nextStreaming;
  }
  $: trackParser(content, streaming);

  afterUpdate(() => {
    if (!element) return;
    const text = element.textContent ?? '';
    if (content === previousContent && streaming === previousStreaming) { previousText = text; return; }
    const append = previousStreaming && streaming && content.startsWith(previousContent) && text.startsWith(previousText) && text.length > previousText.length;
    const start = previousText.length;
    previousContent = content;
    previousText = text;
    previousStreaming = streaming;
    clearTimeout(clear);
    covers = [];
    if (!append || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let node: Node | null;
    const rectangles: DOMRect[] = [];
    while ((node = walker.nextNode())) {
      const length = node.textContent?.length ?? 0;
      if (offset + length > start) {
        const range = document.createRange();
        range.setStart(node, Math.max(0, start - offset));
        range.setEnd(node, length);
        rectangles.push(...range.getClientRects());
      }
      offset += length;
    }
    const bounds = element.getBoundingClientRect();
    const viewport = element.closest('[aria-label="Agent messages"]')?.getBoundingClientRect();
    covers = rectangles.filter(rect => rect.width > 0 && rect.bottom > Math.max(0, viewport?.top ?? 0) && rect.top < Math.min(window.innerHeight, viewport?.bottom ?? window.innerHeight))
      .slice(0, 64).map(rect => ({ top: rect.top - bounds.top, left: rect.left - bounds.left, width: rect.width, height: rect.height }));
    clear = setTimeout(() => { covers = []; }, 220);
  });
  onDestroy(() => clearTimeout(clear));
</script>

<div class="message-markdown" bind:this={element} data-parser-epoch={parserEpoch} data-parser-input-bytes={parserInputBytes}>
  {#await renderer}
    <p class="feed-notice">Loading message…</p>
  {:then Streamdown}
    {#key parserEpoch}<Streamdown {content} mode={streaming ? 'streaming' : 'static'} isAnimating={streaming}
    skipHtml={true} disallowedElements={['img']} allowedImagePrefixes={[]}
    allowedLinkPrefixes={['https:', 'http:']} urlTransform={safeMarkdownUrl}
    linkSafety={{ enabled: false }} controls={false} animation={{ enabled: false }}
    components={{ code: PlainCode, mermaid: PlainCode }}>
      {#snippet strong({ children })}<strong>{@render children()}</strong>{/snippet}
    </Streamdown>{/key}
  {:catch}
    <p class="feed-notice">Formatted view unavailable. Showing text.</p><p class="legacy-body">{content}</p>
  {/await}
  {#each covers as cover (cover)}
    <span class="text-reveal-cover" aria-hidden="true" style:top={`${cover.top}px`} style:left={`${cover.left}px`} style:width={`${cover.width}px`} style:height={`${cover.height}px`}></span>
  {/each}
</div>

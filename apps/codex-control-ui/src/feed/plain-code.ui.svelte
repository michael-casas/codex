<script lang="ts">
  export let token: { text: string; lang?: string };
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to scroll long code output.) -->
<pre class="message-code" tabindex="0" aria-label="Code output"><code>{token.text}</code></pre>

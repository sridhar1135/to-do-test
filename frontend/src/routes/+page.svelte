<script lang="ts">
  import { onMount } from 'svelte';
  import '#lib/app.css';
  import { loadLocal } from '#lib/store';
  import { mount } from '#lib/ui.js';

  let el: HTMLDivElement;

  onMount(async () => {
    await loadLocal();
    mount(el);
  });
</script>

<svelte:head>
  <title>To-do</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
  />
</svelte:head>

<div id="app" class="app" bind:this={el}></div>
<div class="sync-toast" id="sync-toast" aria-live="polite"></div>

<script lang="ts">
  import { onMount } from 'svelte';
  import '#lib/app.css';
  import { getToken, loadLocal, signIn, syncNow } from '#lib/store';
  import { mount } from '#lib/ui.js';

  let el: HTMLDivElement;
  let needKey = $state(false);
  let key = $state('');
  let error = $state('');
  let busy = $state(false);

  onMount(async () => {
    await loadLocal();
    if (!getToken()) needKey = true;
    window.addEventListener('todo:auth', () => (needKey = true));
    mount(el);
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    const result = await signIn(key.trim());
    busy = false;
    if (result === 'ok') {
      needKey = false;
      key = '';
      void syncNow();
    } else {
      error = result === 'wrong' ? 'That access key didn’t work.' : 'Can’t reach the server. Check your connection and try again.';
    }
  }
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

{#if needKey}
  <div class="signin-scrim">
    <form class="signin" onsubmit={submit}>
      <h2>Sign in</h2>
      <p>Enter your access key once on this device. Your tasks then sync with your other devices.</p>
      <input type="password" bind:value={key} placeholder="Access key" autocomplete="current-password" required />
      {#if error}<p class="signin-err">{error}</p>{/if}
      <button class="btn" disabled={busy || !key.trim()}>{busy ? 'Checking…' : 'Sign in'}</button>
      <button type="button" class="link" onclick={() => (needKey = false)}>Use offline for now</button>
    </form>
  </div>
{/if}

<style>
  .signin-scrim { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 16px; background: var(--scrim); }
  .signin { width: min(100%, 380px); background: var(--sheet); color: var(--ink); border-radius: 20px; padding: 24px; display: grid; gap: 12px; box-shadow: 0 20px 50px -20px rgba(0, 0, 0, 0.4); }
  .signin h2 { font-family: var(--f-display); font-size: 26px; letter-spacing: -0.02em; margin: 0; }
  .signin p { margin: 0; color: var(--muted); font-size: 14px; }
  .signin input { border: 1px solid var(--line); border-radius: 12px; padding: 11px 12px; font-size: 16px; background: transparent; color: inherit; outline: none; }
  .signin input:focus { border-color: var(--accent); }
  .signin .signin-err { color: var(--danger); }
  .signin .btn { padding: 11px 16px; }
  .signin .btn:disabled { opacity: 0.6; }
</style>

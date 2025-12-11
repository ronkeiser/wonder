<script lang="ts">
</script>

<svelte:head>
  <title>Wonder Platform</title>
</svelte:head>

<div class="home">
  <h1>Wonder Platform</h1>
  <nav>
    <a href="/events">Events</a>
    <a href="/logs">Logs</a>
  </nav>
</div>

<style>
  .home {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: #0d1117;
    color: #c9d1d9;
  }

  h1 {
    font-size: 2rem;
    font-weight: 600;
    margin-bottom: 2rem;
  }

  nav {
    display: flex;
    gap: 1rem;
  }

  a {
    padding: 0.75rem 1.5rem;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    text-decoration: none;
    font-size: 1rem;
    transition:
      background 0.2s,
      border-color 0.2s;
  }

  a:hover {
    background: #30363d;
    border-color: #58a6ff;
  }
</style>

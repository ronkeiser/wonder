<script lang="ts">
  export let form: { error?: string } | undefined = undefined;

  let loading = false;
</script>

<div class="login-container">
  <div class="login-card">
    <h1>Wonder</h1>

    <form method="POST">
      <div class="form-group">
        <label for="username">Username</label>
        <input
          id="username"
          name="username"
          type="text"
          required
          autocomplete="username"
          disabled={loading}
        />
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autocomplete="current-password"
          disabled={loading}
        />
      </div>

      {#if form?.error}
        <div class="error">{form.error}</div>
      {/if}

      <button type="submit" disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  </div>
</div>

<style>
  .login-container {
    --gray-darkest: #0d1117;
    --gray-darker: #161b22;
    --gray-dark: #21262d;
    --gray: #586078;
    --gray-light: #8b949e;
    --gray-lighter: #c9d1d9;
    --blue: #58a6ff;
    --blue-hover: #79b8ff;
    --red-bg: #3f1a1a;
    --red-text: #f85149;

    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gray-darkest);
  }

  .login-card {
    background: var(--gray-darker);
    padding: 2.5rem;
    border-radius: 8px;
    border: 1px solid var(--gray);
    width: 100%;
    max-width: 400px;
  }

  h1 {
    margin: 0 0 2rem 0;
    text-align: center;
    color: var(--gray-lighter);
    font-weight: 600;
    font-size: 1.75rem;
  }

  .form-group {
    margin-bottom: 1.25rem;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--gray-lighter);
    font-weight: 500;
    font-size: 0.875rem;
  }

  input {
    width: 100%;
    padding: 0.75rem;
    background: var(--gray-darkest);
    border: 1px solid var(--gray);
    border-radius: 6px;
    font-size: 1rem;
    color: var(--gray-lighter);
    box-sizing: border-box;
    font-family: inherit;
  }

  input:focus {
    outline: none;
    border-color: var(--blue);
  }

  input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  button {
    width: 100%;
    padding: 0.75rem;
    background: var(--blue);
    color: var(--gray-darkest);
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    margin-top: 1rem;
    font-family: inherit;
  }

  button:hover:not(:disabled) {
    background: var(--blue-hover);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error {
    padding: 0.75rem;
    background: var(--red-bg);
    color: var(--red-text);
    border: 1px solid var(--red-text);
    border-radius: 6px;
    margin-bottom: 1rem;
    text-align: center;
    font-size: 0.875rem;
  }
</style>

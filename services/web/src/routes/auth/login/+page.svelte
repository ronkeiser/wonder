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
    border-color: var(--accent);
  }

  input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  button {
    width: 100%;
    padding: 0.75rem;
    background: var(--accent);
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
    background: var(--accent-hover);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error {
    padding: 0.75rem;
    background: var(--error-bg);
    color: var(--error-text);
    border: 1px solid var(--error-text);
    border-radius: 6px;
    margin-bottom: 1rem;
    text-align: center;
    font-size: 0.875rem;
  }
</style>

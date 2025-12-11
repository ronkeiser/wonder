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
    background: transparent;
    padding: 1.5rem;
    width: 100%;
    max-width: 280px;
  }

  h1 {
    margin: 0 0 1.5rem 0;
    text-align: center;
    color: var(--gray-lighter);
    font-weight: 400;
    font-size: 0.875rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .form-group {
    margin-bottom: 0.875rem;
  }

  label {
    display: block;
    margin-bottom: 0.25rem;
    color: var(--gray-light);
    font-weight: 400;
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  input {
    width: 100%;
    padding: 0.5rem 0.625rem;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--gray-dark);
    border-radius: 0;
    font-size: 0.75rem;
    color: var(--gray-lighter);
    box-sizing: border-box;
    font-family: inherit;
    transition: border-color 0.2s;
  }

  input:focus {
    outline: none;
    border-bottom-color: var(--accent);
  }

  input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  button {
    width: 100%;
    padding: 0.5rem;
    background: transparent;
    color: var(--gray-lighter);
    border: 1px solid var(--gray-dark);
    border-radius: 0;
    font-size: 0.625rem;
    font-weight: 400;
    cursor: pointer;
    margin-top: 1rem;
    font-family: inherit;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    transition: all 0.2s;
  }

  button:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error {
    padding: 0.5rem;
    background: transparent;
    color: var(--error-text);
    border: none;
    border-left: 2px solid var(--error-text);
    border-radius: 0;
    margin-bottom: 0.75rem;
    text-align: left;
    font-size: 0.625rem;
  }
</style>

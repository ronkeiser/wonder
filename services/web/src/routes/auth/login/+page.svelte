<script lang="ts">
  export let form: { error?: string } | undefined = undefined;

  let loading = false;
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-darkest">
  <div class="bg-transparent p-6 w-full max-w-[280px]">
    <h1 class="m-0 mb-6 text-center text-gray-lightest font-normal text-sm tracking-widest uppercase">
      Wonder
    </h1>

    <form method="POST">
      <div class="mb-3.5">
        <label
          for="username"
          class="block mb-1 text-gray-lighter font-normal text-[0.625rem] uppercase tracking-wide"
        >
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          autocomplete="username"
          disabled={loading}
          class="w-full py-2 px-2.5 bg-transparent border-0 border-b border-gray-dark rounded-none text-xs text-gray-lightest box-border transition-colors duration-200 focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      <div class="mb-3.5">
        <label
          for="password"
          class="block mb-1 text-gray-lighter font-normal text-[0.625rem] uppercase tracking-wide"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autocomplete="current-password"
          disabled={loading}
          class="w-full py-2 px-2.5 bg-transparent border-0 border-b border-gray-dark rounded-none text-xs text-gray-lightest box-border transition-colors duration-200 focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {#if form?.error}
        <div
          class="py-2 px-2 bg-transparent text-error border-0 border-l-2 border-error rounded-none mb-3 text-left text-[0.625rem]"
        >
          {form.error}
        </div>
      {/if}

      <button
        type="submit"
        disabled={loading}
        class="w-full py-2 bg-transparent text-gray-lightest border border-gray-dark rounded-none text-[0.625rem] font-normal cursor-pointer mt-4 uppercase tracking-widest transition-all duration-200 hover:enabled:border-accent hover:enabled:text-accent disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  </div>
</div>

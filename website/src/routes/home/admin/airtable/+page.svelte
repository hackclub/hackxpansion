<script lang="ts">
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Airtable Backfill | Hackxpansion Admin</title>
</svelte:head>

<main class="mx-auto flex max-w-6xl flex-col gap-8 p-6 text-slate-800">
	<header>
		<p class="text-sm font-bold tracking-widest text-slate-500 uppercase">Admin</p>
		<h1 class="text-4xl font-bold">Airtable backfill</h1>
		<p class="text-slate-600">
			Copy stored Ari audit notes into
			<span class="font-semibold">Justification - Alternate Tracking Method</span> on existing approved
			YSWS Project Submission rows.
		</p>
	</header>

	{#if form?.message}
		<p
			class="border p-3 text-sm"
			class:border-green-700={form.success}
			class:bg-green-100={form.success}
			class:border-red-700={!form.success}
			class:bg-red-100={!form.success}
		>
			{form.message}
		</p>
	{/if}

	<section class="flex flex-col gap-4 content-box p-5" aria-labelledby="backfill-heading">
		<h2 id="backfill-heading" class="text-2xl font-bold">Ready to backfill</h2>
		<p>
			<span class="font-bold">{data.candidateCount}</span>
			approved project{data.candidateCount === 1 ? '' : 's'} with an audit note and Airtable record ID.
		</p>
		{#if !data.airtableConfigured}
			<p class="border border-amber-700 bg-amber-100 p-3 text-sm text-amber-900">
				<code>AIRTABLE_PAC</code> is not configured, so the backfill cannot be applied.
			</p>
		{/if}

		<form method="POST" class="flex flex-wrap gap-3">
			<button
				type="submit"
				name="mode"
				value="preview"
				class="bg-slate-300 px-4 py-2 font-bold text-slate-900 transition hover:bg-slate-400"
			>
				Preview
			</button>
			<button
				type="submit"
				name="mode"
				value="apply"
				disabled={!data.airtableConfigured || data.candidateCount === 0}
				class="bg-green-600 px-4 py-2 font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
			>
				Run backfill
			</button>
		</form>
		<p class="text-xs text-slate-500">
			Preview only counts matching projects. Run backfill patches the Airtable field and can be run
			again safely.
		</p>
	</section>
</main>

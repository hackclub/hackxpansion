<script lang="ts">
	import DropdownSelect from '$lib/components/dropdown_select.svelte';
	import { inferGithubUsername, type UserSubmissionProfile } from '$lib/profile';
	import type { ProjectReviewPhase } from '$lib/projects/lifecycle';

	let {
		action,
		phase,
		profile,
		addressOptions,
		hackClubIdentityError,
		repoUrl,
		errorMessage,
		values
	}: {
		action: string;
		phase: ProjectReviewPhase;
		profile: UserSubmissionProfile;
		addressOptions: Array<{ id: string; label: string; primary: boolean }>;
		hackClubIdentityError: { code: string; message: string } | null;
		repoUrl: string | null;
		errorMessage?: string;
		values?: Record<string, string>;
	} = $props();

	function value(name: string, fallback: string | null = null) {
		return values?.[name] ?? fallback ?? '';
	}

	let selectedAddressId = $state<string | null>(value('addressId') || null);
</script>

<form method="post" {action} class="content-box flex w-full flex-col gap-6 p-5 sm:p-7">
	{#if errorMessage}
		<p class="border border-red-700 bg-red-100 p-3 text-sm text-red-900">{errorMessage}</p>
	{/if}

	<div>
		<h3 class="font-bold">Submission details</h3>
		<p class="text-sm text-slate-600">
			We save your GitHub username and the ID of the address selected for this submission. Your
			birthday and full address stay in Hack Club Auth.
		</p>
	</div>

	<label class="flex flex-col gap-1 text-sm font-semibold">
		GitHub username
		<input
			name="githubUsername"
			value={value('githubUsername', profile.githubUsername ?? inferGithubUsername(repoUrl))}
			maxlength="39"
			pattern="[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?"
			autocomplete="username"
			class="border border-slate-500 bg-white p-2 font-normal"
		/>
	</label>

	{#if hackClubIdentityError}
		<div class="border border-amber-700 bg-amber-100 p-4 text-sm text-amber-950">
			<p>{hackClubIdentityError.message}</p>
			{#if hackClubIdentityError.code === 'reauthorization_required'}
				<button
					type="submit"
					formaction="?/reconnectHackClub"
					formnovalidate
					class="mt-3 border border-amber-900 bg-white px-3 py-2 hover:bg-amber-50"
				>
					Reconnect Hack Club Auth
				</button>
			{/if}
		</div>
	{:else}
		<div class="flex flex-col gap-1">
			<DropdownSelect
				name="addressId"
				label="Shipping address"
				options={addressOptions.map((address) => ({
					value: address.id,
					label: `${address.label}${address.primary ? ' (primary)' : ''}`
				}))}
				bind:value={selectedAddressId}
				placeholder="Select an address"
				required
			/>
			<span class="font-normal text-slate-500">
				Loaded from Hack Club Auth. This choice applies only to this submission.
			</span>
		</div>
	{/if}

	<fieldset class="flex flex-col gap-2">
		<legend class="font-bold"
			>How likely are you to recommend Hackxpansion to a friend? <span class="text-red-700">*</span
			></legend
		>
		<span class="font-normal text-slate-500 flex flex-row justify-between">
			<div>Never: 1-6</div>
			<div>Maybe: 7-8</div>
			<div>Likely: 9-10</div>
		</span>
		<div class="grid grid-cols-6 gap-1 sm:grid-cols-11">
			{#each Array.from({ length: 11 }, (_, score) => score) as score (score)}
				<label
					class="flex cursor-pointer flex-col items-center gap-1 border border-slate-400 bg-white p-2 text-sm hover:bg-slate-100"
				>
					<input
						type="radio"
						name="nps"
						value={score}
						checked={value('nps') === String(score)}
						required
					/>
					{score}
				</label>
			{/each}
		</div>
	</fieldset>

	<div class="flex flex-col gap-3">
		<h3 class="font-bold">Optional feedback</h3>
		<label class="flex flex-col gap-1 text-sm font-semibold">
			How did you hear about Hackxpansion?
			<textarea
				name="howDidYouHear"
				maxlength="2000"
				class="min-h-20 border border-slate-500 bg-white p-2 font-normal"
				>{value('howDidYouHear')}</textarea
			>
		</label>
		<label class="flex flex-col gap-1 text-sm font-semibold">
			What are we doing well?
			<textarea
				name="whatAreWeDoingWell"
				maxlength="2000"
				class="min-h-20 border border-slate-500 bg-white p-2 font-normal"
				>{value('whatAreWeDoingWell')}</textarea
			>
		</label>
		<label class="flex flex-col gap-1 text-sm font-semibold">
			How can we improve?
			<textarea
				name="howCanWeImprove"
				maxlength="2000"
				class="min-h-20 border border-slate-500 bg-white p-2 font-normal"
				>{value('howCanWeImprove')}</textarea
			>
		</label>
	</div>

	<button
		type="submit"
		disabled={hackClubIdentityError !== null}
		class="bg-slate-800 px-4 py-2 text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
	>
		Submit {phase} review
	</button>
</form>

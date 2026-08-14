<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	function value(name: keyof PageServerData['profile']) {
		return form?.profileValues?.[name] ?? data.profile[name] ?? '';
	}
</script>

<svelte:head>
	<title>Settings | Hackxpansion</title>
</svelte:head>

<main class="mx-auto flex max-w-5xl flex-col gap-8 p-6 text-slate-800">
	<header>
		<h1 class="text-4xl font-bold">Settings</h1>
		<p class="text-slate-600">Manage your Hackxpansion account and project information.</p>
	</header>

	<section aria-labelledby="project-settings" class="content-box p-5">
		<h2 id="project-settings" class="text-2xl font-bold">Project settings</h2>
		<p class="mt-2">
			Project details are managed individually from
			<a href={resolve('/home/projects')} class="underline">your projects</a>.
		</p>
	</section>

	<section aria-labelledby="submission-settings" class="content-box p-5">
		<h2 id="submission-settings" class="text-2xl font-bold">Submission details</h2>
		<p class="mt-2 text-slate-600">Your GitHub username is used to pre-fill review submissions.</p>
		<p class="mt-1 text-sm text-slate-500">
			Shipping addresses and birthdays are read from Hack Club Auth only when needed and are not
			stored in Hackxpansion.
		</p>

		{#if form && 'profileSuccess' in form}
			<p
				class="mt-4 border p-3 text-sm"
				class:border-green-700={form.profileSuccess}
				class:bg-green-100={form.profileSuccess}
				class:text-green-900={form.profileSuccess}
				class:border-red-700={!form.profileSuccess}
				class:bg-red-100={!form.profileSuccess}
				class:text-red-900={!form.profileSuccess}
			>
				{form.message}
			</p>
		{/if}

		<form method="post" action="?/updateProfile" class="mt-5 grid gap-4">
			<label class="flex flex-col gap-1 text-sm font-semibold">
				GitHub username
				<input
					name="githubUsername"
					value={value('githubUsername')}
					maxlength="39"
					pattern="[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?"
					autocomplete="username"
					class="border border-slate-500 bg-white p-2 font-normal"
				/>
			</label>
			<div>
				<button class="bg-slate-800 px-4 py-2 text-white hover:bg-slate-700">Save details</button>
			</div>
		</form>
	</section>

	<section aria-labelledby="hack-club-profile" class="content-box p-5">
		<h2 id="hack-club-profile" class="text-2xl font-bold">Hack Club profile</h2>
		<p class="mt-2 text-slate-600">
			Refresh your local Hack Club fields. Display name and profile image come directly from Slack;
			email, verification status, and YSWS eligibility come from Hack Club Auth.
		</p>

		{#if form && 'hackClubProfileSuccess' in form}
			<p
				class="mt-4 border p-3 text-sm"
				class:border-green-700={form.hackClubProfileSuccess}
				class:bg-green-100={form.hackClubProfileSuccess}
				class:text-green-900={form.hackClubProfileSuccess}
				class:border-red-700={!form.hackClubProfileSuccess}
				class:bg-red-100={!form.hackClubProfileSuccess}
				class:text-red-900={!form.hackClubProfileSuccess}
			>
				{form.message}
			</p>
		{/if}

		<form method="post" action="?/refreshHackClubProfile" class="mt-4">
			<button class="border border-slate-800 px-4 py-2 hover:bg-slate-800 hover:text-white">
				Refresh Hack Club profile
			</button>
		</form>
	</section>

	<section aria-labelledby="account-settings" class="content-box p-5">
		<h2 id="account-settings" class="text-2xl font-bold">Account</h2>
		<p class="mt-2">Sign out of your Hack Club account on this device.</p>
		<form method="post" action={`${resolve('/home')}?/signOut`} class="mt-4">
			<button
				class="border border-slate-800 px-4 py-2 hover:bg-slate-800 hover:text-white cursor-pointer"
			>
				Sign out
			</button>
		</form>
	</section>
</main>

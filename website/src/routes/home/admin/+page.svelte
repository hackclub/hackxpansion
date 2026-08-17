<script lang="ts">
	import { resolve } from '$app/paths';
	import CoinIcon from '$lib/components/coin_icon.svelte';
	import { formatMinutes } from '$lib/projects/domain';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();
	const stats = $derived(data.stats);

	const statusLabels: Record<string, string> = {
		not_submitted: 'Not Submitted',
		waiting_design: 'Waiting Design Review',
		needs_changes_design: 'Needs Changes (Design)',
		rejected_design: 'Rejected (Design)',
		approved_design: 'Approved (Design)',
		waiting_build: 'Waiting Build Review',
		needs_changes_build: 'Needs Changes (Build)',
		rejected_build: 'Rejected (Build)',
		approved_build: 'Approved (Build)'
	};

	function percentage(count: number, total: number): string {
		if (total === 0) return '0%';
		return `${Math.round((count / total) * 100)}%`;
	}
</script>

<svelte:head>
	<title>Admin Overview | Hackxpansion</title>
</svelte:head>

<main class="mx-auto flex max-w-6xl flex-col gap-8 p-6 text-slate-800">
	<header>
		<p class="text-sm font-bold uppercase tracking-widest text-slate-500">Admin</p>
		<h1 class="text-4xl font-bold">Event Overview</h1>
		<p class="text-slate-600">
			General stats, participant activity, project pipeline, and economic activity.
		</p>
	</header>

	<!-- Quick Attention Alerts -->
	{#if stats.projects.pendingReview > 0 || stats.orders.pending > 0}
		<section
			class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
			aria-label="Action required items"
		>
			{#if stats.projects.pendingReview > 0}
				<a
					href={resolve('/home/admin/submissions')}
					class="content-box flex flex-1 items-center justify-between border-amber-600 bg-amber-100/80 p-4 transition hover:bg-amber-200/80"
				>
					<div class="flex items-center gap-3">
						<span class="flex size-8 items-center justify-center bg-amber-500 font-bold text-white">
							!
						</span>
						<div>
							<p class="font-bold text-amber-900">
								{stats.projects.pendingReview}
								{stats.projects.pendingReview === 1 ? 'submission' : 'submissions'} pending review
							</p>
							<p class="text-xs text-amber-800">Projects waiting for design or build approval.</p>
						</div>
					</div>
					<span class="text-sm font-bold underline">Review &rarr;</span>
				</a>
			{/if}

			{#if stats.orders.pending > 0}
				<a
					href={resolve('/home/admin/orders')}
					class="content-box flex flex-1 items-center justify-between border-amber-600 bg-amber-100/80 p-4 transition hover:bg-amber-200/80"
				>
					<div class="flex items-center gap-3">
						<span class="flex size-8 items-center justify-center bg-amber-500 font-bold text-white">
							!
						</span>
						<div>
							<p class="font-bold text-amber-900">
								{stats.orders.pending} shop {stats.orders.pending === 1 ? 'order' : 'orders'} in queue
							</p>
							<p class="text-xs text-amber-800">Orders waiting to be marked as fulfilled.</p>
						</div>
					</div>
					<span class="text-sm font-bold underline">Fulfill &rarr;</span>
				</a>
			{/if}
		</section>
	{/if}

	<!-- Top Metric Cards Grid -->
	<section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Top level stats">
		<!-- Users Card -->
		<article class="content-box flex flex-col justify-between p-5">
			<div>
				<p class="text-xs font-bold uppercase tracking-wider text-slate-500">Participants</p>
				<p class="mt-2 text-4xl font-extrabold">{stats.users.total}</p>
			</div>
			<div
				class="mt-4 flex flex-col gap-1 border-t border-slate-400/60 pt-3 text-xs text-slate-600"
			>
				<p>
					<span class="font-semibold text-slate-800">{stats.users.withAtLeastOneProject}</span>
					active ({percentage(stats.users.withAtLeastOneProject, stats.users.total)}) with one
					project created
				</p>
				<p>
					<span class="font-semibold text-slate-800">{stats.users.withActiveWork}</span> active ({percentage(
						stats.users.withActiveWork,
						stats.users.total
					)}) with journals or hackatime
				</p>
				<p>
					<span class="font-semibold text-slate-800">{stats.users.yswsEligible}</span> YSWS eligible
					({percentage(stats.users.yswsEligible, stats.users.total)})
				</p>
				<p><span class="font-semibold text-slate-800">{stats.users.admins}</span> admin users</p>
			</div>
		</article>

		<!-- Projects Card -->
		<article class="content-box flex flex-col justify-between p-5">
			<div>
				<p class="text-xs font-bold uppercase tracking-wider text-slate-500">Projects Created</p>
				<p class="mt-2 text-4xl font-extrabold">{stats.projects.total}</p>
			</div>
			<div class="mt-4 border-t border-slate-400/60 pt-3 text-xs text-slate-600">
				<p>
					<span class="font-semibold text-slate-800">{stats.projects.shippedToAri}</span> shipped to Ari
				</p>
				<p>
					<span class="font-semibold text-slate-800">{stats.projects.approvedBuild}</span> fully approved
					builds
				</p>
			</div>
		</article>

		<!-- Currency Card -->
		<article class="content-box flex flex-col justify-between p-5">
			<div>
				<p class="text-xs font-bold uppercase tracking-wider text-slate-500">Currency Awarded</p>
				<p class="mt-2 flex items-center gap-1.5 text-4xl font-extrabold">
					<CoinIcon />
					{stats.projects.totalCurrencyPaidOut}
				</p>
			</div>
			<div class="mt-4 border-t border-slate-400/60 pt-3 text-xs text-slate-600">
				<p class="flex items-center gap-1">
					User wallets: <span class="font-semibold text-slate-800">{stats.users.totalCurrency}</span
					>
				</p>
				<p class="flex items-center gap-1">
					Shop spent: <span class="font-semibold text-slate-800">{stats.orders.totalSpent}</span>
				</p>
			</div>
		</article>

		<!-- Hours & NPS Card -->
		<article class="content-box flex flex-col justify-between p-5">
			<div>
				<p class="text-xs font-bold uppercase tracking-wider text-slate-500">Logged Work</p>
				<p class="mt-2 text-4xl font-extrabold">
					{formatMinutes(stats.journals.totalMinutes + stats.hackatime.totalMinutes)}
				</p>
			</div>
			<div class="mt-4 border-t border-slate-400/60 pt-3 text-xs text-slate-600">
				<p>
					Journals: <span class="font-semibold text-slate-800"
						>{formatMinutes(stats.journals.totalMinutes)}</span
					>
					({stats.journals.total} entries)
				</p>
				<p>
					Hackatime: <span class="font-semibold text-slate-800"
						>{formatMinutes(stats.hackatime.totalMinutes)}</span
					>
				</p>
				<p>
					Avg NPS:
					<span class="font-semibold text-slate-800">
						{stats.submissions.avgNps !== null ? `${stats.submissions.avgNps} / 10` : 'N/A'}
					</span>
				</p>
			</div>
		</article>
	</section>

	<!-- Main Details Grid -->
	<section class="grid gap-6 lg:grid-cols-3" aria-label="Detailed breakdowns">
		<!-- Project Status Pipeline (2 cols) -->
		<article class="content-box flex flex-col gap-4 p-5 lg:col-span-2">
			<div class="flex items-center justify-between">
				<h2 class="text-xl font-bold">Project Pipeline Status</h2>
				<a
					href={resolve('/home/admin/projects')}
					class="text-xs font-bold underline hover:text-slate-900"
				>
					View All Projects &rarr;
				</a>
			</div>

			<div class="flex flex-col gap-2.5">
				{#each Object.entries(statusLabels) as [key, label] (key)}
					{@const count = stats.projects.byStatus[key] ?? 0}
					{@const pct = stats.projects.total > 0 ? (count / stats.projects.total) * 100 : 0}
					<div class="flex flex-col gap-1">
						<div class="flex items-center justify-between text-xs font-medium">
							<span
								class:font-bold={key === 'waiting_design' || key === 'waiting_build'}
								class:text-amber-800={key === 'waiting_design' || key === 'waiting_build'}
								class:text-green-800={key === 'approved_build'}
							>
								{label}
							</span>
							<span class="font-bold">{count} ({Math.round(pct)}%)</span>
						</div>
						<div class="h-2 w-full overflow-hidden bg-slate-300">
							<div
								class="h-full transition-all duration-300"
								class:bg-amber-500={key === 'waiting_design' || key === 'waiting_build'}
								class:bg-green-600={key === 'approved_build' || key === 'approved_design'}
								class:bg-red-500={key === 'rejected_design' || key === 'rejected_build'}
								class:bg-slate-500={key === 'not_submitted' || key.startsWith('needs_changes')}
								style={`width: ${pct}%`}
							></div>
						</div>
					</div>
				{/each}
			</div>
		</article>

		<!-- Right Column: Types, Tiers, & Quick Admin Links -->
		<div class="flex flex-col gap-6">
			<!-- Project Types & Tiers -->
			<article class="content-box flex flex-col gap-4 p-5">
				<h2 class="text-xl font-bold">Project Types & Tiers</h2>

				<div>
					<p class="text-xs font-bold uppercase tracking-wider text-slate-500">By Type</p>
					<div class="mt-2 grid grid-cols-3 gap-2">
						<div class="bg-slate-200/80 p-2.5 text-center">
							<p class="text-xs uppercase text-slate-500 font-bold">Card</p>
							<p class="mt-0.5 text-xl font-bold">{stats.projects.byType['card'] ?? 0}</p>
						</div>
						<div class="bg-slate-200/80 p-2.5 text-center">
							<p class="text-xs uppercase text-slate-500 font-bold">App</p>
							<p class="mt-0.5 text-xl font-bold">{stats.projects.byType['app'] ?? 0}</p>
						</div>
						<div class="bg-slate-200/80 p-2.5 text-center">
							<p class="text-xs uppercase text-slate-500 font-bold">Mod</p>
							<p class="mt-0.5 text-xl font-bold">{stats.projects.byType['mod'] ?? 0}</p>
						</div>
					</div>
				</div>

				<div class="border-t border-slate-400/60 pt-3">
					<p class="text-xs font-bold uppercase tracking-wider text-slate-500">By Tier</p>
					<div class="mt-2 grid grid-cols-3 gap-2">
						<div class="bg-slate-200/80 p-2.5 text-center">
							<p class="text-xs uppercase text-slate-500 font-bold">Basic</p>
							<p class="mt-0.5 text-xl font-bold">{stats.projects.byTier['basic'] ?? 0}</p>
						</div>
						<div class="bg-slate-200/80 p-2.5 text-center">
							<p class="text-xs uppercase text-slate-500 font-bold">Advanced</p>
							<p class="mt-0.5 text-xl font-bold">{stats.projects.byTier['advanced'] ?? 0}</p>
						</div>
						<div class="bg-slate-200/80 p-2.5 text-center">
							<p class="text-xs uppercase text-slate-500 font-bold">Pro</p>
							<p class="mt-0.5 text-xl font-bold">{stats.projects.byTier['pro'] ?? 0}</p>
						</div>
					</div>
				</div>
			</article>

			<!-- Quick Admin Navigation -->
			<article class="content-box flex flex-col gap-3 p-5">
				<h2 class="text-xl font-bold">Admin Navigation</h2>
				<nav class="flex flex-col gap-2 font-medium">
					<a
						href={resolve('/home/admin/submissions')}
						class="flex items-center justify-between bg-slate-300/80 px-3 py-2 transition hover:bg-slate-300"
					>
						<span>Submissions Review</span>
						<span class="text-xs font-bold bg-slate-400 px-2 py-0.5">{stats.submissions.total}</span
						>
					</a>
					<a
						href={resolve('/home/admin/projects')}
						class="flex items-center justify-between bg-slate-300/80 px-3 py-2 transition hover:bg-slate-300"
					>
						<span>All Projects</span>
						<span class="text-xs font-bold bg-slate-400 px-2 py-0.5">{stats.projects.total}</span>
					</a>
					<a
						href={resolve('/home/admin/orders')}
						class="flex items-center justify-between bg-slate-300/80 px-3 py-2 transition hover:bg-slate-300"
					>
						<span>Shop Orders</span>
						<span class="text-xs font-bold bg-slate-400 px-2 py-0.5">
							{stats.orders.pending} queue / {stats.orders.total} total
						</span>
					</a>
					<a
						href={resolve('/home/admin/shop')}
						class="flex items-center justify-between bg-slate-300/80 px-3 py-2 transition hover:bg-slate-300"
					>
						<span>Catalog & Shop Items</span>
						<span class="text-xs font-bold">&rarr;</span>
					</a>
					<a
						href={resolve('/home/admin/users')}
						class="flex items-center justify-between bg-slate-300/80 px-3 py-2 transition hover:bg-slate-300"
					>
						<span>Manage Users & Admins</span>
						<span class="text-xs font-bold bg-slate-400 px-2 py-0.5">{stats.users.total}</span>
					</a>
				</nav>
			</article>
		</div>
	</section>
</main>

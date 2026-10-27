<script lang="ts">
	import { cn } from '#lib/utils';
	import { formatPrize } from '#lib/format';

	interface Props {
		status: 'synced' | 'saving' | 'offline' | 'error';
		prize?: string | null;
		onSave: () => void;
		saving?: boolean;
	}

	let { status, prize, onSave, saving = false }: Props = $props();
</script>

<div class="sticky top-0 z-10 border-b border-border bg-background px-4 py-3">
	<div class="flex flex-col gap-2">
		<div class="flex items-center justify-between gap-2">
			{#if prize}
				<span class="font-semibold text-sm tabular-nums">{formatPrize(prize)}</span>
			{/if}
			<span class={cn('text-[10px] font-semibold px-2 py-1 rounded-full', status === 'synced' ? 'bg-success/10 text-success-foreground border border-success/20' : status === 'offline' ? 'bg-secondary text-muted-foreground' : 'bg-accent text-accent-foreground')}>
				{status === 'synced' ? 'Synced' : status === 'saving' ? 'Saving…' : status === 'offline' ? 'Offline' : 'Sync failed'}
			</span>
		</div>
		<button class="w-full min-h-[56px] rounded-lg bg-primary text-primary-foreground font-semibold py-3 text-base shadow-sm active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none" disabled={saving} onclick={onSave}>
			{saving ? 'Saving…' : 'Save'}
		</button>
	</div>
</div>

<script lang="ts">
	import { cn } from '#lib/utils';
	import { Info } from '@lucide/svelte';

	interface Props {
		title: string;
		body: string;
		dismissed: boolean;
		onDismiss: () => void;
		onAction?: () => void;
		actionLabel?: string;
	}

	let { title, body, dismissed, onDismiss, onAction, actionLabel }: Props = $props();
</script>

<div class={cn('rounded-xl border border-border bg-card p-5', dismissed ? 'hidden' : '')}>
	<div class="flex items-start gap-3">
		<Info class="w-5 h-5 text-primary shrink-0" />
		<div class="flex-1">
			<h3 class="font-bold text-lg">{title}</h3>
			<p class="text-sm text-muted-foreground">{body}</p>
		</div>
	</div>
	<div class="mt-4 flex gap-2">
		<button class="flex-1 rounded-xl border border-border bg-background py-2 text-sm font-semibold" onclick={onDismiss}>
			Got it
		</button>
		{#if onAction}
			<button class="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold" onclick={onAction}>
				{actionLabel ?? 'OK'}
			</button>
		{/if}
	</div>
</div>

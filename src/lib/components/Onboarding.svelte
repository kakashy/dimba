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

<div class={cn('rounded-xl border border-border bg-card p-6', dismissed ? 'hidden' : '')}>
	<div class="flex items-start gap-4">
		<Info class="w-6 h-6 text-primary shrink-0" />
		<div class="flex-1">
			<h3 class="font-bold text-xl">{title}</h3>
			<p class="text-base text-muted-foreground">{body}</p>
		</div>
	</div>
	<div class="mt-6 flex gap-2">
		<button class="flex-1 rounded-xl border border-border bg-background py-3 text-base font-semibold" onclick={onDismiss}>
			Got it
		</button>
		{#if onAction}
			<button class="rounded-xl bg-primary text-primary-foreground py-3 text-base font-semibold min-h-[56px]" onclick={onAction}>
				{actionLabel ?? 'OK'}
			</button>
		{/if}
	</div>
</div>

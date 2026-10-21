<script lang="ts">
	import { cn } from '#lib/utils';

	let { current }: { current: 'home' | 'history' } = $props();
	const navigate = (to: 'home' | 'history') => {
		const ev = new CustomEvent('dimba:navigate', { detail: { to }, bubbles: true, composed: true });
		void ev;
	};
</script>

<nav class="fixed bottom-0 left-0 right-0 border-t border-border bg-background/80 backdrop-blur z-50 px-4 pb-4">
	<div class="grid grid-cols-2 gap-2 max-w-md mx-auto">
		<button
			class={cn(
				'flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl text-sm font-semibold transition-colors',
				current === 'home' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
			)}
			onclick={() => (current === 'home' ? null : navigate('home'))}
		>
			<span class="text-xl">🏠</span>
			<span>Fixtures</span>
		</button>
		<button
			class={cn(
				'flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl text-sm font-semibold transition-colors',
				current === 'history' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
			)}
			onclick={() => (current === 'history' ? null : navigate('history'))}
		>
			<span class="text-xl">📜</span>
			<span>Results</span>
		</button>
	</div>
</nav>

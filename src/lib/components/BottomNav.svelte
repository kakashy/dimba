<script lang="ts">
	import { cn } from '#lib/utils';
	import { Home, BookOpen } from '@lucide/svelte';

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
				'flex flex-col items-center justify-center gap-1.5 px-3 py-4 rounded-xl text-sm font-semibold transition-colors',
				current === 'home' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
			)}
			onclick={() => (current === 'home' ? null : navigate('home'))}
		>
			<Home class="w-5 h-5 shrink-0" />
			<span>Fixtures</span>
		</button>
		<button
			class={cn(
				'flex flex-col items-center justify-center gap-1.5 px-3 py-4 rounded-xl text-sm font-semibold transition-colors',
				current === 'history' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
			)}
			onclick={() => (current === 'history' ? null : navigate('history'))}
		>
			<BookOpen class="w-5 h-5 shrink-0" />
			<span>Results</span>
		</button>
	</div>
</nav>

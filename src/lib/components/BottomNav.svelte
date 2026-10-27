<script lang="ts">
	import { cn } from '#lib/utils';
	import { Home, BookOpen } from '@lucide/svelte';
	import { goto } from '$app/navigation';

	let { current }: { current: 'home' | 'history' } = $props();

	const navigate = (to: 'home' | 'history') => {
		if (to === current) return;
		void goto(to === 'home' ? '/' : '/history');
	};
</script>

<nav
	class="fixed bottom-0 left-0 right-0 border-t border-border bg-background z-50 px-4 pb-6 pt-2"
	aria-label="Bottom navigation"
>
	<div class="grid grid-cols-2 gap-2 max-w-md mx-auto">
		<button
			class={cn(
				'flex flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-xl text-sm font-semibold transition-colors min-h-[60px]',
				current === 'home'
					? 'bg-primary text-primary-foreground shadow-sm'
					: 'text-muted-foreground hover:text-foreground hover:bg-secondary'
			)}
			onclick={() => navigate('home')}
			aria-current={current === 'home' ? 'page' : undefined}
		>
			<Home class="w-5 h-5 shrink-0" />
			<span>Fixtures</span>
		</button>
		<button
			class={cn(
				'flex flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-xl text-sm font-semibold transition-colors min-h-[60px]',
				current === 'history'
					? 'bg-primary text-primary-foreground shadow-sm'
					: 'text-muted-foreground hover:text-foreground hover:bg-secondary'
			)}
			onclick={() => navigate('history')}
			aria-current={current === 'history' ? 'page' : undefined}
		>
			<BookOpen class="w-5 h-5 shrink-0" />
			<span>Results</span>
		</button>
	</div>
</nav>

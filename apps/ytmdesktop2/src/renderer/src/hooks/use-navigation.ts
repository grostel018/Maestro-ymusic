import { useState } from "react";
import { trpc } from "@/lib/trpc";

/**
 * YouTube view navigation: home / back / devtools + same-origin home flag.
 */
export function useNavigation() {
	const [isHome, setIsHome] = useState(true);
	const { mutateAsync: home, isLoading: homePending } = trpc.navigation.home.useMutation();
	const { mutateAsync: goback, isLoading: gobackPending } = trpc.navigation.goback.useMutation();
	const { mutateAsync: goforward } = trpc.navigation.goforward.useMutation();
	const { mutateAsync: playerPage } = trpc.navigation.playerPage.useMutation();
	const { mutateAsync: search } = trpc.navigation.search.useMutation();
	const { mutateAsync: devTools, isLoading: devToolsPending } = trpc.navigation.devTools.useMutation();

	trpc.navigation.onSameOrigin.useSubscription(undefined, {
		onData: (sameOrigin) => setIsHome(!!sameOrigin),
	});

	return {
		isHome,
		home,
		goback,
		goforward,
		playerPage,
		search,
		devTools,
		isPending: homePending || gobackPending || devToolsPending,
	};
}

import { firefoxImportAvailable, getGoogleLoginState, importGoogleSignInFromFirefox, retryGoogleLogin } from "@main/windows/googleLogin";
import { publicProcedure, router } from "@shared/trpc/trpc";

/** Used by the notice bar of the Google sign-in window (renderer route /youtube/login-notice). */
export const googleLoginRouter = router({
	state: publicProcedure.query(() => getGoogleLoginState()),
	retry: publicProcedure.mutation(() => retryGoogleLogin()),
	firefoxAvailable: publicProcedure.query(() => firefoxImportAvailable()),
	importFromFirefox: publicProcedure.mutation(() => importGoogleSignInFromFirefox()),
});

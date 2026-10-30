import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { devLoginProviders } from "./devLogin";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  // devLoginProviders() is empty unless DEV_LOGIN_SECRET is set on the deployment.
  providers: [Google, ...devLoginProviders()],
});

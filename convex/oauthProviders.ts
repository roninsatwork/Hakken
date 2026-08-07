import { publicQuery } from "./tenantFunctions";
import { enabledOAuthProviders } from "./oauthProviderDirectory";

/**
 * The sign-in buttons the login screen should draw.
 *
 * Runs on the server because only the server knows which credentials exist;
 * only ids and labels cross to the browser. Public by necessity — nobody is
 * signed in yet on the screen that asks.
 */
export const getEnabledOAuthProviders = publicQuery({
  reason: "The login screen has to know which sign-in buttons to draw before anyone is signed in.",
  args: {},
  handler: async () => {
    return enabledOAuthProviders(process.env).map(({ id, label }) => ({ id, label }));
  },
});

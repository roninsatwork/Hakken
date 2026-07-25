import { describe, expect, test } from "vitest";
import {
  filterNavigationTree,
  isNavItemVisible,
  resolveHiddenNavKeys,
  type NavigationProfile,
} from "./navigationVisibility";

const customerWorkspace: NavigationProfile = {
  key: "customerWorkspace",
  visible: ["appDashboard", "assistant", "reports", "organization"],
  owner: ["systemSettings", "systemHealth"],
  hide: ["adminCompanies", "releaseCenter", "apiKeys", "webhookDeliveries"],
};

describe("navigation visibility", () => {
  test("hides exactly what the profile lists", () => {
    const hidden = resolveHiddenNavKeys({ profile: customerWorkspace });

    expect(hidden).toEqual(
      new Set(["adminCompanies", "releaseCenter", "apiKeys", "webhookDeliveries"]),
    );
    expect(isNavItemVisible("adminCompanies", hidden)).toBe(false);
    expect(isNavItemVisible("assistant", hidden)).toBe(true);
  });

  test("shows unclassified items rather than hiding them", () => {
    // Deny-by-default would mean a newly added nav item silently disappears on
    // every deployment using a profile, until someone remembers to classify it.
    const hidden = resolveHiddenNavKeys({ profile: customerWorkspace });

    expect(isNavItemVisible("aBrandNewFeature", hidden)).toBe(true);
    expect(isNavItemVisible(undefined, hidden)).toBe(true);
  });

  test("shows everything when no profile is selected", () => {
    expect(resolveHiddenNavKeys({}).size).toBe(0);
    expect(resolveHiddenNavKeys({ profile: null }).size).toBe(0);
  });

  test("treats a key listed as both shown and hidden as shown", () => {
    const contradictory: NavigationProfile = {
      key: "supportWidget",
      visible: ["chatLogs"],
      owner: [],
      hide: ["chatLogs", "properties"],
    };

    const hidden = resolveHiddenNavKeys({ profile: contradictory });

    expect(isNavItemVisible("chatLogs", hidden)).toBe(true);
    expect(isNavItemVisible("properties", hidden)).toBe(false);
  });

  test("deployment overrides hide items the profile would show", () => {
    const hidden = resolveHiddenNavKeys({
      profile: customerWorkspace,
      hiddenNavKeys: ["reports"],
    });

    expect(isNavItemVisible("reports", hidden)).toBe(false);
    expect(isNavItemVisible("assistant", hidden)).toBe(true);
  });

  test("ignores blank and padded entries", () => {
    const hidden = resolveHiddenNavKeys({
      profile: { key: "supportWidget", visible: [], owner: [], hide: ["  properties  ", "", "   "] },
    });

    expect(hidden).toEqual(new Set(["properties"]));
  });

  test("filters a nav tree and drops parents left empty", () => {
    const tree = [
      {
        navKey: "administration",
        children: [{ navKey: "adminCompanies" }, { navKey: "apiKeys" }],
      },
      {
        navKey: "workspace",
        children: [{ navKey: "assistant" }, { navKey: "reports" }],
      },
      { navKey: "standalone" },
    ];

    const filtered = filterNavigationTree(
      tree,
      resolveHiddenNavKeys({ profile: customerWorkspace }),
    );

    // "administration" loses both children, so it must not render as an empty
    // heading.
    expect(filtered.map((entry) => entry.navKey)).toEqual(["workspace", "standalone"]);
    expect(filtered[0].children?.map((child) => child.navKey)).toEqual(["assistant", "reports"]);
  });

  test("keeps a parent that still has at least one visible child", () => {
    const tree = [
      { navKey: "administration", children: [{ navKey: "adminCompanies" }, { navKey: "auditLogs" }] },
    ];

    const filtered = filterNavigationTree(
      tree,
      resolveHiddenNavKeys({ profile: customerWorkspace }),
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].children?.map((child) => child.navKey)).toEqual(["auditLogs"]);
  });

  test("does not mutate the input tree", () => {
    const tree = [{ navKey: "administration", children: [{ navKey: "adminCompanies" }] }];
    const snapshot = JSON.stringify(tree);

    filterNavigationTree(tree, resolveHiddenNavKeys({ profile: customerWorkspace }));

    expect(JSON.stringify(tree)).toBe(snapshot);
  });
});

import { describe, expect, test } from "vitest";
import type { Doc, Id } from "./_generated/dataModel";
import {
  buildPlanRecord,
  DEFAULT_PLAN_STATUS,
  getAssignedPlanDeleteErrorMessage,
  getPlanStatusFromCompany,
  getPlanStatusFromUser,
} from "./planService";

const baseUser = {
  _id: "user-1" as Id<"users">,
  _creationTime: 0,
  email: "user@test.com",
} satisfies Doc<"users">;

const basePlan = {
  _id: "plan-1" as Id<"plans">,
  _creationTime: 0,
  name: "Team Plan",
  messageLimit: 100,
  priceGBP: 29,
  isActive: true,
  createdAt: 1,
} satisfies Doc<"plans">;

const baseCompany = {
  _id: "company-1" as Id<"companies">,
  _creationTime: 0,
  name: "Company One",
  createdAt: 1,
} satisfies Doc<"companies">;

describe("plan service helpers", () => {
  test("returns default plan status for users without override or company", () => {
    expect(getPlanStatusFromUser({ user: baseUser })).toEqual(DEFAULT_PLAN_STATUS);
  });

  test("prefers user plan overrides and reports user usage", () => {
    expect(
      getPlanStatusFromUser({
        user: {
          ...baseUser,
          planOverrideId: basePlan._id,
          companyId: baseCompany._id,
          messagesUsedThisPeriod: 7,
        },
        userPlan: basePlan,
        company: { ...baseCompany, messagesUsedThisPeriod: 30 },
        companyPlan: { ...basePlan, name: "Company Plan", messageLimit: 500 },
      })
    ).toEqual({
      planName: "Custom Team Plan",
      messageLimit: 100,
      messagesUsed: 7,
    });
  });

  test("preserves missing override behavior without falling back to company plan", () => {
    expect(
      getPlanStatusFromUser({
        user: {
          ...baseUser,
          planOverrideId: "missing-plan" as Id<"plans">,
          companyId: baseCompany._id,
          messagesUsedThisPeriod: 4,
        },
        userPlan: null,
        company: { ...baseCompany, messagesUsedThisPeriod: 30 },
        companyPlan: basePlan,
      })
    ).toEqual({
      planName: "System Default",
      messageLimit: -1,
      messagesUsed: 4,
    });
  });

  test("resolves company plan status with usage", () => {
    expect(getPlanStatusFromCompany({ ...baseCompany, messagesUsedThisPeriod: 12 }, basePlan)).toEqual({
      planName: "Team Plan",
      messageLimit: 100,
      messagesUsed: 12,
    });
  });

  test("uses company usage with default plan details when no plan exists", () => {
    expect(getPlanStatusFromCompany({ ...baseCompany, messagesUsedThisPeriod: 6 }, null)).toEqual({
      planName: "System Default",
      messageLimit: -1,
      messagesUsed: 6,
    });
  });

  test("builds plan create records with timestamps", () => {
    expect(
      buildPlanRecord(
        {
          name: "Growth",
          description: "For growing teams",
          messageLimit: 1000,
          priceGBP: 99,
          isActive: true,
        },
        123
      )
    ).toEqual({
      name: "Growth",
      description: "For growing teams",
      messageLimit: 1000,
      priceGBP: 99,
      isActive: true,
      createdAt: 123,
    });
  });

  test("formats assigned-plan delete errors", () => {
    expect(getAssignedPlanDeleteErrorMessage(3)).toBe(
      "Cannot delete this plan. It is actively assigned to 3 companies."
    );
  });
});

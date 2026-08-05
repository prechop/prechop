import { describe, expect, it } from "vitest";
import {
  clearPinResetAuthParam,
  getPinResetAuthToken,
} from "@/libs/forgotPinAuth";

describe("forgotPinAuth", () => {
  it("reads admin-approved reset tokens from the URL", () => {
    expect(
      getPinResetAuthToken("/vendor/settings?pinResetAuth=token-123"),
    ).toBe("token-123");
  });

  it("removes the admin auth token from the query string without disturbing other params", () => {
    const next = clearPinResetAuthParam(
      "/vendor/settings?pinResetAuth=token-123&saved=1",
    );
    expect(next).toBe("/vendor/settings?saved=1");
  });
});

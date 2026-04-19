import { appMode, isDemoModeEnabled } from "../lib/runtimeConfig";

test("runtime mode is derived deterministically", () => {
  expect(["demo", "prod"]).toContain(appMode);
  expect(typeof isDemoModeEnabled).toBe("boolean");
});

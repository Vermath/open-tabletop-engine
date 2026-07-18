import { describe, expect, it } from "vitest";
import { ApiCompatibilityError, apiBuildFingerprintIssue, apiCompatibilityIssue } from "./api-compatibility.js";
import { assertApiCompatibility } from "./api.js";

describe("browser/API startup compatibility", () => {
  it("explains missing, wrong-service, and mismatched API identities", () => {
    expect(apiCompatibilityIssue(undefined)).toContain("JSON identity");
    expect(apiCompatibilityIssue({ service: "not-otte", apiCompatibility: "1" })).toContain("Expected open-tabletop-api");
    expect(apiCompatibilityIssue({ service: "open-tabletop-api" })).toContain("API missing");
    expect(apiCompatibilityIssue({ service: "open-tabletop-api", apiCompatibility: "0" })).toContain("web 1, API 0");
    expect(apiCompatibilityIssue({ service: "open-tabletop-api", apiCompatibility: "1" })).toBeUndefined();
    expect(apiBuildFingerprintIssue({ buildFingerprint: "sha256:old" }, "sha256:current")).toContain("another checkout");
    expect(apiBuildFingerprintIssue({ buildFingerprint: "sha256:current" }, "sha256:current")).toBeUndefined();
  });

  it("fails browser bootstrap before it can use a retained API", async () => {
    const staleFetch = async () => Response.json({ ok: true, version: "0.3.0", service: "open-tabletop-api" });
    await expect(assertApiCompatibility(staleFetch)).rejects.toEqual(expect.objectContaining({
      name: "ApiCompatibilityError",
      message: expect.stringContaining("API missing")
    } satisfies Partial<ApiCompatibilityError>));

    const expectedBuildFingerprint = import.meta.env.VITE_EXPECTED_API_BUILD_FINGERPRINT;
    expect(expectedBuildFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    const otherCheckoutFetch = async () => Response.json({
      ok: true,
      version: "0.3.0",
      service: "open-tabletop-api",
      apiCompatibility: "1",
      buildFingerprint: "sha256:another-checkout"
    });
    await expect(assertApiCompatibility(otherCheckoutFetch)).rejects.toThrow("source fingerprint mismatch");

    const currentCheckoutFetch = async () => Response.json({
      ok: true,
      version: "0.3.0",
      service: "open-tabletop-api",
      apiCompatibility: "1",
      buildFingerprint: expectedBuildFingerprint
    });
    await expect(assertApiCompatibility(currentCheckoutFetch)).resolves.toBeUndefined();
  });

  it("preserves the dev proxy guard detail instead of misreporting a missing service identity", async () => {
    const guardedFetch = async () => Response.json({
      error: "api_compatibility_check_failed",
      message: "API source fingerprint changed; restart or rebuild the API."
    }, { status: 502 });

    await expect(assertApiCompatibility(guardedFetch)).rejects.toThrow(
      "API source fingerprint changed; restart or rebuild the API."
    );
  });
});

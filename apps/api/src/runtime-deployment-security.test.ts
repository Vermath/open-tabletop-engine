import { describe, expect, it } from "vitest";
import { insecureLocalS3EndpointAllowed } from "./runtime.js";

describe("runtime deployment security", () => {
  it("permits explicit local Compose MinIO HTTP without weakening remote S3 TLS", () => {
    const optedIn = { OTTE_S3_ALLOW_INSECURE_LOCAL_ENDPOINT: "true" };
    expect(insecureLocalS3EndpointAllowed("http://minio:9000", optedIn)).toBe(true);
    expect(insecureLocalS3EndpointAllowed("http://127.0.0.1:9000", optedIn)).toBe(true);
    expect(insecureLocalS3EndpointAllowed("http://10.0.0.8:9000", optedIn)).toBe(false);
    expect(insecureLocalS3EndpointAllowed("http://minio.example.test:9000", optedIn)).toBe(false);
    expect(insecureLocalS3EndpointAllowed("http://user:secret@minio:9000", optedIn)).toBe(false);
    expect(insecureLocalS3EndpointAllowed("http://minio:9000", {})).toBe(false);
  });
});
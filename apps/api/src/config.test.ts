import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("defaults to the dev namespace in development", () => {
    const config = loadConfig({});
    expect(config.NODE_ENV).toBe("development");
    expect(config.FIRESTORE_NAMESPACE).toBe("dev");
  });

  it.each(["development", "test"])("refuses the prod namespace when NODE_ENV=%s", (nodeEnv) => {
    expect(() => loadConfig({ NODE_ENV: nodeEnv, FIRESTORE_NAMESPACE: "prod" })).toThrow(
      /FIRESTORE_NAMESPACE=prod requires NODE_ENV=production/,
    );
  });

  it("allows exactly one CORS origin, the Vite dev server by default (D27)", () => {
    expect(loadConfig({}).CORS_ORIGIN).toBe("http://localhost:5173");
    expect(loadConfig({ CORS_ORIGIN: "https://apply.example.com" }).CORS_ORIGIN).toBe(
      "https://apply.example.com",
    );
    expect(() => loadConfig({ CORS_ORIGIN: "*" })).toThrow();
  });

  it("allows the prod namespace in production", () => {
    expect(
      loadConfig({ NODE_ENV: "production", FIRESTORE_NAMESPACE: "prod" }).FIRESTORE_NAMESPACE,
    ).toBe("prod");
  });

  it.each(["a/b", "ns/../prod", "has space", "__dunder__"])(
    "rejects %j as a namespace (it must be one safe path segment)",
    (namespace) => {
      expect(() => loadConfig({ FIRESTORE_NAMESPACE: namespace })).toThrow();
    },
  );

  it("passes the credential variables through for loadCredential", () => {
    const config = loadConfig({
      FIREBASE_SERVICE_ACCOUNT_JSON: "{}",
      GOOGLE_APPLICATION_CREDENTIALS: "/keys/sa.json",
    });
    expect(config.FIREBASE_SERVICE_ACCOUNT_JSON).toBe("{}");
    expect(config.GOOGLE_APPLICATION_CREDENTIALS).toBe("/keys/sa.json");
  });

  it("treats empty credential variables as unset", () => {
    const config = loadConfig({
      FIREBASE_SERVICE_ACCOUNT_JSON: "",
      GOOGLE_APPLICATION_CREDENTIALS: "",
    });
    expect(config.FIREBASE_SERVICE_ACCOUNT_JSON).toBeUndefined();
    expect(config.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
  });

  it("defaults to the Firestore repository", () => {
    expect(loadConfig({}).REPO).toBe("firestore");
  });

  it("accepts REPO=memory outside production", () => {
    expect(loadConfig({ REPO: "memory" }).REPO).toBe("memory");
  });

  it("refuses REPO=memory in production (it would lose every run on restart)", () => {
    expect(() => loadConfig({ NODE_ENV: "production", REPO: "memory" })).toThrow(
      /REPO=memory is not allowed with NODE_ENV=production/,
    );
  });

  it("rejects an unknown REPO value", () => {
    expect(() => loadConfig({ REPO: "postgres" })).toThrow();
  });

  it.each([undefined, ""])(
    "leaves the salary floor unset (salary hard block inactive) when SALARY_FLOOR_LPA=%j",
    (value) => {
      expect(loadConfig({ SALARY_FLOOR_LPA: value }).SALARY_FLOOR_LPA).toBeUndefined();
    },
  );

  it("reads the salary floor in lakhs per annum", () => {
    expect(loadConfig({ SALARY_FLOOR_LPA: "45" }).SALARY_FLOOR_LPA).toBe(45);
    expect(loadConfig({ SALARY_FLOOR_LPA: "37.5" }).SALARY_FLOOR_LPA).toBe(37.5);
  });

  it.each(["abc", "0", "-5"])("fails fast on an invalid SALARY_FLOOR_LPA=%j", (value) => {
    expect(() => loadConfig({ SALARY_FLOOR_LPA: value })).toThrow();
  });
});

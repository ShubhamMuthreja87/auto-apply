import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONFIG_KEYS, loadConfig } from "./config.js";
import { TEST_AUTH_ENV } from "./auth/test-auth.js";

describe(".env.example", () => {
  const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");

  it("documents every variable the server reads, set or commented out", () => {
    // `KEY=` or `# KEY=` at the start of a line.
    const documented = new Set(
      [...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]),
    );
    expect(CONFIG_KEYS.filter((key) => !documented.has(key))).toEqual([]);
  });

  it("covers the core, Firebase, CORS, auth and AI variables", () => {
    expect(CONFIG_KEYS).toEqual(
      expect.arrayContaining([
        "NODE_ENV",
        "PORT",
        "FIRESTORE_NAMESPACE",
        "GOOGLE_APPLICATION_CREDENTIALS",
        "FIREBASE_SERVICE_ACCOUNT_JSON",
        "CORS_ORIGIN",
        "AUTH_USERNAME",
        "AUTH_PASSWORD_HASH",
        "JWT_SECRET",
        "AI_PROVIDER",
        "AI_BASE_URL",
        "AI_MODEL",
        "AI_API_KEY",
      ]),
    );
  });

  it("holds no secret values", () => {
    for (const key of ["AUTH_PASSWORD_HASH", "JWT_SECRET", "AI_API_KEY"]) {
      expect(example).not.toMatch(new RegExp(`^${key}=\\S`, "m"));
    }
  });
});

describe("loadConfig", () => {
  it("defaults to the dev namespace in development", () => {
    const config = loadConfig({ ...TEST_AUTH_ENV });
    expect(config.NODE_ENV).toBe("development");
    expect(config.FIRESTORE_NAMESPACE).toBe("dev");
  });

  it.each(["development", "test"])("refuses the prod namespace when NODE_ENV=%s", (nodeEnv) => {
    expect(() =>
      loadConfig({ ...TEST_AUTH_ENV, NODE_ENV: nodeEnv, FIRESTORE_NAMESPACE: "prod" }),
    ).toThrow(/FIRESTORE_NAMESPACE=prod requires NODE_ENV=production/);
  });

  it("allows exactly one CORS origin, the Vite dev server by default (D27)", () => {
    expect(loadConfig({ ...TEST_AUTH_ENV }).CORS_ORIGIN).toBe("http://localhost:5173");
    expect(
      loadConfig({ ...TEST_AUTH_ENV, CORS_ORIGIN: "https://apply.example.com" }).CORS_ORIGIN,
    ).toBe("https://apply.example.com");
    expect(() => loadConfig({ ...TEST_AUTH_ENV, CORS_ORIGIN: "*" })).toThrow();
  });

  it("requires an explicit CORS_ORIGIN in production instead of defaulting to localhost (D27)", () => {
    for (const value of [undefined, ""]) {
      expect(() =>
        loadConfig({ ...TEST_AUTH_ENV, NODE_ENV: "production", CORS_ORIGIN: value }),
      ).toThrow(/CORS_ORIGIN must be set explicitly when NODE_ENV=production/);
    }
    expect(
      loadConfig({
        ...TEST_AUTH_ENV,
        NODE_ENV: "production",
        CORS_ORIGIN: "https://apply.example.com",
      }).CORS_ORIGIN,
    ).toBe("https://apply.example.com");
  });

  it.each(["development", "test"])(
    "keeps the Vite dev origin default when NODE_ENV=%s",
    (nodeEnv) => {
      expect(loadConfig({ ...TEST_AUTH_ENV, NODE_ENV: nodeEnv }).CORS_ORIGIN).toBe(
        "http://localhost:5173",
      );
    },
  );

  it("allows the prod namespace in production", () => {
    expect(
      loadConfig({
        ...TEST_AUTH_ENV,
        NODE_ENV: "production",
        FIRESTORE_NAMESPACE: "prod",
        CORS_ORIGIN: "https://apply.example.com",
      }).FIRESTORE_NAMESPACE,
    ).toBe("prod");
  });

  it.each(["a/b", "ns/../prod", "has space", "__dunder__"])(
    "rejects %j as a namespace (it must be one safe path segment)",
    (namespace) => {
      expect(() => loadConfig({ ...TEST_AUTH_ENV, FIRESTORE_NAMESPACE: namespace })).toThrow();
    },
  );

  it("reads live job boards by default and offers a fixtures-only job source", () => {
    expect(loadConfig({ ...TEST_AUTH_ENV }).JOB_SOURCE).toBe("live");
    expect(loadConfig({ ...TEST_AUTH_ENV, JOB_SOURCE: "fixtures" }).JOB_SOURCE).toBe("fixtures");
    expect(() => loadConfig({ ...TEST_AUTH_ENV, JOB_SOURCE: "scrape" })).toThrow();
  });

  it("passes the credential variables through for loadCredential", () => {
    const config = loadConfig({
      ...TEST_AUTH_ENV,
      FIREBASE_SERVICE_ACCOUNT_JSON: "{}",
      GOOGLE_APPLICATION_CREDENTIALS: "/keys/sa.json",
    });
    expect(config.FIREBASE_SERVICE_ACCOUNT_JSON).toBe("{}");
    expect(config.GOOGLE_APPLICATION_CREDENTIALS).toBe("/keys/sa.json");
  });

  it("treats empty credential variables as unset", () => {
    const config = loadConfig({
      ...TEST_AUTH_ENV,
      FIREBASE_SERVICE_ACCOUNT_JSON: "",
      GOOGLE_APPLICATION_CREDENTIALS: "",
    });
    expect(config.FIREBASE_SERVICE_ACCOUNT_JSON).toBeUndefined();
    expect(config.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
  });

  it("defaults to the Firestore repository", () => {
    expect(loadConfig({ ...TEST_AUTH_ENV }).REPO).toBe("firestore");
  });

  it("accepts REPO=memory outside production", () => {
    expect(loadConfig({ ...TEST_AUTH_ENV, REPO: "memory" }).REPO).toBe("memory");
  });

  it("refuses REPO=memory in production (it would lose every run on restart)", () => {
    expect(() =>
      loadConfig({
        ...TEST_AUTH_ENV,
        NODE_ENV: "production",
        REPO: "memory",
        CORS_ORIGIN: "https://apply.example.com",
      }),
    ).toThrow(/REPO=memory is not allowed with NODE_ENV=production/);
  });

  it("rejects an unknown REPO value", () => {
    expect(() => loadConfig({ ...TEST_AUTH_ENV, REPO: "postgres" })).toThrow();
  });

  it.each([undefined, ""])(
    "leaves the salary floor unset (salary hard block inactive) when SALARY_FLOOR_LPA=%j",
    (value) => {
      expect(
        loadConfig({ ...TEST_AUTH_ENV, SALARY_FLOOR_LPA: value }).SALARY_FLOOR_LPA,
      ).toBeUndefined();
    },
  );

  it("reads the salary floor in lakhs per annum", () => {
    expect(loadConfig({ ...TEST_AUTH_ENV, SALARY_FLOOR_LPA: "45" }).SALARY_FLOOR_LPA).toBe(45);
    expect(loadConfig({ ...TEST_AUTH_ENV, SALARY_FLOOR_LPA: "37.5" }).SALARY_FLOOR_LPA).toBe(37.5);
  });

  it.each(["abc", "0", "-5"])("fails fast on an invalid SALARY_FLOOR_LPA=%j", (value) => {
    expect(() => loadConfig({ ...TEST_AUTH_ENV, SALARY_FLOOR_LPA: value })).toThrow();
  });

  it("reads the auth vars (D26)", () => {
    const config = loadConfig({ ...TEST_AUTH_ENV });
    expect(config.AUTH_USERNAME).toBe(TEST_AUTH_ENV.AUTH_USERNAME);
    expect(config.AUTH_PASSWORD_HASH).toBe(TEST_AUTH_ENV.AUTH_PASSWORD_HASH);
    expect(config.JWT_SECRET).toBe(TEST_AUTH_ENV.JWT_SECRET);
  });

  it.each(["AUTH_USERNAME", "AUTH_PASSWORD_HASH", "JWT_SECRET"] as const)(
    "fails fast when %s is missing or blank",
    (key) => {
      expect(() => loadConfig({ ...TEST_AUTH_ENV, [key]: undefined })).toThrow(key);
      expect(() => loadConfig({ ...TEST_AUTH_ENV, [key]: "" })).toThrow(key);
    },
  );

  it.each([
    ["a plain password", "hunter2"],
    ["a bcrypt hash below cost 12", "$2b$10$" + "a".repeat(53)],
    ["a truncated hash", "$2b$12$" + "a".repeat(20)],
  ])("rejects AUTH_PASSWORD_HASH that is %s", (_case, hash) => {
    expect(() => loadConfig({ ...TEST_AUTH_ENV, AUTH_PASSWORD_HASH: hash })).toThrow(
      /AUTH_PASSWORD_HASH/,
    );
  });

  it("rejects a JWT_SECRET shorter than 32 characters", () => {
    expect(() => loadConfig({ ...TEST_AUTH_ENV, JWT_SECRET: "short" })).toThrow(/JWT_SECRET/);
  });
});

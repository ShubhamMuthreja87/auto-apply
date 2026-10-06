import { describe, expect, it } from "vitest";
import { recordedFetch } from "../discovery/recorded-fetch.js";
import type { FormField, FormSchema } from "../pipeline/ports.js";
import { greenhouseForms, greenhouseFormUrl } from "./greenhouse-forms.js";

const stripe = { board: "stripe", jobId: "8113337" };
const anthropic = { board: "anthropic", jobId: "5418402008" };

function live(options: { failing?: string[] } = {}) {
  const fake = recordedFetch(options);
  return { forms: greenhouseForms({ fetch: fake.fetch, timeoutMs: 1_000, mode: "live" }), fake };
}

function byId(schema: FormSchema): Map<string, FormField> {
  return new Map(schema.fields.map((f) => [f.id, f]));
}

describe("Greenhouse forms adapter (recorded real forms)", () => {
  it("reads the form with one GET to the questions endpoint", async () => {
    const { forms, fake } = live();

    const schema = await forms.fetchSchema(stripe);

    expect(schema.source).toBe("live");
    expect(fake.calls).toEqual([{ url: greenhouseFormUrl("stripe", "8113337"), method: "GET" }]);
  });

  it("merges Stripe's School and Degree from outside `questions` as required fields (D5)", async () => {
    const { forms } = live();

    const fields = byId(await forms.fetchSchema(stripe));

    expect(fields.get("education.school")).toMatchObject({
      label: "School",
      required: true,
      group: "education",
    });
    expect(fields.get("education.degree")).toMatchObject({ label: "Degree", required: true });
    expect(fields.get("education.discipline")).toMatchObject({ required: false });
  });

  it("merges location questions, keeping the Location field and dropping the hidden coordinates", async () => {
    const { forms } = live();

    const fields = byId(await forms.fetchSchema(stripe));

    expect(fields.get("location")).toMatchObject({
      type: "text",
      required: true,
      group: "location",
    });
    expect(fields.has("latitude")).toBe(false);
    expect(fields.has("longitude")).toBe(false);
  });

  it("merges the compliance (EEOC) questions into their own group", async () => {
    const { forms } = live();

    const fields = byId(await forms.fetchSchema(stripe));

    for (const id of ["veteran_status", "race", "gender"]) {
      expect(fields.get(id)?.group).toBe("compliance");
    }
  });

  it("normalises field types and keeps select options with their payload values", async () => {
    const { forms } = live();

    const fields = byId(await forms.fetchSchema(stripe));

    expect(fields.get("first_name")).toMatchObject({ type: "text", required: true });
    expect(fields.get("resume")).toMatchObject({ type: "file", required: false });
    expect(fields.get("question_68474656[]")?.type).toBe("multiselect");
    const sponsor = fields.get("question_68474658");
    expect(sponsor?.type).toBe("select");
    expect(sponsor?.options).toContainEqual({ label: "No", value: 747544206 });
  });

  it("keeps Anthropic's AI-policy acknowledgement and arbitration agreement with their text", async () => {
    const { forms } = live();

    const schema = await forms.fetchSchema(anthropic);
    const fields = byId(schema);

    expect(fields.get("question_18610019008")).toMatchObject({
      label: "AI Policy for Application",
      required: true,
      type: "select",
    });
    expect(fields.get("question_18610029008")).toMatchObject({
      label: "Agreement to Arbitrate",
      required: true,
    });
    expect(fields.get("question_18610020008")?.description).toContain("Why do you want to work");
    // No education section on this form.
    expect(schema.fields.some((f) => f.group === "education")).toBe(false);
  });

  it("uses the hosted URL when it is on Greenhouse, else the embed URL (D5)", async () => {
    const { forms } = live();

    expect((await forms.fetchSchema(anthropic)).formUrl).toBe(
      "https://job-boards.greenhouse.io/anthropic/jobs/5418402008",
    );
    // Stripe's hosted URL redirects to stripe.com.
    expect((await forms.fetchSchema(stripe)).formUrl).toBe(
      "https://boards.greenhouse.io/embed/job_app?for=stripe&token=8113337",
    );
  });

  it("falls back to the recorded form, labelled, when the live GET fails (D3)", async () => {
    const { forms } = live({ failing: ["stripe"] });

    const schema = await forms.fetchSchema(stripe);

    expect(schema.source).toBe("fallback");
    expect(byId(schema).has("education.school")).toBe(true);
  });

  it("throws when the live GET fails and no form is recorded", async () => {
    const { forms } = live({ failing: ["acme"] });

    await expect(forms.fetchSchema({ board: "acme", jobId: "1" })).rejects.toThrow(
      /application form/i,
    );
  });

  it("falls back when the live call times out", async () => {
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as typeof fetch;
    const forms = greenhouseForms({ fetch: hanging, timeoutMs: 5, mode: "live" });

    expect((await forms.fetchSchema(stripe)).source).toBe("fallback");
  });

  it("reads only the recordings in fixtures mode, without any network", async () => {
    const fake = recordedFetch();
    const forms = greenhouseForms({ fetch: fake.fetch, timeoutMs: 1_000, mode: "fixtures" });

    const schema = await forms.fetchSchema(anthropic);

    expect(schema.source).toBe("fixture");
    expect(fake.calls).toEqual([]);
  });
});

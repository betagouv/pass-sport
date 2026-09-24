import { describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import { createCheckpointRunner } from "../../src/eligibility/checkpoint";
import type { HistoryRecorder } from "../../src/db/history";
import type { ApiParticulierRateGate, RateSlot } from "../../src/eligibility/rate-gate";
import type { EligibilityCheckpoint, ResourceResult } from "../../src/eligibility/types";

type CheckpointedJob = { checkpoint?: EligibilityCheckpoint };

const QF_RESOURCE = "dss.quotient_familial_identite";

const qfRow = (valeur: number, checkpointKey: string): ResourceResult => ({
  resource: QF_RESOURCE,
  label: "Quotient familial",
  httpStatus: 200,
  success: true,
  data: { allocataires: [], enfants: [], quotient_familial: { valeur } },
  checkpointKey,
});

const openGate = (): ApiParticulierRateGate & { take: ReturnType<typeof vi.fn> } => ({
  take: vi.fn(
    async (): Promise<RateSlot> => ({
      allowed: true,
      perSecond: 20,
      perMinute: 300,
      isNight: false,
    }),
  ),
});

// Stands in for the BullMQ job: the runner only reads `id`, the attempt counters,
// `data.checkpoint` and `updateData`.
const runner = (checkpoint?: EligibilityCheckpoint) => {
  const job = {
    id: "job-1",
    attemptsMade: 0,
    opts: { attempts: 4 },
    data: { checkpoint } as CheckpointedJob,
    updateData: vi.fn(async (next: CheckpointedJob) => {
      job.data = next;
    }),
  } as unknown as Job<CheckpointedJob>;

  const history: HistoryRecorder = { record: vi.fn(async () => {}) };
  const rateGate = openGate();

  return { ...createCheckpointRunner(job, { rateLimit: async () => {} }, history, rateGate), rateGate };
};

describe("createCheckpointRunner", () => {
  // Every swept quotient month shares one `resource` and carries no childIndex, so the key is the
  // only thing that tells two of them apart. Replaying the wrong one silently rewrites the
  // household's quotient.
  it("replays each key with its own row, even when rows share a resource", async () => {
    const resumed: EligibilityCheckpoint = {
      results: [qfRow(900, "qf:8"), qfRow(650, "qf:9")],
    };

    const { run, rateGate } = runner(resumed);
    const invoke = vi.fn();

    const aout = await run({ key: "qf:8", resource: QF_RESOURCE, subject: "self", invoke });
    const septembre = await run({ key: "qf:9", resource: QF_RESOURCE, subject: "self", invoke });

    expect(invoke).not.toHaveBeenCalled();
    // A replayed row makes no API call, so it must spend no quota.
    expect(rateGate.take).not.toHaveBeenCalled();
    expect((aout?.data as { quotient_familial: { valeur: number } }).quotient_familial.valeur).toBe(
      900,
    );
    expect(
      (septembre?.data as { quotient_familial: { valeur: number } }).quotient_familial.valeur,
    ).toBe(650);
  });

  it("calls a key the checkpoint has never seen", async () => {
    const { run, rateGate } = runner({ results: [qfRow(900, "qf:8")] });
    const invoke = vi.fn(async () => qfRow(1000, "ignored"));

    await run({ key: "qf:9", resource: QF_RESOURCE, subject: "self", invoke });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(rateGate.take).toHaveBeenCalledTimes(1);
  });

  // What makes the replay above possible at all: the key is stamped by the runner from the call
  // it is serving, never taken from whatever the client happened to return.
  it("stamps the calling key onto the row it commits", async () => {
    const { run, results } = runner();

    await run({
      key: "qf:9",
      resource: QF_RESOURCE,
      subject: "self",
      invoke: async () => qfRow(650, "a key the client made up"),
    });

    expect(results.map((r) => r.checkpointKey)).toEqual(["qf:9"]);
  });
});

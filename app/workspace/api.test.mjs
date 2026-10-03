import assert from "node:assert/strict";
import test from "node:test";
import { apiError, assertCalibration, proposalDraft, stepFor } from "./api.ts";

const snapshot = () => ({ job_id: "test-job", criteria: [{ id: "c1", type: "MUST_HAVE", text: "相关经验", weight: 3 }], evaluations: [], workflow: { next_nodes: ["spec_confirmation"], waiting_for: "spec_confirmation" }, change_proposal: null });

test("checkpoint controls initial confirmation and feedback approval views", () => {
  const job = snapshot();
  assertCalibration(job);
  assert.equal(stepFor(job), "spec");
  job.workflow.waiting_for = "human_approval";
  assert.equal(stepFor(job), "evaluation");
});
test("reject old backend contracts instead of silently starting local simulation", () => {
  assert.throws(() => assertCalibration({ job_id: "old", criteria: [], evaluations: [] }), /重启/);
});
test("proposal editor includes additions/removals and reserves original IDs", () => {
  const job = snapshot();
  job.change_proposal = { remove: ["c1"], add: [{ text: "新标准", type: "NICE_TO_HAVE" }] };
  assert.deepEqual(proposalDraft(job), [{ id: "c2", type: "NICE_TO_HAVE", text: "新标准", weight: 2 }]);
  assert.equal(job.criteria[0].text, "相关经验");
});
test("FastAPI validation and conflict details stay readable", () => {
  assert.equal(apiError({ code: "JOB_BUSY", message: "正在处理中" }, 409), "正在处理中");
  assert.match(apiError([{ loc: ["body", "criteria", 0, "text"], msg: "不能为空" }], 422), /不能为空/);
});

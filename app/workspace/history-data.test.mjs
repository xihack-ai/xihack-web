import test from "node:test";
import assert from "node:assert/strict";
import { parseHistory, historySnapshots, diffCriteria } from "./history-data.ts";
const criterion = { id:"c1", type:"NICE_TO_HAVE", text:"带队经验", weight:2 };
test("PostgreSQL HistoryOut object restores snapshots across sessions",()=>{
 const body={spec_versions:[{version:1,criteria:[criterion]},{version:2,criteria:[{...criterion,type:"MUST_HAVE"}]}],feedback:[{id:"f1",text:"必须带队"}],proposals:[],audit:[{event_type:"PROPOSAL_DECIDED"}]};
 assert.equal(historySnapshots(body)[1][0].type,"NICE_TO_HAVE");
 assert.equal(historySnapshots(body)[2][0].type,"MUST_HAVE");
 assert.equal(parseHistory(body).feedback[0].id,"f1");
 assert.equal(parseHistory(body).audit.length,1);
});
test("invalid snapshots are not invented and missing history stays empty",()=>{
 assert.deepEqual(historySnapshots({spec_versions:[{version:3,criteria:[{id:"broken"}]}]}),{});
 assert.deepEqual(parseHistory(null),{spec_versions:[],feedback:[],proposals:[],audit:[]});
});
test("version comparison includes weight-only edits and does not mutate input",()=>{
 const before=[criterion], after=[{...criterion,weight:3},{...criterion,id:"c2"}];
 assert.deepEqual(diffCriteria(before,after).map(r=>r.kind),["mod","add"]);
 assert.equal(before[0].weight,2);
 assert.equal(diffCriteria(after,[]).length,2);
});

import { access, readFile } from "node:fs/promises";
const required=["README.md","AGENTS.md","SECURITY.md","CONTRIBUTING.md","LICENSE","ROADMAP.md","docs/progress/STATUS.md","docs/provenance/PERSONAMONKEY_BASELINE.md","docs/architecture/00-principles.md","docs/architecture/01-system-architecture.md","docs/adr/ADR-001-personamonkey-derivative.md","docs/implementation/v1/README.md","docs/implementation/v1/plan.json","docs/implementation/v1/policies.json","docs/implementation/v1/requirements.json","docs/implementation/v1/acceptance.json","docs/implementation/v1/claims/CLAIM.schema.json","tools/generate-views.mjs","tools/verify-claims.mjs","tools/verify-repo.mjs",".github/workflows/verify.yml","operator-inputs/README.md"];
const errors=[]; for(const path of required){try{await access(path);}catch{errors.push("missing "+path);}}
const plan=JSON.parse(await readFile("docs/implementation/v1/plan.json","utf8"));
const acceptance=JSON.parse(await readFile("docs/implementation/v1/acceptance.json","utf8"));
const ids=new Set(); for(const p of plan.phases){if(ids.has(p.id))errors.push("duplicate phase "+p.id);ids.add(p.id);}
for(const p of plan.phases){
 for(const d of p.dependsOn) if(!ids.has(d)) errors.push(p.id+": unknown dependency "+d);
 if(["READY","CLAIMED","IN_PROGRESS","PR_OPEN","MERGED","ACCEPTED"].includes(p.status)) for(const d of p.dependsOn){const dep=plan.phases.find(x=>x.id===d);if(dep?.status!=="ACCEPTED")errors.push(p.id+": active/accepted while dependency "+d+" is "+dep?.status);}
}
const gateIds=new Set(acceptance.gates.map(g=>g.id)); for(const p of plan.phases) for(const a of p.acceptanceIds) if(!gateIds.has(a)) errors.push(p.id+": missing acceptance gate "+a);
if(plan.executionModel.finalLivePhases.join(",")!=="P025,P026") errors.push("final live phases must be exactly P025,P026");
const provenance=await readFile("docs/provenance/PERSONAMONKEY_BASELINE.md","utf8"); if(!provenance.includes("9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf")) errors.push("missing frozen PersonaMonkey provenance SHA");
if(errors.length){for(const e of errors)console.error("ERROR:",e);process.exit(1);}
console.log("Repository authority verified: "+plan.phases.length+" phases, "+acceptance.gates.length+" acceptance gates.");

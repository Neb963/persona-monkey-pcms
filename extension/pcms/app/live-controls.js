import { sha256Hex } from "../providers/perchance/contract.js";

function value(form,name){return String(new FormData(form).get(name)||"").trim();}
function setStatus(documentRef,message,state=""){
  const node=documentRef.getElementById("liveActionStatus");
  if(!node)return;
  node.textContent=message;
  node.dataset.state=state;
}
function errorMessage(error){return error?.code?error.code+": "+error.message:(error?.message||String(error));}

function personaOptionLabel(persona){return persona.name+" · "+persona.cookieStoreId;}

export function bindPcmsLiveControls({runtime,documentRef=globalThis.document,refresh=async()=>{}}={}){
  if(!runtime||!documentRef) throw new TypeError("Live controls require runtime and document");
  const cleanups=[];

  function on(target,event,handler){
    target?.addEventListener(event,handler);
    if(target)cleanups.push(()=>target.removeEventListener(event,handler));
  }
  function form(id,run){
    const node=documentRef.getElementById(id);
    on(node,"submit",async(event)=>{
      event.preventDefault();
      const submit=node?.querySelector?.('button[type="submit"]');
      if(submit)submit.disabled=true;
      node?.setAttribute?.("aria-busy","true");
      setStatus(documentRef,"Working…");
      try{
        const result=await run(node,event);
        setStatus(documentRef,result||"Operation completed.","connected");
        await refresh();
      }catch(error){
        console.error(error);
        setStatus(documentRef,errorMessage(error),"error");
      }finally{
        node?.removeAttribute?.("aria-busy");
        if(submit)submit.disabled=false;
      }
    });
  }

  function renderPersonaSelect(select,personas){
    if(!select)return;
    const previous=select.value;
    select.textContent="";
    const prompt=documentRef.createElement("option");
    prompt.value="";
    prompt.textContent=personas.length?"Choose a managed Persona":"No managed Personas available";
    select.appendChild(prompt);
    for(const persona of personas){
      const option=documentRef.createElement("option");
      option.value=persona.personaUid;
      option.textContent=personaOptionLabel(persona);
      select.appendChild(option);
    }
    if(personas.some((persona)=>persona.personaUid===previous))select.value=previous;
  }

  async function loadPersonaOptions(){
    if(!runtime.personaDirectory||typeof runtime.personaDirectory.list!=="function")throw new Error("Managed Persona directory is unavailable");
    const personas=await runtime.personaDirectory.list();
    renderPersonaSelect(documentRef.getElementById("accountCreatePersonaUid"),personas);
    renderPersonaSelect(documentRef.getElementById("accountRebindPersonaUid"),personas);
    return personas;
  }

  void loadPersonaOptions().catch((error)=>setStatus(documentRef,errorMessage(error),"error"));

  form("accountCreateForm",async(node)=>{
    const listed=await runtime.accounts.listAccounts();
    const result=await runtime.accounts.createAccount({
      accountId:value(node,"accountId"),
      displayName:value(node,"displayName"),
      personaUid:value(node,"personaUid")
    },{expectedRevision:listed.revision});
    return "Account bound: "+result.account.accountId;
  });

  form("accountRebindForm",async(node)=>{
    const accountId=value(node,"accountId");
    const current=await runtime.accounts.getAccount(accountId);
    if(!current)throw new Error("Account not found");
    const listed=await runtime.accounts.listAccounts();
    const result=await runtime.accounts.rebindPersona(accountId,{
      expectedRevision:listed.revision,
      expectedPersonaUid:current.personaUid,
      newPersonaUid:value(node,"personaUid")
    });
    return "Account rebound to "+result.account.personaUid;
  });

  form("explorerLiveForm",async(node)=>{
    const accountId=value(node,"accountId");
    const generatorId=value(node,"generatorId");
    const listed=await runtime.explorer.listCandidates();
    let result=await runtime.explorer.recordDiscovery({
      accountId,
      discoveryId:value(node,"discoveryId"),
      candidates:[{generatorId,observedSourceHash:value(node,"sourceHash")}]
    },{expectedRevision:listed.revision});
    const claimId=value(node,"claimId");
    const deploymentId=value(node,"deploymentId");
    if(claimId&&deploymentId){
      const candidate=result.candidates.find((item)=>item.accountId===accountId&&item.generatorId===generatorId);
      if(!candidate)throw new Error("Explorer candidate was not created");
      result=await runtime.explorer.claimCandidate(candidate.candidateId,{claimId,deploymentId},{expectedRevision:result.revision});
      return "Explorer reservation ready: "+result.reservation.deploymentId;
    }
    return "Explorer discovery recorded.";
  });

  form("deployerLiveForm",async(node)=>{
    const deploymentId=value(node,"deploymentId");
    const accountId=value(node,"accountId");
    const generatorId=value(node,"generatorId");
    const source=String(new FormData(node).get("source")||"");
    const sourceHash=await sha256Hex(source);
    const listed=await runtime.deployer.listDeployments();
    let deployment=await runtime.deployer.getDeployment(deploymentId);
    let revision=listed.revision;

    if(!deployment){
      const created=await runtime.deployer.createDeployment({deploymentId,accountId,generatorId,sourceHash},{expectedRevision:revision});
      deployment=created.deployment;
      revision=created.revision;
    }else{
      if(deployment.accountId!==accountId||deployment.targetRef?.id!==generatorId) {
        throw new Error("Deployment identity does not match the existing durable target.");
      }

      if(["ACTIVE","RECONCILE"].includes(deployment.operation.status)){
        const reconciled=await runtime.deployer.reconcileDeployment(deploymentId,{expectedRevision:revision});
        deployment=reconciled.deployment;
        revision=reconciled.revision;
        if(["ACTIVE","RECONCILE"].includes(deployment.operation.status)){
          throw new Error("Deployment outcome remains uncertain; PCMS will not replay it.");
        }
      }

      if(deployment.operation.status==="RETRYABLE"&&deployment.desired.sourceHash!==sourceHash){
        throw new Error("Retryable deployment must prove the existing intent first; desired source cannot change yet.");
      }

      if(deployment.operation.status==="SUCCEEDED"&&deployment.desired.sourceHash===sourceHash){
        return "Deployer: already in sync ("+sourceHash.slice(0,12)+"…).";
      }

      if(deployment.desired.sourceHash!==sourceHash){
        const desired=await runtime.deployer.setDesired(deploymentId,{
          expectedRevision:revision,
          expectedDesiredRevision:deployment.desired.revision,
          sourceHash
        });
        deployment=desired.deployment;
        revision=desired.revision;
      }else if(["FAILED","CANCELLED"].includes(deployment.operation.status)){
        const retry=await runtime.deployer.prepareRetry(deploymentId,{expectedRevision:revision});
        deployment=retry.deployment;
        revision=retry.revision;
      }
    }

    const result=await runtime.deployer.deploy(deploymentId,{expectedRevision:revision,source});
    return "Deployer: "+result.status+" ("+sourceHash.slice(0,12)+"…)";
  });

  form("refresherLiveForm",async(node)=>{
    const cohortId=value(node,"cohortId");
    const accountId=value(node,"accountId");
    const generatorId=value(node,"generatorId");
    const source=String(new FormData(node).get("source")||"");
    const sourceHash=await sha256Hex(source);
    const listed=await runtime.refresher.listCohorts();
    let cohort=listed.cohorts.find((item)=>item.cohortId===cohortId);
    let revision=listed.revision;
    let member=null;

    if(!cohort){
      const created=await runtime.refresher.createCohort({
        cohortId,
        accountId,
        enabled:true,
        policy:{
          mode:"MANUAL",
          dailyBudget:1,
          dayOffsetMinutes:0,
          activeHours:24,
          sleepDays:0,
          anchorAt:new Date().toISOString()
        },
        members:[{generatorId,sourceHash}]
      },{expectedRevision:revision});
      cohort=created.cohort;
      member=cohort.members.find((item)=>item.generatorId===generatorId);
      revision=created.revision;
    }else{
      if(cohort.accountId!==accountId) throw new Error("Cohort identity does not match the existing durable account.");
      member=cohort.members.find((item)=>item.generatorId===generatorId);
      if(!member)throw new Error("Generator is not a member of this cohort");

      if(["ACTIVE","RECONCILE"].includes(member.operation.status)){
        const reconciled=await runtime.refresher.reconcileRefresh(cohortId,generatorId,{expectedRevision:revision});
        member=reconciled.member;
        revision=reconciled.revision;
        if(["ACTIVE","RECONCILE"].includes(member.operation.status)){
          throw new Error("Refresh outcome remains uncertain; PCMS will not replay it.");
        }
      }

      if(["PENDING","RETRYABLE"].includes(member.operation.status)&&member.sourceHash!==sourceHash){
        throw new Error("Unresolved refresh intent must settle before its source can change.");
      }

      if(!["PENDING","RETRYABLE"].includes(member.operation.status)&&member.sourceHash!==sourceHash){
        const updated=await runtime.refresher.setMemberSourceHash(cohortId,generatorId,{expectedRevision:revision,sourceHash});
        member=updated.member;
        revision=updated.revision;
      }
    }

    if(!["PENDING","RETRYABLE"].includes(member.operation.status)){
      const prepared=await runtime.refresher.prepareRefresh(cohortId,generatorId,{expectedRevision:revision});
      member=prepared.member;
      revision=prepared.revision;
    }

    const result=await runtime.refresher.dispatchRefresh(cohortId,generatorId,{expectedRevision:revision,source});
    return "Refresher: "+result.status+" ("+sourceHash.slice(0,12)+"…)";
  });

  form("provisioningLiveForm",async(node)=>{
    const attemptId=value(node,"attemptId");
    let row=await runtime.provisioning.getAttempt(attemptId);
    if(!row){
      row=await runtime.provisioning.createAttempt({
        attemptId,
        accountId:value(node,"accountId"),
        displayName:value(node,"displayName"),
        personaUid:value(node,"personaUid"),
        credentialRef:value(node,"credentialRef")
      });
      return "Provisioning created; click Continue again to acquire the Persona session.";
    }
    const state=row.value.state;
    if(state==="SESSION_REQUIRED"){
      row=await runtime.provisioning.acquireSession(attemptId,{expectedRevision:row.revision});
    }else if(state==="UNCERTAIN"){
      row=await runtime.provisioning.reconcileAttempt(attemptId,{expectedRevision:row.revision});
    }else if(state==="WAITING_HUMAN"){
      row=await runtime.provisioning.advance(attemptId,{expectedRevision:row.revision});
      if(row.value.state==="WAITING_HUMAN") {
        throw new Error("Resolve the open HumanTask in Attention, then continue.");
      }
    }else if(state==="COMPLETED"||state==="CANCELLED"){
      return "Provisioning is "+state+".";
    }else{
      row=await runtime.provisioning.advance(attemptId,{expectedRevision:row.revision});
    }
    return "Provisioning state: "+row.value.state;
  });

  const attention=documentRef.getElementById("attentionList");
  on(attention,"click",async(event)=>{
    const button=event.target.closest?.("[data-resolve-task]");
    if(!button)return;
    event.preventDefault();
    setStatus(documentRef,"Resolving HumanTask…");
    try{
      const task=await runtime.humanTasks.get(button.dataset.resolveTask);
      if(!task)throw new Error("HumanTask not found");
      await runtime.humanTasks.resolve(task.value.taskId,{expectedRevision:task.revision,resolutionCode:"completed"});
      setStatus(documentRef,"HumanTask resolved.","connected");
      await refresh();
    }catch(error){
      setStatus(documentRef,errorMessage(error),"error");
    }
  });

  const recoveryStatus=documentRef.getElementById("recoveryStatus");
  async function renderRecovery(){
    if(!recoveryStatus)return;
    const hold=await runtime.recoveryHold.getStatus();
    const unresolved=await runtime.remoteOps.listUnresolved();
    recoveryStatus.textContent=hold.value.state+" · unresolved RemoteOperations: "+unresolved.length;
    recoveryStatus.dataset.state=hold.value.state==="NORMAL"?"connected":"error";
  }

  form("backupCreateForm",async(node)=>{
    const backup=await runtime.backupRestore.createBackup({backupId:value(node,"backupId")});
    documentRef.getElementById("backupPayload").value=JSON.stringify(backup,null,2);
    await renderRecovery();
    return "Backup created: "+backup.backupId;
  });

  form("restoreApplyForm",async()=>{
    const raw=JSON.parse(documentRef.getElementById("backupPayload").value);
    const staged=await runtime.backupRestore.stageRestore(raw);
    const result=await runtime.backupRestore.applyStagedRestore(staged);
    await renderRecovery();
    return "Restore applied under RECOVERY_HOLD at revision "+result.holdRevision+".";
  });

  form("recoveryReleaseForm",async()=>{
    const result=await runtime.backupRestore.reconcileAndRelease();
    await renderRecovery();
    if(!result.released)throw new Error("Recovery remains held; unresolved: "+result.unresolvedOperationIds.join(", "));
    return "Recovery checks passed and RECOVERY_HOLD released.";
  });

  renderRecovery().catch((error)=>setStatus(documentRef,errorMessage(error),"error"));
  return Object.freeze({close(){for(const cleanup of cleanups)cleanup();}});
}

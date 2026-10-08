import { installPcmsNamespace } from "../core/bootstrap.js";
import { PCMS_V2_BUILTIN_MODULE_IDS, pcmsV2Href, resolvePcmsRouteV2 } from "./router-v2.js";
import { pcmsStatusToken, presentPcmsCoreStatus, presentPcmsHumanTask, presentPcmsModule, presentPcmsReceipt } from "./primitives.js";
import { readPcmsCachedStatus, startPcmsLiveRuntime } from "./live-runtime.js";
import { startPcmsRuntimeWithRetry } from "./startup-retry.js";
import { createPcmsModuleProjectionService } from "./module-projections.js";
import { bindPcmsLiveControls } from "./live-controls.js";
import { createPcmsAccountsView } from "./views/accounts/accounts-view.js";

function element(documentRef,tag,className=null) {
  const node=documentRef.createElement(tag);
  if(className) node.className=className;
  return node;
}

function clear(node) {
  while(node.firstChild) node.removeChild(node.firstChild);
}

function appendStatusToken(documentRef,parent,token,label=null) {
  const definition=pcmsStatusToken(token);
  const badge=element(documentRef,"span","status-token");
  badge.dataset.token=token;
  badge.dataset.tone=definition.tone;
  badge.textContent=label||definition.label;
  parent.appendChild(badge);
  return badge;
}

function appendLink(documentRef,parent,{href,title,subtitle=null,badge=null}) {
  const link=element(documentRef,"a","item-link");
  link.href=href;
  const main=element(documentRef,"span","item-main");
  const strong=element(documentRef,"strong");
  strong.textContent=title;
  main.appendChild(strong);
  if(subtitle!==null) {
    const small=element(documentRef,"small");
    small.textContent=subtitle;
    main.appendChild(small);
  }
  link.appendChild(main);
  if(badge!==null) {
    const count=element(documentRef,"span","badge");
    count.textContent=String(badge);
    link.appendChild(count);
  }
  parent.appendChild(link);
  return link;
}

function appendModuleRow(documentRef,parent,title,subtitle) {
  const row=element(documentRef,"div","module-row");
  const strong=element(documentRef,"strong");
  strong.textContent=title;
  const small=element(documentRef,"small");
  small.textContent=subtitle;
  row.append(strong,small);
  parent.appendChild(row);
}

function section(documentRef,id) {
  const node=documentRef.getElementById(id);
  if(!node) throw new Error("PCMS app DOM is incomplete");
  return node;
}

function moduleStatus(documentRef,name,projection,count) {
  section(documentRef,"module"+name+"Count").textContent=String(count);
  const node=section(documentRef,"module"+name+"Status");
  if(projection.available) {
    node.textContent="Live module state connected.";
    node.dataset.state="connected";
  } else {
    node.textContent="Unavailable · "+String(projection.code||projection.error||"PCMS_MODULE_UNAVAILABLE");
    node.dataset.state="error";
  }
}

export function mountPcmsApp({
  projectionService,
  moduleProjectionService,
  runtime=null,
  documentRef=globalThis.document,
  windowRef=globalThis.window
}={}) {
  if(!projectionService || typeof projectionService.snapshot!=="function") {
    throw new TypeError("PCMS app requires a projection service");
  }
  if(!moduleProjectionService || typeof moduleProjectionService.snapshot!=="function") {
    throw new TypeError("PCMS app requires module projections");
  }
  if(!documentRef || !windowRef) throw new TypeError("PCMS app requires a document/window");

  const nav=section(documentRef,"primaryNav");
  const overview=section(documentRef,"viewOverview");
  const modules=section(documentRef,"viewModules");
  const attention=section(documentRef,"viewAttention");
  const accounts=section(documentRef,"viewAccounts");
  const search=section(documentRef,"viewSearch");
  const diagnostics=section(documentRef,"viewDiagnostics");
  const placeholder=section(documentRef,"viewPlaceholder");
  const searchForm=section(documentRef,"searchForm");
  const searchInput=section(documentRef,"searchInput");
  const notificationStatus=section(documentRef,"notificationStatus");
  let disposed=false;
  let refreshGeneration=0;
  const accountsView=runtime?.accounts && documentRef.getElementById("accountsV2")
    ?createPcmsAccountsView({runtime,documentRef,windowRef,onChanged:()=>refresh()})
    :null;

  function setVisible(route) {
    for(const [name,node] of [
      ["overview",overview],["modules",modules],["attention",attention],["accounts",accounts],
      ["search",search],["diagnostics",diagnostics],["placeholder",placeholder]
    ]) node.hidden=name!==route;
  }

  function renderNav(snapshot,currentRoute,moduleSnapshot) {
    clear(nav);
    const active=currentRoute.route==="module"
      ?"module-"+currentRoute.moduleId
      : currentRoute.route==="settings"
        ?"settings-"+currentRoute.section
        : currentRoute.route;
    const items=[
      {id:"overview",label:"Overview",href:"#/overview"},
      {id:"attention",label:"Attention",href:"#/attention",badge:snapshot.notifications.count},
      {id:"accounts",label:"Accounts",href:"#/accounts"},
      {id:"generators",label:"Generators",href:"#/generators"},
      ...PCMS_V2_BUILTIN_MODULE_IDS.map((id)=>({
        id:"module-"+id,
        label:id[0].toUpperCase()+id.slice(1),
        href:"#/m/"+id,
        badge:moduleSnapshot?.[id]?.available===false?"!":null
      })),
      {id:"activity",label:"Activity",href:"#/activity"},
      {id:"settings-modules",label:"Module settings",href:"#/settings/modules"},
      {id:"settings-diagnostics",label:"Diagnostics",href:"#/settings/diagnostics"}
    ];
    for(const item of items) {
      const link=element(documentRef,"a","nav-link");
      link.href=item.href;
      link.textContent=item.label;
      if(item.id===active) link.setAttribute("aria-current","page");
      if(item.badge!==null&&item.badge!==undefined) {
        const badge=element(documentRef,"span","nav-badge");
        badge.textContent=String(item.badge);
        link.appendChild(badge);
      }
      nav.appendChild(link);
    }
  }

  function renderOverview(snapshot,moduleSnapshot) {
    section(documentRef,"overviewAttentionCount").textContent=String(snapshot.notifications.count);
    section(documentRef,"overviewAccountCount").textContent=String(snapshot.accounts.accounts.length);
    section(documentRef,"overviewModuleCount").textContent=String(
      PCMS_V2_BUILTIN_MODULE_IDS.filter((id)=>moduleSnapshot?.[id]?.available===true).length
    );
  }

  function renderModules(snapshot) {
    const explorerList=section(documentRef,"moduleExplorerList");
    clear(explorerList);
    const explorerItems=[
      ...snapshot.explorer.candidates.map((item)=>({
        title:"Candidate · "+item.generatorId,
        subtitle:item.accountId+" · "+item.freshness+(item.claimStatus ? " · "+item.claimStatus : "")
      })),
      ...snapshot.explorer.reservations.map((item)=>({
        title:"Reservation · "+item.claimId,
        subtitle:item.accountId+" · "+item.status+(item.ready ? " · ready" : "")
      }))
    ];
    for(const item of explorerItems.slice(0,20)) appendModuleRow(documentRef,explorerList,item.title,item.subtitle);
    if(explorerItems.length===0) appendModuleRow(documentRef,explorerList,"No discovery state","Explorer is connected and has no candidates or reservations.");
    moduleStatus(documentRef,"Explorer",snapshot.explorer,explorerItems.length);

    const deployerList=section(documentRef,"moduleDeployerList");
    clear(deployerList);
    for(const item of snapshot.deployer.items?.slice(0,20)||[]) {
      appendModuleRow(documentRef,deployerList,item.generatorId||item.deploymentId,(item.accountId||"unknown")+" · "+(item.syncState||item.operationStatus||"unknown"));
    }
    if((snapshot.deployer.items?.length||0)===0) appendModuleRow(documentRef,deployerList,"No deployments","Deployer is connected and has no desired/observed targets.");
    moduleStatus(documentRef,"Deployer",snapshot.deployer,snapshot.deployer.items?.length||0);

    const refresherList=section(documentRef,"moduleRefresherList");
    clear(refresherList);
    for(const item of snapshot.refresher.items?.slice(0,20)||[]) {
      appendModuleRow(documentRef,refresherList,item.cohortId,(item.accountId||"unknown")+" · "+item.mode+" · budget "+item.budget.used+"/"+item.budget.limit);
    }
    if((snapshot.refresher.items?.length||0)===0) appendModuleRow(documentRef,refresherList,"No cohorts","Refresher is connected and has no configured cohorts.");
    moduleStatus(documentRef,"Refresher",snapshot.refresher,snapshot.refresher.items?.length||0);

    const statisticsList=section(documentRef,"moduleStatisticsList");
    clear(statisticsList);
    for(const item of snapshot.statistics.items?.slice(0,20)||[]) {
      appendModuleRow(documentRef,statisticsList,item.label,String(item.value)+" total · "+String(item.matchedEvents)+" matched events");
    }
    if((snapshot.statistics.items?.length||0)===0) appendModuleRow(documentRef,statisticsList,"No metrics","Statistics is connected but no metric projection is available.");
    moduleStatus(documentRef,"Statistics",snapshot.statistics,snapshot.statistics.items?.length||0);

    const provisioningList=section(documentRef,"moduleProvisioningList");
    clear(provisioningList);
    for(const item of snapshot.provisioning.items?.slice(0,20)||[]) {
      appendModuleRow(documentRef,provisioningList,item.attemptId,(item.accountId||"unbound")+" · "+item.state+(item.humanReason ? " · "+item.humanReason : ""));
    }
    if((snapshot.provisioning.items?.length||0)===0) appendModuleRow(documentRef,provisioningList,"No attempts","Provisioning is connected and has no active attempts.");
    moduleStatus(documentRef,"Provisioning",snapshot.provisioning,snapshot.provisioning.items?.length||0);
  }

  function renderAttention(snapshot,selectedId=null) {
    const list=section(documentRef,"attentionList");
    clear(list);
    const items=selectedId===null
      ? snapshot.notifications.items
      : snapshot.notifications.items.filter((item)=>item.taskId===selectedId);
    for(const item of items) {
      appendLink(documentRef,list,{
        href:item.href,
        title:item.title,
        subtitle:item.priority+" · "+item.taskKind
      });
      if(item.taskKind==="provider.confirm-apply"&&runtime?.providerHandoff) {
        // ADR-002 §9: the answer is submitted as reconciliation, from any tab, at any time.
        const show=element(documentRef,"button","inline-action");
        show.type="button";
        show.dataset.handoffShow=item.taskId;
        show.textContent="Show details";
        list.appendChild(show);
        for(const [outcome,label] of [["APPLIED","Applied"],["NOT_APPLIED","Not applied"],["UNKNOWN","Still unknown"]]) {
          const answer=element(documentRef,"button","inline-action");
          answer.type="button";
          answer.dataset.handoffTask=item.taskId;
          answer.dataset.handoffOutcome=outcome;
          answer.textContent=label;
          list.appendChild(answer);
        }
      } else if(runtime?.humanTasks) {
        const resolve=element(documentRef,"button","inline-action");
        resolve.type="button";
        resolve.dataset.resolveTask=item.taskId;
        resolve.textContent="Mark done";
        list.appendChild(resolve);
      }
    }
    section(documentRef,"attentionEmpty").hidden=items.length!==0;
  }

  function renderAccounts(snapshot,route) {
    if(accountsView) {
      void accountsView.render({accounts:snapshot.accounts.accounts,revision:snapshot.accounts.revision,route})
        .catch(()=>{notificationStatus.textContent="Accounts view unavailable.";notificationStatus.dataset.state="warning";});
      return;
    }
    const list=section(documentRef,"accountList");
    clear(list);
    for(const item of snapshot.accounts.accounts)appendLink(documentRef,list,{
      href:item.href,title:item.displayName,subtitle:item.providerId
    });
    section(documentRef,"accountsEmpty").hidden=snapshot.accounts.accounts.length!==0;
  }

  function renderSearch(snapshot) {
    searchInput.value=snapshot.search.query;
    const list=section(documentRef,"searchResults");
    clear(list);
    for(const result of snapshot.search.results) {
      appendLink(documentRef,list,{
        href:result.href,
        title:result.title,
        subtitle:result.kind+" · "+result.subtitle
      });
    }
    section(documentRef,"searchEmpty").hidden=snapshot.search.results.length!==0 || snapshot.search.query==="";
  }

  function renderActionTray(snapshot,receiptState) {
    const taskList=section(documentRef,"actionTrayDurableList");
    clear(taskList);
    for(const item of snapshot.notifications.items.slice(0,8)) {
      const presentation=presentPcmsHumanTask(item);
      const row=element(documentRef,"a","action-receipt");
      row.href=item.href;
      appendStatusToken(documentRef,row,presentation.token,presentation.label);
      const text=element(documentRef,"span");
      text.textContent=item.title;
      row.appendChild(text);
      taskList.appendChild(row);
    }

    const receiptList=section(documentRef,"actionTrayReceiptList");
    clear(receiptList);
    const receipts=Array.isArray(receiptState?.receipts)?receiptState.receipts.slice(0,8):[];
    for(const receipt of receipts) {
      const row=element(documentRef,"div","action-receipt");
      row.dataset.receiptId=receipt.receiptId;
      const presentation=presentPcmsReceipt(receipt);
      appendStatusToken(documentRef,row,presentation.token,presentation.label);
      const text=element(documentRef,"span");
      text.textContent=receipt.subject;
      row.appendChild(text);
      receiptList.appendChild(row);
    }
    // A direct command response is temporary feedback. Core's durable copy becomes
    // authoritative on the next revision, so never display the same ID twice.
    const localList=section(documentRef,"actionTrayLocalList");
    for(const row of [...localList.children]) {
      if(receipts.some((receipt)=>receipt.receiptId===row.dataset.receiptId)) row.remove();
    }
    if(receiptState?.unavailable) {
      const row=element(documentRef,"div","action-receipt");
      appendStatusToken(documentRef,row,"UNAVAILABLE","History unavailable");
      receiptList.appendChild(row);
    }
    section(documentRef,"actionTrayCount").textContent=snapshot.notifications.count?String(snapshot.notifications.count):"";
    section(documentRef,"actionTrayEmpty").hidden=taskList.childNodes.length!==0
      ||receiptList.childNodes.length!==0||localList.childNodes.length!==0;
  }

  function showReceipt(receipt) {
    const list=section(documentRef,"actionTrayReceiptList");
    const id=String(receipt?.receiptId||"");
    if(!id) return;
    // Avoid duplicate direct responses for a retried command.
    for(const previous of [...list.children]) if(previous.dataset.receiptId===id) previous.remove();
    const row=element(documentRef,"div","action-receipt");
    row.dataset.receiptId=id;
    const presentation=presentPcmsReceipt(receipt);
    appendStatusToken(documentRef,row,presentation.token,presentation.label);
    const text=element(documentRef,"span");
    text.textContent=String(receipt?.subject||"PCMS action");
    row.appendChild(text);
    list.prepend(row);
    while(list.childNodes.length>5) list.removeChild(list.lastChild);
    section(documentRef,"actionTrayEmpty").hidden=true;
  }

  function renderPlaceholder(route) {
    const heading=section(documentRef,"placeholderHeading");
    const body=section(documentRef,"placeholderBody");
    if(route.route==="generators") {
      heading.textContent="Generators";
      body.textContent="The canonical Generators route is available. Its domain redesign belongs to P036.";
    } else if(route.route==="activity") {
      heading.textContent="Activity";
      body.textContent="The v2 shell reserves Activity without replacing the accepted audit surface in this phase.";
    } else {
      heading.textContent="Settings · "+String(route.section||"");
      body.textContent="This Settings section is reserved by the v2 shell and remains owned by its later phase.";
    }
  }

  function routeView(route) {
    if(route.route==="overview") return "overview";
    if(route.route==="attention") return "attention";
    if(route.route==="accounts") return "accounts";
    if(route.route==="search") return "search";
    if(route.route==="module"||(route.route==="settings"&&route.section==="modules")) return "modules";
    if(route.route==="settings"&&route.section==="diagnostics") return "diagnostics";
    return "placeholder";
  }

  function updateCoreStatus(status,{live=false,pending=false}={}) {
    const presentation=presentPcmsCoreStatus(status,{live,pending});
    const pill=section(documentRef,"coreStatusPill");
    clear(pill);
    appendStatusToken(documentRef,pill,presentation.token,presentation.label);
    pill.dataset.state=presentation.state;
    section(documentRef,"diagnosticCoreState").textContent=presentation.state;
    section(documentRef,"diagnosticCoreAsOf").textContent=presentation.asOf||"—";
    section(documentRef,"coreHostStatus").textContent="Background · "+presentation.label.toLowerCase()
      +(status?.wake?" · "+String(status.wake).toLowerCase()+" wake":"");
    section(documentRef,"coreHostStatus").dataset.state=presentation.state==="UNAVAILABLE"?"error":"connected";
    return presentation;
  }

  async function refresh() {
    const generation=++refreshGeneration;
    const initial=resolvePcmsRouteV2(windowRef.location.hash);
    const parsed=initial.route;
    let snapshot,moduleSnapshot,receiptState;
    try {
      [snapshot,moduleSnapshot,receiptState]=await Promise.all([
        projectionService.snapshot({query:parsed.query}),
        moduleProjectionService.snapshot(),
        runtime?.uiReceipts?.list
          ?runtime.uiReceipts.list().then((result)=>{
            if(!Array.isArray(result?.receipts)) throw new Error("Invalid receipt projection");
            return {receipts:result.receipts,unavailable:false};
          }).catch(()=>({receipts:[],unavailable:true}))
          :Promise.resolve({receipts:[],unavailable:true})
      ]);
    } catch {
      if(disposed||generation!==refreshGeneration) return;
      notificationStatus.textContent="PCMS live projections are unavailable.";
      notificationStatus.dataset.state="error";
      setVisible("overview");
      return;
    }
    if(disposed||generation!==refreshGeneration) return;

    const resolved=resolvePcmsRouteV2(windowRef.location.hash,{
      accountIds:snapshot.accounts.accounts.map((item)=>item.accountId),
      attentionIds:snapshot.notifications.items.map((item)=>item.taskId),
      moduleIds:PCMS_V2_BUILTIN_MODULE_IDS
    });
    if(!resolved.valid) {
      notificationStatus.textContent=resolved.reason==="NOT_FOUND"
        ?"That item is no longer available."
        :"That PCMS link is invalid and was opened safely at Overview.";
      notificationStatus.dataset.state="warning";
      windowRef.history.replaceState(null,"",resolved.route.href);
    } else {
      if(resolved.canonicalized) windowRef.history.replaceState(null,"",resolved.route.href);
      const modulesReady=PCMS_V2_BUILTIN_MODULE_IDS.every((id)=>moduleSnapshot?.[id]?.available===true);
      notificationStatus.textContent=snapshot.notifications.count
        ? snapshot.notifications.count+" item"+(snapshot.notifications.count===1?"":"s")+" need attention."
        : modulesReady
          ? "PCMS is ready."
          : "PCMS is running; one or more module projections are unavailable.";
      notificationStatus.dataset.state=modulesReady?"connected":"warning";
    }
    const route=resolved.route;
    renderNav(snapshot,route,moduleSnapshot);
    renderOverview(snapshot,moduleSnapshot);
    renderModules(moduleSnapshot);
    renderAttention(snapshot,route.route==="attention"?route.id:null);
    renderAccounts(snapshot,route);
    renderSearch(snapshot);
    renderActionTray(snapshot,receiptState);
    renderPlaceholder(route);
    setVisible(routeView(route));
  }

  function onHashChange(){ void refresh(); }
  function onSubmit(event) {
    event.preventDefault();
    let href;
    try { href=pcmsV2Href("search",{query:searchInput.value}); }
    catch { return; }
    windowRef.location.hash=href;
    void refresh();
  }

  windowRef.addEventListener("hashchange",onHashChange);
  searchForm.addEventListener("submit",onSubmit);
  void refresh();

  return Object.freeze({
    refresh,
    showReceipt,
    updateCoreStatus,
    destroy() {
      if(disposed) return;
      disposed=true;
      refreshGeneration+=1;
      accountsView?.destroy();
      windowRef.removeEventListener("hashchange",onHashChange);
      searchForm.removeEventListener("submit",onSubmit);
    }
  });
}

// Core failure must never leave the dashboard with an empty, inaccessible navigation.
// This is a tab-local read-only shell; it does not attempt background recovery or work.
export function mountUnavailablePcmsShell({
  documentRef=globalThis.document,
  windowRef=globalThis.window
}={}) {
  const nav=section(documentRef,"primaryNav");
  const routes=[
    ["Overview","#/overview"],
    ["Attention","#/attention"],
    ["Accounts","#/accounts"],
    ["Generators","#/generators"],
    ["Modules","#/settings/modules"],
    ["Activity","#/activity"],
    ["Diagnostics","#/settings/diagnostics"]
  ];
  clear(nav);
  for(const [label,href] of routes){
    const link=element(documentRef,"a","nav-link");
    link.href=href;
    link.textContent=label;
    nav.appendChild(link);
  }
  // The page can be reloaded while Core is unavailable; no inherited P026
  // mutation form should remain actionable without a bound UI client.
  for(const form of documentRef.querySelectorAll(".live-form, #restoreApplyForm, #recoveryReleaseForm")){
    for(const control of form.querySelectorAll("button, input, select, textarea")) control.disabled=true;
  }
  function showRoute(){
    const resolved=resolvePcmsRouteV2(windowRef.location.hash,{accountIds:[],attentionIds:[]});
    const route=resolved.route;
    if(!resolved.valid||resolved.canonicalized) windowRef.history.replaceState(null,"",route.href);
    const diagnostics=route.route==="settings"&&route.section==="diagnostics";
    for(const id of ["viewOverview","viewModules","viewAttention","viewAccounts","viewSearch","viewDiagnostics","viewPlaceholder"]){
      section(documentRef,id).hidden=id!==(diagnostics?"viewDiagnostics":"viewPlaceholder");
    }
    section(documentRef,"placeholderHeading").textContent="PCMS Core unavailable";
    section(documentRef,"placeholderBody").textContent=
      "Background Core is unavailable. Open Settings → Diagnostics for the last known technical status.";
    for(const link of nav.children){
      if(link.getAttribute("href")===route.href) link.setAttribute("aria-current","page");
      else link.removeAttribute("aria-current");
    }
  }
  windowRef.addEventListener("hashchange",showRoute);
  showRoute();
  return Object.freeze({destroy(){windowRef.removeEventListener("hashchange",showRoute);}});
}

async function bootPcmsApp() {
  const pcms=installPcmsNamespace();
  document.getElementById("namespaceVersion").textContent="v"+pcms.version;
  document.getElementById("brokerVersion").textContent="v"+pcms.broker.contractVersion;
  document.getElementById("commandCount").textContent=String(pcms.broker.commandCount);
  document.getElementById("brokerImplementation").textContent=pcms.broker.implementation;

  let cachedStatus=null;
  try { cachedStatus=await readPcmsCachedStatus(); } catch {}
  const initial=presentPcmsCoreStatus(cachedStatus,{live:false,pending:!cachedStatus});
  const initialPill=document.getElementById("coreStatusPill");
  initialPill.textContent=initial.label;
  initialPill.dataset.token=initial.token;
  document.getElementById("diagnosticCoreState").textContent=initial.state;
  document.getElementById("diagnosticCoreAsOf").textContent=initial.asOf||"—";

  const liveStatus=document.getElementById("brokerLiveStatus");
  try {
    const runtime=await startPcmsRuntimeWithRetry({startRuntime:startPcmsLiveRuntime});
    liveStatus.textContent="Connected · rev "+runtime.brokerRevision;
    liveStatus.dataset.state="connected";
    document.getElementById("diagnosticBrokerBootId").textContent=String(runtime.brokerBootId||"—");
    document.getElementById("diagnosticBrokerRevision").textContent=String(runtime.brokerRevision??"—");
    const moduleProjectionService=createPcmsModuleProjectionService({runtime});
    const app=mountPcmsApp({
      projectionService:runtime.uiProjection,
      moduleProjectionService,
      runtime
    });
    app.updateCoreStatus(runtime.coreStatus,{live:true});
    const controls=bindPcmsLiveControls({
      runtime,
      documentRef:document,
      refresh:app.refresh
    });
    const unsubscribeReceipt=runtime.subscribeReceipt?.((receipt)=>app.showReceipt(receipt))||(()=>{});
    let lastSeq=-1;
    const unsubscribe=runtime.subscribe((revision)=>{
      if(!Number.isSafeInteger(revision?.seq)||revision.seq<=lastSeq) return;
      lastSeq=revision.seq;
      document.body.dataset.pcmsRevision=String(revision.seq);
      document.getElementById("diagnosticUiRevision").textContent=String(revision.seq);
      void app.refresh();
      void controls.refreshRecovery();
      void Promise.resolve(runtime.readCachedStatus?.()).then((status)=>{
        if(status) app.updateCoreStatus(status,{live:true});
      }).catch(()=>{});
    });
    window.addEventListener("unload",()=>{
      unsubscribe();
      unsubscribeReceipt();
      controls.close();
      app.destroy();
      runtime.close();
    },{once:true});
  } catch {
    const presentation=presentPcmsCoreStatus({state:"UNAVAILABLE"},{live:false});
    const pill=document.getElementById("coreStatusPill");
    pill.textContent=presentation.label;
    pill.dataset.token=presentation.token;
    document.getElementById("diagnosticCoreState").textContent=presentation.state;
    liveStatus.textContent="Unavailable";
    liveStatus.dataset.state="error";
    document.getElementById("coreHostStatus").textContent="Background · unavailable";
    document.getElementById("coreHostStatus").dataset.state="error";
    document.getElementById("notificationStatus").textContent="PCMS Core is unavailable. Open Diagnostics for technical status.";
    document.getElementById("notificationStatus").dataset.state="error";
    const unavailable=mountUnavailablePcmsShell();
    window.addEventListener("unload",unavailable.destroy,{once:true});
  }
}

void bootPcmsApp();

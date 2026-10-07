import { installPcmsNamespace } from "../core/bootstrap.js";
import { parsePcmsDeepLink, pcmsRouteHref, resolvePcmsDeepLink } from "./deep-links.js";
import { startPcmsLiveRuntime } from "./live-runtime.js";
import { startPcmsRuntimeWithRetry } from "./startup-retry.js";
import { createPcmsModuleProjectionService } from "./module-projections.js";
import { bindPcmsLiveControls } from "./live-controls.js";

function element(documentRef,tag,className=null) {
  const node=documentRef.createElement(tag);
  if(className) node.className=className;
  return node;
}

function clear(node) {
  while(node.firstChild) node.removeChild(node.firstChild);
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
  const searchForm=section(documentRef,"searchForm");
  const searchInput=section(documentRef,"searchInput");
  const notificationStatus=section(documentRef,"notificationStatus");
  let disposed=false;
  let refreshGeneration=0;

  function setVisible(route) {
    for(const [name,node] of [["overview",overview],["modules",modules],["attention",attention],["accounts",accounts],["search",search]]) {
      node.hidden=name!==route;
    }
  }

  function renderNav(snapshot,currentRoute) {
    clear(nav);
    const overviewItem=snapshot.navigation.find((item)=>item.id==="overview") || {id:"overview",label:"Overview",href:"#/overview",badge:null};
    const remaining=snapshot.navigation.filter((item)=>item.id!=="overview");
    const items=[overviewItem,{id:"modules",label:"Modules",href:"#/modules",badge:5},...remaining];
    for(const item of items) {
      const link=element(documentRef,"a","nav-link");
      link.href=item.href;
      link.textContent=item.label;
      if(item.id===currentRoute) link.setAttribute("aria-current","page");
      if(item.badge!==null) {
        const badge=element(documentRef,"span","nav-badge");
        badge.textContent=String(item.badge);
        link.appendChild(badge);
      }
      nav.appendChild(link);
    }
  }

  function renderOverview(snapshot) {
    section(documentRef,"overviewAttentionCount").textContent=String(snapshot.notifications.count);
    section(documentRef,"overviewAccountCount").textContent=String(snapshot.accounts.accounts.length);
    section(documentRef,"overviewModuleCount").textContent="5";
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
      if(runtime?.humanTasks) {
        const resolve=element(documentRef,"button","inline-action");
        resolve.type="button";
        resolve.dataset.resolveTask=item.taskId;
        resolve.textContent="Resolve";
        list.appendChild(resolve);
      }
    }
    section(documentRef,"attentionEmpty").hidden=items.length!==0;
  }

  function renderAccounts(snapshot,selectedId=null) {
    const list=section(documentRef,"accountList");
    clear(list);
    const items=selectedId===null
      ? snapshot.accounts.accounts
      : snapshot.accounts.accounts.filter((item)=>item.accountId===selectedId);
    for(const item of items) {
      appendLink(documentRef,list,{
        href:item.href,
        title:item.displayName,
        subtitle:item.accountId+" · "+item.personaUid
      });
    }
    section(documentRef,"accountsEmpty").hidden=items.length!==0;
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

  async function refresh() {
    const generation=++refreshGeneration;
    let parsed;
    try { parsed=parsePcmsDeepLink(windowRef.location.hash); }
    catch { parsed=parsePcmsDeepLink("#/overview"); }
    let snapshot,moduleSnapshot;
    try {
      [snapshot,moduleSnapshot]=await Promise.all([
        projectionService.snapshot({query:parsed.query}),
        moduleProjectionService.snapshot()
      ]);
    } catch {
      if(disposed||generation!==refreshGeneration) return;
      notificationStatus.textContent="PCMS live projections are unavailable.";
      setVisible("overview");
      return;
    }
    if(disposed||generation!==refreshGeneration) return;

    const resolved=resolvePcmsDeepLink(parsed.href,{
      accountIds:snapshot.accounts.accounts.map((item)=>item.accountId),
      attentionIds:snapshot.notifications.items.map((item)=>item.taskId)
    });
    if(!resolved.valid) {
      notificationStatus.textContent="That PCMS item is no longer available.";
      windowRef.history.replaceState(null,"",resolved.route.href);
    } else {
      const modulesReady=[
        moduleSnapshot.deployer.available,
        moduleSnapshot.explorer.available,
        moduleSnapshot.refresher.available,
        moduleSnapshot.statistics.available,
        moduleSnapshot.provisioning.available
      ].every(Boolean);
      notificationStatus.textContent=snapshot.notifications.count
        ? snapshot.notifications.count+" item"+(snapshot.notifications.count===1?"":"s")+" need attention."
        : modulesReady
          ? "PCMS connected · all module projections available."
          : "PCMS connected · one or more module projections are unavailable.";
    }
    const route=resolved.route;
    renderNav(snapshot,route.route);
    renderOverview(snapshot);
    renderModules(moduleSnapshot);
    renderAttention(snapshot,route.route==="attention"?route.id:null);
    renderAccounts(snapshot,route.route==="accounts"?route.id:null);
    renderSearch(snapshot);
    setVisible(route.route);
  }

  function onHashChange(){ void refresh(); }
  function onSubmit(event) {
    event.preventDefault();
    let href;
    try { href=pcmsRouteHref("search",{query:searchInput.value}); }
    catch { return; }
    windowRef.location.hash=href;
    void refresh();
  }

  windowRef.addEventListener("hashchange",onHashChange);
  searchForm.addEventListener("submit",onSubmit);
  void refresh();

  return Object.freeze({
    refresh,
    destroy() {
      if(disposed) return;
      disposed=true;
      refreshGeneration+=1;
      windowRef.removeEventListener("hashchange",onHashChange);
      searchForm.removeEventListener("submit",onSubmit);
    }
  });
}

async function bootPcmsApp() {
  const pcms=installPcmsNamespace();
  document.getElementById("namespaceVersion").textContent="v"+pcms.version;
  document.getElementById("brokerVersion").textContent="v"+pcms.broker.contractVersion;
  document.getElementById("commandCount").textContent=String(pcms.broker.commandCount);
  document.getElementById("brokerImplementation").textContent=pcms.broker.implementation;

  const liveStatus=document.getElementById("brokerLiveStatus");
  try {
    const runtime=await startPcmsRuntimeWithRetry({startRuntime:startPcmsLiveRuntime});
    liveStatus.textContent="Connected · rev "+runtime.brokerRevision;
    liveStatus.dataset.state="connected";
    const moduleProjectionService=createPcmsModuleProjectionService({runtime});
    const app=mountPcmsApp({
      projectionService:runtime.uiProjection,
      moduleProjectionService,
      runtime
    });
    const controls=bindPcmsLiveControls({
      runtime,
      documentRef:document,
      refresh:app.refresh
    });
    window.addEventListener("unload",()=>{
      controls.close();
      app.destroy();
      runtime.close();
    },{once:true});
  } catch {
    liveStatus.textContent="Unavailable";
    liveStatus.dataset.state="error";
    document.getElementById("notificationStatus").textContent="PCMS could not connect to PersonaMonkey Integration v1.";
  }
}

void bootPcmsApp();

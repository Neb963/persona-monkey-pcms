import { installPcmsNamespace } from "../core/bootstrap.js";
import { parsePcmsDeepLink, pcmsRouteHref, resolvePcmsDeepLink } from "./deep-links.js";
import { startPcmsLiveRuntime } from "./live-runtime.js";

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
}

function section(documentRef,id) {
  const node=documentRef.getElementById(id);
  if(!node) throw new Error("PCMS app DOM is incomplete");
  return node;
}

export function mountPcmsApp({
  projectionService,
  documentRef=globalThis.document,
  windowRef=globalThis.window
}={}) {
  if(!projectionService || typeof projectionService.snapshot!=="function") {
    throw new TypeError("PCMS app requires a projection service");
  }
  if(!documentRef || !windowRef) throw new TypeError("PCMS app requires a document/window");

  const nav=section(documentRef,"primaryNav");
  const overview=section(documentRef,"viewOverview");
  const attention=section(documentRef,"viewAttention");
  const accounts=section(documentRef,"viewAccounts");
  const search=section(documentRef,"viewSearch");
  const searchForm=section(documentRef,"searchForm");
  const searchInput=section(documentRef,"searchInput");
  const notificationStatus=section(documentRef,"notificationStatus");
  let disposed=false;
  let refreshGeneration=0;

  function setVisible(route) {
    for(const [name,node] of [["overview",overview],["attention",attention],["accounts",accounts],["search",search]]) {
      node.hidden=name!==route;
    }
  }

  function renderNav(snapshot,currentRoute) {
    clear(nav);
    for(const item of snapshot.navigation) {
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
    section(documentRef,"overviewCriticalCount").textContent=String(snapshot.notifications.criticalCount);
    section(documentRef,"overviewAccountCount").textContent=String(snapshot.accounts.accounts.length);
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
    let snapshot;
    try { snapshot=await projectionService.snapshot({query:parsed.query}); }
    catch {
      if(disposed||generation!==refreshGeneration) return;
      notificationStatus.textContent="PCMS projections are unavailable.";
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
      notificationStatus.textContent=snapshot.notifications.count
        ? snapshot.notifications.count+" item"+(snapshot.notifications.count===1?"":"s")+" need attention."
        : "No items need attention.";
    }
    const route=resolved.route;
    renderNav(snapshot,route.route);
    renderOverview(snapshot);
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
    const runtime=await startPcmsLiveRuntime();
    liveStatus.textContent="Connected · rev "+runtime.brokerRevision;
    liveStatus.dataset.state="connected";
    mountPcmsApp({projectionService:runtime.uiProjection});
    window.addEventListener("unload",()=>runtime.close(),{once:true});
  } catch {
    liveStatus.textContent="Unavailable";
    liveStatus.dataset.state="error";
    document.getElementById("notificationStatus").textContent="PCMS could not connect to PersonaMonkey Integration v1.";
  }
}

void bootPcmsApp();

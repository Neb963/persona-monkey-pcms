import { installPcmsNamespace } from "../core/bootstrap.js";

const pcms=installPcmsNamespace();

document.getElementById("namespaceVersion").textContent=`v${pcms.version}`;
document.getElementById("brokerVersion").textContent=`v${pcms.broker.contractVersion}`;
document.getElementById("commandCount").textContent=String(pcms.broker.commandCount);
document.getElementById("brokerImplementation").textContent=
  pcms.broker.implementation === "pending-P009" ? "Pending P009" : pcms.broker.implementation;

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PCMS_INTERNAL_BROKER_EVENTS_PORT,
  PCMS_INTERNAL_BROKER_REQUEST_TYPE,
  createFirefoxPersonaBrokerTransport
} from "../../../extension/pcms/platform/firefox-persona-broker-transport.js";
import { PERSONA_BROKER_INTEGRATION_EVENTS_PORT } from "../../../extension/pcms/core/persona-broker.js";

test("P025 Firefox Persona Broker transport uses only bounded same-extension messages", async () => {
  const sent=[];
  let eventListener=null;
  let disconnected=false;
  const runtime={
    async sendMessage(message){sent.push(message);return {ok:true};},
    connect({name}){
      assert.equal(name,PCMS_INTERNAL_BROKER_EVENTS_PORT);
      return {
        onMessage:{
          addListener(listener){eventListener=listener;},
          removeListener(listener){if(eventListener===listener)eventListener=null;}
        },
        disconnect(){disconnected=true;}
      };
    }
  };
  const transport=createFirefoxPersonaBrokerTransport({runtime});
  const envelope=Object.freeze({type:"PERSONAMONKEY_INTEGRATION_REQUEST",version:1,requestId:"r1",command:"system.status",params:Object.freeze({})});
  assert.deepEqual(await transport.send(envelope),{ok:true});
  assert.equal(sent.length,1);
  assert.equal(sent[0].type,PCMS_INTERNAL_BROKER_REQUEST_TYPE);
  assert.equal(sent[0].request,envelope);

  const events=[];
  const subscription=transport.openEvents(PERSONA_BROKER_INTEGRATION_EVENTS_PORT,(event)=>events.push(event));
  assert.equal(typeof eventListener,"function");
  eventListener({sequence:1});
  assert.deepEqual(events,[{sequence:1}]);
  subscription.disconnect();
  assert.equal(disconnected,true);
  assert.equal(eventListener,null);
  assert.throws(()=>transport.openEvents("wrong-port",()=>{}),TypeError);
});

test("P025 production app mounts live projections and ships accepted feature modules", async () => {
  const [app,liveRuntime,builder,popup]=await Promise.all([
    readFile("extension/pcms/app/app.js","utf8"),
    readFile("extension/pcms/app/live-runtime.js","utf8"),
    readFile("scripts/build-extension.mjs","utf8"),
    readFile("extension/popup/popup.html","utf8")
  ]);
  assert.match(app,/startPcmsLiveRuntime/);
  assert.doesNotMatch(app,/emptyProjection/);
  assert.match(app,/mountPcmsApp\(\{projectionService:runtime\.uiProjection\}\)/);
  assert.match(liveRuntime,/from "\/pcms-modules\/p014\/accounts\.js"/);
  assert.match(liveRuntime,/command:"system\.status"/);
  assert.match(builder,/const moduleSource = resolve\(root, "pcms-modules"\)/);
  assert.match(builder,/copyTree\(moduleSource, resolve\(stage, "pcms-modules"\)\)/);
  assert.match(popup,/\.\.\/pcms\/app\/index\.html/);
});

test("P025 built-in principal reuses Integration-v1 policy rather than legacy management API", async () => {
  const [integration,background,liveCore]=await Promise.all([
    readFile("extension/lib/management-integration.js","utf8"),
    readFile("extension/background.js","utf8"),
    readFile("extension/pcms/integration/live-core.js","utf8")
  ]);
  assert.match(integration,/INTERNAL_PCMS_INTEGRATION_SENDER_ID = "pcms-internal@personamonkey\.local"/);
  assert.match(integration,/return Object\.freeze\(\{ \.\.\.current, enabled:true \}\)/);
  assert.doesNotMatch(integration,/\.\.\.current, enabled:true, allowDirect:true/);
  assert.doesNotMatch(integration,/\.\.\.current, enabled:true, allowDestructive:true/);
  assert.doesNotMatch(integration,/\.\.\.current, enabled:true, allowExternalAutomation:true/);
  assert.doesNotMatch(integration,/\.\.\.current, enabled:true, allowExecutableInstall:true/);
  assert.match(integration,/handleInternalRequest/);
  assert.match(integration,/attachInternalPort/);
  assert.match(background,/isPcmsExtensionPageSender/);
  assert.match(background,/managementIntegration\.handleInternalRequest\(message\.request\)/);
  assert.match(background,/managementIntegration\.attachInternalPort\(port\)/);
  assert.doesNotMatch(liveCore,/pcms-client|PCMS_REQUEST|browser\.|nativeMessaging|personaApi|stateManager/);
});

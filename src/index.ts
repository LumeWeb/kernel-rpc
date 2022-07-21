import { addHandler, handleMessage } from "libkmodule";
import type { ActiveQuery } from "libkmodule";
import { DHT } from "@lumeweb/kernel-dht-client";
import { RpcNetwork, RPCRequest } from "@lumeweb/dht-rpc-client";

onmessage = handleMessage;

const network = new RpcNetwork(new DHT());
const dht = network.dht as DHT;

addHandler("addRelay", handleAddRelay);
addHandler("removeRelay", handleRemoveRelay);
addHandler("clearRelays", handleClearRelays);
addHandler("query", handleQuery);
addHandler("ready", handleReady);

async function handleAddRelay(aq: ActiveQuery) {
  const { pubkey = null } = aq.callerInput;

  if (!pubkey) {
    aq.reject("invalid pubkey");
    return;
  }

  network.addRelay(pubkey);
  try {
    await dht.addRelay(pubkey);
  } catch (e: any) {}

  aq.respond();
}

function handleRemoveRelay(aq: ActiveQuery) {
  const { pubkey = null } = aq.callerInput;

  if (!pubkey) {
    aq.reject("invalid pubkey");
    return;
  }

  aq.respond(network.removeRelay(pubkey));
}

async function handleClearRelays(aq: ActiveQuery) {
  network.clearRelays();

  await dht.clearRelays();
  aq.respond();
}

async function handleQuery(aq: ActiveQuery) {
  const query: RPCRequest = aq.callerInput;

  if (!("query" in query)) {
    aq.reject("query required");
    return;
  }

  if (!("chain" in query)) {
    aq.reject("chain required");
    return;
  }
  if (!("data" in query)) {
    aq.reject("data required");
    return;
  }

  let resp;

  try {
    const rpcQuery = await network.query(
      query.query,
      query.chain,
      query.data,
      query.force ?? false
    );
    resp = await rpcQuery.result;
  } catch (e: any) {
    aq.reject(e);
  }

  aq.respond(resp);
}

async function handleReady(aq: ActiveQuery) {
  await network.ready;
  aq.respond();
}

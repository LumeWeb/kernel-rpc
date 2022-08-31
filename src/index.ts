import { addHandler, handleMessage } from "libkmodule";
import type { ActiveQuery } from "libkmodule";
import { DHT } from "@lumeweb/kernel-dht-client";
import {
  RpcNetwork,
  RpcQueryOptions,
  StreamingRpcQueryOptions,
} from "@lumeweb/dht-rpc-client";
import type { RPCRequest, RPCResponse } from "@lumeweb/relay-types";

onmessage = handleMessage;

const network = new RpcNetwork(new DHT());
const dht = network.dht as DHT;

addHandler("addRelay", handleAddRelay);
addHandler("removeRelay", handleRemoveRelay);
addHandler("clearRelays", handleClearRelays);
addHandler("simpleQuery", handleSimpleQuery);
addHandler("streamingQuery", handleStreamingQuery);
addHandler("wisdomQuery", handleWisdomQuery);
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

async function handleSimpleQuery(aq: ActiveQuery) {
  const {
    query = null,
    relay = null,
    options = undefined,
  } = aq.callerInput as {
    query: RPCRequest;
    options: RpcQueryOptions;
    relay: Buffer | string;
  };

  if (!query) {
    aq.reject("RPCRequest query required");
    return;
  }

  if (!relay) {
    aq.reject("relay required");
    return;
  }

  let resp: RPCResponse | null = null;

  try {
    const rpcQuery = network.simpleQuery(
      relay as Buffer | string,
      query.method,
      query.module,
      query.data,
      query.bypassCache,
      options
    );
    resp = await rpcQuery.result;
  } catch (e: any) {
    aq.reject(e);
  }

  if (resp?.error) {
    aq.reject(resp?.error);
    return;
  }

  aq.respond(resp);
}

async function handleStreamingQuery(aq: ActiveQuery) {
  const {
    query = null,
    relay = null,
    options = undefined,
  } = aq.callerInput as {
    query: RPCRequest;
    options: StreamingRpcQueryOptions;
    relay: Buffer | string;
  };

  if (!query) {
    aq.reject("RPCRequest query required");
    return;
  }

  if (!relay) {
    aq.reject("relay required");
    return;
  }

  if (!options || !options?.streamHandler) {
    aq.reject("RPCRequest query required");
    return;
  }

  let resp: RPCResponse | null = null;

  try {
    const rpcQuery = network.streamingQuery(
      relay as Buffer | string,
      query.method,
      query.module,
      query.data,
      { ...options, streamHandler: aq.sendUpdate }
    );
    resp = await rpcQuery.result;
  } catch (e: any) {
    aq.reject(e);
  }

  if (resp?.error) {
    aq.reject(resp?.error);
    return;
  }

  aq.respond(resp);
}

async function handleWisdomQuery(aq: ActiveQuery) {
  const { query = null, options = undefined } = aq.callerInput as {
    query: RPCRequest;
    options: RpcQueryOptions;
    relay: Buffer | string;
  };

  if (!query) {
    aq.reject("RPCRequest query required");
    return;
  }

  let resp: RPCResponse | null = null;

  try {
    const rpcQuery = network.wisdomQuery(
      query.method,
      query.module,
      query.data,
      query.bypassCache ?? undefined,
      options
    );
    resp = await rpcQuery.result;
  } catch (e: any) {
    aq.reject(e);
  }

  if (resp?.error) {
    aq.reject(resp?.error);
    return;
  }

  aq.respond(resp);
}

async function handleReady(aq: ActiveQuery) {
  await network.ready;
  aq.respond();
}

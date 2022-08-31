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

function idFactory(start = 1, step = 1, limit = 2 ** 32) {
  let id = start;

  return function nextId() {
    const nextId = id;
    id += step;
    if (id >= limit) id = start;
    return nextId;
  };
}

const nextId = idFactory(1);

let defaultNetwork: RpcNetwork;

const networkInstances = new Map<number, RpcNetwork>();

addHandler("presentSeed", handlePresentSeed);
addHandler("createNetwork", handleCreateNetwork);
addHandler("addRelay", handleAddRelay);
addHandler("removeRelay", handleRemoveRelay);
addHandler("clearRelays", handleClearRelays);
addHandler("simpleQuery", handleSimpleQuery);
addHandler("streamingQuery", handleStreamingQuery);
addHandler("wisdomQuery", handleWisdomQuery);
addHandler("ready", handleReady);

async function handlePresentSeed() {
  if (!defaultNetwork) {
    defaultNetwork = networkInstances.get(await createNetwork()) as RpcNetwork;
  }
}

async function handleCreateNetwork(aq: ActiveQuery) {
  aq.respond(await createNetwork(false));
}

async function handleAddRelay(aq: ActiveQuery) {
  const { pubkey = null } = aq.callerInput;

  if (!pubkey) {
    aq.reject("invalid pubkey");
    return;
  }

  const network = getNetwork(aq);

  network.addRelay(pubkey);
  try {
    await network.dht.addRelay(pubkey);
  } catch (e: any) {}

  aq.respond();
}

function handleRemoveRelay(aq: ActiveQuery) {
  const { pubkey = null } = aq.callerInput;

  if (!pubkey) {
    aq.reject("invalid pubkey");
    return;
  }

  aq.respond(getNetwork(aq).removeRelay(pubkey));
}

async function handleClearRelays(aq: ActiveQuery) {
  const network = getNetwork(aq);
  network.clearRelays();

  await network.dht.clearRelays();
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

  const network = getNetwork(aq);

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

  const network = getNetwork(aq);

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

  const network = getNetwork(aq);

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
  await getNetwork(aq).ready;
  aq.respond();
}
async function createNetwork(def = true): Promise<number> {
  const dhtInstance = new RpcNetwork(new DHT(def));
  const id = nextId();
  networkInstances.set(id, dhtInstance);

  return id;
}

function getNetwork(aq: ActiveQuery): RpcNetwork {
  const { network = null } = aq.callerInput;

  if (!network) {
    return defaultNetwork;
  }

  if (!networkInstances.has(network)) {
    const err = "Invalid network id";
    aq.reject(err);
    throw err;
  }

  return networkInstances.get(network) as RpcNetwork;
}

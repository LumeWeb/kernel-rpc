import { addHandler, handleMessage } from "libkmodule";
import type { ActiveQuery } from "libkmodule";
import {
  createClient,
  Socket,
  SwarmClient,
} from "@lumeweb/kernel-swarm-client";
import { RpcNetwork, RpcQueryOptions } from "@lumeweb/rpc-client";
import type { RPCRequest, RPCResponse } from "@lumeweb/interface-relay";
import { setupStream } from "@lumeweb/rpc-client";

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
let moduleReadyResolve: Function;
let moduleReady: Promise<void> = new Promise((resolve) => {
  moduleReadyResolve = resolve;
});

const networkInstances = new Map<number, RpcNetwork>();

addHandler("presentSeed", handlePresentSeed);
addHandler("createNetwork", handleCreateNetwork);
addHandler("simpleQuery", handleSimpleQuery);
addHandler("ready", handleReady);

async function handlePresentSeed() {
  if (!defaultNetwork) {
    defaultNetwork = networkInstances.get(await createNetwork()) as RpcNetwork;
  }
  moduleReadyResolve();
}

async function handleCreateNetwork(aq: ActiveQuery) {
  aq.respond(await createNetwork(false));
}
async function handleSimpleQuery(aq: ActiveQuery) {
  const {
    query = undefined,
    relay = undefined,
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

  const network = await getNetwork(aq);

  let resp: RPCResponse | null = null;

  try {
    const rpcQuery = network.factory.simple({
      relay,
      query,
      options,
    });
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
  const network = await getNetwork(aq);
  const swarm: SwarmClient = network.swarm;

  await swarm.start();
  await swarm.ready();

  await (
    await getNetwork(aq)
  ).readyWithRelays;
  aq.respond();
}
async function createNetwork(def = true): Promise<number> {
  const dhtInstance = new RpcNetwork(createClient(def));
  const id = nextId();
  networkInstances.set(id, dhtInstance);

  dhtInstance.swarm.on("setup", (socket: Socket) => {
    setupStream(socket);
  });

  return id;
}

async function getNetwork(aq: ActiveQuery): Promise<RpcNetwork> {
  const { network = null } = aq?.callerInput ?? {};

  await moduleReady;

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

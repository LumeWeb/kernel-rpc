import { Client, factory } from "@lumeweb/libkernel-universal";
const MODULE = "_AXYJDzn2fjd-YfuchEegna7iErhun6QwQK7gSa3UNjHvw";

import defer from "p-defer";
import b4a from "b4a";

class Protomux {
  private isProtomux = true;

  constructor(stream: any) {
    this._stream = stream;
    if (!stream.userData) {
      stream.userData = this;
    }
  }

  private _stream: any;

  get stream(): any {
    return this._stream;
  }

  static from(stream: any) {
    if (stream.userData && stream.userData.isProtomux) return stream.userData;
    if (stream.isProtomux) return stream;
    return new this(stream);
  }

  public async createChannel({
    protocol,
    id = null,
    handshake = null,
    onopen = undefined,
    onclose = undefined,
    ondestroy = undefined,
  }: {
    protocol: string;
    id: any;
    handshake: any;
    onopen?: Function;
    onclose?: Function;
    ondestroy?: Function;
  }) {
    return createChannel(
      this,
      protocol,
      id,
      handshake,
      onopen,
      onclose,
      ondestroy
    );
  }
}

class Channel extends Client {
  private protocol: string;
  private id: any;
  private handshake: any;
  private onopen?: Function;
  private onclose?: Function;
  private ondestroy?: Function;
  private _created = defer();
  private _send?: (data?: any) => void;
  private _queue: Message[] = [];
  private _inited = false;

  constructor(
    mux: Protomux,
    protocol: string,
    id: any,
    handshake: any,
    onopen?: Function,
    onclose?: Function,
    ondestroy?: Function
  ) {
    super();
    this._mux = mux;
    this.protocol = protocol;
    this.id = id;
    this.handshake = handshake;
    this.onopen = onopen;
    this.onclose = onclose;
    this.ondestroy = ondestroy;
  }

  private _ready = defer();

  get ready(): Promise<void> {
    return this._ready.promise as Promise<void>;
  }

  private _mux: Protomux;

  get mux(): Protomux {
    return this._mux;
  }

  private _channelId = -1;

  get channelId(): number {
    return this._channelId;
  }

  async open(): Promise<void> {
    await this.init();
    await this._created;

    while (this._queue.length) {
      await this._queue.shift()?.init();
    }

    this._ready.resolve();
  }

  public addMessage({
    encoding = undefined,
    onmessage,
  }: {
    encoding?: any;
    onmessage: Function;
  }) {
    return createMessage({ channel: this, encoding, onmessage });
  }

  public async queueMessage(message: Message) {
    this._queue.push(message);
  }

  private async init(): Promise<void> {
    if (this._inited) {
      return;
    }

    this._inited = true;

    const [update, ret] = this.connectModule(
      "createProtomuxChannel",
      {
        id: this._mux.stream.id,
        data: {
          protocol: this.protocol,
          id: this.id,
          handshake: this.handshake,
          onopen: !!this.onopen,
          onclose: !!this.onclose,
          ondestroy: !!this.ondestroy,
        },
      },
      (data: any) => {
        switch (data.action) {
          case "onopen":
            this.onopen?.(...data.args);
            break;
          case "onclose":
            this.onclose?.(...data.args);
            break;
          case "ondestroy":
            this.ondestroy?.(...data.args);
            break;
          default:
            this._channelId = data;
            this._created.resolve();
        }
      }
    );
    this._send = update;

    ret.catch((e) => this._created.reject(e));

    return this._created.promise as Promise<void>;
  }
}

class Message extends Client {
  private encoding: any;
  private onmessage: Function;
  private channel: Channel;

  private _send?: (data?: any) => void;

  constructor({
    channel,
    encoding = undefined,
    onmessage = () => {},
  }: {
    channel: Channel;
    encoding?: any;
    onmessage: Function;
  }) {
    super();
    this.channel = channel;
    this.encoding = encoding;
    this.onmessage = onmessage;
    this.channel.queueMessage(this);
  }

  async init(): Promise<void> {
    const created = defer();

    await this.loadLibs(MODULE);

    const [update] = this.connectModule(
      "createProtomuxMessage",
      {
        id: this.channel.mux.stream.id,
        channelId: this.channel.channelId,
        data: {
          encoding: !!this.encoding,
          onmessage: !!this.onmessage,
        },
      },
      async (data: any) => {
        if (data?.args && data?.args[0] instanceof Uint8Array) {
          data.args[0] = b4a.from(data.args[0]);
        }
        switch (data.action) {
          case "encode":
            update({
              action: "encode",
              args: [await this.encoding.encode?.(...data.args), data.args[0]],
            });
            break;
          case "decode":
            update({
              action: "decode",
              args: [await this.encoding.decode?.(...data.args), data.args[0]],
            });
            break;
          case "preencode":
            update({
              action: "preencode",
              args: [
                await this.encoding.preencode?.(...data.args),
                data.args[0],
              ],
            });
            break;
          case "onmessage":
            this.onmessage?.(...data.args);
            break;
          case "created":
            created.resolve();
            break;
        }
      }
    );

    this._send = update;

    return created.promise as Promise<void>;
  }

  public send(data: any) {
    this._send?.({ action: "send", args: [data] });
  }
}

const createChannel = factory<Channel>(Channel, MODULE);
const createMessage = factory<Message>(Message, MODULE);

// @ts-ignore
export = Protomux;

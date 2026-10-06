/**
 * A stand-in for the browser's `EventSource` (spec, UI seam): tests push
 * contract-shaped server events into it and inspect how it was opened and
 * whether it was closed.
 */
export class FakeEventSource extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  readyState = FakeEventSource.CONNECTING;
  readonly withCredentials: boolean;

  constructor(
    readonly url: string,
    init?: EventSourceInit,
  ) {
    super();
    this.withCredentials = init?.withCredentials ?? false;
    FakeEventSource.instances.push(this);
  }

  /** The most recently opened stream. */
  static latest(): FakeEventSource {
    const latest = FakeEventSource.instances.at(-1);
    if (!latest) throw new Error("no EventSource was opened");
    return latest;
  }

  /** The server sends a named event with a JSON payload. */
  emit(event: string, data: unknown): void {
    this.readyState = FakeEventSource.OPEN;
    this.dispatchEvent(new MessageEvent(event, { data: JSON.stringify(data) }));
  }

  /** The connection drops; the browser will retry (`reconnecting`) unless closed. */
  drop(): void {
    this.readyState = FakeEventSource.CONNECTING;
    this.dispatchEvent(new Event("error"));
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }
}

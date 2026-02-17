export interface SSEWriter {
  send(event: string, data: unknown): void;
  close(): void;
}

export function createSSEResponse(): { response: Response; writer: SSEWriter } {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {},
  });

  const writer: SSEWriter = {
    send(event: string, data: unknown) {
      try {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      } catch {}
    },
    close() {
      try {
        controller.close();
      } catch {}
    },
  };

  const response = new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });

  return { response, writer };
}

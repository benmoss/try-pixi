// A WebSocket-shaped wrapper over unkernel's vm.connect() byte streams, so
// noVNC (which accepts any channel with this shape) can talk RFB straight to
// a VNC server on the guest's loopback. No network, no websockify.
export function socketChannel(sock) {
  const writer = sock.writable.getWriter();
  const ch = {
    binaryType: "arraybuffer",
    protocol: "",
    readyState: WebSocket.OPEN,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send(data) {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data.buffer ?? data);
      writer.write(bytes.slice()).catch((e) => ch.onerror?.(e));
    },
    close() {
      if (ch.readyState >= WebSocket.CLOSING) return;
      ch.readyState = WebSocket.CLOSING;
      sock.close();
    },
  };
  (async () => {
    const reader = sock.readable.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        ch.onmessage?.({ data: value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) });
      }
    } catch (e) {
      ch.onerror?.(e);
    }
    ch.readyState = WebSocket.CLOSED;
    ch.onclose?.({ code: 1000, reason: "", wasClean: true });
  })();
  return ch;
}

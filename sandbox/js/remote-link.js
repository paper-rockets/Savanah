// Message link between the phone remote and the animal screen, through serve.py.
// send() posts one message; listen() keeps asking the server for new ones (it answers as soon as one arrives).

export function send(msg) {
  fetch('/remote', { method: 'POST', body: JSON.stringify(msg) }).catch(() => {});
}

export async function listen(onMessage, onReady) {
  let after = -1;
  for (;;) {
    try {
      const r = await fetch('/remote/poll?after=' + after, { cache: 'no-store' });
      const data = await r.json();
      if (after < 0 && onReady) onReady();
      if (after >= 0) data.msgs.forEach(onMessage);
      after = data.last;
    } catch {
      await new Promise(res => setTimeout(res, 2000));   // server restarting or wifi gone: try again
      after = -1;
    }
  }
}

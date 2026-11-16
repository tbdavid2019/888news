import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import {
  buildMimeMessage,
  extractAddress,
  invalidateEmailCache,
  isEmailConfigured,
  parseEmailList,
  sendEmailMessage,
  type EmailConfig,
} from "@aihot/backend/notify/email";

test("parseEmailList and extractAddress normalize mailboxes and filter invalid values", () => {
  assert.deepEqual(parseEmailList("a@example.com, invalid; b@example.org\nc@example.net"), [
    "a@example.com",
    "b@example.org",
    "c@example.net",
  ]);
  assert.equal(extractAddress("888news 系統 <news2@david888.com>"), "news2@david888.com");
  assert.equal(extractAddress("news2@david888.com"), "news2@david888.com");
  assert.throws(() => extractAddress("not-an-email"), /Invalid email/);
});

test("buildMimeMessage encodes UTF-8 subject and body without newline injection", () => {
  const mime = buildMimeMessage({
    from: "news2@david888.com",
    to: ["tbdavid2019@gmail.com"],
    subject: "系統告警\r\nBcc: evil@example.com",
    text: "網站停止收錄\n.dot-prefixed-line",
  });
  assert.match(mime, /^From: 888news 系統通知 <news2@david888\.com>/m);
  assert.match(mime, /^To: tbdavid2019@gmail\.com/m);
  assert.match(mime, /^Subject: =\?UTF-8\?B\?/m);
  assert.equal(/\r\nBcc:/i.test(mime), false, "injected headers must be flattened into the encoded subject");
  const body = mime.split("\r\n\r\n")[1]!;
  assert.equal(Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8"), "網站停止收錄\r\n.dot-prefixed-line");
});

test("isEmailConfigured tracks required SMTP env vars", () => {
  const keys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "ALERT_EMAIL_TO"] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    for (const k of keys) delete process.env[k];
    invalidateEmailCache();
    assert.equal(isEmailConfigured(), false);

    process.env.SMTP_HOST = "email-smtp.ap-northeast-1.amazonaws.com";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASS = "pass";
    process.env.SMTP_FROM = "news2@david888.com";
    process.env.ALERT_EMAIL_TO = "tbdavid2019@gmail.com";
    assert.equal(isEmailConfigured(), true);
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    invalidateEmailCache();
  }
});

test("sendEmailMessage performs EHLO, AUTH LOGIN, MAIL FROM, RCPT TO, DATA dot-stuffing and QUIT", async () => {
  const receivedCommands: string[] = [];
  let receivedBody = "";

  const server = net.createServer((sock) => {
    let readingData = false;
    let buf = "";
    sock.write("220 mock-ses ESMTP ready\r\n");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      if (readingData) {
        const end = buf.indexOf("\r\n.\r\n");
        if (end >= 0) {
          receivedBody = buf.slice(0, end);
          buf = buf.slice(end + 5);
          readingData = false;
          sock.write("250 2.0.0 Ok: queued as mock-id\r\n");
        }
        return;
      }
      while (buf.includes("\r\n")) {
        const idx = buf.indexOf("\r\n");
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        receivedCommands.push(line);
        if (line.startsWith("EHLO ")) {
          sock.write("250-mock-ses\r\n250 AUTH LOGIN PLAIN\r\n");
        } else if (line === "AUTH LOGIN") {
          sock.write("334 VXNlcm5hbWU6\r\n");
        } else if (line === Buffer.from("akiay", "utf8").toString("base64")) {
          sock.write("334 UGFzc3dvcmQ6\r\n");
        } else if (line === Buffer.from("secret-pass", "utf8").toString("base64")) {
          sock.write("235 Authentication successful\r\n");
        } else if (line.startsWith("MAIL FROM:") || line.startsWith("RCPT TO:")) {
          sock.write("250 Ok\r\n");
        } else if (line === "DATA") {
          sock.write("354 End data with <CR><LF>.<CR><LF>\r\n");
          readingData = true;
          if (buf.includes("\r\n.\r\n")) {
            const end = buf.indexOf("\r\n.\r\n");
            receivedBody = buf.slice(0, end);
            buf = buf.slice(end + 5);
            readingData = false;
            sock.write("250 2.0.0 Ok\r\n");
          }
          break;
        } else if (line === "QUIT") {
          sock.write("221 Bye\r\n");
          sock.end();
        }
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as net.AddressInfo).port;
    const cfg: EmailConfig = {
      host: "127.0.0.1",
      port,
      secure: false,
      user: "akiay",
      pass: "secret-pass",
      from: "news2@david888.com",
      to: ["tbdavid2019@gmail.com"],
    };
    const res = await sendEmailMessage({
      subject: "測試報錯通知",
      text: "Hello\n..escaped",
      cfg,
      connect: (c) => new Promise((resolve, reject) => {
        const s = net.connect({ host: c.host!, port: c.port }, () => resolve(s));
        s.once("error", reject);
      }),
    });
    assert.deepEqual(res, { ok: true });
    assert.ok(receivedCommands.includes("AUTH LOGIN"));
    assert.ok(receivedCommands.includes("MAIL FROM:<news2@david888.com>"));
    assert.ok(receivedCommands.includes("RCPT TO:<tbdavid2019@gmail.com>"));
    assert.ok(receivedCommands.includes("QUIT"));
    assert.match(receivedBody, /^From: 888news 系統通知 <news2@david888\.com>/m);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

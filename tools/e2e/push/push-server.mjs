// A stand-in push service: records what the app sends and answers like FCM/APNs would.
import https from "node:https";
import { readFileSync } from "node:fs";
const received = [];
https.createServer({ key: readFileSync(new URL("./key.pem", import.meta.url)), cert: readFileSync(new URL("./cert.pem", import.meta.url)) }, (req, res) => {
  let size = 0;
  req.on("data", (c) => (size += c.length));
  req.on("end", () => {
    if (req.url === "/__received") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(received)); }
    received.push({ path: req.url, encoding: req.headers["content-encoding"], auth: (req.headers.authorization ?? "").slice(0, 12), ttl: req.headers.ttl, bytes: size });
    res.writeHead(req.url.includes("gone") ? 410 : 201);
    res.end();
  });
}).listen(54500, () => console.log("push service on 54500"));

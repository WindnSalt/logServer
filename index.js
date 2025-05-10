const express = require("express");
const app = express();
const port = 8080;

const MAX_LOGS = 5000;
let logs = {};

app.use(express.raw({ type: "text/plain" }));

const clients = [];

app.get("/", (req, res) => {
  res.set("Content-Type", "text/html");
  res.send(`
    <html>
      <head>
        <title>Live Logs</title>
        <style>
          body {
            font-family: sans-serif;
          }
        </style>
      </head>
      <body>
        <h1>Live Logs</h1>
        <label for="clientSelect">Select Client:</label>
        <select id="clientSelect"></select>
        <pre id="logOutput"></pre>
        <script>
          let currentClient = null;
          let evtSource = null;

          async function fetchClientList() {
            const response = await fetch("/clientList");
            const list = await response.json();
            const select = document.getElementById("clientSelect");
            select.innerHTML = "";
            list.forEach(client => {
              const option = document.createElement("option");
              option.value = client;
              option.textContent = client;
              select.appendChild(option);
            });
            if (list.length > 0) {
              select.value = list[0];
              changeClient(list[0]);
            }
          }

          async function changeClient(clientId) {
            currentClient = clientId;
            const response = await fetch("/log/" + clientId);
            const html = await response.text();
            const logMatch = html.match(/<pre>([\\s\\S]*)<\\/pre>/);
            const pre = document.getElementById("logOutput");
            pre.textContent = logMatch ? (logMatch[1] + "\\\n"): "";

            if (evtSource) evtSource.close();
            evtSource = new EventSource("/events");
            evtSource.onmessage = function(event) {
              const data = event.data;
              if (data.endsWith("\\n")) {
                console.log("Received CR");
              }
              const [client, ...logParts] = data.split(" ");
              const logLine = logParts.join(" ");
              const decodedLogLine = logLine.replace(/\\\\n/g, "\\n");
              if (client === currentClient) {
                pre.textContent += decodedLogLine;
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
              } 
            };
          }

          document.addEventListener("DOMContentLoaded", fetchClientList);
          document.getElementById("clientSelect").addEventListener("change", (e) => {
            changeClient(e.target.value);
          });
        </script>
      </body>
    </html>
  `);
});

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  clients.push(res);
  req.on("close", () => {
    const index = clients.indexOf(res);
    if (index !== -1) clients.splice(index, 1);
  });
});

function broadcast(logEntry, clientId) {
  process.stdout.write(logEntry);
  const safeEntry = logEntry.replace(/\n/g, "\\n");
  clients.forEach((client) => {
    client.write(`data: ${clientId} ${safeEntry}\n\n`);
  });
}

app.post("/log/:clientId", (req, res) => {
  const { clientId } = req.params;
  const rawBody = req.body.toString();
  if (rawBody.length > 0) {
    const entry = `[${new Date().toISOString()}] ${rawBody}`;
    if (!logs[clientId]) logs[clientId] = [];

    const lastIndex = logs[clientId].length - 1;
    if (lastIndex >= 0 && !logs[clientId][lastIndex].endsWith("\n")) {
      logs[clientId][lastIndex] += rawBody;
      broadcast(rawBody, clientId);
    } else {
      logs[clientId].push(entry);
      broadcast(entry, clientId);
    }

    if (logs[clientId].length > MAX_LOGS) logs[clientId].shift(); // ring buffer

    res.status(200).send("Log received\n");
    //console.log(`[${clientId}] ${entry.trim()}`);
  } else {
    res.status(400).send("Invalid log entry\n");
  }
});

app.get("/log/:clientId", (req, res) => {
  const { clientId } = req.params;
  const clientLogs = logs[clientId] || [];
  res.set("Content-Type", "text/html");
  res.send(`<html><body><h1>Logs for ${clientId}</h1><pre>${clientLogs.join("")}</pre></body></html>`);
});

app.get("/clientList", (req, res) => {
  res.json(Object.keys(logs));
});

app.listen(port, () => {
  console.log(`Logserver listening at http://localhost:${port}/log`);
});

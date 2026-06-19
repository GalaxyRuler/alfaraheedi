import http from "node:http";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

const port = Number(option("--port", process.env.MOCK_OPENAI_PORT ?? "3199"));
const model = option("--model", process.env.MOCK_OPENAI_MODEL ?? "mock-local-model");

function json(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/v1/models") {
    json(response, 200, {
      object: "list",
      data: [{ id: model, object: "model", owned_by: "alfaraheedi-smoke" }],
    });
    return;
  }

  if (request.method === "POST" && request.url === "/v1/chat/completions") {
    request.resume();
    request.on("end", () => {
      json(response, 200, {
        id: "chatcmpl-alfaraheedi-smoke",
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({
                replacement: "مرحبا بالعالم",
                explanation: "Mock local runtime suggestion.",
                confidence: 0.64,
              }),
            },
            finish_reason: "stop",
          },
        ],
      });
    });
    return;
  }

  json(response, 404, { error: "not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`mock-openai-server listening on http://127.0.0.1:${port}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});

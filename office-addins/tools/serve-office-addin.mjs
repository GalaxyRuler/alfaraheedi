import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { URL } from "node:url";

const repoRootArg = process.argv[2] ?? ".";
const pfxPathArg = process.argv[3];
const port = Number.parseInt(process.argv[4] ?? "3443", 10);
const host = process.argv[5] ?? "localhost";

if (!pfxPathArg) {
  console.error(
    "Usage: node serve-office-addin.mjs <repo-root> <pfx-path> [port] [host]",
  );
  process.exit(1);
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid HTTPS port: ${process.argv[4]}`);
  process.exit(1);
}

const repoRoot = fs.realpathSync(path.resolve(repoRootArg));
const pfxPath = path.resolve(pfxPathArg);
const pfx = fs.readFileSync(pfxPath);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
]);

function isInsideRepoRoot(candidatePath) {
  const relative = path.relative(repoRoot, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveRequestPath(requestUrl) {
  const parsedUrl = new URL(requestUrl ?? "/", `https://${host}:${port}`);
  const pathname =
    parsedUrl.pathname === "/" ? "/office-addins/taskpane.html" : parsedUrl.pathname;
  const decodedPathname = decodeURIComponent(pathname);
  const candidatePath = path.resolve(repoRoot, `.${decodedPathname}`);

  if (!isInsideRepoRoot(candidatePath)) {
    return null;
  }

  return candidatePath;
}

function writeResponse(response, statusCode, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

const server = https.createServer(
  {
    passphrase: process.env.NAHOU_OFFICE_ADDIN_PFX_PASSWORD || undefined,
    pfx,
  },
  (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      writeResponse(response, 405, "Method not allowed");
      return;
    }

    const filePath = resolveRequestPath(request.url);
    if (!filePath) {
      writeResponse(response, 403, "Forbidden");
      return;
    }

    fs.realpath(filePath, (realpathError, realFilePath) => {
      if (realpathError || !isInsideRepoRoot(realFilePath)) {
        writeResponse(response, realpathError ? 404 : 403, realpathError ? "Not found" : "Forbidden");
        return;
      }

      fs.stat(realFilePath, (statError, stat) => {
        if (statError || !stat.isFile()) {
          writeResponse(response, 404, "Not found");
          return;
        }

        fs.readFile(realFilePath, (readError, data) => {
          if (readError) {
            writeResponse(response, 500, "Could not read file");
            return;
          }

          response.writeHead(200, {
            "Cache-Control": "no-store",
            "Content-Length": data.length,
            "Content-Type":
              contentTypes.get(path.extname(realFilePath).toLowerCase()) ??
              "application/octet-stream",
            "X-Content-Type-Options": "nosniff",
          });

          if (request.method === "HEAD") {
            response.end();
            return;
          }

          response.end(data);
        });
      });
    });
  },
);

server.listen(port, host, () => {
  console.log(
    JSON.stringify({
      host,
      port,
      repoRoot,
      taskpaneUrl: `https://${host}:${port}/office-addins/taskpane.html`,
    }),
  );
});

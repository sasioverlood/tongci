import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { canStartNextRound, evaluateRound, publicRoom } from "./game.js";

const port = Number(process.env.PORT) || 3000;
const root = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const rooms = new Map();
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function createCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 6 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function cleanName(value) {
  const name = String(value ?? "").trim().slice(0, 12);
  return name || "匿名玩家";
}

function cleanWord(value) {
  return String(value ?? "").trim().slice(0, 20);
}

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function broadcast(room) {
  const payload = JSON.stringify({ type: "room", room: publicRoom(room) });
  for (const player of room.players) {
    if (player.socket.readyState === WebSocket.OPEN) player.socket.send(payload);
  }
}

function fail(socket, message) {
  send(socket, { type: "error", message });
}

function reveal(room) {
  if (room.phase !== "thinking") return;
  clearTimeout(room.timer);
  const outcome = evaluateRound(room.players);
  for (const player of room.players) {
    if (!player.word) player.word = "（未提交）";
    player.readyNext = false;
  }
  room.result = outcome;
  room.phase = outcome.won ? "finished" : "reveal";
  room.deadline = null;
  room.history.push({
    round: room.round,
    words: room.players.map((player) => ({ name: player.name, word: player.word })),
  });
  broadcast(room);
}

function startRound(room) {
  if (room.players.length < 2) return false;
  clearTimeout(room.timer);
  room.round += 1;
  room.phase = "thinking";
  room.result = null;
  room.deadline = Date.now() + room.roundSeconds * 1000;
  for (const player of room.players) {
    player.word = "";
    player.readyNext = false;
  }
  room.timer = setTimeout(() => reveal(room), room.roundSeconds * 1000);
  broadcast(room);
  return true;
}

function leaveCurrentRoom(socket) {
  const room = rooms.get(socket.roomCode);
  if (!room) return;
  room.players = room.players.filter((player) => player.id !== socket.playerId);
  socket.roomCode = null;
  socket.playerId = null;

  if (room.players.length === 0) {
    clearTimeout(room.timer);
    rooms.delete(room.code);
    return;
  }

  if (room.hostId && !room.players.some((player) => player.id === room.hostId)) {
    room.hostId = room.players[0].id;
  }
  if (room.phase === "thinking" && room.players.every((player) => player.word)) reveal(room);
  else if (room.phase === "reveal" && canStartNextRound(room.players)) startRound(room);
  else broadcast(room);
}

function addPlayer(socket, room, name) {
  const player = {
    id: crypto.randomUUID(),
    name: cleanName(name),
    word: "",
    readyNext: false,
    socket,
  };
  room.players.push(player);
  socket.roomCode = room.code;
  socket.playerId = player.id;
  if (!room.hostId) room.hostId = player.id;
  send(socket, { type: "identity", playerId: player.id });
  broadcast(room);
}

function handleMessage(socket, raw) {
  let message;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    fail(socket, "消息格式错误");
    return;
  }

  if (message.type === "create") {
    leaveCurrentRoom(socket);
    const code = createCode();
    const room = {
      code,
      hostId: null,
      maxPlayers: message.maxPlayers === 3 ? 3 : 2,
      roundSeconds: Math.min(180, Math.max(15, Number(message.roundSeconds) || 60)),
      phase: "waiting",
      round: 0,
      deadline: null,
      result: null,
      history: [],
      players: [],
      timer: null,
    };
    rooms.set(code, room);
    addPlayer(socket, room, message.name);
    return;
  }

  if (message.type === "join") {
    leaveCurrentRoom(socket);
    const code = String(message.code ?? "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return fail(socket, "没有找到这个房间");
    if (room.phase !== "waiting") return fail(socket, "游戏已经开始");
    if (room.players.length >= room.maxPlayers) return fail(socket, "房间已经满员");
    addPlayer(socket, room, message.name);
    return;
  }

  const room = rooms.get(socket.roomCode);
  if (!room) return fail(socket, "请先创建或加入房间");
  const player = room.players.find((item) => item.id === socket.playerId);
  if (!player) return fail(socket, "玩家信息已失效");

  if (message.type === "start") {
    if (room.hostId !== player.id) return fail(socket, "只有房主可以开始回合");
    if (room.phase !== "waiting") return;
    if (!startRound(room)) fail(socket, "至少需要两名玩家");
    return;
  }

  if (message.type === "ready_next") {
    if (room.phase !== "reveal" || player.readyNext) return;
    player.readyNext = true;
    if (canStartNextRound(room.players)) startRound(room);
    else broadcast(room);
    return;
  }

  if (message.type === "submit") {
    if (room.phase !== "thinking") return fail(socket, "当前不能提交词语");
    const word = cleanWord(message.word);
    if (!word) return fail(socket, "请输入一个词语");
    player.word = word;
    broadcast(room);
    if (room.players.every((item) => item.word)) reveal(room);
  }
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("页面不存在");
  }
});

const allowedOrigins = new Set(
  String(process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const wss = new WebSocketServer({
  server,
  verifyClient: ({ origin }, done) => {
    const allowed = allowedOrigins.size === 0 || !origin || allowedOrigins.has(origin);
    done(allowed, allowed ? 200 : 403, allowed ? "" : "Origin not allowed");
  },
});
wss.on("connection", (socket) => {
  socket.on("message", (raw) => handleMessage(socket, raw));
  socket.on("close", () => leaveCurrentRoom(socket));
  send(socket, { type: "connected" });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`同词相见已启动：http://localhost:${port}`);
});

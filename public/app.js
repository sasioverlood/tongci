const state = {
  socket: null,
  playerId: null,
  room: null,
  selectedPlayers: 2,
  selectedTime: 60,
  countdown: null,
  historyCollapsed: false,
};

const elements = Object.fromEntries(
  [
    "homeView", "roomView", "nameInput", "serverInput", "codeInput", "createButton", "joinButton",
    "playerCount", "roundTime", "leaveButton", "copyCodeButton", "connectionBadge",
    "phaseLabel", "roundLabel", "timer", "gameTitle", "gameHint", "players",
    "thinkingControls", "wordInput", "submitButton", "hostControls", "historySection",
    "historyToggle", "history", "toast",
  ].map((id) => [id, document.getElementById(id)]),
);

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("show"), 2200);
}

function serverUrl() {
  const query = new URLSearchParams(location.search).get("server");
  if (query) localStorage.setItem("same-word-server", query);
  let value = elements.serverInput.value.trim() || query || window.GAME_SERVER_URL || "";
  if (!value) {
    if (location.protocol === "http:" || location.protocol === "https:") {
      if (location.hostname.endsWith("github.io")) {
        throw new Error("请先填写你电脑的联机服务器地址");
      }
      value = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
    }
  }
  value = value.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:").replace(/\/$/, "");
  if (!/^wss?:\/\//i.test(value)) throw new Error("服务器地址需要以 https://、wss://、http:// 或 ws:// 开头");
  if (location.protocol === "https:" && value.startsWith("ws://")) {
    throw new Error("HTTPS 页面只能连接 wss:// 安全服务器");
  }
  localStorage.setItem("same-word-server", value);
  elements.serverInput.value = value;
  return value;
}

function connect() {
  return new Promise((resolve, reject) => {
    if (state.socket?.readyState === WebSocket.OPEN) return resolve();
    let endpoint;
    try {
      endpoint = serverUrl();
    } catch (error) {
      reject(error);
      return;
    }
    const socket = new WebSocket(endpoint);
    state.socket = socket;
    elements.connectionBadge.textContent = "连接中";
    socket.addEventListener("open", () => {
      elements.connectionBadge.textContent = "已连接";
      resolve();
    }, { once: true });
    socket.addEventListener("error", reject, { once: true });
    socket.addEventListener("close", () => {
      elements.connectionBadge.textContent = "已断开";
      if (state.room) showToast("连接已断开，请刷新重试");
    });
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === "identity") state.playerId = message.playerId;
      if (message.type === "room") {
        state.room = message.room;
        renderRoom();
      }
      if (message.type === "error") showToast(message.message);
    });
  });
}

function send(payload) {
  if (state.socket?.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify(payload));
}

function selectedValue(container) {
  return Number(container.querySelector(".selected").dataset.value);
}

function playerName() {
  const name = elements.nameInput.value.trim();
  localStorage.setItem("same-word-name", name);
  return name;
}

function showRoomView() {
  elements.homeView.classList.remove("active");
  elements.roomView.classList.add("active");
}

function showHomeView() {
  elements.roomView.classList.remove("active");
  elements.homeView.classList.add("active");
}

function currentPlayer() {
  return state.room?.players.find((player) => player.id === state.playerId);
}

function renderPlayers(room) {
  const revealed = room.phase === "reveal" || room.phase === "finished";
  const cards = room.players.map((player, index) => {
    let content = `<div class="player-avatar">${escapeHtml(player.name.slice(0, 1))}</div>`;
    content += `<div class="player-name">${escapeHtml(player.name)}${player.id === room.hostId ? " · 房主" : ""}</div>`;
    if (revealed) content += `<div class="player-word">${escapeHtml(player.word)}</div>`;
    else if (room.phase === "thinking") content += `<div class="player-status">${player.submitted ? "✓ 已锁定" : "正在思考…"}</div>`;
    else content += `<div class="player-status">已加入</div>`;
    return `<article class="player player-tone-${index % 3} ${player.id === state.playerId ? "self" : ""}">${content}</article>`;
  });
  for (let index = room.players.length; index < room.maxPlayers; index += 1) {
    cards.push(`<article class="player empty-player"><div class="player-avatar">+</div><div class="player-name">等待加入</div></article>`);
  }
  elements.players.innerHTML = cards.join("");
}

function renderHistory(room) {
  elements.historySection.classList.toggle("hidden", room.history.length === 0);
  elements.history.classList.toggle("hidden", state.historyCollapsed);
  elements.historyToggle.textContent = `${state.historyCollapsed ? "展开" : "收起"}联想足迹 · ${room.history.length} 轮`;
  elements.history.innerHTML = room.history.map((item) => `
    <div class="history-round-block">
      <div class="history-round">第 ${item.round} 轮</div>
      <div class="history-cards" data-count="${item.words.length}">
        ${item.words.map((entry, index) => `
          ${index > 0 ? `<span class="history-separator">×</span>` : ""}
          <article class="history-answer player-tone-${index % 3}">
            <span>${escapeHtml(entry.name)}</span>
            <strong>${escapeHtml(entry.word)}</strong>
          </article>
        `).join("")}
      </div>
    </div>
  `).join("");
}

function renderControls(room) {
  const self = currentPlayer();
  const isHost = room.hostId === state.playerId;
  elements.thinkingControls.classList.toggle("hidden", room.phase !== "thinking" || self?.submitted);
  elements.hostControls.innerHTML = "";

  if (room.phase === "waiting") {
    if (isHost) {
      const ready = room.players.length >= 2;
      elements.hostControls.innerHTML = `<button class="primary-button" data-action="start" ${ready ? "" : "disabled"}>${ready ? "开始第一轮" : "等待朋友加入"}</button>`;
    } else {
      elements.hostControls.innerHTML = `<div class="host-note">等待房主开始游戏</div>`;
    }
  }

  if (room.phase === "thinking" && self?.submitted) {
    elements.hostControls.innerHTML = `<div class="host-note">答案已锁定，等待其他玩家提交</div>`;
  }

  if (room.phase === "reveal") {
    const readyCount = room.players.filter((player) => player.readyNext).length;
    elements.hostControls.innerHTML = self?.readyNext
      ? `<button class="primary-button ready-button" disabled>已确认 · 等待其他玩家（${readyCount}/${room.players.length}）</button>`
      : `<button class="primary-button" data-action="ready_next">继续下一轮（${readyCount}/${room.players.length}）</button>`;
  }

  if (room.phase === "finished") {
    elements.hostControls.innerHTML = `<div class="host-note">把房间码分享给朋友，再开一局吧。</div>`;
  }
}

function renderCopy(room) {
  const copy = {
    waiting: ["等待玩家", "邀请朋友加入", "复制房间码，等人到齐后由房主开始。"],
    thinking: ["独立联想", "写下此刻想到的词", "答案提交后不可修改，所有人完成后会同时揭晓。"],
    reveal: ["答案揭晓", "还差一点默契", "观察大家的答案，用这些词继续联想下一轮。"],
    finished: ["默契达成", `你们都想到了“${room.result?.word ?? "同一个词"}”`, `经过 ${room.round} 轮，你们终于在同一个词里相见。`],
  }[room.phase];
  elements.phaseLabel.textContent = copy[0];
  elements.gameTitle.textContent = copy[1];
  elements.gameHint.textContent = copy[2];
  elements.roundLabel.textContent = room.round ? `第 ${room.round} 轮` : `${room.players.length}/${room.maxPlayers} 人`;
}

function updateTimer() {
  clearInterval(state.countdown);
  const tick = () => {
    if (!state.room || state.room.phase !== "thinking" || !state.room.deadline) {
      elements.timer.textContent = state.room?.phase === "finished" ? "✓" : "--";
      return;
    }
    const seconds = Math.max(0, Math.ceil((state.room.deadline - Date.now()) / 1000));
    elements.timer.textContent = seconds;
  };
  tick();
  state.countdown = setInterval(tick, 250);
}

function renderRoom() {
  const room = state.room;
  if (!room) return;
  showRoomView();
  elements.copyCodeButton.textContent = room.code;
  renderCopy(room);
  renderPlayers(room);
  renderControls(room);
  renderHistory(room);
  updateTimer();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

for (const container of [elements.playerCount, elements.roundTime]) {
  container.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    container.querySelectorAll("button").forEach((item) => item.classList.remove("selected"));
    button.classList.add("selected");
  });
}

elements.createButton.addEventListener("click", async () => {
  try {
    await connect();
    send({
      type: "create",
      name: playerName(),
      maxPlayers: selectedValue(elements.playerCount),
      roundSeconds: selectedValue(elements.roundTime),
    });
  } catch (error) {
    showToast(error.message || "无法连接游戏服务");
  }
});

elements.joinButton.addEventListener("click", async () => {
  const code = elements.codeInput.value.trim();
  if (code.length !== 6) return showToast("请输入 6 位房间码");
  try {
    await connect();
    send({ type: "join", code, name: playerName() });
  } catch (error) {
    showToast(error.message || "无法连接游戏服务");
  }
});

elements.hostControls.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (button) send({ type: button.dataset.action });
});

elements.historyToggle.addEventListener("click", () => {
  state.historyCollapsed = !state.historyCollapsed;
  if (state.room) renderHistory(state.room);
});

elements.submitButton.addEventListener("click", () => {
  const word = elements.wordInput.value.trim();
  if (!word) return showToast("先写下一个词吧");
  send({ type: "submit", word });
  elements.wordInput.value = "";
});

elements.wordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") elements.submitButton.click();
});

elements.copyCodeButton.addEventListener("click", async () => {
  const inviteUrl = new URL(location.href);
  inviteUrl.search = "";
  inviteUrl.searchParams.set("room", state.room.code);
  inviteUrl.searchParams.set("server", serverUrl());
  const text = `来和我玩「同词相见」！房间码：${state.room.code}\n${inviteUrl}`;
  await navigator.clipboard.writeText(text);
  showToast("邀请信息已复制");
});

elements.leaveButton.addEventListener("click", () => {
  state.socket?.close();
  state.socket = null;
  state.room = null;
  state.playerId = null;
  clearInterval(state.countdown);
  showHomeView();
});

elements.nameInput.value = localStorage.getItem("same-word-name") || "";
elements.serverInput.value = new URLSearchParams(location.search).get("server") || localStorage.getItem("same-word-server") || window.GAME_SERVER_URL || "";
const codeFromUrl = new URLSearchParams(location.search).get("room");
if (codeFromUrl) elements.codeInput.value = codeFromUrl.toUpperCase();

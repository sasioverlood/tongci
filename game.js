export function normalizeWord(word) {
  return word.trim().replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
}

export function evaluateRound(players) {
  const submitted = players.filter((player) => player.word);
  if (submitted.length !== players.length || players.length < 2) {
    return { won: false, word: null };
  }

  const normalizedWords = submitted.map((player) => normalizeWord(player.word));
  const firstWord = normalizedWords[0];
  const won = Boolean(firstWord) && normalizedWords.every((word) => word === firstWord);

  return {
    won,
    word: won ? submitted[0].word.trim() : null,
  };
}

export function canStartNextRound(players) {
  return players.length >= 2 && players.every((player) => player.readyNext);
}

export function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    maxPlayers: room.maxPlayers,
    roundSeconds: room.roundSeconds,
    phase: room.phase,
    round: room.round,
    deadline: room.deadline,
    result: room.result,
    history: room.history,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      submitted: Boolean(player.word),
      readyNext: Boolean(player.readyNext),
      word: room.phase === "reveal" || room.phase === "finished" ? player.word : null,
    })),
  };
}

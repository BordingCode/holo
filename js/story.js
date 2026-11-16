// Between-run story: Nell, the night clerk, says one thing after every finished run.
// Order of priority: the first time a boss beats you → a tip about that boss; otherwise the next story
// beat (one per run, in order) → once the story is told, short lines that react to how the run went.
// Pure logic: takes the meta object + the finished run, returns { text, kind, beat }.

export const CLERK = { name: 'Nell', title: 'the night clerk', icon: 'desk-lamp' };

export const STORY = [
  "Oh — you're still here? The shop closed hours ago. Funny thing about this place: after the lights go out, the stock wakes up. Most people run. You ripped a pack.",
  "I'm Nell. Night clerk. I count the till, I sweep the aisles, and I don't ask what moves on the shelves. That row of six of yours? That's how the cards fight back. Order matters. It always has.",
  "The Shredder used to be for damaged stock. Bent corners, water stains. Then one night it started eating the good cards too. It always bites from the left.",
  "The man who built this shop never sold a single rare. Not one. Customers would beg, and he'd smile and lock the case. People called him the Proprietor. Nobody ever saw him leave.",
  "The Collector was his best customer. Bought everything, paid for nothing. Said he'd settle up \"at the end\". He's still upstairs, waiting for the end.",
  "The Laminator was a gift — to protect the cards forever. It wrapped them so tight nobody could ever touch them again. It calls that protection. Your Block means nothing to it.",
  "The Rubber Band Ball? Every band from every bundle of bulk commons. Forty years of them. It remembers being thrown away. That's why it throws things back.",
  "The Appraiser graded every card that came through the door. The plain ones it barely looked at. If you want it to notice you, bring something shiny.",
  "You know what a sealed pack is? A promise. Every one might hold the card. That's what keeps the stock awake at night — and what keeps you coming back.",
  "I found the old ledger last night. Every card the Proprietor ever sold, he bought back the next day at double the price. He wasn't keeping a shop. He was keeping a collection.",
  "Some nights I think the Proprietor wants to be beaten. At closing time your row runs backward — like he's trying to undo something he did a long time ago.",
  "Here's what nobody tells you: the shop doesn't want to be emptied. It wants to be played. As long as somebody rips the packs, it stays alive. Me too, I think. Same time tomorrow?",
];

// the first time each boss ends your run
export const BOSS_TIPS = {
  shredder: "The Shredder got you? It eats your leftmost card, every other round. Next time, lead with something you won't miss.",
  rubber_ball: "Bounced, huh. The first hit each round never lands on that thing — half of it comes back at you. Put your weakest card first and let it take the bounce.",
  collector: "The Collector took your best card, didn't he? He always grabs the rarest one in your row. Sometimes a spare rare is worth carrying as a decoy.",
  laminator: "Block does nothing against the Laminator — it goes straight through. Thorns do something. Healing does. Hitting it hard and early does.",
  proprietor: "Closing time. At half health he turns the lights out and your row fires right to left. Build a row that works in both directions.",
  appraiser: "The Appraiser shrugged off your plain cards, didn't it? Foil, Holo, Gilded, Misprint, even Cracked — those it takes seriously.",
};

const FIRST_WIN = "You did it. The lights came back on at six and the stock went quiet — first time in years. The Proprietor just… nodded. I'll leave the back door unlocked tomorrow. Bring some Heat.";
const WIN_LINES = [
  "Another clean shelf. On his way down, the Proprietor tipped his hat. I swear he did.",
  "The till balances, the shelves are quiet, and you look like you slept on a pallet. Good night's work.",
  "The Collector left an IOU on the counter. Made out to you. I wouldn't count on it.",
];
const EARLY_LINES = [
  "The bottom shelf is meaner than it looks. Rip every pack you can early — each card is another chance.",
  "Rough night. Even the dust bunnies bite after hours. Try a different path on the map — there's always a softer door.",
];
const LATE_LINES = [
  "So close. Up there it's about the row, not the cards — what fires first, what fires twice.",
  "You made it further than most. The shop noticed. It always does.",
  "Lost a good row tonight. The packs will still be here tomorrow. So will I.",
];

const pick = (arr, n) => arr[n % arr.length];

// Decide the line for a finished run and move the story along. Call once per run.
export function nightLine(meta, run) {
  const S = (meta.story ||= { beat: 0, tips: {}, n: 0 });
  S.n++;
  const win = run.over === 'win';
  if (win && !S.firstWin) { S.firstWin = true; return { kind: 'win', text: FIRST_WIN }; }
  const tip = !win && run.killedById && BOSS_TIPS[run.killedById];
  if (tip && !S.tips[run.killedById]) { S.tips[run.killedById] = true; return { kind: 'tip', text: tip }; }
  if (S.beat < STORY.length) { const beat = S.beat++; return { kind: 'story', text: STORY[beat], beat: beat + 1, of: STORY.length }; }
  if (win) return { kind: 'win', text: pick(WIN_LINES, S.n) };
  return { kind: 'loss', text: run.act <= 1 ? pick(EARLY_LINES, S.n) : pick(LATE_LINES, S.n) };
}

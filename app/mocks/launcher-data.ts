export const launcherSections = [
  { id: "my-apps", label: "My Apps", symbol: "[A]" },
  { id: "quests", label: "Quest System", symbol: "[Q]" },
  { id: "achievements", label: "Achievement System", symbol: "[C]" },
  { id: "settings", label: "Settings", symbol: "[S]" },
] as const;

export const mockStatus = {
  playerName: "Ranger Nova",
  region: "Neo Shanghai",
  level: 12,
  stamina: 78,
  morale: 66,
  credits: 1420,
  streakDays: 9,
};

export const mockPinnedApps = [
  { name: "Atlas Mail", type: "Communication" },
  { name: "Terra Maps", type: "Navigation" },
  { name: "Guild Notes", type: "Productivity" },
  { name: "Pulse Radio", type: "Media" },
];

export const mockQuests = [
  { title: "Open 3 useful tabs", progress: 2, target: 3, reward: "+40 XP" },
  { title: "Bookmark one learning source", progress: 1, target: 1, reward: "+1 Token" },
  { title: "Finish inbox triage", progress: 4, target: 6, reward: "+25 XP" },
];

export const mockAchievements = [
  { title: "First Login", unlocked: true, detail: "Entered Earth Online launcher." },
  { title: "Rising Explorer", unlocked: true, detail: "Reached level 10." },
  { title: "Task Conqueror", unlocked: false, detail: "Complete 20 quests." },
];

export const mockSettings = [
  { key: "Ambient Audio", value: "On" },
  { key: "Event Alerts", value: "Compact" },
  { key: "Wall Style", value: "Guild Banner" },
];

export const mockEvents = [
  "Daily quest board synchronized.",
  "Stamina recovered by 4 percent.",
  "Guild scout recommends checking Terra Maps.",
  "Achievement tracker saved local checkpoint.",
  "One quick action can unlock bonus credits.",
  "Event pulse updated from mock timeline.",
  "Marketplace rumor: crafting prices are stable.",
  "New side mission is available for review.",
];

export type InteractionPrompt = {
  id: string;
  title: string;
  hint: string;
  options: string[];
};

export const mockInteractionPrompts: InteractionPrompt[] = [
  {
    id: "p-1",
    title: "A traveler asks for route assistance.",
    hint: "Choose one response to continue the mock storyline.",
    options: ["Share map route", "Open Terra Maps", "Decline politely"],
  },
  {
    id: "p-2",
    title: "Your guild requests a focus session.",
    hint: "Selecting a response updates local event flow only.",
    options: ["Start 20-minute focus", "Postpone for later", "View quest rewards"],
  },
  {
    id: "p-3",
    title: "A mystery merchant sends a quick offer.",
    hint: "This is a mock interaction card without backend calls.",
    options: ["Inspect offer", "Ask for details", "Ignore message"],
  },
  {
    id: "p-4",
    title: "Companion ping: choose your next action.",
    hint: "The selected option will be echoed in the event stream.",
    options: ["Accept party invite", "Stay solo", "Open settings panel"],
  },
];

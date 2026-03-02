const starterQuests = [
  "Complete your first daily check-in",
  "Pin one useful website to your launcher",
  "Unlock the first achievement badge",
];

export default function HomePage() {
  return (
    <main className="launcher">
      <section className="hero">
        <p className="kicker">Earth Online</p>
        <h1>Browser Launcher</h1>
        <p className="subtitle">A graphical RPG-style start page with quests and achievements.</p>
      </section>

      <section className="panel">
        <h2>Starter Quests</h2>
        <ul>
          {starterQuests.map((quest) => (
            <li key={quest}>{quest}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/jetbrains-mono";
import "./popup.css";
import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Auto } from "./Auto";
import { History } from "./History";
import { Home } from "./Home";
import { call, Icon, Lantern, type State } from "./lib";
import { Lock, Onboard } from "./Onboard";
import { Send } from "./Send";
import { Settings } from "./Settings";

// Opened from a GitHub button as its own window (popup.html#send?to=octocat): no fixed popup size.
if (new URLSearchParams(location.search).has("window") || window.outerWidth > 420) document.body.classList.add("window");

const parseRoute = () => {
  const [path = "home", query = ""] = location.hash.slice(1).split("?");
  return { path: path || "home", query: new URLSearchParams(query) };
};

function App() {
  const [state, setState] = useState<State | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [route, setRoute] = useState(parseRoute);
  // The service worker may be starting (or restarting after an update): retry a few times before showing the error.
  const refresh = useCallback(() => {
    let alive = true;
    void (async () => {
      for (let i = 0; i < 6 && alive; i++) {
        try {
          setState(await call<State>("state"));
          setLoadErr(null);
          return;
        } catch (e) {
          setLoadErr((e as Error).message);
          await new Promise((r) => setTimeout(r, 300 * (i + 1)));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  useEffect(refresh, [refresh]);
  useEffect(() => {
    const on = () => setRoute(parseRoute());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  const go = (path: string) => (location.hash = path);

  if (!state)
    return (
      <div className="app">
        <main>
          <div className="skel" style={{ height: 120 }} />
          {loadErr && (
            <>
              <div className="notice err">The extension's background didn't answer: {loadErr}</div>
              <button className="secondary" onClick={() => location.reload()}>Retry</button>
            </>
          )}
        </main>
      </div>
    );
  const ready = state.hasVault && state.unlocked && state.profile;
  const synced = ready; // the Home card shows sync state itself

  return (
    <div className="app">
      <header className="top">
        <Lantern size={22} />
        <span className="wordmark">sereno</span>
        {state.profile && (
          <span className="who">
            {state.profile.avatarUrl && <img className="avatar" src={state.profile.avatarUrl} alt="" />}@{state.profile.login}
          </span>
        )}
        {state.hasVault && state.unlocked && (
          <button className="icon-btn" title="Lock" onClick={async () => { await call("lock"); refresh(); }} style={{ marginLeft: state.profile ? 0 : "auto" }}>
            <Icon name="lock" size={15} />
          </button>
        )}
      </header>
      {!state.hasVault || (state.unlocked && !state.profile) ? (
        <Onboard state={state} onDone={refresh} />
      ) : !state.unlocked ? (
        <Lock onDone={refresh} />
      ) : route.path === "send" ? (
        <Send state={state} initial={route.query} done={() => go("home")} />
      ) : route.path === "history" ? (
        <History />
      ) : route.path === "auto" ? (
        <Auto state={state} refresh={refresh} />
      ) : route.path === "settings" ? (
        <Settings state={state} refresh={refresh} />
      ) : (
        <Home state={state} go={go} />
      )}
      {synced && (
        <nav className="tabs">
          {[["home", "home", "Home"], ["send", "send", "Send"], ["history", "history", "History"], ["auto", "bolt", "Automate"], ["settings", "gear", "Settings"]].map(([path, icon, label]) => (
            <button key={path} className={route.path === path ? "on" : ""} onClick={() => go(path!)}>
              <Icon name={icon!} size={18} />
              {label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

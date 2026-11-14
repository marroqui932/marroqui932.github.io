import { lazy, Suspense, useEffect, useState } from "react";
import { Hub } from "./hub/Hub";

// Chaque jeu n'est chargé que lorsqu'on l'ouvre : le hub s'affiche tout de suite.
const MonopolyApp = lazy(() => import("./MonopolyApp").then((m) => ({ default: m.MonopolyApp })));
const UnoApp = lazy(() => import("./games/uno/UnoApp").then((m) => ({ default: m.UnoApp })));
const LoupApp = lazy(() => import("./games/loup/LoupApp").then((m) => ({ default: m.LoupApp })));

function useRoute(): string {
  const read = () => window.location.hash.replace(/^#\/?/, "").split("?")[0] ?? "";
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

function Loading() {
  return (
    <div className="loading-screen">
      <span className="loading-logo">3AJIB GAMES</span>
      <span className="loading-bar" />
    </div>
  );
}

export function App() {
  const route = useRoute();
  let page = <Hub />;
  if (route === "monopoly") page = <MonopolyApp />;
  else if (route === "uno") page = <UnoApp />;
  else if (route === "loup") page = <LoupApp />;
  return <Suspense fallback={<Loading />}>{page}</Suspense>;
}

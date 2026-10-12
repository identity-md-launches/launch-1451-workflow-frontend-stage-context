import {
  useEffect,
  useState,
  Component,
  type ReactNode,
  type ErrorInfo,
} from "react";
import { Shell } from "./components/Shell";
import { Markets } from "./components/Markets";
import { MarketDetail } from "./components/MarketDetail";
import { CreateMarket } from "./components/CreateMarket";
import { Trade } from "./components/Trade";
import { Protocol } from "./components/Protocol";
import { HowItWorks } from "./components/HowItWorks";
import { AppProvider } from "./context";
function Routes() {
  const [route, setRoute] = useState(location.hash.slice(1) || "markets");
  useEffect(() => {
    const handle = () => {
      setRoute(location.hash.slice(1) || "markets");
      window.scrollTo(0, 0);
      window.setTimeout(
        () =>
          document
            .getElementById("main-content")
            ?.focus({ preventScroll: true }),
        0,
      );
    };
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, []);
  useEffect(() => {
    document.title = `The Tribunal — ${route === "create" ? "Create a market" : route === "trade" ? "Get VERDICT" : route === "protocol" ? "Protocol" : route === "how" ? "How it works" : route.startsWith("market/") ? "Case " + route.split("/")[1] : "Prediction markets"}`;
  }, [route]);
  let page: ReactNode;
  if (/^market\/[1-9]\d*$/.test(route))
    page = <MarketDetail key={route} id={BigInt(route.split("/")[1])} />;
  else if (route === "markets") page = <Markets />;
  else if (route === "create") page = <CreateMarket />;
  else if (route === "trade") page = <Trade />;
  else if (route === "protocol") page = <Protocol />;
  else if (route === "how") page = <HowItWorks />;
  else
    page = (
      <section className="page-section">
        <h1>Case not found.</h1>
        <p>This route is not part of the public docket.</p>
        <a href="#markets" className="button outline">
          Return to markets
        </a>
      </section>
    );
  return <Shell route={route}>{page}</Shell>;
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "Tribunal rendering error",
      error.message,
      info.componentStack,
    );
  }
  render() {
    return this.state.error ? (
      <main className="wrap page-section">
        <h1>The case file could not open.</h1>
        <p>
          An unexpected display error occurred. Reload the verified export to
          try again.
        </p>
        <button className="button primary" onClick={() => location.reload()}>
          Reload Tribunal
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Routes />
      </AppProvider>
    </ErrorBoundary>
  );
}

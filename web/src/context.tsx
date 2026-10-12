import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getAddress,
  numberToHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import {
  loadRuntime,
  publicClient,
  walletClient,
  type ReadClient,
} from "./config";
import { readState, verifyDeployment } from "./chain";
import { eq, errorText } from "./domain";
import type {
  ChainState,
  Runtime,
  TxStatus,
  WalletOption,
  WalletProvider,
} from "./types";
export type TxSpec = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  validUntil?: number;
};
type AppContext = {
  runtime?: Runtime;
  client?: ReadClient;
  configError?: string;
  state?: ChainState;
  readError?: string;
  loading: boolean;
  refreshing: boolean;
  account?: Address;
  walletChain?: number;
  walletName?: string;
  wallets: WalletOption[];
  walletError?: string;
  connecting: boolean;
  connect: (id?: string) => Promise<void>;
  disconnect: () => void;
  switchChain: () => Promise<void>;
  refresh: () => Promise<void>;
  page: number;
  setPage: (page: number) => void;
  now: number;
  ready: boolean;
  statuses: Record<string, TxStatus>;
  busy: boolean;
  send: (key: string, label: string, spec: TxSpec) => Promise<boolean>;
};
const Context = createContext<AppContext | null>(null);
export const useApp = () => {
  const value = useContext(Context);
  if (!value) throw Error("App context missing");
  return value;
};
export function AppProvider({ children }: { children: ReactNode }) {
  const [runtime, setRuntime] = useState<Runtime>();
  const [configError, setConfigError] = useState<string>();
  const [state, setState] = useState<ChainState>();
  const [readError, setReadError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [account, setAccount] = useState<Address>();
  const [walletChain, setWalletChain] = useState<number>();
  const [provider, setProvider] = useState<WalletProvider>();
  const [walletName, setWalletName] = useState<string>();
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [walletError, setWalletError] = useState<string>();
  const [connecting, setConnecting] = useState(false);
  const [page, setPage] = useState(0);
  const [walletVersion, setWalletVersion] = useState(0);
  const [statuses, setStatuses] = useState<Record<string, TxStatus>>({});
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(Date.now());
  const lock = useRef(false);
  const epoch = useRef(0);
  const activeRead = useRef<symbol | null>(null);
  const accountRef = useRef(account);
  accountRef.current = account;
  const providerRef = useRef(provider);
  providerRef.current = provider;
  const chainRef = useRef(walletChain);
  chainRef.current = walletChain;
  useEffect(() => {
    loadRuntime()
      .then(setRuntime)
      .catch((error) => setConfigError(errorText(error)));
  }, []);
  useEffect(() => {
    const add = (option: WalletOption) =>
      setWallets((old) =>
        old.some((x) => x.provider === option.provider)
          ? old
          : [...old, option],
      );
    const announced = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          info: { uuid: string; name: string };
          provider: WalletProvider;
        }>
      ).detail;
      if (detail?.provider)
        add({
          id: detail.info.uuid,
          name: detail.info.name,
          provider: detail.provider,
        });
    };
    window.addEventListener("eip6963:announceProvider", announced);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const injected = (window as Window & { ethereum?: WalletProvider })
      .ethereum;
    if (injected)
      add({
        id: "injected",
        name: injected.isMetaMask ? "MetaMask" : "Browser wallet",
        provider: injected,
      });
    return () =>
      window.removeEventListener("eip6963:announceProvider", announced);
  }, []);
  const client = useMemo(
    () =>
      runtime
        ? publicClient(
            runtime,
            account && walletChain === runtime.deployment.chainId
              ? provider
              : undefined,
          )
        : undefined,
    [runtime, provider, account, walletChain],
  );
  const disconnect = useCallback(() => {
    epoch.current++;
    setAccount(undefined);
    accountRef.current = undefined;
    setProvider(undefined);
    providerRef.current = undefined;
    setWalletName(undefined);
    setWalletChain(undefined);
    setWalletError(undefined);
    setState(undefined);
  }, []);
  useEffect(() => {
    if (!provider) return;
    const accountsChanged = (accounts: Address[]) => {
      epoch.current++;
      setWalletVersion((v) => v + 1);
      const next = accounts[0] ? getAddress(accounts[0]) : undefined;
      accountRef.current = next;
      setAccount(next);
      setState(undefined);
    };
    const chainChanged = (id: string) => {
      epoch.current++;
      setWalletVersion((v) => v + 1);
      chainRef.current = Number(id);
      setWalletChain(Number(id));
      setState(undefined);
    };
    const onDisconnect = () => disconnect();
    provider.on?.("accountsChanged", accountsChanged);
    provider.on?.("chainChanged", chainChanged);
    provider.on?.("disconnect", onDisconnect);
    return () => {
      provider.removeListener?.("accountsChanged", accountsChanged);
      provider.removeListener?.("chainChanged", chainChanged);
      provider.removeListener?.("disconnect", onDisconnect);
    };
  }, [provider, disconnect]);
  const connect = useCallback(
    async (id?: string) => {
      if (connecting) return;
      setConnecting(true);
      setWalletError(undefined);
      try {
        const selected = wallets.find((x) => x.id === id) ?? wallets[0];
        if (!selected)
          throw Error(
            "No browser wallet found. Open this site in an Ethereum wallet browser or install an EIP-1193 browser wallet, then reload.",
          );
        const accounts = await selected.provider.request({
          method: "eth_requestAccounts",
        });
        if (!accounts.length)
          throw Error(
            "The wallet returned no accounts. Unlock it and try again.",
          );
        const chain = await selected.provider.request({
          method: "eth_chainId",
        });
        epoch.current++;
        setState(undefined);
        setProvider(selected.provider);
        providerRef.current = selected.provider;
        setWalletName(selected.name);
        const next = getAddress(accounts[0]);
        setAccount(next);
        accountRef.current = next;
        setWalletChain(Number(chain));
        chainRef.current = Number(chain);
      } catch (error) {
        setWalletError(errorText(error));
      } finally {
        setConnecting(false);
      }
    },
    [wallets, connecting],
  );
  const switchChain = useCallback(async () => {
    if (!runtime || !provider || connecting) return;
    setConnecting(true);
    setWalletError(undefined);
    const chainId = numberToHex(runtime.deployment.chainId);
    try {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId }],
        });
      } catch (error) {
        const value = error as {
          code?: number;
          message?: string;
          data?: { originalError?: { code?: number } };
        };
        if (
          value.code !== 4902 &&
          value.data?.originalError?.code !== 4902 &&
          !/unknown chain|unrecognized chain|not added/i.test(
            value.message ?? "",
          )
        )
          throw error;
        if (!runtime.deployment.walletAddChain)
          throw Error(
            "This wallet does not know the required chain and no add-chain configuration is available.",
          );
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [runtime.deployment.walletAddChain],
        });
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId }],
        });
      }
      const actual = Number(await provider.request({ method: "eth_chainId" }));
      epoch.current++;
      setWalletChain(actual);
      chainRef.current = actual;
      setState(undefined);
      if (actual !== runtime.deployment.chainId)
        throw Error(
          "The wallet is still on another network. Switch networks in your wallet and retry.",
        );
    } catch (error) {
      setWalletError(errorText(error));
    } finally {
      setConnecting(false);
    }
  }, [runtime, provider, connecting]);
  const refresh = useCallback(async () => {
    if (!runtime || !client || account !== accountRef.current) return;
    const token = Symbol();
    activeRead.current = token;
    const version = epoch.current;
    setRefreshing(true);
    try {
      const fresh = await readState(client, runtime, account, page);
      if (version === epoch.current && activeRead.current === token) {
        setState(fresh);
        setReadError(undefined);
      }
    } catch (error) {
      if (version === epoch.current && activeRead.current === token)
        setReadError(errorText(error));
    } finally {
      if (activeRead.current === token) {
        setRefreshing(false);
        activeRead.current = null;
      }
    }
  }, [runtime, client, account, page, walletVersion]);
  useEffect(() => {
    void refresh();
    return () => {
      activeRead.current = null;
    };
  }, [refresh]);
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!document.hidden && !activeRead.current) void refresh();
    }, 15000);
    // Explicit visibility refresh avoids stale deadlines when returning to a background tab.
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const now = state
    ? state.timestamp + Math.floor((tick - state.fetchedAt) / 1000)
    : Math.floor(tick / 1000);
  const ready =
    !!runtime &&
    !!state &&
    !readError &&
    !!account &&
    walletChain === runtime.deployment.chainId &&
    tick - state.fetchedAt < 60000;
  const send = useCallback(
    async (key: string, label: string, spec: TxSpec) => {
      if (lock.current) return false;
      lock.current = true;
      setBusy(true);
      const update = (status: Omit<TxStatus, "label">) =>
        setStatuses((old) => ({ ...old, [key]: { ...status, label } }));
      update({ stage: "simulating" });
      let hash: Hex | undefined;
      try {
        if (!ready || !runtime || !client || !provider || !account)
          throw Error(
            "Connect on the required network and refresh verified contract state before continuing.",
          );
        const version = epoch.current;
        const checkWallet = async () => {
          const [chain, accounts] = await Promise.all([
            provider.request({ method: "eth_chainId" }),
            provider.request({ method: "eth_accounts" }),
          ]);
          if (
            version !== epoch.current ||
            providerRef.current !== provider ||
            !eq(accounts[0], account) ||
            !eq(accountRef.current, account) ||
            Number(chain) !== runtime.deployment.chainId
          )
            throw Error(
              "The wallet account or network changed. Review the action again.",
            );
        };
        await checkWallet();
        await verifyDeployment(client, runtime);
        const code = await client.getCode({ address: spec.address });
        if (!code || code === "0x")
          throw Error(
            "The target contract has no code. No transaction was sent.",
          );
        const { validUntil, ...call } = spec;
        if (validUntil && Date.now() >= validUntil)
          throw Error(
            "The reviewed quote expired. Get a fresh quote before signing.",
          );
        const simulation = await client.simulateContract({ ...call, account });
        await checkWallet();
        if (validUntil && Date.now() >= validUntil)
          throw Error(
            "The reviewed quote expired during simulation. Get a fresh quote.",
          );
        update({ stage: "signature" });
        hash = await walletClient(runtime, provider, account).writeContract(
          simulation.request,
        );
        update({ stage: "confirming", hash });
        let replaced = false;
        const receipt = await client.waitForTransactionReceipt({
          hash,
          confirmations: 1,
          timeout: 180000,
          onReplaced: ({ reason, transaction }) => {
            hash = transaction.hash;
            replaced = reason !== "repriced";
            update({ stage: "confirming", hash });
          },
        });
        if (replaced)
          throw Error(
            "The wallet cancelled or replaced the requested transaction. Inspect the replacement before taking another action.",
          );
        if (receipt.status !== "success")
          throw Error(
            "The transaction reverted onchain. Gas may have been spent. Refresh before retrying.",
          );
        // Read fresh balances/allowances before releasing the transaction lock.
        await refresh();
        update({ stage: "confirmed", hash });
        return true;
      } catch (error) {
        update({
          stage: "error",
          hash,
          message: hash
            ? `${errorText(error)} Check the transaction in the explorer before retrying; it may still confirm.`
            : errorText(error),
        });
        return false;
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [ready, runtime, client, provider, account, refresh],
  );
  return (
    <Context.Provider
      value={{
        runtime,
        client,
        configError,
        state,
        readError,
        loading: !configError && !state && !readError,
        refreshing,
        account,
        walletChain,
        walletName,
        wallets,
        walletError,
        connecting,
        connect,
        disconnect,
        switchChain,
        refresh,
        page,
        setPage,
        now,
        ready,
        statuses,
        busy,
        send,
      }}
    >
      {children}
    </Context.Provider>
  );
}

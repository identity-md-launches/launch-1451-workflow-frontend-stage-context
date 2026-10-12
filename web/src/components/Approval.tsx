import { useCallback, useEffect, useState, type ReactNode } from "react";
import { erc20Abi } from "../config";
import { useApp, type TxSpec } from "../context";
import { errorText, units } from "../domain";
import type { Address } from "viem";
import type { Token } from "../types";
import { AddressView, TxAction } from "./ui";
export type ApprovalNeed = {
  token: Token;
  spender: Address;
  amount: bigint;
  name: string;
};
export function ApprovalAction({
  needs,
  actionKey,
  label,
  description,
  prepare,
  disabledReason,
  onSuccess,
}: {
  needs: ApprovalNeed[];
  actionKey: string;
  label: string;
  description: ReactNode;
  prepare: () => TxSpec | Promise<TxSpec>;
  disabledReason?: string;
  onSuccess?: () => void | Promise<void>;
}) {
  const app = useApp();
  const [allowances, setAllowances] = useState<bigint[]>();
  const [error, setError] = useState("");
  const signature = needs
    .map((n) => `${n.token.address}:${n.spender}:${n.amount}`)
    .join("|");
  const refresh = useCallback(async () => {
    if (!app.client || !app.account || !app.ready) {
      setAllowances(undefined);
      return;
    }
    try {
      const result = await Promise.all(
        needs.map((n) =>
          app.client!.readContract({
            address: n.token.address,
            abi: erc20Abi,
            functionName: "allowance",
            args: [app.account!, n.spender],
          }),
        ),
      );
      setAllowances(result);
      setError("");
    } catch (error) {
      setAllowances(undefined);
      setError(errorText(error));
    }
  }, [app.client, app.account, app.ready, signature, app.state?.block]);
  useEffect(() => {
    setAllowances(undefined);
    void refresh();
  }, [refresh]);
  const index =
    allowances?.findIndex((allowance, i) => allowance < needs[i].amount) ?? -1;
  const need = index >= 0 ? needs[index] : undefined;
  const tokenAbi = (address: Address) =>
    app.runtime?.contracts.LaunchToken.address.toLowerCase() ===
    address.toLowerCase()
      ? app.runtime.contracts.LaunchToken.abi
      : erc20Abi;
  const reason =
    disabledReason ||
    error ||
    (app.ready && !allowances
      ? "Checking current token allowances…"
      : undefined);
  return (
    <div>
      {need ? (
        <>
          <p className="step-label">
            Approval {index + 1} of {needs.length} · {need.token.symbol}
          </p>
          <TxAction
            actionKey={`${actionKey}-approve-${index}`}
            label={`Approve ${need.token.symbol}`}
            disabledReason={reason}
            description={
              <>
                <p>
                  Allow {need.name} to spend exactly{" "}
                  <strong>
                    {units(
                      need.amount,
                      need.token.decimals,
                      need.token.decimals,
                    )}{" "}
                    {need.token.symbol}
                  </strong>
                  . This approval does not place a bet, create a market, or
                  swap.
                </p>
                <p>
                  Spender: <AddressView address={need.spender} compact />
                </p>
              </>
            }
            prepare={() => ({
              address: need.token.address,
              abi: tokenAbi(need.token.address),
              functionName: "approve",
              args: [need.spender, need.amount],
            })}
            onSuccess={refresh}
          />
        </>
      ) : (
        <TxAction
          actionKey={actionKey}
          label={label}
          description={description}
          disabledReason={reason}
          prepare={async () => {
            if (!app.account || !app.client)
              throw Error("Connect your wallet first.");
            for (const n of needs) {
              const current = await app.client.readContract({
                address: n.token.address,
                abi: erc20Abi,
                functionName: "allowance",
                args: [app.account, n.spender],
              });
              if (current < n.amount) {
                await refresh();
                throw Error(
                  "An allowance changed. Review and approve the required amount.",
                );
              }
            }
            return prepare();
          }}
          onSuccess={onSuccess}
        />
      )}
    </div>
  );
}

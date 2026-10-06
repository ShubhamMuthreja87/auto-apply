/**
 * One read from the API as loading / error / ready state, so every view renders
 * all three. It reloads when `key` changes and ignores answers that arrive
 * after a newer load started or the component unmounted.
 */
import { useEffect, useState } from "react";
import { ApiError, messageOf } from "./api";

/** `code` is the contract's error code when the API answered with one. */
export type LoadState<T> =
  | { kind: "loading" }
  | { kind: "error"; message: string; code: string | null }
  | { kind: "ready"; data: T };

export function useLoad<T>(load: () => Promise<T>, key: string): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ kind: "loading" });

  useEffect(() => {
    let current = true;
    setState({ kind: "loading" });
    load()
      .then((data) => {
        if (current) setState({ kind: "ready", data });
      })
      .catch((err: unknown) => {
        if (!current) return;
        setState({
          kind: "error",
          message: messageOf(err),
          code: err instanceof ApiError ? err.code : null,
        });
      });
    return () => {
      current = false;
    };
    // `load` is a fresh closure every render; `key` names what it loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

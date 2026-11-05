import { useCallback } from "react";
import { useNavigate } from "react-router";

/**
 * Client-side navigation that keeps the embedded app session alive.
 * Avoid plain href on in-app routes — that drops shop/host params and shows /auth/login.
 */
export function useAppNavigate() {
  const navigate = useNavigate();

  return useCallback(
    (to: string) => {
      navigate(to);
    },
    [navigate],
  );
}

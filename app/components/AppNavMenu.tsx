import { NavMenu } from "@shopify/app-bridge-react";
import { useNavigate } from "react-router";
import { useAppLayoutData } from "../hooks/useAppLayoutData";
import { hasAnalyticsAccess } from "../lib/billing.plans";

const BASE_NAV_ITEMS = [
  { href: "/app", label: "Dashboard", rel: "home" as const },
  { href: "/app/funnel", label: "Post-Purchase Funnel" },
  { href: "/app/funnel/new", label: "Create Post-Purchase Funnel" },
  { href: "/app/billing", label: "Billing" },
];

export function AppNavMenu() {
  const navigate = useNavigate();
  const layout = useAppLayoutData();
  const showAnalytics = hasAnalyticsAccess(layout?.tier ?? null);

  const navItems = showAnalytics
    ? [
        BASE_NAV_ITEMS[0],
        { href: "/app/analytics", label: "Analytics" },
        ...BASE_NAV_ITEMS.slice(1),
      ]
    : BASE_NAV_ITEMS;

  return (
    <NavMenu>
      {navItems.map((item) => (
        <a
          key={item.href}
          href={item.href}
          {...("rel" in item && item.rel ? { rel: item.rel } : {})}
          onClick={(event) => {
            event.preventDefault();
            navigate(item.href);
          }}
        >
          {item.label}
        </a>
      ))}
    </NavMenu>
  );
}

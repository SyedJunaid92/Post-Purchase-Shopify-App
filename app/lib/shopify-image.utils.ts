import type { FunnelImage } from "./test-config.types";

const SHOPIFY_CDN_HOSTS = ["cdn.shopify.com", "shopifycdn.com"];

/** Resize Shopify CDN images for checkout/post-purchase display (max ~560px wide). */
export function optimizeShopifyImageUrl(
  url: string | null | undefined,
  width = 560,
): string {
  const trimmed = url?.trim() ?? "";
  if (!trimmed) return "";

  const isShopifyCdn = SHOPIFY_CDN_HOSTS.some((host) => trimmed.includes(host));
  if (!isShopifyCdn) return trimmed;

  if (/[?&]width=\d+/.test(trimmed)) return trimmed;

  const separator = trimmed.includes("?") ? "&" : "?";
  return `${trimmed}${separator}width=${width}`;
}

export function optimizeFunnelImagesForCheckout(
  images: FunnelImage[],
  width = 560,
): FunnelImage[] {
  return images.map((image) => ({
    ...image,
    url: optimizeShopifyImageUrl(image.url, width),
  }));
}

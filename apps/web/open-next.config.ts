import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Every product page is dynamic; only the /demo replays are prerendered at build time and never revalidated.
export default defineCloudflareConfig({ incrementalCache: staticAssetsIncrementalCache, enableCacheInterception: true });

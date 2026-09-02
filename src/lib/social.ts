import type { Platform } from "./types";

// All supported platforms for campaign creation and clip submission.
export const ALL_PLATFORMS: Platform[] = ["YouTube", "Instagram", "Kick"];

// Platforms clippers can connect via OAuth right now.
// Kick is NOT yet connectable — no OAuth integration available.
export const CONNECTABLE_PLATFORMS: Platform[] = ["Instagram", "YouTube"];

// Platforms coming soon (no OAuth/metrics integration yet).
export const COMING_SOON_PLATFORMS: Platform[] = ["Kick"];

// Legacy alias — use CONNECTABLE_PLATFORMS instead.
export const SUPPORTED_PLATFORMS = CONNECTABLE_PLATFORMS;

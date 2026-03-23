export {};

declare global {
  interface Window {
    isTrippingGlobal: boolean;
    isPlacingGlobal: boolean;
    pendingBuildingGlobal: { type: string; cost: any } | null;
  }
}

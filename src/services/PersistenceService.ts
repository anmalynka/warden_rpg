import { get, set, createStore } from 'idb-keyval';
import type { UseStore } from 'idb-keyval';

export interface Item {
  id: string;
  name: string;
  count: number;
}

export interface GameState {
  catName: string;
  catColor: string;
  inventory: Item[];
  unlockedScenes: number[];
  worldData: any;
}

export class PersistenceService {
  private static instance: PersistenceService;
  private store: UseStore;
  private fallbackStore: Map<string, any> = new Map();
  private debounceTimer: any = null;
  private currentGameState: GameState;

  private constructor() {
    this.store = createStore('WardenDB', 'GameStateStore');
    this.currentGameState = this.getDefaultGameState();
  }

  public static getInstance(): PersistenceService {
    if (!PersistenceService.instance) {
      PersistenceService.instance = new PersistenceService();
    }
    return PersistenceService.instance;
  }

  public getDefaultGameState(): GameState {
    return {
      catName: 'Warden',
      catColor: 'grey-cat',
      inventory: [],
      unlockedScenes: [],
      worldData: {}
    };
  }

  public async init(): Promise<GameState> {
    try {
      const data = await get('state', this.store);
      if (data) {
        this.currentGameState = data;
        return data;
      } else {
        // Attempt migration from localStorage
        const migrated = this.migrateFromLocalStorage();
        if (migrated) {
          this.currentGameState = migrated;
          await this.save(true);
          return migrated;
        }
        await this.save(true);
        return this.currentGameState;
      }
    } catch (error) {
      console.warn('PersistenceService: IndexedDB initialization failed, using fallback:', error);
      return this.currentGameState;
    }
  }

  private migrateFromLocalStorage(): GameState | null {
    const hasData = localStorage.getItem('warden_map') || localStorage.getItem('warden_player_name');
    if (!hasData) return null;

    const state = this.getDefaultGameState();
    try {
      state.catName = localStorage.getItem('warden_player_name') || state.catName;
      state.catColor = localStorage.getItem('warden_cat_type') || state.catColor;
      
      const savedInv = localStorage.getItem('warden_inventory');
      if (savedInv) {
        const parsed = JSON.parse(savedInv);
        state.inventory = Object.entries(parsed).map(([id, count]) => ({ id, name: id, count: count as number }));
      }

      state.worldData = {
        islandMap: JSON.parse(localStorage.getItem('warden_map') || 'null'),
        expansionCost: JSON.parse(localStorage.getItem('warden_expansion_cost') || '500'),
        resources: JSON.parse(localStorage.getItem('warden_resources') || 'null'),
        exploredTerritory: JSON.parse(localStorage.getItem('warden_territory') || 'null'),
        buildings: JSON.parse(localStorage.getItem('warden_buildings') || '[]'),
        totalDistanceWalked: JSON.parse(localStorage.getItem('warden_distance') || '0'),
        level: JSON.parse(localStorage.getItem('warden_level') || '1'),
        xp: JSON.parse(localStorage.getItem('warden_xp') || '0'),
        totalXp: JSON.parse(localStorage.getItem('warden_total_xp') || '0'),
        npcs: JSON.parse(localStorage.getItem('warden_npcs') || '[]'),
        hasCompletedOnboarding: localStorage.getItem('warden_has_completed_onboarding') === 'true',
        removedDecorations: JSON.parse(localStorage.getItem('warden_removed_decorations') || '[]')
      };
      
      // Cleanup localStorage after migration? Maybe safer to keep it for now.
      return state;
    } catch (e) {
      console.error('Migration failed', e);
      return null;
    }
  }

  public async save(immediate: boolean = false): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    const performSave = async () => {
      try {
        await set('state', this.currentGameState, this.store);
      } catch (error) {
        console.warn('PersistenceService: IndexedDB save failed, using fallback Map:', error);
        this.fallbackStore.set('state', JSON.parse(JSON.stringify(this.currentGameState)));
      }
    };

    if (immediate) {
      await performSave();
    } else {
      this.debounceTimer = setTimeout(performSave, 500);
    }
  }

  /**
   * Middleware Strategy: Wrapper to get a value from GameState.
   */
  public getGameValue<T>(key: keyof GameState): T {
    return this.currentGameState[key] as T;
  }

  /**
   * Middleware Strategy: Wrapper to set a value in GameState and trigger autoSave.
   */
  public setGameValue<T>(key: keyof GameState, value: T): void {
    this.currentGameState[key] = value as any;
    this.save();
  }

  public getWorldValue<T>(key: string): T {
    return this.currentGameState.worldData[key] as T;
  }

  public setWorldValue<T>(key: string, value: T): void {
    if (!this.currentGameState.worldData) this.currentGameState.worldData = {};
    this.currentGameState.worldData[key] = value;
    this.save();
  }

  public async clear(): Promise<void> {
    try {
      const { clear } = await import('idb-keyval');
      await clear(this.store);
      this.currentGameState = this.getDefaultGameState();
      this.fallbackStore.clear();
    } catch (error) {
      console.warn('PersistenceService: IndexedDB clear failed:', error);
    }
  }
}

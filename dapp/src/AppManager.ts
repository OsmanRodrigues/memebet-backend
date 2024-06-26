import Game from './Game';
import { WalletApp, createWallet } from '@deroll/wallet';
import { Hex } from 'viem';
import { ValidatorFunctionRunner, ValidatorManager } from './validator';

// Higher level manager for all things bet
// Handles the creation and listing of new models
// Handles the creation and listing of new games
export default class AppManager {
    private static instance: AppManager;
    private static wallet: WalletApp;


    activeGames: Map<number, Game>;

    private constructor() {
        this.activeGames = new Map<number, Game>();
        AppManager.wallet = createWallet();
    }

    public static getInstance(): AppManager {
        if (!AppManager.instance) {
            AppManager.instance = new AppManager();
        }
        return AppManager.instance;
    }

    public getWallet(): WalletApp {
        return AppManager.wallet;
    }

    createGame(picks: Array<string>, start: number, end: number, tokenAddress: Hex, validatorFunction: ValidatorFunctionRunner) {
        const game = new Game(picks, start, end, tokenAddress, AppManager.wallet, validatorFunction);
        this.activeGames.set(game.id, game);
        return game;
    }

    async closeGame(gameId: number, data: string, signature: Hex) {
        const game = this.activeGames.get(gameId);
        if (!game) {
            throw new Error("No Game found");
        }
        await game.settle(data, signature);
        this.activeGames.delete(gameId);
    }

    getGameById(gameId: number): Game | undefined {
        return this.activeGames.get(gameId);
    }

    listActiveGames() {
        const games = [];
        for (const game of this.activeGames.values()) {
            games.push(game);
        }
        return games;
    }
}


import { describe, expect, test, beforeAll } from "vitest";
import { hashMessage, createWalletClient, http, WalletClient, PrivateKeyAccount } from "viem";
import { privateKeyToAccount } from "viem/accounts"
import { mainnet } from "viem/chains";

import { ValidatorManager, ValidatorFunctionRunner, DAOSignatureBlobChecker } from "../src/validator";
import Governance from "../src/Governance";
import { Bet, VFR, PlayerBet } from "../src/types";

// describe("ValidatorManager", () => {})


describe("DAOSignatureBlobChecker", () => {
    const privateTestKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const publicTestKey = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    let wallet: WalletClient
    let account: PrivateKeyAccount
    beforeAll(() => {
        account = privateKeyToAccount(privateTestKey);
        wallet = createWalletClient({ account, chain: mainnet, transport: http() });
    });

    test("should verify a signature", async () => {
        const governance = new Governance([publicTestKey]);
        const checker = new DAOSignatureBlobChecker(governance);
        const data = "test data";
        const hash = hashMessage(data);
        const signature = await wallet.signMessage({ account, message: data });
        expect(checker.verify(hash, signature)).resolves.toBe(true);
    });

    test("should not verify a signature", async () => {
        const secondPubKey = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
        const governance = new Governance([secondPubKey]);
        const checker = new DAOSignatureBlobChecker(governance);
        const data = "test data 123";
        const hash = hashMessage(data);
        const signature = await wallet.signMessage({ account, message: data });
        expect(checker.verify(hash, signature)).resolves.toBe(false);
    })

    test("should handle null or undefined hash and signature", async () => {
        const governance = new Governance([publicTestKey]);
        const checker = new DAOSignatureBlobChecker(governance);
        await expect(checker.verify(null, "alice_signature_123")).rejects.toThrow();
        await expect(checker.verify("hash_123", null)).rejects.toThrow();
    });

    test("should consistently verify the same signature", async () => {
        const governance = new Governance([publicTestKey]);
        const checker = new DAOSignatureBlobChecker(governance);
        const data = "cata_123";
        const hash = hashMessage(data);
        const signature = await wallet.signMessage({ account, message: data });
        const firstAttempt = await checker.verify(hash, signature);
        const secondAttempt = await checker.verify(hash, signature);
        expect(firstAttempt).toBe(secondAttempt);
    });

    test("should verify a signature when multiple members are in governance", async () => {
        const multipleMembers = [publicTestKey, "0xAnotherMemberKey"];
        const governance = new Governance(multipleMembers);
        const checker = new DAOSignatureBlobChecker(governance);
        const data = "multi-member data";
        const hash = hashMessage(data);
        const signature = await wallet.signMessage({ account, message: data });
        expect(await checker.verify(hash, signature)).toBe(true);
    });

    test("should not verify any signature if governance list is empty", async () => {
        const governance = new Governance([]);
        const checker = new DAOSignatureBlobChecker(governance);
        const data = "data_123";
        const hash = hashMessage(data);
        const signature = await wallet.signMessage({ account, message: data });
        expect(await checker.verify(hash, signature)).toBe(false);
    });

    test("should fail verification if data is altered", async () => {
        const governance = new Governance([publicTestKey]);
        const checker = new DAOSignatureBlobChecker(governance);
        const originalData = "original_data";
        const alteredData = "corrupted_or_malicious_data";
        const originalHash = hashMessage(originalData);
        const signature = await wallet.signMessage({ account, message: originalData });
        expect(await checker.verify(originalHash, signature)).toBe(true);
        const alteredHash = hashMessage(alteredData);
        expect(await checker.verify(alteredHash, signature)).toBe(false);
    });

    test("should not verify a signature from a non-member", async () => {
        const nonMemberPubKey = "0x123456789abcdef"; 
        const governance = new Governance([nonMemberPubKey]);
        const checker = new DAOSignatureBlobChecker(governance);
        const data = "important data";
        const hash = hashMessage(data);
        const fakeSignature = await wallet.signMessage({ account, message: data }); 
        expect(await checker.verify(hash, fakeSignature)).toBe(false);
    });





});




describe("ValidatorFunctionRunner", () => {
    const privateTestKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const publicTestKey = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    let wallet: WalletClient
    let account: PrivateKeyAccount
    let governance: Governance
    let checker: DAOSignatureBlobChecker

    beforeAll(() => {
        account = privateKeyToAccount(privateTestKey);
        wallet = createWalletClient({ account, chain: mainnet, transport: http() });
        governance = new Governance([publicTestKey]);
        checker = new DAOSignatureBlobChecker(governance);
    });

    test("should run a validator function", () => {
        const checkers = new Map();
        const emptyPicks: Map<string, Bet[]> = new Map();
        const data = "test data";
        const temp = `
            (...args) => {
                return "true";
            }
        `;
        const runner = new ValidatorFunctionRunner(temp, checker);
        expect(runner.run(emptyPicks, data, "0x00")).toBe("true");
    });

    test("should run a validator function and return basic pick", () => {
        const checkers = new Map();
        const picks: Map<string, Bet[]> = new Map();
        picks.set("test_pick", [{ pick: "test", player: "test", tokenAddress: "test", amount: BigInt(0) }]);
        picks.set("test_pick2", [{ pick: "test2", player: "test2", tokenAddress: "test2", amount: BigInt(0) }]);
        const data = "test data";
        const temp = `
            (...args) => {
                const [picks, bets, data] = args;
                return picks.keys().next().value;
            }
        `;
        const runner = new ValidatorFunctionRunner(temp, checker);
        expect(runner.run(picks, data, "0x00")).toBe("test_pick");
    });

    test("should run a validator function and use dao checker", async () => {
        const checkers = new Map();
        const picks: Map<string, Bet[]> = new Map();
        picks.set("test_pick", [{ pick: "test", player: "test", tokenAddress: "test", amount: BigInt(0) }]);
        picks.set("test_pick2", [{ pick: "test2", player: "test2", tokenAddress: "test2", amount: BigInt(0) }]);
        const data = "test data";
        const hash = hashMessage(data);
        const signature = await wallet.signMessage({ account, message: data });
        const temp = `
            async (...args) => {
                const viem = require("viem");
                const [picks, data, signature, checkers] = args;
                const hash = viem.hashMessage(data);
                const checker = checkers.get("dao_checker");
                if(await checker.verify(hash, signature)) {
                    return picks.keys().next().value;
                }
                throw new Error("Failed to verify dao signature");
            }
        `;
        checkers.set("dao_checker", checker);
        const runner = new ValidatorFunctionRunner(temp, checker);
        expect(runner.run(picks, data, signature)).resolves.toBe("test_pick");
    });

    test("should run a validator function and fail to verify dao signature", async () => {
        const checkers = new Map();
        const picks: Map<string, Bet[]> = new Map();
        picks.set("test_pick", [{ pick: "test", player: "test", tokenAddress: "test", amount: BigInt(0) }]);
        picks.set("test_pick2", [{ pick: "test2", player: "test2", tokenAddress: "test2", amount: BigInt(0) }]);
        const data = "test data";
        const alterateData = "test data 123";
        const hash = hashMessage(data);
        const signature = await wallet.signMessage({ account, message: data });
        const temp = `
            async (...args) => {
                const viem = require("viem");
                const [picks, data, signature, checkers] = args;
                const hash = viem.hashMessage(data);
                const checker = checkers.get("dao_checker");
                if(await checker.verify(hash, signature)) {
                    return picks.keys().next().value;
                }
                throw new Error("Failed to verify dao signature");
            }
        `;
        checkers.set("dao_checker", checker);
        const runner = new ValidatorFunctionRunner(temp, checker);
        expect(runner.run(picks, alterateData, signature)).rejects.toThrow("Failed to verify dao signature");
    });

    test("should run asynchronous validator functions", async () => {
        const temp = `async (...args) => { return "async result"; }`;
        const runner = new ValidatorFunctionRunner(temp, checker);
        await expect(runner.run(new Map(), "data", "0x00")).resolves.toBe("async result");
    });



});
import { salesforceClient } from "./salesforceClient";
import type { ApiBudgetSnapshot, ApiBudgetState } from "@/types/workerMessages";

type SalesforceLimitUsage = {
    Max: number;
    Remaining: number;
}

type SalesforceLimitsResponse = {
    DailyApiRequests?: SalesforceLimitUsage;
}

const getBudgetState = (used: number, limit: number): ApiBudgetState => {
    if (limit <= 0) {
        return 'unknown';
    }

    const usageRatio = used / limit;

    if (usageRatio >= 0.95) {
        return 'exceeded';
    }

    if (usageRatio >= 0.85) {
        return 'throttle';
    }

    if (usageRatio >= 0.70) {
        return 'warn';
    }

    return 'ok';
}

export const apiLimitService = {
    async getApiBudget(): Promise<ApiBudgetSnapshot> {
        const limits = await salesforceClient.restGet<SalesforceLimitsResponse>('limits');
        const dailyApiRequests = limits.DailyApiRequests;

        if (!dailyApiRequests) {
            return {
                state: 'unknown',
                used: null,
                limit: null,
                remainingPercent: null,
                updatedAt: new Date().toISOString()
            };
        }

        const limit = dailyApiRequests.Max;
        const remaining = dailyApiRequests.Remaining;
        const used = Math.max(0, limit - remaining);

        return {
            state: getBudgetState(used, limit),
            used,
            limit,
            remainingPercent: limit > 0 ? Math.max(0, remaining / limit) : null,
            updatedAt: new Date().toISOString()
        };
    }
};

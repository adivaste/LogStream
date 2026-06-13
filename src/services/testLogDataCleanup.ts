import { logBodyRepository } from "@/background/db/logBodyRepository";
import { logRepository } from "@/background/db/logRepository";
import { queueRepository } from "@/background/db/queueRepository";
import { MOCK_ORG_ID } from "@/lib/logEntryMapper";

let cleanupPromise: Promise<void> | null = null;

export const removeTestLogData = () => {
    if (cleanupPromise) {
        return cleanupPromise;
    }

    cleanupPromise = Promise.all([
        logRepository.deleteAllForOrg(MOCK_ORG_ID),
        logBodyRepository.deleteAllForOrg(MOCK_ORG_ID),
        queueRepository.deleteAllForOrg(MOCK_ORG_ID)
    ]).then(() => undefined);

    return cleanupPromise;
}

import { salesforceClient } from "./salesforceClient";

type OrganizationRecord = {
    Id: string;
    Name: string | null;
}

const ORGANIZATION_QUERY = 'SELECT Id, Name FROM Organization LIMIT 1';

export const orgService = {
    async getOrgName() {
        const response = await salesforceClient.restQuery<OrganizationRecord>(
            ORGANIZATION_QUERY
        );

        return response.records[0]?.Name ?? null;
    }
};

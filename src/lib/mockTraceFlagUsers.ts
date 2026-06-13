type TraceFlagUser = {
    id: string;
    name: string;
    username: string;
    avatarInitials: string;
    avatarColorClassName: string;
    hasTraceFlag: boolean;
    traceFlagDurationLabel?: string;
}

const mockTraceFlagUsers: TraceFlagUser[] = [
    {
        id: '0051',
        name: 'Aditya Vaste',
        username: 'aditya.vaste@acme.com',
        avatarInitials: 'AV',
        avatarColorClassName: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
        hasTraceFlag: true,
        traceFlagDurationLabel: '1h 42m left'
    },
    {
        id: '0052',
        name: 'Jane Smith',
        username: 'jane.smith@acme.com',
        avatarInitials: 'JS',
        avatarColorClassName: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
        hasTraceFlag: true,
        traceFlagDurationLabel: '38m left'
    },
    {
        id: '0053',
        name: 'Rohan Mehta',
        username: 'rohan.mehta@acme.com',
        avatarInitials: 'RM',
        avatarColorClassName: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
        hasTraceFlag: false
    },
    {
        id: '0054',
        name: 'Maya Chen',
        username: 'maya.chen@acme.com',
        avatarInitials: 'MC',
        avatarColorClassName: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
        hasTraceFlag: true,
        traceFlagDurationLabel: '5h 09m left'
    },
    {
        id: '0055',
        name: 'Nina Patel',
        username: 'nina.patel@acme.com',
        avatarInitials: 'NP',
        avatarColorClassName: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
        hasTraceFlag: false
    },
    {
        id: '0056',
        name: 'Owen Brooks',
        username: 'owen.brooks@acme.com',
        avatarInitials: 'OB',
        avatarColorClassName: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
        hasTraceFlag: false
    },
    {
        id: '0057',
        name: 'Sara Wilson',
        username: 'sara.wilson@acme.com',
        avatarInitials: 'SW',
        avatarColorClassName: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
        hasTraceFlag: true,
        traceFlagDurationLabel: '21m left'
    },
    {
        id: '0058',
        name: 'Karan Shah',
        username: 'karan.shah@acme.com',
        avatarInitials: 'KS',
        avatarColorClassName: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
        hasTraceFlag: false
    }
];

export { mockTraceFlagUsers };
export type { TraceFlagUser };

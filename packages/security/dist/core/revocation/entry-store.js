export function createEntryStore(maxEntries) {
    const entries = new Map();
    const bySub = new Map();
    const bySid = new Map();
    const deleteEntry = (jti) => {
        const existing = entries.get(jti);
        if (!existing)
            return false;
        entries.delete(jti);
        const subSet = bySub.get(existing.sub);
        if (subSet) {
            subSet.delete(jti);
            if (subSet.size === 0) {
                bySub.delete(existing.sub);
            }
        }
        if (existing.sid !== null) {
            const sidSet = bySid.get(existing.sid);
            if (sidSet) {
                sidSet.delete(jti);
                if (sidSet.size === 0) {
                    bySid.delete(existing.sid);
                }
            }
        }
        return true;
    };
    const setEntry = (jti, entry) => {
        if (entries.has(jti)) {
            deleteEntry(jti);
        }
        else if (entries.size >= maxEntries) {
            const oldest = entries.keys().next().value;
            if (oldest !== undefined) {
                deleteEntry(oldest);
            }
        }
        entries.set(jti, entry);
        let subSet = bySub.get(entry.sub);
        if (!subSet) {
            subSet = new Set();
            bySub.set(entry.sub, subSet);
        }
        subSet.add(jti);
        if (entry.sid !== null) {
            let sidSet = bySid.get(entry.sid);
            if (!sidSet) {
                sidSet = new Set();
                bySid.set(entry.sid, sidSet);
            }
            sidSet.add(jti);
        }
    };
    return {
        get: (jti) => entries.get(jti),
        set: setEntry,
        delete: deleteEntry,
        touch(jti, entry) {
            entries.delete(jti);
            entries.set(jti, entry);
        },
        clear() {
            entries.clear();
            bySub.clear();
            bySid.clear();
        },
        jtisBySub: (sub) => bySub.get(sub),
        jtisBySid: (sid) => bySid.get(sid),
    };
}

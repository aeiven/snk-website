// Remembers the last Insurable Value and Current Market Valuation results in this browser tab
// for the free compare panel. sessionStorage is cleared when the tab is closed.

export type ResultKind = 'insurable' | 'market'

export interface StoredResult {
    kind: ResultKind
    selections: { label: string; value: string }[]
    lowest: number
    average: number
    highest: number
    // When the result was produced (for market: when the listings were collected)
    date: string
    listingCount?: number
}

export const COMPARE_EVENT = 'snk-compare-updated'

const storageKey = (kind: ResultKind) => `snk.compare.${kind}`

export function saveResult(result: StoredResult) {
    try {
        sessionStorage.setItem(storageKey(result.kind), JSON.stringify(result))
        window.dispatchEvent(new Event(COMPARE_EVENT))
    } catch {
        // Storage can be unavailable (private mode, blocked site data); the panel is optional
    }
}

export function loadResult(kind: ResultKind): StoredResult | null {
    try {
        const raw = sessionStorage.getItem(storageKey(kind))
        return raw ? JSON.parse(raw) : null
    } catch {
        return null
    }
}

export const PAGE_LINKS: Record<ResultKind, { href: string; title: string }> = {
    insurable: { href: '/valuation/insurable', title: 'Insurable Value' },
    market: { href: '/valuation/market', title: 'Current Market Valuation' },
}

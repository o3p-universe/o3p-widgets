/** @odoo-module **/

import { browser } from "@web/core/browser/browser";
import { router, routerBus } from "@web/core/browser/router";
import { Notebook } from "@web/core/notebook/notebook";
import { patch } from "@web/core/utils/patch";
import { useBus } from "@web/core/utils/hooks";
import { session } from "@web/session";
import { onMounted, onPatched, onWillUnmount } from "@odoo/owl";

const STORAGE_KEY = "o3p_widgets.notebook_tabs.v1";
const MAX_ENTRY_AGE = 48 * 60 * 60 * 1000;
const WARNING_PREFIX = "[o3p_widgets] Notebook tab persistence";
const persistenceEnabled = session.o3p_widgets?.remember_notebook_tabs ?? false;
const defaultTabsEnabled = session.o3p_widgets?.default_notebook_tabs ?? false;
const sessionDefaultTabRules = session.o3p_widgets?.default_notebook_tab_rules;
const defaultTabRules = Array.isArray(sessionDefaultTabRules) ? sessionDefaultTabRules : [];
const activeNotebooks = new Set();
let routeRestoreTimer = null;

function warn(message, error) {
    if (error === undefined) {
        console.warn(`${WARNING_PREFIX}: ${message}`);
    } else {
        console.warn(`${WARNING_PREFIX}: ${message}`, error);
    }
}

function writeEntries(entries) {
    try {
        browser.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
        warn("could not write local storage", error);
    }
}

function readEntries() {
    let entries;
    try {
        const storedValue = browser.localStorage.getItem(STORAGE_KEY);
        if (!storedValue) {
            return {};
        }
        entries = JSON.parse(storedValue);
        if (!entries || Array.isArray(entries) || typeof entries !== "object") {
            throw new TypeError("stored notebook state is not an object");
        }
    } catch (error) {
        warn("could not read local storage", error);
        try {
            browser.localStorage.removeItem(STORAGE_KEY);
        } catch (cleanupError) {
            warn("could not clear invalid local storage", cleanupError);
        }
        return {};
    }

    const now = Date.now();
    let changed = false;
    for (const [key, entry] of Object.entries(entries)) {
        const valid =
            entry &&
            typeof entry === "object" &&
            typeof entry.pageId === "string" &&
            Number.isFinite(entry.updatedAt) &&
            now - entry.updatedAt <= MAX_ENTRY_AGE;
        if (!valid) {
            delete entries[key];
            changed = true;
        }
    }
    if (changed) {
        writeEntries(entries);
    }
    return entries;
}

function getHashParameters(hash) {
    const hashValue = hash.replace(/^#!/, "").replace(/^#/, "");
    const queryStart = hashValue.indexOf("?");
    return new URLSearchParams(queryStart >= 0 ? hashValue.slice(queryStart + 1) : hashValue);
}

function getPageUrl() {
    const canonicalUrl = router.current
        ? router.stateToUrl(router.current)
        : browser.location.href;
    const url = new URL(canonicalUrl, browser.location.origin);
    const hashParameters = getHashParameters(url.hash);
    const identityParameters = new URLSearchParams();
    for (const parameterName of ["id", "model"]) {
        const value = hashParameters.get(parameterName) ?? url.searchParams.get(parameterName);
        if (value !== null) {
            identityParameters.set(parameterName, value);
        }
    }
    const identityQuery = identityParameters.toString();
    const pagePath = url.pathname.replace(/^\/odoo(?:\/|$)/, "").replace(/^\//, "");
    return `${pagePath}${identityQuery ? `?${identityQuery}` : ""}`;
}

function getNotebookStorageId(notebook) {
    const notebookElement = notebook.activePane()?.closest(".o_notebook");
    if (!notebookElement) {
        return null;
    }
    const notebookIndex = Array.from(document.querySelectorAll(".o_notebook")).indexOf(
        notebookElement
    );
    if (notebookIndex < 0) {
        return null;
    }
    return `::[${notebookIndex}]${getPageUrl()}`;
}

function forgetEntry(storageId, entries) {
    delete entries[storageId];
    writeEntries(entries);
}

function rememberCurrentPage(notebook) {
    if (!persistenceEnabled) {
        return;
    }
    const storageId = getNotebookStorageId(notebook);
    if (!storageId || typeof notebook.state.currentPage !== "string") {
        return;
    }
    const entries = readEntries();
    entries[storageId] = {
        pageId: notebook.state.currentPage,
        updatedAt: Date.now(),
    };
    writeEntries(entries);
}

function getDefaultPageId(notebook, storageId) {
    if (!defaultTabsEnabled) {
        return null;
    }
    const matchingRules = defaultTabRules
        .filter(
            (rule) =>
                rule &&
                typeof rule.prefix === "string" &&
                Number.isInteger(rule.tab_index) &&
                rule.tab_index >= 0 &&
                storageId.startsWith(rule.prefix)
        )
        .sort((left, right) => right.prefix.length - left.prefix.length);
    if (!matchingRules.length) {
        return null;
    }
    const rule = matchingRules[0];
    const pageId = notebook.navItems[rule.tab_index]?.[0];
    if (typeof pageId !== "string") {
        warn(
            `tab index ${rule.tab_index} is outside notebook ${storageId} for prefix ${rule.prefix}`
        );
        return null;
    }
    return pageId;
}

function getNativeDefaultPageId(notebook) {
    const visiblePageIds = notebook.navItems.map(([pageId]) => pageId);
    if (notebook.props.defaultPage && visiblePageIds.includes(notebook.props.defaultPage)) {
        return notebook.props.defaultPage;
    }
    return visiblePageIds[0] ?? null;
}

async function restoreCurrentPage(notebook, storageId) {
    let pageId = null;
    if (persistenceEnabled) {
        const entries = readEntries();
        const entry = entries[storageId];
        if (entry && notebook.navItems.some(([navPageId]) => navPageId === entry.pageId)) {
            pageId = entry.pageId;
        } else if (entry) {
            forgetEntry(storageId, entries);
        }
    }
    pageId ||= getDefaultPageId(notebook, storageId);
    pageId ||= getNativeDefaultPageId(notebook);
    if (!pageId) {
        return;
    }

    if (getNotebookStorageId(notebook) !== storageId) {
        scheduleRestore(notebook);
        return;
    }

    notebook.o3pNotebookRestoring = true;
    try {
        await notebook.activatePage(pageId);
        if (persistenceEnabled && notebook.state.currentPage !== pageId) {
            const entries = readEntries();
            if (entries[storageId]) {
                forgetEntry(storageId, entries);
            }
        }
    } catch (error) {
        warn("could not restore the selected tab", error);
    } finally {
        notebook.o3pNotebookRestoring = false;
    }
}

function scheduleRestore(notebook) {
    browser.cancelAnimationFrame(notebook.o3pNotebookRestoreFrame);
    notebook.o3pNotebookRestoreFrame = browser.requestAnimationFrame(() => {
        const storageId = getNotebookStorageId(notebook);
        if (!storageId || storageId === notebook.o3pNotebookStorageId) {
            return;
        }
        notebook.o3pNotebookStorageId = storageId;
        restoreCurrentPage(notebook, storageId);
    });
}

function scheduleRouteRestore() {
    browser.clearTimeout(routeRestoreTimer);
    routeRestoreTimer = browser.setTimeout(() => {
        for (const notebook of activeNotebooks) {
            scheduleRestore(notebook);
        }
    });
}

if (persistenceEnabled || defaultTabsEnabled) {
    patch(router, {
        pushState() {
            const result = super.pushState(...arguments);
            scheduleRouteRestore();
            return result;
        },

        replaceState() {
            const result = super.replaceState(...arguments);
            scheduleRouteRestore();
            return result;
        },
    });

    patch(Notebook.prototype, {
        setup() {
            super.setup(...arguments);
            this.o3pNotebookStorageId = null;
            this.o3pNotebookRestoreFrame = null;
            this.o3pNotebookRestoring = false;
            activeNotebooks.add(this);
            useBus(routerBus, "ROUTE_CHANGE", () => scheduleRestore(this));
            onMounted(() => scheduleRestore(this));
            onPatched(() => scheduleRestore(this));
            onWillUnmount(() => {
                activeNotebooks.delete(this);
                browser.cancelAnimationFrame(this.o3pNotebookRestoreFrame);
            });
        },

        async activatePage(pageIndex) {
            await super.activatePage(...arguments);
            if (!this.o3pNotebookRestoring && this.state.currentPage === pageIndex) {
                rememberCurrentPage(this);
            }
        },
    });
}

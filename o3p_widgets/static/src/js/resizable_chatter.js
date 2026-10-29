/** @odoo-module **/

import "@mail/chatter/web/form_renderer";

import { onMounted, onWillUnmount } from "@odoo/owl";

import { browser } from "@web/core/browser/browser";
import { patch } from "@web/core/utils/patch";
import { FormRenderer } from "@web/views/form/form_renderer";
import { session } from "@web/session";

const ENABLED = session.o3p_widgets?.enable_resizable_chatter ?? false;
const EXTRA_WIDTH_PROPERTY = "--Chatter-asideExtraWidth";
const RESIZED_CLASS = "o3p-resizable-chatter-resized";
const RESIZE_HANDLE_CLASS = "o3p-resizable-chatter-handle";
const STORAGE_KEY = "o3p_widgets.chatter_extra_width";
const LEGACY_STORAGE_KEY = "o3p_resizable_chatter.extra_width";
const MIN_CHATTER_WIDTH = 280;
const MIN_FORM_WIDTH = 320;
const WARNING_PREFIX = "[o3p_widgets] Resizable chatter";

function warn(message, error) {
    if (error === undefined) {
        console.warn(`${WARNING_PREFIX}: ${message}`);
    } else {
        console.warn(`${WARNING_PREFIX}: ${message}`, error);
    }
}

function readStoredWidth() {
    try {
        const storedValue =
            browser.localStorage.getItem(STORAGE_KEY) ??
            browser.localStorage.getItem(LEGACY_STORAGE_KEY);
        const width = Number.parseFloat(storedValue);
        return Number.isFinite(width) ? width : null;
    } catch (error) {
        warn("could not read local storage", error);
        return null;
    }
}

function storeWidth(width) {
    try {
        browser.localStorage.setItem(STORAGE_KEY, String(width));
        browser.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (error) {
        warn("could not write local storage", error);
    }
}

function clearStoredWidth() {
    try {
        browser.localStorage.removeItem(STORAGE_KEY);
        browser.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (error) {
        warn("could not clear local storage", error);
    }
}

function applyWidth(chatter, width) {
    if (width === null) {
        chatter.classList.remove(RESIZED_CLASS);
        chatter.style.removeProperty(EXTRA_WIDTH_PROPERTY);
        return;
    }
    chatter.classList.add(RESIZED_CLASS);
    chatter.style.setProperty(EXTRA_WIDTH_PROPERTY, `${width}px`);
}

function stopResize(renderer, persist = true) {
    if (!renderer.o3pChatterResizeSession) {
        return;
    }
    const { resize, stop, extraWidth } = renderer.o3pChatterResizeSession;
    window.removeEventListener("pointermove", resize);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    window.removeEventListener("blur", stop);
    document.body.classList.remove("o3p-resizing-chatter");
    renderer.o3pChatterResizeSession = null;
    if (persist) {
        storeWidth(extraWidth());
    }
}

function startResize(renderer, event) {
    if (event.button !== 0) {
        return;
    }
    const chatter = event.currentTarget.closest(".o-mail-Form-chatter");
    if (!chatter?.classList.contains("o-aside")) {
        return;
    }

    event.preventDefault();
    stopResize(renderer);

    const initialX = event.clientX;
    const initialWidth = chatter.getBoundingClientRect().width;
    let initialExtraWidth = Number.parseFloat(
        getComputedStyle(chatter).getPropertyValue(EXTRA_WIDTH_PROPERTY)
    );
    initialExtraWidth = Number.isFinite(initialExtraWidth) ? initialExtraWidth : 0;

    if (!chatter.classList.contains(RESIZED_CLASS)) {
        chatter.classList.add(RESIZED_CLASS);
        const formulaWidth = chatter.getBoundingClientRect().width;
        initialExtraWidth += initialWidth - formulaWidth;
        chatter.style.setProperty(EXTRA_WIDTH_PROPERTY, `${initialExtraWidth}px`);
    }

    const containerWidth = chatter.parentElement.getBoundingClientRect().width;
    const maxChatterWidth = Math.max(MIN_CHATTER_WIDTH, containerWidth - MIN_FORM_WIDTH);
    let currentExtraWidth = initialExtraWidth;

    const resize = (moveEvent) => {
        moveEvent.preventDefault();
        const requestedWidth = Math.min(
            maxChatterWidth,
            Math.max(MIN_CHATTER_WIDTH, initialWidth + initialX - moveEvent.clientX)
        );
        currentExtraWidth = initialExtraWidth + requestedWidth - initialWidth;
        chatter.style.setProperty(EXTRA_WIDTH_PROPERTY, `${currentExtraWidth}px`);
    };
    const stop = () => stopResize(renderer);

    renderer.o3pChatterResizeSession = {
        resize,
        stop,
        extraWidth: () => currentExtraWidth,
    };
    document.body.classList.add("o3p-resizing-chatter");
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
}

function resetWidth(renderer, event) {
    event.preventDefault();
    stopResize(renderer, false);
    clearStoredWidth();
    const root = renderer.rootRef();
    for (const chatter of root?.querySelectorAll(".o-mail-Form-chatter") || []) {
        applyWidth(chatter, null);
    }
}

function attachResizeHandles(renderer) {
    const root = renderer.rootRef();
    if (!root) {
        return;
    }
    const storedWidth = readStoredWidth();
    for (const chatter of root.querySelectorAll(".o-mail-Form-chatter")) {
        if (storedWidth !== null) {
            applyWidth(chatter, storedWidth);
        }
        if (chatter.querySelector(`:scope > .${RESIZE_HANDLE_CLASS}`)) {
            continue;
        }
        const handle = document.createElement("div");
        handle.classList.add(RESIZE_HANDLE_CLASS);
        handle.title = "Drag to resize; double-click to reset";
        handle.setAttribute("role", "separator");
        handle.setAttribute("aria-orientation", "vertical");
        handle.addEventListener("pointerdown", (event) => startResize(renderer, event));
        handle.addEventListener("dblclick", (event) => resetWidth(renderer, event));
        chatter.append(handle);
    }
}

if (ENABLED) {
    patch(FormRenderer.prototype, {
        setup() {
            super.setup(...arguments);
            onMounted(() => {
                attachResizeHandles(this);
                const root = this.rootRef();
                if (!root) {
                    warn("could not find the form renderer root");
                    return;
                }
                this.o3pChatterObserver = new MutationObserver(() => attachResizeHandles(this));
                this.o3pChatterObserver.observe(root, { childList: true, subtree: true });
            });
            onWillUnmount(() => {
                this.o3pChatterObserver?.disconnect();
                stopResize(this, false);
            });
        },
    });
}

/** @odoo-module **/

import { browser } from "@web/core/browser/browser";
import { router, routerBus } from "@web/core/browser/router";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { isHtmlEmpty } from "@web/core/utils/html";
import { useBus } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import { exprToBoolean } from "@web/core/utils/strings";
import { createElement } from "@web/core/utils/xml";
import { FormCompiler } from "@web/views/form/form_compiler";
import { InnerGroup, OuterGroup } from "@web/views/form/form_group/form_group";
import { makeSeparator } from "@web/views/view_compiler";
import { session } from "@web/session";
import {
    onMounted,
    onWillUnmount,
    proxy,
    t,
    useEffect,
} from "@odoo/owl";

const STORAGE_KEY = "o3p_widgets.group_accordions.v1";
const MAX_ENTRY_AGE = 30 * 24 * 60 * 60 * 1000;
const WARNING_PREFIX = "[o3p_widgets] Accordion persistence";
const accordionEnabled = session.o3p_widgets?.enable_group_accordion ?? false;
const stickyEnabled = session.o3p_widgets?.sticky_group_accordion ?? false;
const activeAccordions = new Set();
let routeRestoreTimer = null;
let accordionInstanceSequence = 0;

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
            throw new TypeError("stored accordion state is not an object");
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
            typeof entry.open === "boolean" &&
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

function hasMeaningfulValue(value, fieldType) {
    if (value === false || value === null || value === undefined || value === "") {
        return false;
    }
    if (typeof value === "number") {
        return value !== 0;
    }
    if (typeof value === "string") {
        if (fieldType === "html") {
            return !isHtmlEmpty(value);
        }
        return Boolean(value.trim());
    }
    if (Array.isArray(value)) {
        return value.length > 0;
    }
    if (typeof value === "object") {
        if (Array.isArray(value.currentIds)) {
            return value.currentIds.length > 0;
        }
        if ("resId" in value) {
            return Boolean(value.resId);
        }
        if ("id" in value) {
            return Boolean(value.id);
        }
    }
    return true;
}

function scheduleRouteRestore() {
    browser.clearTimeout(routeRestoreTimer);
    routeRestoreTimer = browser.setTimeout(() => {
        for (const accordion of activeAccordions) {
            accordion.restoreState();
        }
    });
}

const accordionProps = {
    o3pAccordion: t.boolean().optional(false),
    o3pAccordionFieldNames: t.array().optional([]),
    o3pAccordionRecord: t.object().optional(),
};

InnerGroup.propShape = { ...InnerGroup.propShape, ...accordionProps };
OuterGroup.propShape = { ...OuterGroup.propShape, ...accordionProps };

function getAccordionElement(component) {
    return document.querySelector(`.${component.o3pAccordionInstanceClass}`);
}

function hasAnyFieldValue(component) {
    const record = component.props.o3pAccordionRecord;
    return component.props.o3pAccordionFieldNames.some((fieldName) =>
        hasMeaningfulValue(record.data[fieldName], record.fields[fieldName]?.type)
    );
}

function isAccordionOpen(component) {
    return component.o3pAccordionState.selectedOpen ?? hasAnyFieldValue(component);
}

function getStorageId(component) {
    const element = getAccordionElement(component);
    if (!element) {
        return null;
    }
    const accordionIndex = Array.from(document.querySelectorAll(".o3p_accordion_group")).indexOf(
        element
    );
    return accordionIndex < 0 ? null : `::accordion[${accordionIndex}]${getPageUrl()}`;
}

function restoreState(component) {
    const storageId = getStorageId(component);
    if (!stickyEnabled || !storageId) {
        component.o3pAccordionState.selectedOpen = null;
        return;
    }
    const entry = readEntries()[storageId];
    component.o3pAccordionState.selectedOpen = entry ? entry.open : null;
}

function toggleAccordion(component) {
    const open = !isAccordionOpen(component);
    component.o3pAccordionState.selectedOpen = open;
    if (!stickyEnabled) {
        return;
    }
    const storageId = getStorageId(component);
    if (!storageId) {
        return;
    }
    const entries = readEntries();
    entries[storageId] = { open, updatedAt: Date.now() };
    writeEntries(entries);
}

function setupAccordion(component) {
    if (!component.props.o3pAccordion) {
        return;
    }
    component.o3pAccordionInstanceClass = `o3p_accordion_instance_${accordionInstanceSequence++}`;
    component.o3pAccordionState = proxy({ selectedOpen: null });
    component.restoreState = () => restoreState(component);
    activeAccordions.add(component);

    if (stickyEnabled) {
        useBus(routerBus, "ROUTE_CHANGE", component.restoreState);
    }
    useEffect(
        component.restoreState,
        () => [
            component.props.o3pAccordionRecord.resModel,
            component.props.o3pAccordionRecord.resId,
            hasAnyFieldValue(component),
        ]
    );
    onMounted(() => {
        const element = getAccordionElement(component);
        const summary = element?.querySelector(".o3p_accordion_group_summary");
        if (!element || !summary) {
            warn("could not find the rendered group title");
            return;
        }
        let titleContainer = summary;
        while (titleContainer.parentElement && titleContainer.parentElement !== element) {
            titleContainer = titleContainer.parentElement;
        }
        titleContainer.classList.add("o3p_accordion_group_title_container");
        component.o3pAccordionClickHandler = (event) => {
            if (event.target.closest(".o3p_accordion_group_summary")) {
                toggleAccordion(component);
            }
        };
        component.o3pAccordionKeyHandler = (event) => {
            if (
                event.target.closest(".o3p_accordion_group_summary") &&
                (event.key === "Enter" || event.key === " ")
            ) {
                event.preventDefault();
                toggleAccordion(component);
            }
        };
        element.addEventListener("click", component.o3pAccordionClickHandler);
        element.addEventListener("keydown", component.o3pAccordionKeyHandler);
        component.restoreState();
    });
    onWillUnmount(() => {
        const element = getAccordionElement(component);
        element?.removeEventListener("click", component.o3pAccordionClickHandler);
        element?.removeEventListener("keydown", component.o3pAccordionKeyHandler);
        activeAccordions.delete(component);
    });
}

function accordionClasses(component, nativeClasses) {
    if (!component.props.o3pAccordion) {
        return nativeClasses;
    }
    const stateClass = isAccordionOpen(component)
        ? "o3p_accordion_group_open"
        : "o3p_accordion_group_collapsed";
    return [
        nativeClasses,
        "o3p_accordion_group",
        stateClass,
        component.o3pAccordionInstanceClass,
    ]
        .filter(Boolean)
        .join(" ");
}

patch(InnerGroup.prototype, {
    setup() {
        super.setup(...arguments);
        setupAccordion(this);
    },
    get allClasses() {
        return accordionClasses(this, super.allClasses);
    },
});

patch(OuterGroup.prototype, {
    setup() {
        setupAccordion(this);
    },
    get allClasses() {
        return accordionClasses(this, super.allClasses);
    },
});

/** @this {FormCompiler} */
function compileAccordionGroup(node, params) {
    const groupNode = node.cloneNode(true);
    const groupAccordionEnabled = exprToBoolean(groupNode.getAttribute("accordion") || "");
    groupNode.removeAttribute("accordion");

    if (!groupAccordionEnabled) {
        return this.compileGroup(groupNode, params);
    }

    const fieldNames = Array.from(groupNode.querySelectorAll("field[name]"))
        .filter((fieldNode) => {
            const invisible = fieldNode.getAttribute("invisible");
            const insideRelationalSubview = fieldNode.parentElement?.closest("field");
            return !insideRelationalSubview && invisible !== "1" && invisible !== "True";
        })
        .map((fieldNode) => fieldNode.getAttribute("name"));

    const compiledGroup = this.compileGroup(groupNode, params);
    compiledGroup.setAttribute("o3pAccordion", "true");
    compiledGroup.setAttribute(
        "o3pAccordionFieldNames",
        JSON.stringify([...new Set(fieldNames)])
    );
    compiledGroup.setAttribute("o3pAccordionRecord", "__comp__.props.record");

    let titleSlot = compiledGroup.querySelector("t[t-set-slot='title']");
    if (!titleSlot) {
        titleSlot = createElement("t", { "t-set-slot": "title" }, [makeSeparator(_t("Details"))]);
        compiledGroup.prepend(titleSlot);
    }
    const titleElement = titleSlot.firstElementChild;
    titleElement.classList.add("o3p_accordion_group_summary");
    titleElement.setAttribute("role", "button");
    titleElement.setAttribute("tabindex", "0");
    return compiledGroup;
}

if (accordionEnabled) {
    registry.category("form_compilers").add("o3p_accordion_group", {
        selector: "group[accordion]",
        fn: compileAccordionGroup,
    });

    if (stickyEnabled) {
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
    }
}

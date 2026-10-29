/** @odoo-module **/

import { onMounted, onWillUnmount, signal } from "@odoo/owl";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import { session } from "@web/session";
import { KanbanController } from "@web/views/kanban/kanban_controller";
import { ListController } from "@web/views/list/list_controller";

// Grow the visible range through the model API, retaining the current page's
// records and scroll position. Grouped views keep their native group pagination.
if (session.o3p_widgets?.enable_scroll_load) {
    for (const Controller of [ListController, KanbanController]) {
        patch(Controller.prototype, {
            setup() {
                super.setup(...arguments);
                this.o3pScrollLoading = signal(false);
                this.o3pScrollDialog = useService("dialog");
                this.o3pScrollNotification = useService("notification");
                this.o3pScrollAlive = true;
                let root;
                const onScroll = (event) => {
                    const target = event.target;
                    if (
                        !this.o3pCanScrollLoad ||
                        !(target instanceof HTMLElement) ||
                        (target !== root && !target.matches(
                            ".o_content, .o_list_renderer, .o_kanban_renderer"
                        )) ||
                        target.closest(".o_field_widget") ||
                        target.scrollHeight <= target.clientHeight ||
                        target.scrollTop + target.clientHeight < target.scrollHeight - 100
                    ) {
                        return;
                    }
                    void this.o3pLoadRecords(false);
                };
                onMounted(() => {
                    root = this.rootRef();
                    root?.addEventListener("scroll", onScroll, { capture: true, passive: true });
                });
                onWillUnmount(() => {
                    this.o3pScrollAlive = false;
                    root?.removeEventListener("scroll", onScroll, true);
                });
            },

            get o3pCanLoadAll() {
                const list = this.model.root;
                return Boolean(
                    this.model.isReady() &&
                    !this.model.useSampleModel &&
                    !this.offlinePlugin?.isOffline() &&
                    !list.isGrouped &&
                    !list.editedRecord &&
                    !this.o3pScrollLoading() &&
                    (list.offset > 0 || list.hasLimitedCount || list.records.length < list.count)
                );
            },

            get o3pCanScrollLoad() {
                const list = this.model.root;
                return this.o3pCanLoadAll &&
                    (list.hasLimitedCount || list.offset + list.records.length < list.count);
            },

            o3pLoadContext(list) {
                return JSON.stringify([list.domain, list.context, list.orderBy, list.offset, list.limit]);
            },

            async o3pLoadAll() {
                await this.o3pLoadRecords(true);
            },

            async o3pLoadRecords(all) {
                if (!(all ? this.o3pCanLoadAll : this.o3pCanScrollLoad)) {
                    return;
                }
                this.o3pScrollLoading.set(true);
                const list = this.model.root;
                const config = this.o3pLoadContext(list);
                try {
                    if (list.hasLimitedCount) {
                        await list.fetchCount();
                    }
                    // Do not apply an old request after a search or navigation.
                    if (!this.o3pScrollAlive || this.model.root !== list || this.o3pLoadContext(list) !== config) {
                        return;
                    }
                    if (all && list.count > 5000) {
                        this.o3pScrollDialog.add(ConfirmationDialog, {
                            body: _t("Loading all %s records may take several minutes. Continue?", list.count),
                            confirmLabel: _t("Load all"),
                            confirm: () => this.o3pLoadConfirmed(list, config),
                        });
                        return;
                    }
                    await this.o3pGrowList(list, all);
                } catch (error) {
                    this.o3pReportLoadError(error);
                } finally {
                    this.o3pScrollLoading.set(false);
                }
            },

            async o3pLoadConfirmed(list, config) {
                if (!this.o3pCanLoadAll || this.model.root !== list || this.o3pLoadContext(list) !== config) {
                    return;
                }
                this.o3pScrollLoading.set(true);
                try {
                    await this.o3pGrowList(list, true);
                } catch (error) {
                    this.o3pReportLoadError(error);
                } finally {
                    this.o3pScrollLoading.set(false);
                }
            },

            async o3pGrowList(list, all) {
                if (!this.o3pScrollAlive || list.editedRecord) {
                    return;
                }
                const offset = all ? 0 : list.offset;
                const limit = all ? list.count : Math.min(list.limit + 80, list.count - offset);
                if (limit > 0) {
                    await list.load({ offset, limit });
                }
            },

            o3pReportLoadError(error) {
                console.warn("[o3p_widgets] Scroll loading failed", error);
                if (this.o3pScrollAlive) {
                    this.o3pScrollNotification.add(_t("Could not load more records. Please try again."), {
                        type: "warning",
                    });
                }
            },
        });
    }
}

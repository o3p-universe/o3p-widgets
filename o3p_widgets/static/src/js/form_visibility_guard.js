/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { FormController } from "@web/views/form/form_controller";

patch(FormController.prototype, {
    async beforeVisibilityChange() {
        if (!this.model?.root?.activeFields) {
            return;
        }
        return super.beforeVisibilityChange(...arguments);
    },
});

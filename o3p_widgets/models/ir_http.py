from odoo import models


ENABLE_SCROLL_LOAD_PARAM = "o3p_widgets.enable_scroll_load"
MINIMUM_TEXT_LINES_PARAM = "o3p_widgets.minimum_text_lines"
NATIVE_MINIMUM_TEXT_LINES = 2
MINIMUM_LISTS_LINES_PARAM = "o3p_widgets.minimum_lists_lines"
NATIVE_MINIMUM_LISTS_LINES = 4
REMEMBER_NOTEBOOK_TABS_PARAM = "o3p_widgets.remember_notebook_tabs"
DEFAULT_NOTEBOOK_TABS_PARAM = "o3p_widgets.default_notebook_tabs"
LAST_NOTEBOOK_TAB_MEMORY_TYPE = "lastnbtab"
ENABLE_GROUP_ACCORDION_PARAM = "o3p_widgets.enable_group_accordion"
STICKY_GROUP_ACCORDION_PARAM = "o3p_widgets.sticky_group_accordion"
ENABLE_RESIZABLE_CHATTER_PARAM = "o3p_widgets.enable_resizable_chatter"


class IrHttp(models.AbstractModel):
    _inherit = "ir.http"

    def session_info(self):
        result = super().session_info()
        minimum_text_lines = (
            self.env["ir.config_parameter"]
            .sudo()
            .get_int(MINIMUM_TEXT_LINES_PARAM, NATIVE_MINIMUM_TEXT_LINES)
        )
        minimum_lists_lines = (
            self.env["ir.config_parameter"]
            .sudo()
            .get_int(MINIMUM_LISTS_LINES_PARAM, NATIVE_MINIMUM_LISTS_LINES)
        )
        remember_notebook_tabs = (
            self.env["ir.config_parameter"]
            .sudo()
            .get_bool(REMEMBER_NOTEBOOK_TABS_PARAM, False)
        )
        default_notebook_tabs = (
            self.env["ir.config_parameter"]
            .sudo()
            .get_bool(DEFAULT_NOTEBOOK_TABS_PARAM, False)
        )
        enable_group_accordion = (
            self.env["ir.config_parameter"]
            .sudo()
            .get_bool(ENABLE_GROUP_ACCORDION_PARAM, False)
        )
        sticky_group_accordion = (
            self.env["ir.config_parameter"]
            .sudo()
            .get_bool(STICKY_GROUP_ACCORDION_PARAM, False)
        )
        enable_resizable_chatter = (
            self.env["ir.config_parameter"]
            .sudo()
            .get_bool(ENABLE_RESIZABLE_CHATTER_PARAM, False)
        )
        default_notebook_tab_rules = []
        if default_notebook_tabs:
            memories = (
                self.env["o3p.widget.memory"]
                .sudo()
                .search(
                    [
                        ("mtype", "=", LAST_NOTEBOOK_TAB_MEMORY_TYPE),
                        ("tvalue", "!=", False),
                    ],
                    order="id",
                )
            )
            default_notebook_tab_rules = [
                {
                    "prefix": memory.tvalue,
                    "tab_index": memory.nvalue,
                }
                for memory in memories
            ]
        result["o3p_widgets"] = {
            "enable_scroll_load": self.env["ir.config_parameter"].sudo().get_bool(
                ENABLE_SCROLL_LOAD_PARAM, False
            ),
            "minimum_text_lines": max(1, minimum_text_lines),
            "minimum_lists_lines": max(0, minimum_lists_lines),
            "remember_notebook_tabs": remember_notebook_tabs,
            "default_notebook_tabs": default_notebook_tabs,
            "default_notebook_tab_rules": default_notebook_tab_rules,
            "enable_group_accordion": enable_group_accordion,
            "sticky_group_accordion": sticky_group_accordion,
            "enable_resizable_chatter": enable_resizable_chatter,
        }
        return result

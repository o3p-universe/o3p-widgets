from odoo import api, fields, models, _
from odoo.exceptions import ValidationError

from .ir_http import (
    DEFAULT_NOTEBOOK_TABS_PARAM,
    ENABLE_SCROLL_LOAD_PARAM,
    ENABLE_RESIZABLE_CHATTER_PARAM,
    ENABLE_GROUP_ACCORDION_PARAM,
    LAST_NOTEBOOK_TAB_MEMORY_TYPE,
    MINIMUM_LISTS_LINES_PARAM,
    MINIMUM_TEXT_LINES_PARAM,
    NATIVE_MINIMUM_LISTS_LINES,
    NATIVE_MINIMUM_TEXT_LINES,
    REMEMBER_NOTEBOOK_TABS_PARAM,
    STICKY_GROUP_ACCORDION_PARAM,
)


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    enable_scroll_load = fields.Boolean(
        string="Enable scroll loading",
        config_parameter=ENABLE_SCROLL_LOAD_PARAM,
        default=False,
    )
    minimum_text_lines = fields.Integer(
        string="Minimum text lines",
        config_parameter=MINIMUM_TEXT_LINES_PARAM,
        default=NATIVE_MINIMUM_TEXT_LINES,
    )
    minimum_lists_lines = fields.Integer(
        string="Minimum list lines",
        config_parameter=MINIMUM_LISTS_LINES_PARAM,
        default=NATIVE_MINIMUM_LISTS_LINES,
    )
    remember_notebook_tabs = fields.Boolean(
        string="Remember notebook tabs",
        config_parameter=REMEMBER_NOTEBOOK_TABS_PARAM,
        default=False,
    )
    notebook_default_tabs = fields.Boolean(
        string="Default notebook tabs",
        config_parameter=DEFAULT_NOTEBOOK_TABS_PARAM,
        default=False,
    )
    enable_group_accordion = fields.Boolean(
        string='Enable support of accordion="true" for groups',
        config_parameter=ENABLE_GROUP_ACCORDION_PARAM,
        default=False,
    )
    sticky_group_accordion = fields.Boolean(
        string="Sticky accordion open-close status",
        config_parameter=STICKY_GROUP_ACCORDION_PARAM,
        default=False,
    )
    enable_resizable_chatter = fields.Boolean(
        string="Enable resizable chatter",
        config_parameter=ENABLE_RESIZABLE_CHATTER_PARAM,
        default=False,
    )
    notebook_default_tab_memory_ids = fields.Many2many(
        comodel_name="o3p.widget.memory",
        string="Default notebook tab rules",
        compute="_compute_notebook_default_tab_memory_ids",
        inverse="_inverse_notebook_default_tab_memory_ids",
        readonly=False,
    )

    @api.depends_context("uid")
    def _compute_notebook_default_tab_memory_ids(self):
        memories = self.env["o3p.widget.memory"].search(
            [("mtype", "=", LAST_NOTEBOOK_TAB_MEMORY_TYPE)], order="id"
        )
        for settings in self:
            settings.notebook_default_tab_memory_ids = memories

    def _inverse_notebook_default_tab_memory_ids(self):
        Memory = self.env["o3p.widget.memory"]
        for settings in self:
            selected = settings.notebook_default_tab_memory_ids
            selected.write({"mtype": LAST_NOTEBOOK_TAB_MEMORY_TYPE})
            existing = Memory.search([("mtype", "=", LAST_NOTEBOOK_TAB_MEMORY_TYPE)])
            (existing - selected).unlink()

    @api.constrains("minimum_text_lines")
    def _check_minimum_text_lines(self):
        if any(settings.minimum_text_lines < 1 for settings in self):
            raise ValidationError(_("Minimum text lines must be at least 1."))

    @api.constrains("minimum_lists_lines")
    def _check_minimum_lists_lines(self):
        if any(settings.minimum_lists_lines < 0 for settings in self):
            raise ValidationError(_("Minimum list lines cannot be negative."))
